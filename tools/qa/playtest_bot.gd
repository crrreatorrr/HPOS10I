extends SceneTree
## QA playtest bot. Boots the game through core/main.tscn (which honours
## --scene / --zone via the Dev autoload, exactly like a normal launch),
## plays with a simple policy and prints a JSON summary. Owned by QA.
##
##   godot --headless --fixed-fps 60 --path <project> -s res://tools/qa/playtest_bot.gd -- \
##       --scene=res://levels/test_zone/test_zone.tscn --frames=3600
##   godot ... -s res://tools/qa/playtest_bot.gd -- --zone=z1_retro_rush_hills --stage=1 \
##       --frames=18000 --out=/tmp/z1a1.json --record=/tmp/z1a1_inputs.json
##
## Arguments (after --):
##   --scene=res://...       open a scene (sandboxes; no zone, so a death
##                           returns to the dev menu, see SceneRouter.open_scene)
##   --zone=<id> --stage=N   start a zone stage (real respawns and accessories)
##   --frames=N              physics frames to run (default 3600 = 60 s)
##   --policy=runner         hold right; on the floor, jump when blocked or every
##                           N frames, spin dash after 2 s without progress (default)
##   --policy=fuzz           random presses/releases every frame (input spam),
##                           including rare pause toggles; see --seed
##   --no-pause              fuzz: never press pause (the real pause menu can
##                           otherwise end a run through QUIT TO MENU)
##   --policy=none           send nothing; observe only (combine with Dev's
##                           --inputs=<path> to replay a timeline)
##   --jump-every=N          runner: also jump every N frames (default 240, 0 = off)
##   --seed=N                fuzz seed (default 1)
##   --wait-player=N         frames to wait for a player before giving up (default 300)
##   --out=PATH              also write the JSON summary to PATH
##   --record=PATH           write the inputs the bot sent as a Dev input
##                           timeline, for bug repros
##
## The player is found through the `player` group and read only through the
## contract properties (docs/CONTRACTS.md). No player: the summary says so
## and the bot exits 0. Exit 2 = bad arguments, 3 = scene not found.
## Output: human lines, then one line `PLAYTEST_RESULT {json}`.

const MAIN_SCENE := "res://core/main.tscn"
const FPS := 60.0
const STUCK_LOG_FRAMES := 300  # > 5 s without x progress = logged stuck period
const SPINDASH_AFTER_FRAMES := 120  # > 2 s without progress = spin dash
const WALL_WINDOW := 10  # frames of no movement while holding right = blocked
const JUMP_HOLD_FRAMES := 20
const PERF_SAMPLE_FRAMES := 60
const FUZZ_ACTIONS := [&"move_left", &"move_right", &"move_up", &"move_down", &"jump"]
const CONTRACT_PROPERTIES := [
	&"ground_speed", &"velocity", &"ground_angle", &"grounded", &"collision_mode", &"state", &"facing",
]

var _args := {}
var _max_frames := 3600
var _policy := "runner"
var _jump_every := 240
var _wait_player := 300
var _rng := RandomNumberGenerator.new()

var _frame := 0
var _queue: Array = []  # [frame, action, pressed], sorted by frame
var _held := {}  # action -> true
var _sent: Array = []  # [frame, action, pressed] for --record
var _recording := false
## Tick on which the boot target (--scene, or the --zone/--stage act) first
## became the current scene: frame 0 of recorded timelines, as for Dev's
## replay clock (core/dev.gd, Z1-01). -1 until then.
var _clock_start := -1
var _inputs_sent := 0
var _finished := false

var _player: Node2D = null
var _ever_had_player := false
var _frames_without_player := 0
var _missing_contract := PackedStringArray()

var _start := Vector2.ZERO
var _max_x := -INF
var _life_best_x := -INF
var _frames_since_progress := 0
var _longest_no_progress := 0
var _stuck_open: Dictionary = {}
var _stuck_periods: Array = []
var _x_history: Array[float] = []
var _busy_until := 0  # runner: frame until which a scripted move is running
var _next_spindash := 0

var _deaths: Array = []
var _death_latched := false  # one death per "dead" episode (signal + state)
var _jumps := 0
var _spindashes := 0
var _paused_frames := 0
var _nan_frames := 0
var _first_nan_frame := -1
var _state_frames := {}
var _scenes: Array = []
var _last_scene := ""
var _level_completed_frame := -1
var _perf := {}


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--"):
			var kv := arg.substr(2).split("=", true, 1)
			_args[kv[0]] = kv[1] if kv.size() > 1 else "true"
	_max_frames = int(_args.get("frames", "3600"))
	_policy = str(_args.get("policy", "runner"))
	_jump_every = int(_args.get("jump-every", "240"))
	_wait_player = int(_args.get("wait-player", "300"))
	_rng.seed = int(_args.get("seed", "1"))
	_recording = _args.has("record")
	if not _policy in ["runner", "fuzz", "none"] or _max_frames <= 0:
		printerr("playtest_bot: bad arguments %s (policy runner|fuzz|none, frames > 0)" % [_args])
		quit(2)
		return
	if _args.has("scene") and not ResourceLoader.exists(str(_args.scene)):
		_finish("scene_not_found", 3)
		return
	if _args.has("zone") and ZoneRegistry.get_zone(str(_args.zone)).is_empty():
		_finish("zone_not_found", 3)
		return
	if _policy != "none" and _args.has("inputs"):
		print("playtest_bot: note: Dev is also replaying --inputs; use --policy=none to observe only")
	physics_frame.connect(_tick)
	# Same as a normal launch: the main scene is in the tree before the first
	# frame (its _ready runs after the autoloads'), so Dev timelines recorded
	# here replay frame-exactly with `godot --path . -- --scene=... --inputs=...`.
	var main := (load(MAIN_SCENE) as PackedScene).instantiate()
	root.add_child(main)
	current_scene = main


func _tick() -> void:
	if _finished:
		return
	var f := _frame
	_frame += 1
	_start_clock(f)
	_run_queue(f)
	_track_scene(f)
	_sample_perf(f)
	if paused:
		_paused_frames += 1
	_acquire_player()
	if _player == null:
		_frames_without_player += 1
		if _frames_without_player > _wait_player:
			_finish("no_player" if not _ever_had_player else "player_lost", 0)
			return
	else:
		_frames_without_player = 0
		_observe(f)
		match _policy:
			"runner":
				_runner(f)
			"fuzz":
				_fuzz(f)
	if _frame >= _max_frames:
		_finish("frames", 0)


# ---------------------------------------------------------------------------
# Observation


func _acquire_player() -> void:
	if _player != null and is_instance_valid(_player) and _player.is_inside_tree():
		return
	_player = null
	var node := get_first_node_in_group(&"player")
	if node == null:
		return
	if not node is Node2D:
		_note_missing("root is %s, not Node2D" % node.get_class())
		return
	_player = node
	_life_best_x = _player.global_position.x
	_frames_since_progress = 0
	_x_history.clear()
	_death_latched = false
	_close_stuck(_frame)
	if not _ever_had_player:
		_ever_had_player = true
		_start = _player.global_position
		for prop in CONTRACT_PROPERTIES:
			if _player.get(prop) == null:
				_note_missing(String(prop))
	if _player.has_signal(&"died") and not _player.is_connected(&"died", _on_died):
		_player.connect(&"died", _on_died)
	var game_state := root.get_node_or_null(^"GameState")
	if game_state != null and not game_state.is_connected(&"level_completed", _on_level_completed):
		game_state.connect(&"level_completed", _on_level_completed)


func _observe(f: int) -> void:
	var pos := _player.global_position
	var velocity = _player.get(&"velocity")
	if not (is_finite(pos.x) and is_finite(pos.y)) \
			or (velocity is Vector2 and not (is_finite(velocity.x) and is_finite(velocity.y))):
		_nan_frames += 1
		if _first_nan_frame < 0:
			_first_nan_frame = f
		return
	var state := _state_name()
	_state_frames[state] = int(_state_frames.get(state, 0)) + 1
	if state == "dead":
		_record_death(f)
	elif _death_latched and state != "?":
		_death_latched = false  # alive again on the same instance (respawn_at)
	_max_x = maxf(_max_x, pos.x)
	if pos.x > _life_best_x + 1.0:
		_life_best_x = pos.x
		_frames_since_progress = 0
		_close_stuck(f)
	else:
		_frames_since_progress += 1
		_longest_no_progress = maxi(_longest_no_progress, _frames_since_progress)
		if _frames_since_progress == STUCK_LOG_FRAMES:
			_stuck_open = {start = f - STUCK_LOG_FRAMES, x = snappedf(pos.x, 0.1), y = snappedf(pos.y, 0.1), state = state}
	_x_history.append(pos.x)
	if _x_history.size() > WALL_WINDOW:
		_x_history.pop_front()


func _state_name() -> String:
	var state = _player.get(&"state")
	return "?" if state == null else str(state)


func _grounded() -> bool:
	# Unknown (missing property) counts as grounded so the runner still acts.
	return _player.get(&"grounded") != false


## Grounded in floor mode (collision_mode 0, or unknown).
func _on_floor() -> bool:
	var mode = _player.get(&"collision_mode")
	return _grounded() and (mode == null or int(mode) == 0)


func _on_died() -> void:
	_record_death(_frame)


func _record_death(f: int) -> void:
	if _death_latched:
		return
	_death_latched = true
	var pos := _player.global_position if _player != null and is_instance_valid(_player) else Vector2.ZERO
	_deaths.append({frame = f, x = snappedf(pos.x, 0.1), y = snappedf(pos.y, 0.1)})


func _on_level_completed() -> void:
	if _level_completed_frame < 0:
		_level_completed_frame = _frame


func _close_stuck(f: int) -> void:
	if _stuck_open.is_empty():
		return
	_stuck_open.end = f
	_stuck_open.seconds = snappedf((f - int(_stuck_open.start)) / FPS, 0.01)
	_stuck_periods.append(_stuck_open)
	_stuck_open = {}


func _track_scene(f: int) -> void:
	var scene := current_scene.scene_file_path if current_scene != null else ""
	if scene != _last_scene:
		_last_scene = scene
		_scenes.append({frame = f, path = scene})


func _sample_perf(f: int) -> void:
	if f % PERF_SAMPLE_FRAMES != 0:
		return
	var nodes := int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	var orphans := int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))
	var mem := snappedf(Performance.get_monitor(Performance.MEMORY_STATIC) / 1e6, 0.1)
	if _perf.is_empty():
		_perf = {nodes_start = nodes, nodes_max = nodes, orphans_start = orphans, static_mb_start = mem}
	_perf.nodes_end = nodes
	_perf.nodes_max = maxi(int(_perf.nodes_max), nodes)
	_perf.orphans_end = orphans
	_perf.static_mb_end = mem


func _note_missing(what: String) -> void:
	if not what in _missing_contract:
		_missing_contract.append(what)


# ---------------------------------------------------------------------------
# Policies


func _runner(f: int) -> void:
	if f < _busy_until:
		return
	if not _held.has(&"move_right"):
		_schedule(f, &"move_right", true)
	if not _on_floor():
		return  # never jump or spin dash off a wall, a loop or a ceiling
	if _frames_since_progress >= SPINDASH_AFTER_FRAMES and f >= _next_spindash:
		_spindash(f)
		return
	# Blocked = on flat-ish floor, nearly stopped and not moving for a while
	# (x alone also stalls while running up a loop's wall).
	var gsp = _player.get(&"ground_speed")
	var slow: bool = gsp == null or absf(float(gsp)) < 0.5
	var blocked := slow and _x_history.size() == WALL_WINDOW and absf(_x_history[-1] - _x_history[0]) < 0.5
	if blocked or (_jump_every > 0 and f > 0 and f % _jump_every == 0):
		_jump(f)


func _jump(f: int) -> void:
	_jumps += 1
	_schedule(f, &"jump", true)
	_schedule(f + JUMP_HOLD_FRAMES, &"jump", false)
	_busy_until = f + JUMP_HOLD_FRAMES + 1


func _spindash(f: int) -> void:
	_spindashes += 1
	_schedule(f, &"move_right", false)
	_schedule(f, &"move_down", true)
	for tap in 3:
		_schedule(f + 2 + tap * 4, &"jump", true)
		_schedule(f + 3 + tap * 4, &"jump", false)
	_schedule(f + 16, &"move_down", false)
	_schedule(f + 17, &"move_right", true)
	_busy_until = f + 18
	_next_spindash = f + SPINDASH_AFTER_FRAMES + 18


func _fuzz(f: int) -> void:
	for action in FUZZ_ACTIONS:
		if _rng.randf() < 0.15:
			_schedule(f, action, not _held.has(action))
	# The draw happens either way, so --no-pause keeps the same seed's other
	# presses. With the real pause menu, random presses can choose QUIT.
	if _rng.randf() < 0.003 and not _args.has("no-pause"):
		_schedule(f, &"pause", true)
		_schedule(f + 1, &"pause", false)


# ---------------------------------------------------------------------------
# Input


func _schedule(at: int, action: StringName, pressed: bool) -> void:
	var event := [at, action, pressed]
	var i := _queue.size()
	while i > 0 and int(_queue[i - 1][0]) > at:
		i -= 1
	_queue.insert(i, event)
	if at <= _frame - 1:
		_run_queue(_frame - 1)


func _run_queue(f: int) -> void:
	while not _queue.is_empty() and int(_queue[0][0]) <= f:
		var event: Array = _queue.pop_front()
		_send(f, event[1], event[2])


func _send(f: int, action: StringName, pressed: bool) -> void:
	if pressed == _held.has(action):
		return
	if pressed:
		_held[action] = true
	else:
		_held.erase(action)
	_inputs_sent += 1
	if _recording:
		_sent.append([maxi(0, f - maxi(_clock_start, 0)), String(action), pressed])
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)


# ---------------------------------------------------------------------------
# Report


func _finish(reason: String, code: int) -> void:
	if _finished:
		return
	_finished = true
	for action in _held.keys():
		Input.action_release(action)
	_close_stuck(_frame)
	var summary := _summary(reason)
	print("playtest_bot: %s, %s, %d frames (%.1f s), end: %s" % [
		_target_label(), _policy, _frame, _frame / FPS, reason])
	if _ever_had_player:
		print("playtest_bot: progress %.0f px (max x %.0f), deaths %d, stuck periods %d, completed %s, final state %s" % [
			summary.progress_px, summary.max_x, _deaths.size(), _stuck_periods.size(),
			summary.level_completed, summary.final.state])
	elif reason == "no_player" or reason == "player_lost":
		print("playtest_bot: no node in group 'player' within %d frames" % _wait_player)
	print("PLAYTEST_RESULT ", JSON.stringify(summary))
	if _args.has("out"):
		_write(str(_args.out), JSON.stringify(summary, "  "))
	if _args.has("record"):
		_write(str(_args.record), _timeline_json())
	quit(code)


func _summary(reason: String) -> Dictionary:
	var summary := {
		tool = "playtest_bot",
		target = {scene = _args.get("scene", ""), zone = _args.get("zone", ""), stage = int(_args.get("stage", "1"))},
		policy = _policy,
		seed = _rng.seed if _policy == "fuzz" else null,
		frames = _frame,
		seconds = snappedf(_frame / FPS, 0.01),
		end_reason = reason,
		player_found = _ever_had_player,
		missing_contract = Array(_missing_contract),
		deaths = _deaths.size(),
		death_events = _deaths,
		stuck_periods = _stuck_periods,
		longest_no_progress_s = snappedf(_longest_no_progress / FPS, 0.01),
		jumps = _jumps,
		spindashes = _spindashes,
		inputs_sent = _inputs_sent,
		level_completed = _level_completed_frame >= 0,
		level_completed_frame = _level_completed_frame,
		scenes = _scenes,
		returned_to_menu = _scenes.size() > 1 and _last_scene == MAIN_SCENE,
		paused_frames = _paused_frames,
		nan_frames = _nan_frames,
		first_nan_frame = _first_nan_frame,
		state_frames = _state_frames,
		perf = _perf,
	}
	var game_state := root.get_node_or_null(^"GameState")
	if game_state != null:
		summary.game_state = {
			tickets = game_state.tickets, score = game_state.score, lives = game_state.lives,
			level_time = snappedf(game_state.level_time, 0.01),
		}
	if _ever_had_player:
		summary.start = {x = snappedf(_start.x, 0.1), y = snappedf(_start.y, 0.1)}
		summary.max_x = snappedf(_max_x, 0.1)
		summary.progress_px = snappedf(_max_x - _start.x, 0.1)
		summary.final = _final_snapshot()
	return summary


func _final_snapshot() -> Dictionary:
	if _player == null or not is_instance_valid(_player):
		return {state = "(no player at end)"}
	var snapshot := {
		x = snappedf(_player.global_position.x, 0.01),
		y = snappedf(_player.global_position.y, 0.01),
		state = _state_name(),
	}
	for prop in [&"grounded", &"ground_speed", &"ground_angle", &"collision_mode", &"facing"]:
		var value = _player.get(prop)
		snapshot[String(prop)] = snappedf(value, 0.001) if value is float else value
	var velocity = _player.get(&"velocity")
	if velocity is Vector2:
		snapshot.velocity = [snappedf(velocity.x, 0.001), snappedf(velocity.y, 0.001)]
	return snapshot


## Dev input timeline (core/dev.gd format), one event per line for diffs.
## Frame 0 of recorded timelines: the first tick the boot target is current.
func _start_clock(f: int) -> void:
	if _clock_start >= 0:
		return
	var target := ""
	var dev := root.get_node_or_null("Dev")
	if dev != null and dev.has_method(&"timeline_scene"):
		target = str(dev.call(&"timeline_scene", _dev_args()))
	elif _args.has("scene"):
		target = str(_args.scene)
	elif _args.has("zone"):
		target = ZoneRegistry.stage_path(str(_args.zone), int(_args.get("stage", "1")))
	if target == "" or (current_scene != null and current_scene.scene_file_path == target):
		_clock_start = f


func _dev_args() -> Dictionary:
	var out := {}
	for key in ["scene", "zone", "stage"]:
		if _args.has(key):
			out[key] = str(_args[key])
	return out


func _timeline_json() -> String:
	var meta := {
		tool = "playtest_bot", target = _target_label(), policy = _policy, seed = _rng.seed,
		frames = _frame, clock_start = _clock_start,
		note = "frame 0 is the first tick the boot target is the current scene (Dev timeline clock)",
	}
	var lines := PackedStringArray()
	for event in _sent:
		lines.append("    " + JSON.stringify(event))
	return "{\n  \"meta\": %s,\n  \"events\": [\n%s\n  ]\n}" % [JSON.stringify(meta), ",\n".join(lines)]


func _target_label() -> String:
	if _args.has("zone"):
		return "%s stage %s" % [_args.zone, _args.get("stage", "1")]
	return str(_args.get("scene", "(boot)"))


func _write(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		printerr("playtest_bot: cannot write %s: %s" % [path, error_string(FileAccess.get_open_error())])
		return
	file.store_string(text + "\n")
