extends StaticBody2D
## A conveyor belt (Capital Mansion; docs/CONTRACTS.md "Moving terrain",
## conveyors): a static floor segment carrying the `conveyor_speed` meta, so
## a grounded Sproto is carried `speed` px/frame along it (+ = right) on top
## of his own motion. The belt's chevrons roll in the carrying direction.
## The origin is the top-left corner of the belt surface.

const BELT := Color(0.2, 0.2, 0.26)
const BELT_LIGHT := Color(0.34, 0.34, 0.42)
const ROLLER := Color(0.6, 0.62, 0.7)
const CHEVRON := Color(0.98, 0.84, 0.4)
const CHEVRON_DIM := Color(0.6, 0.5, 0.2)
const OUTLINE := Color(0.08, 0.08, 0.12)

@export var size := Vector2(256.0, 48.0)
## Carry speed, px/frame; + carries right, - carries left.
@export var speed := -4.0

var _t := 0


func _ready() -> void:
	collision_layer = Layers.TERRAIN_SOLID
	collision_mask = 0
	set_meta(&"conveyor_speed", speed)
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	shape.position = size / 2.0
	add_child(shape)


func _physics_process(_delta: float) -> void:
	_t += 1
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2(-1.0, -1.0), size + Vector2(2.0, 2.0)), OUTLINE)
	draw_rect(Rect2(Vector2.ZERO, size), BELT)
	draw_rect(Rect2(0.0, 0.0, size.x, 6.0), BELT_LIGHT)
	# Rollers at both ends, then chevrons rolling along the belt.
	for x in [6.0, size.x - 6.0]:
		draw_circle(Vector2(x, 6.0), 5.0, OUTLINE)
		draw_circle(Vector2(x, 6.0), 4.0, ROLLER)
	var dir := signf(speed)
	var phase := fposmod(_t * absf(speed) * 0.5, 24.0)
	var x := 16.0 - 24.0 + (phase if dir > 0.0 else 24.0 - phase)
	var k := 0
	while x < size.x - 12.0:
		if x >= 12.0:
			var tip := Vector2(x + 4.0 * dir, 3.0)
			var color := CHEVRON if k % 2 == 0 else CHEVRON_DIM
			draw_line(Vector2(x - 2.0 * dir, 0.5), tip, color, 2.0)
			draw_line(tip, Vector2(x - 2.0 * dir, 5.5), color, 2.0)
		x += 24.0
		k += 1
	draw_rect(Rect2(0.0, 6.0, size.x, size.y - 6.0), BELT.darkened(0.3))
	draw_rect(Rect2(0.0, 6.0, size.x, 1.0), OUTLINE)
