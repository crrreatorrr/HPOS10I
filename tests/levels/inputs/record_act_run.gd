extends SceneTree
## Records a clean, human-like run of a zone act as a Dev input timeline.
## Frames count from the first physics tick on which the act is the current
## scene (core/dev.gd: Dev's timeline frame 0), so `--inputs=` replays it
## frame for frame through a plain launch or the QA bot. Dev tool:
##
##   godot --headless --fixed-fps 60 --path . -s res://tests/levels/inputs/record_act_run.gd \
##       -- --zone=z1_retro_rush_hills --stage=1 --out=res://tests/levels/inputs/z1_act1_run.json
##
## Replay: godot --fixed-fps 60 --path . -- --zone=z1_retro_rush_hills --stage=1 \
##     --inputs=res://tests/levels/inputs/z1_act1_run.json
## (Dev prints "level completed at timeline frame N"; N is the meta goal_frame.)
## (boot by --zone/--stage, not --scene, so enemies get the act's difficulty).
##
## A pilot plays the act the way a player would: it holds right, jumps into
## each enemy it meets (rolling through walkers and chasers at speed, jumping
## early over spikes and shields), jumps pellets, hops when blocked, backs
## off for a run-up when it stalls on a slope, and rolls into breakable walls
## (the secrets). It reads
## the level only to time those inputs; the recording is plain input events.
## Re-record after changing an act's layout; tests/levels/test_z1_acts.gd
## replays it. Add `--trace` after `--` to print Sproto's state every 10 frames.

const MAIN := "res://core/main.tscn"
const MAX_FRAMES := 18000
## Frames jump is held: a full-height hop, or a short one at high speed (a
## full jump at speed sails far past the enemy).
const JUMP_HOLD := 16
const SHORT_HOP := 8
## Standing centre to feet, px.
const FEET := 19.0

var _zone := ""
var _stage := 1
var _out := ""
var _trace := false
var _frame := 0
## Tick on which the act became the current scene: timeline frame 0 (Dev).
var _origin := -1
var _queue: Array = []
var _events: Array = []
var _held := {}
var _player: Node2D
var _game_state: Node
var _done_frame := -1
var _deaths := 0
var _busy_until := 0
var _slow_frames := 0
var _airborne := false
var _walls: Array = []


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--zone="):
			_zone = arg.get_slice("=", 1)
		elif arg.begins_with("--stage="):
			_stage = int(arg.get_slice("=", 1))
		elif arg.begins_with("--out="):
			_out = arg.get_slice("=", 1)
		elif arg == "--trace":
			_trace = true
	if _zone == "" or _out == "":
		printerr("record: pass -- --zone=<zone id> --stage=<n> --out=<inputs json>")
		quit(2)
		return
	# Boot like a normal launch with --zone/--stage (Dev reads them), so frame
	# numbers match Dev's replay.
	var main := (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	current_scene = main
	physics_frame.connect(_tick)


func _tick() -> void:
	var f := _frame
	_frame += 1
	if _origin < 0:
		if current_scene == null or current_scene.scene_file_path != ZoneRegistry.stage_path(_zone, _stage):
			return
		_origin = f
	while not _queue.is_empty() and _queue[0][0] <= f:
		var event: Array = _queue.pop_front()
		_send(f, event[1], event[2])
	if _player == null or not is_instance_valid(_player):
		_player = get_first_node_in_group(&"player") as Node2D
		if _player == null:
			return
		if _game_state == null:
			_game_state = root.get_node(^"GameState")
			_game_state.level_completed.connect(func() -> void:
				if _done_frame < 0:
					_done_frame = _frame)
		_player.state_changed.connect(func(_old: StringName, new: StringName) -> void:
			if new == &"dead":
				_deaths += 1
				print("record: died at f%d x=%.0f" % [_frame, _player.global_position.x]))
		_find_walls()
		_later(f, 0, &"move_right", true)
		return
	if _done_frame >= 0:
		if _frame > _done_frame + 30:
			_finish()
		return
	if _frame >= MAX_FRAMES:
		_finish()
		return
	var p = _player
	if _trace and f % 10 == 0:
		print("trace: f%d x=%.0f y=%.0f %s gs=%.2f v=(%.2f, %.2f) tickets=%d" % [f, p.global_position.x,
				p.global_position.y, p.state, p.ground_speed, p.velocity.x, p.velocity.y, _game_state.tickets])
	_pilot(f, p)


## Decides this frame's inputs.
func _pilot(f: int, p) -> void:
	if not p.grounded:
		_airborne = true
		return
	if _airborne:
		_airborne = false
		_busy_until = maxi(_busy_until, f + 3)  # a beat after landing, like a person
	if f < _busy_until or p.state == &"hurt" or p.state == &"dead":
		return
	var pos: Vector2 = p.global_position
	var gs: float = p.ground_speed
	# Blocked (a wall or a slope too steep to run up): hop.
	_slow_frames = _slow_frames + 1 if absf(gs) < 0.4 else 0
	if _slow_frames > 20:
		_slow_frames = 0
		if absf(wrapf(float(p.ground_angle), -180.0, 180.0)) > 5.0:
			_back_off(f, "too slow for the slope: back off for a run-up")
		else:
			_jump(f, "blocked")
		return
	# A breakable wall ahead: roll into it (the secret).
	for wall in _walls:
		if not is_instance_valid(wall):
			continue
		var d: Vector2 = (wall as Node2D).global_position - pos
		if d.x > 0.0 and d.x < 40.0 + gs * 10.0 and absf(d.y) < 64.0 and gs > 2.5 and not wall.call(&"is_broken"):
			_roll(f, "roll into the breakable wall")
			return
	# Pellets rolling at him: jump them.
	for pellet in get_nodes_in_group(&"pellets"):
		var d: Vector2 = (pellet as Node2D).global_position - pos
		if absf(d.y) < 40.0 and d.x > -8.0 and d.x < 24.0 + (absf(gs) + 2.0) * 10.0:
			_jump(f, "jump the pellet")
			return
	# Enemies ahead: roll through walkers and chasers on flat ground at
	# speed, hop at the rest (a short hop at speed, so he doesn't sail onto
	# the next slope), jump early over spikes and shields.
	var flat := absf(wrapf(float(p.ground_angle), -180.0, 180.0)) < 5.0
	for node in get_nodes_in_group(&"enemies"):
		var enemy := node as Node2D
		if not enemy.get(&"alive"):
			continue
		var d := enemy.global_position - pos
		var kind := _kind(enemy)
		var flying := kind in ["floater", "diver"]
		var reach := 20.0 + maxf(gs, 1.0) * (6.0 if flying else 4.0)
		if enemy.has_method(&"is_rushing") and enemy.call(&"is_rushing"):
			reach += 30.0
		var shielded: bool = kind == "armored" and enemy.call(&"shield_faces", p) and gs < 4.5
		if kind == "spike" or shielded:
			reach += 24.0  # jump early enough to clear the spikes or the shield
		var level := (d.y > -120.0 and d.y < 0.0) if flying else absf(d.y - FEET) < 40.0
		if not (d.x > 0.0 and d.x < reach and level):
			continue
		if kind in ["walker", "chaser"] and gs >= 3.0 and flat or kind == "armored" and gs >= 5.0 and flat:
			_roll_through(f, "roll through %s" % enemy.name)
		elif kind == "spike" or shielded or flying:
			_jump(f, "jump over %s" % enemy.name if not flying else "jump at %s" % enemy.name, JUMP_HOLD)
		else:
			_jump(f, "hop at %s" % enemy.name)
		return


## The enemy's behaviour, from its script's file name.
func _kind(enemy: Node) -> String:
	var path: String = enemy.get_script().resource_path if enemy.get_script() != null else ""
	for kind in ["walker", "chaser", "hopper", "pellet", "spike", "floater", "diver", "armored", "knight", "spellbook_pill"]:
		if path.get_file().contains(kind):
			match kind:
				"knight":
					return "armored"
				"spellbook_pill":
					return "floater"
			return kind
	return "other"


func _find_walls() -> void:
	_walls.clear()
	for node in root.find_children("*", "", true, false):
		if node.has_method(&"is_broken"):
			_walls.append(node)


func _jump(f: int, why: String, hold := -1) -> void:
	if hold < 0:
		hold = SHORT_HOP if absf(_player.ground_speed) > 4.0 else JUMP_HOLD
	_later(f, 0, &"jump", true)
	_later(f, hold, &"jump", false)
	_busy_until = f + hold + 2
	print("record: f%d x=%.0f %s" % [f, _player.global_position.x, why])


func _back_off(f: int, why: String) -> void:
	_later(f, 0, &"move_right", false)
	_later(f, 0, &"move_left", true)
	_later(f, 50, &"move_left", false)
	_later(f, 50, &"move_right", true)
	_busy_until = f + 52
	print("record: f%d x=%.0f %s" % [f, _player.global_position.x, why])


## A roll into an enemy, then a hop out of the roll to run on.
func _roll_through(f: int, why: String) -> void:
	_later(f, 0, &"move_down", true)
	_later(f, 4, &"move_down", false)
	_later(f, 18, &"jump", true)
	_later(f, 18 + SHORT_HOP, &"jump", false)
	_busy_until = f + 20 + SHORT_HOP
	print("record: f%d x=%.0f %s" % [f, _player.global_position.x, why])


func _roll(f: int, why: String) -> void:
	_later(f, 0, &"move_right", false)
	_later(f, 0, &"move_down", true)
	_later(f, 6, &"move_down", false)
	_later(f, 30, &"move_right", true)
	_busy_until = f + 32
	print("record: f%d x=%.0f %s" % [f, _player.global_position.x, why])


func _later(f: int, delay: int, action: StringName, pressed: bool) -> void:
	_queue.append([f + delay, action, pressed])
	_queue.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])


## Sends an action now and records it at its timeline frame (ticks since the
## act became the current scene).
func _send(f: int, action: StringName, pressed: bool) -> void:
	if bool(_held.get(action, false)) == pressed:
		return
	_held[action] = pressed
	_events.append([f - _origin, String(action), pressed])
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)


func _finish() -> void:
	physics_frame.disconnect(_tick)
	if _done_frame < 0:
		printerr("record: the run did not reach the goal (x %.0f)" % _player.global_position.x)
		quit(1)
		return
	for action: StringName in _held:
		if _held[action]:
			_events.append([_frame - _origin, String(action), false])
	var lines := PackedStringArray()
	for event in _events:
		lines.append("    " + JSON.stringify(event))
	var meta := {tool = "record_act_run.gd", zone = _zone, stage = _stage, goal_frame = _done_frame - _origin, deaths = _deaths,
			note = "Dev timeline: frame 0 is the first tick the act is the current scene; replay with --zone, --stage and --inputs"}
	var text := "{\n  \"meta\": %s,\n  \"events\": [\n%s\n  ]\n}\n" % [JSON.stringify(meta), ",\n".join(lines)]
	var file := FileAccess.open(_out, FileAccess.WRITE)
	file.store_string(text)
	file.close()
	print("record: goal at timeline frame %d, %d deaths, %d events -> %s" % [_done_frame - _origin, _deaths, _events.size(), _out])
	quit(0)
