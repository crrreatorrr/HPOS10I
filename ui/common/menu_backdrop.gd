class_name MenuBackdrop
extends Control
## A sunny hills backdrop for the title and zone select, drawn in code at
## 424x240 until background art exists: banded sky, sun, drifting clouds,
## two hill layers, and the Zone 1 ground (grass lip over argyle dirt).
## `ground_y` sets the horizon of the ground; `dim` darkens it for menus.

@export var ground_y := 196.0
@export_range(0.0, 1.0) var dim := 0.0
## Cloud drift, pixels per second.
@export var cloud_speed := 6.0

const SKY := [Color8(56, 112, 224), Color8(72, 136, 236), Color8(96, 160, 244),
		Color8(124, 184, 250), Color8(156, 208, 252), Color8(188, 228, 255)]
const SUN := Color8(255, 236, 140)
const SUN_CORE := Color8(255, 250, 210)
const CLOUD := Color8(255, 255, 255)
const CLOUD_SHADE := Color8(206, 226, 250)
const HILL_FAR := Color8(120, 196, 200)
const HILL_FAR_SHADE := Color8(100, 172, 184)
const HILL_NEAR := Color8(70, 172, 84)
const HILL_NEAR_SHADE := Color8(52, 140, 70)
const GRASS := Color8(92, 208, 72)
const GRASS_LIGHT := Color8(170, 240, 110)
const GRASS_DARK := Color8(40, 128, 48)
const DIRT_A := Color8(214, 120, 52)
const DIRT_B := Color8(176, 88, 40)
const DIRT_SHADE := Color8(120, 58, 30)

const CLOUDS := [Vector3(40, 46, 1.0), Vector3(170, 30, 0.8), Vector3(300, 54, 1.1), Vector3(410, 24, 0.7)]

var _time := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


func _draw() -> void:
	var w := size.x if size.x > 0 else 424.0
	var h := size.y if size.y > 0 else 240.0
	# Sky in flat bands, lighter toward the horizon (atmospheric depth).
	var band := ceilf(ground_y / SKY.size())
	for i in SKY.size():
		draw_rect(Rect2(0, i * band, w, band + 1), SKY[i])
	_disc(Vector2(w - 70, 44), 20, SUN)
	_disc(Vector2(w - 70, 44), 14, SUN_CORE)
	for cloud in CLOUDS:
		var x := fposmod(cloud.x + _time * cloud_speed * cloud.z, w + 80.0) - 40.0
		_cloud(Vector2(roundf(x), cloud.y), cloud.z)
	# Far hills (light, bluish), then near hills (rich green).
	for i in 6:
		var cx := fposmod(i * 92.0 - 20.0, w + 100.0) - 20.0
		_disc(Vector2(cx, ground_y + 26), 70 + (i % 2) * 18, HILL_FAR)
		_disc(Vector2(cx + 8, ground_y + 30), 62 + (i % 2) * 18, HILL_FAR_SHADE)
	for i in 5:
		var cx := i * 110.0 + 30.0
		_disc(Vector2(cx, ground_y + 34), 52 + (i % 3) * 8, HILL_NEAR)
		_disc(Vector2(cx + 10, ground_y + 40), 46 + (i % 3) * 8, HILL_NEAR_SHADE)
	# Ground: argyle dirt with a shaded bottom, then the grass lip on top.
	var top := ground_y
	draw_rect(Rect2(0, top, w, h - top), DIRT_B)
	var cell := 12.0
	var rows := int((h - top) / cell) + 2
	for row in rows:
		for col in int(w / cell) + 2:
			if (row + col) % 2 == 0:
				var c := Vector2(col * cell, top + 6 + row * cell)
				draw_colored_polygon(PackedVector2Array([
					c + Vector2(0, -cell * 0.5), c + Vector2(cell * 0.5, 0),
					c + Vector2(0, cell * 0.5), c + Vector2(-cell * 0.5, 0)]), DIRT_A)
	draw_rect(Rect2(0, h - 8, w, 8), Color(DIRT_SHADE, 0.6))
	draw_rect(Rect2(0, top - 3, w, 7), GRASS)
	draw_rect(Rect2(0, top - 3, w, 1), GRASS_LIGHT)
	draw_rect(Rect2(0, top + 4, w, 1), GRASS_DARK)
	for x in range(0, int(w), 6):
		# Hanging tufts under the lip.
		draw_rect(Rect2(x + 2, top + 5, 2, 2 + int(x / 6.0) % 2), GRASS_DARK)
	if dim > 0.0:
		draw_rect(Rect2(0, 0, w, h), Color(0.02, 0.03, 0.1, dim))


func _cloud(at: Vector2, scale_: float) -> void:
	var r := 9.0 * scale_
	for p in [Vector2(-r * 1.4, 2), Vector2(r * 1.4, 2), Vector2(0, -r * 0.4)]:
		_disc(at + p + Vector2(0, 2), r, CLOUD_SHADE)
	for p in [Vector2(-r * 1.4, 0), Vector2(r * 1.4, 0), Vector2(0, -r * 0.6)]:
		_disc(at + p, r, CLOUD)
	draw_rect(Rect2(at.x - r * 2.2, at.y, r * 4.4, r * 0.9), CLOUD)


func _disc(center: Vector2, radius: float, color: Color) -> void:
	draw_circle(center.round(), radius, color, true, -1.0, false)
