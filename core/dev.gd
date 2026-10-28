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
## Input timeline format (frames are physics ticks since boot, 60 per second):
##   {"events": [[0, "move_right", true], [90, "jump", true], [96, "jump", false]]}

var args := {}

var _timeline: Array = []
var _frame := 0
## Actions the timeline is holding down. Re-pressed every frame because the
## OS releases all input when the window loses focus mid-recording.
var _held := {}
var _boot_taken := false


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
	set_physics_process(not _timeline.is_empty())


func _physics_process(_delta: float) -> void:
	while not _timeline.is_empty() and _timeline[0][0] <= _frame:
		var event: Array = _timeline.pop_front()
		send_action(event[1], event[2])
		if event[2]:
			_held[event[1]] = true
		else:
			_held.erase(event[1])
	for action in _held:
		if not Input.is_action_pressed(action):
			send_action(action, true)
	_frame += 1
	if _timeline.is_empty() and _held.is_empty():
		set_physics_process(false)


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
