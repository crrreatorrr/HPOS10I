extends SceneTree
## Records tests/levels/inputs/test_zone_run.json: a clean, human-like run of
## the test zone, as a Dev input timeline (frames are physics ticks since
## boot, so `--inputs=` replays it frame for frame). Dev tool:
##
##   godot --headless --fixed-fps 60 --path . -s res://tests/levels/inputs/record_test_zone_run.gd \
##       -- --scene=res://levels/test_zone/test_zone.tscn
##
## The run is a list of moves, each fired when Sproto's centre passes an x:
## it bounces on the stump walker, rolls down into the valley walker, takes
## the up spring, rolls down into the hopper, takes the diagonal spring onto
## the bridge, rolls through the breakable wall and the tunnel, hops out of
## the roll onto the booster, goes round the loop and up the quarter pipe,
## rolls down into the finale walker and the finale hopper, and runs through
## the goal.
## Re-record after changing the layout; test_test_zone.gd replays it.
## Add `--trace` after `--` to print Sproto's state every 10 frames.

const OUT := "res://tests/levels/inputs/test_zone_run.json"
const SCENE := "res://levels/test_zone/test_zone.tscn"
const MAIN := "res://core/main.tscn"
const MAX_FRAMES := 3600

## [x the centre must pass, [[frame offset, action, pressed], ...], note].
const ROLL := [[0, "move_right", false], [0, "move_down", true], [6, "move_down", false], [8, "move_right", true]]
const HOP := [[0, "jump", true], [10, "jump", false]]
const MOVES := [
	[0.0, [[0, "move_right", true]], "run"],
	[295.0, [[0, "jump", true], [16, "jump", false]], "jump the stump onto the walker"],
	[990.0, ROLL, "roll down into the valley walker"],
	# Hop out of the roll before the 45 degree up-slope: a roll into that
	# corner can be stopped dead (physics bug reported to the physics agent).
	[1096.0, HOP, "hop out of the valley"],
	[2760.0, ROLL, "roll down into the hopper and through the gate"],
	[4440.0, ROLL, "roll into the breakable wall and through the tunnel"],
	[5020.0, HOP, "hop out of the roll before the booster"],
	[7366.0, ROLL, "roll down into the finale walker"],
	[7600.0, HOP, "hop out of the roll"],
	[7906.0, ROLL, "roll down the small hill into the finale hopper"],
	[8070.0, HOP, "hop out of the roll and run to the goal"],
]

var _frame := 0
var _next := 0
var _queue: Array = []
var _events: Array = []
var _player: Node2D
var _done_frame := -1


func _initialize() -> void:
	if not "--scene=%s" % SCENE in OS.get_cmdline_user_args():
		printerr("record: pass -- --scene=%s (the replay boots the same way)" % SCENE)
		quit(2)
		return
	# Boot like a normal launch with --scene, so frame numbers match Dev's replay.
	var main := (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	current_scene = main
	physics_frame.connect(_tick)


func _tick() -> void:
	var f := _frame
	_frame += 1
	while not _queue.is_empty() and _queue[0][0] <= f:
		var event: Array = _queue.pop_front()
		_send(f, event[1], event[2])
	if _player == null or not is_instance_valid(_player):
		_player = get_first_node_in_group(&"player") as Node2D
		if _player == null:
			return
		var game_state := root.get_node(^"GameState")
		game_state.level_completed.connect(func() -> void: _done_frame = _frame)
	if "--trace" in OS.get_cmdline_user_args() and f % 10 == 0:
		var p = _player
		print("trace: f%d x=%.0f y=%.0f %s gs=%.2f v=(%.2f, %.2f) tickets=%d score=%d" % [f, p.global_position.x,
				p.global_position.y, p.state, p.ground_speed, p.velocity.x, p.velocity.y,
				root.get_node(^"GameState").tickets, root.get_node(^"GameState").score])
	while _next < MOVES.size() and _player.global_position.x >= MOVES[_next][0]:
		for step: Array in MOVES[_next][1]:
			_queue.append([f + step[0], StringName(step[1]), step[2]])
		_queue.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
		print("record: f%d x=%.0f %s" % [f, _player.global_position.x, MOVES[_next][2]])
		_next += 1
	if (_done_frame >= 0 and _frame > _done_frame + 30) or _frame >= MAX_FRAMES:
		_finish()


func _send(f: int, action: StringName, pressed: bool) -> void:
	_events.append([f, String(action), pressed])
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)


func _finish() -> void:
	physics_frame.disconnect(_tick)
	if _done_frame < 0:
		printerr("record: the run did not reach the goal")
		quit(1)
		return
	_events.append([_frame, "move_right", false])
	var lines := PackedStringArray()
	for event in _events:
		lines.append("    " + JSON.stringify(event))
	var meta := {tool = "record_test_zone_run.gd", scene = SCENE, goal_frame = _done_frame,
			note = "frames are physics ticks since boot (Dev timeline format); replay with --scene and --inputs"}
	var text := "{\n  \"meta\": %s,\n  \"events\": [\n%s\n  ]\n}\n" % [JSON.stringify(meta), ",\n".join(lines)]
	var file := FileAccess.open(OUT, FileAccess.WRITE)
	file.store_string(text)
	file.close()
	print("record: goal at frame %d, %d events -> %s" % [_done_frame, _events.size(), OUT])
	quit(0)
