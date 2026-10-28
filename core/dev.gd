extends Node
## Developer helpers driven by command-line user args (everything after "--"):
##   --scene=res://path.tscn      open a scene directly
##   --zone=z1_retro_rush_hills   start a zone (optionally --stage=2)
##   --inputs=res://path.json     replay a scripted input timeline
##   --dev                        always show the dev menu at boot
##
## Record a clip with Movie Maker:
##   godot --path . --write-movie /tmp/clip.avi --quit-after 600 -- \
##     --scene=res://playground/physics_playground.tscn --inputs=res://tests/inputs/run_right.json
##
## Input timeline format (60 frames per second):
##   {"events": [[0, "move_right", true], [90, "jump", true], [96, "jump", false]]}
## Frame 0 is the first physics tick on which the --scene / --zone target is
## the current scene (or the first tick after boot when there is no target),
## so a plain launch, the QA bot and the recorders all replay alike. Recorders
## count frames from the same moment. While a timeline runs, completing a
## level prints its timeline frame.

var args := {}

var _timeline: Array = []
var _frame := 0
## Actions the timeline is holding down. Pressed again at once whenever
## something else released them: a window losing focus releases all input.
var _held := {}
## action -> process frame its last event was sent on (events apply only
## when the input queue flushes at the start of the next frame).
var _sent_frame := {}
var _boot_taken := false
## Scene the timeline clock waits for ("" = start at once).
var _clock_scene := ""
var _clock_started := false
## Ticks spent waiting for _clock_scene (warns once if it never shows up).
var _clock_wait := 0
const CLOCK_WAIT_WARN := 600


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for arg in OS.get_cmdline_user_args():
		if not arg.begins_with("--"):
			continue
		var kv := arg.substr(2).split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else true
	if args.get("inputs") is String:
		_timeline = load_timeline(args.inputs)
	elif args.has("inputs"):
		push_error("[Dev] --inputs needs a path, e.g. --inputs=res://tests/inputs/run_right.json")
	if not _timeline.is_empty():
		_clock_scene = timeline_scene(args)
		GameState.level_completed.connect(func() -> void:
				print("[Dev] level completed at timeline frame %d" % _frame))
	set_physics_process(not _timeline.is_empty())


func _physics_process(_delta: float) -> void:
	if not _clock_started:
		var scene := get_tree().current_scene
		if _clock_scene != "" and (scene == null or scene.scene_file_path != _clock_scene):
			_clock_wait += 1
			if _clock_wait == CLOCK_WAIT_WARN:
				push_warning("[Dev] input timeline still waiting for %s" % _clock_scene)
			return
		_clock_started = true
	_restore_held()
	while not _timeline.is_empty() and _timeline[0][0] <= _frame:
		var event: Array = _timeline.pop_front()
		send_action(event[1], event[2])
		_sent_frame[event[1]] = Engine.get_process_frames()
		if event[2]:
			_held[event[1]] = true
		else:
			_held.erase(event[1])
	_frame += 1
	if _timeline.is_empty() and _held.is_empty():
		set_physics_process(false)


## Presses held actions that were released behind the timeline's back (a
## focus-out releases every input) immediately, so the game, which reads
## input after this autoload each tick, never sees a one-tick release.
## Actions whose event hasn't flushed yet (sent this frame) are left alone:
## pressing those again doubled them.
func _restore_held() -> void:
	var now := Engine.get_process_frames()
	for action in _held:
		if int(_sent_frame.get(action, now)) < now and not Input.is_action_pressed(action):
			Input.action_press(action)


## The --scene / --zone boot target, returned only once so returning to the
## main scene later (e.g. a missing stage) doesn't relaunch it.
## Returns {scene = path}, {zone = id, stage = n}, or {}.
func take_boot_target() -> Dictionary:
	if _boot_taken:
		return {}
	_boot_taken = true
	if args.get("scene") is String:
		return {scene = args.scene}
	if args.get("zone") is String:
		return {zone = args.zone, stage = int(args.get("stage", "1"))}
	return {}


## The scene an input timeline's frame 0 waits for: the --scene target, or
## the --zone/--stage act's scene; "" when there is neither.
static func timeline_scene(dev_args: Dictionary) -> String:
	if dev_args.get("scene") is String:
		return dev_args.scene
	if dev_args.get("zone") is String:
		return ZoneRegistry.stage_path(dev_args.zone, int(dev_args.get("stage", "1")))
	return ""


## Presses or releases an input action as if a real device did it.
static func send_action(action: StringName, pressed: bool) -> void:
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)


static func load_timeline(path: String) -> Array:
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(data) != TYPE_DICTIONARY or not data.has("events"):
		push_error("[Dev] bad input timeline: %s" % path)
		return []
	var events: Array = []
	for raw in data.events:
		if raw is Array and raw.size() == 3 and (raw[0] is float or raw[0] is int) \
				and raw[1] is String and raw[2] is bool:
			# Stable sort key: events on the same frame keep their file order.
			events.append([int(raw[0]), raw[1], raw[2], events.size()])
		else:
			push_error("[Dev] skipping bad timeline event %s in %s" % [raw, path])
	events.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[3] < b[3]))
	return events
