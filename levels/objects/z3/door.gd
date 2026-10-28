extends MovingBody
## A door (Capital Mansion): a solid panel across a hall that slides up out
## of the way when its switch is pressed (`open()`), and stays open. It is
## moving terrain while it slides (docs/CONTRACTS.md), but it only ever moves
## up, away from anyone standing in the doorway, so it never crushes. The
## origin is the door's bottom-left corner on the floor. Node names should
## contain "door" (QA's lint counts doors and switches for R4).

signal opened

const PANEL := Color(0.52, 0.34, 0.2)
const PANEL_LIGHT := Color(0.68, 0.48, 0.3)
const PANEL_DARK := Color(0.32, 0.2, 0.12)
const BRASS := Color(0.95, 0.8, 0.4)
const OUTLINE := Color(0.1, 0.07, 0.05)

@export var size := Vector2(32.0, 96.0)
## Slide speed, px/frame.
@export_range(0.5, 8.0) var open_speed := 4.0

var is_open := false
var _opening := false
var _home := Vector2.ZERO
var _lift := 0.0


func _ready() -> void:
	_home = position
	add_box(size, Vector2(0.0, -size.y))


func _physics_process(_delta: float) -> void:
	if _opening and _lift < size.y:
		_lift = minf(_lift + open_speed, size.y)
		if _lift >= size.y:
			_opening = false
			is_open = true
			collision_layer = 0  # fully open: out of the way for good
			opened.emit()
	move_to(_home + Vector2(0.0, -_lift))
	queue_redraw()


## Starts sliding up (idempotent).
func open() -> void:
	if not is_open:
		_opening = true


func is_opening() -> bool:
	return _opening


func _draw() -> void:
	var r := Rect2(Vector2(0.0, -size.y), size)
	draw_rect(r.grow(1.0), OUTLINE)
	draw_rect(r, PANEL)
	draw_rect(Rect2(r.position, Vector2(size.x, 3.0)), PANEL_LIGHT)
	draw_rect(Rect2(r.position + Vector2(0.0, size.y - 4.0), Vector2(size.x, 4.0)), PANEL_DARK)
	# Two raised panels and a brass knob.
	for k in 2:
		var py := r.position.y + 8.0 + k * (size.y / 2.0 - 4.0)
		draw_rect(Rect2(6.0, py, size.x - 12.0, size.y / 2.0 - 16.0), PANEL_DARK, false, 1.0)
		draw_rect(Rect2(7.0, py + 1.0, size.x - 14.0, 2.0), PANEL_LIGHT)
	draw_circle(Vector2(size.x - 8.0, -size.y / 2.0), 2.5, OUTLINE)
	draw_circle(Vector2(size.x - 8.0, -size.y / 2.0), 1.5, BRASS)
