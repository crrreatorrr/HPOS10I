@tool
extends Node2D
## A decorative waterfall (Retro Rush Hills): falling water streaks with a
## shimmer and a foam pool at the bottom. Purely visual, no collision; level
## builders put it behind the terrain. The origin is its top-left corner.

const WATER := Color(0.36, 0.66, 0.96)
const WATER_DARK := Color(0.24, 0.5, 0.86)
const WATER_LIGHT := Color(0.72, 0.9, 1.0)
const FOAM := Color(0.95, 0.98, 1.0)

@export var size := Vector2(48.0, 128.0):
	set(value):
		size = value.max(Vector2(8.0, 16.0))
		queue_redraw()

var _t := 0


func _physics_process(_delta: float) -> void:
	_t += 1
	if _t % 2 == 0:
		queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), WATER)
	draw_rect(Rect2(0, 0, 2, size.y), WATER_DARK)
	draw_rect(Rect2(size.x - 2.0, 0, 2, size.y), WATER_DARK)
	# Streaks falling at two speeds.
	var columns := int(size.x / 6.0)
	for c in columns:
		var x := 3.0 + c * 6.0 + float(c % 2)
		var speed := 3.0 if c % 2 == 0 else 2.0
		var length := 10.0 + float((c * 7) % 9)
		var y := fposmod(_t * speed + c * 23.0, size.y + length) - length
		draw_rect(Rect2(x, maxf(y, 0.0), 2.0, minf(length, size.y - maxf(y, 0.0))), WATER_LIGHT)
	# Shimmer at the lip and foam at the bottom.
	for i in int(size.x / 4.0):
		var lip := 1.0 + float((i + _t / 4) % 3 == 0)
		draw_rect(Rect2(i * 4.0, 0.0, 3.0, lip), FOAM)
		var foam_h := 3.0 + 2.0 * absf(sin((i * 1.3) + _t * 0.15))
		draw_rect(Rect2(i * 4.0 - 1.0, size.y - foam_h, 5.0, foam_h), FOAM)
