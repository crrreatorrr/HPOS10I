extends Node2D
## UI sandbox (dev only, never ships): the physics playground with the HUD on
## top, as LevelRoot will show it. Optional scripted touch demo for recording:
##   godot --path . -- --scene=res://tests/ui/ui_sandbox.tscn --touch --touch_demo
## --touch shows the on-screen controls on a desktop (the mouse is one finger).

## [physics frame, finger index, "down" | "up" | "drag", position]
const TOUCH_DEMO := [
	[40, 0, "down", Vector2(84, 180)],
	[100, 1, "down", Vector2(372, 186)],
	[112, 1, "up", Vector2(372, 186)],
	[150, 0, "drag", Vector2(30, 182)],
	[175, 0, "drag", Vector2(84, 180)],
	[215, 0, "drag", Vector2(78, 204)],
	[240, 0, "up", Vector2(78, 204)],
	[262, 2, "down", Vector2(404, 18)],
	[266, 2, "up", Vector2(404, 18)],
]

var _frame := 0
var _demo: Array = []


func _ready() -> void:
	# The playground's own hint line sits where the lives counter goes.
	for child in $Playground.get_children():
		if child is CanvasLayer:
			child.visible = false
	if Dev.args.has("touch_demo"):
		_demo = TOUCH_DEMO.duplicate()


func _physics_process(_delta: float) -> void:
	_frame += 1
	while not _demo.is_empty() and _demo[0][0] <= _frame:
		var step: Array = _demo.pop_front()
		var event: InputEvent
		if step[2] == "drag":
			event = InputEventScreenDrag.new()
		else:
			event = InputEventScreenTouch.new()
			event.pressed = step[2] == "down"
		event.index = step[1]
		event.position = step[3]
		get_viewport().push_input(event, true)
