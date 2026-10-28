class_name PillArt
extends RefCounted
## Code-drawn pill robots (docs/DESIGN.md, "Pill robots"): a rounded capsule
## split across the middle into two colours, a thick dark outline, a soft
## shadow along the lower side, a white dashed shine on the coloured half, a
## seam band with bolts, a dark visor slit with glowing eye dots and a small
## antenna. No text or markings. Colours are the basic mint/white set used in
## Zone 1 and the test zone.

const OUTLINE := Color(0.12, 0.12, 0.2)
const MINT := Color(0.47, 0.9, 0.68)
const MINT_SHADE := Color(0.27, 0.66, 0.5)
const WHITE := Color(0.97, 0.97, 0.95)
const WHITE_SHADE := Color(0.74, 0.77, 0.86)
const SHINE := Color(1.0, 1.0, 1.0, 0.95)
const SEAM := Color(0.56, 0.58, 0.68)
const BOLT := Color(0.88, 0.9, 0.95)
const VISOR := Color(0.09, 0.09, 0.16)
const EYE := Color(1.0, 0.3, 0.24)
const EYE_GLOW := Color(1.0, 0.78, 0.62)
const METAL := Color(0.62, 0.64, 0.72)
const METAL_DARK := Color(0.32, 0.33, 0.42)


## Points of a horizontal capsule (straight part ±half_length, end radius r).
static func capsule_points(half_length: float, r: float, steps := 8) -> PackedVector2Array:
	var points := PackedVector2Array()
	for k in steps + 1:
		var a := -PI * 0.5 + PI * k / steps
		points.append(Vector2(half_length, 0.0) + Vector2(cos(a), sin(a)) * r)
	for k in steps + 1:
		var a := PI * 0.5 + PI * k / steps
		points.append(Vector2(-half_length, 0.0) + Vector2(cos(a), sin(a)) * r)
	return points


## Draws a capsule body lying along local x, centred at the canvas origin
## (use draw_set_transform to place and turn it). `front` is the coloured
## (mint) half: +1 the right half, -1 the left half.
static func draw_capsule(canvas: CanvasItem, half_length: float, r: float, front: int) -> void:
	var outline := capsule_points(half_length, r + 1.5)
	canvas.draw_colored_polygon(outline, OUTLINE)
	var body := capsule_points(half_length, r)
	var right_half := Geometry2D.intersect_polygons(body, _rect(0.0, -r - 2.0, half_length + r + 2.0, r + 2.0))
	var left_half := Geometry2D.intersect_polygons(body, _rect(-half_length - r - 2.0, -r - 2.0, 0.0, r + 2.0))
	var mint_half := right_half if front > 0 else left_half
	var white_half := left_half if front > 0 else right_half
	_fill(canvas, white_half, WHITE)
	_fill(canvas, mint_half, MINT)
	# Soft shadow along the lower side.
	var lower := _rect(-half_length - r - 2.0, r * 0.35, half_length + r + 2.0, r + 2.0)
	for part in white_half:
		_fill(canvas, Geometry2D.intersect_polygons(part, lower), WHITE_SHADE)
	for part in mint_half:
		_fill(canvas, Geometry2D.intersect_polygons(part, lower), MINT_SHADE)
	# White dashed shine on the coloured half.
	var y := -r * 0.55
	for i in 3:
		var x0 := front * (2.5 + i * 3.5)
		canvas.draw_line(Vector2(x0, y), Vector2(x0 + front * 2.0, y), SHINE, 1.0)
	# Seam band with two bolts.
	canvas.draw_rect(Rect2(-1.5, -r, 3.0, r * 2.0), SEAM)
	canvas.draw_line(Vector2(-1.5, -r), Vector2(-1.5, r), OUTLINE, 1.0)
	canvas.draw_line(Vector2(1.5, -r), Vector2(1.5, r), OUTLINE, 1.0)
	canvas.draw_rect(Rect2(-0.5, -r * 0.5 - 0.5, 1.0, 1.0), BOLT)
	canvas.draw_rect(Rect2(-0.5, r * 0.5 - 0.5, 1.0, 1.0), BOLT)


## A dark visor slit with one or two glowing eye dots, centred at `at`.
static func draw_visor(canvas: CanvasItem, at: Vector2, width: float, eyes: int, blink := false) -> void:
	canvas.draw_rect(Rect2(at - Vector2(width / 2.0 + 1.0, 2.5), Vector2(width + 2.0, 5.0)), OUTLINE)
	canvas.draw_rect(Rect2(at - Vector2(width / 2.0, 1.5), Vector2(width, 3.0)), VISOR)
	if blink:
		return
	var xs := PackedFloat32Array([0.0]) if eyes == 1 else PackedFloat32Array([-width / 4.0, width / 4.0])
	for x in xs:
		canvas.draw_rect(Rect2(at + Vector2(x - 1.0, -1.0), Vector2(2.0, 2.0)), EYE)
		canvas.draw_rect(Rect2(at + Vector2(x - 1.0, -1.0), Vector2(1.0, 1.0)), EYE_GLOW)


## A small antenna from `base` going `up` px straight up, with a glowing tip.
static func draw_antenna(canvas: CanvasItem, base: Vector2, up: float, sway := 0.0) -> void:
	var tip := base + Vector2(sway, -up)
	canvas.draw_line(base, tip, OUTLINE, 2.0)
	canvas.draw_line(base, tip, METAL, 1.0)
	canvas.draw_circle(tip, 2.0, OUTLINE)
	canvas.draw_circle(tip, 1.2, EYE)


static func _rect(x0: float, y0: float, x1: float, y1: float) -> PackedVector2Array:
	return PackedVector2Array([Vector2(x0, y0), Vector2(x1, y0), Vector2(x1, y1), Vector2(x0, y1)])


static func _fill(canvas: CanvasItem, polygons: Array, color: Color) -> void:
	for polygon: PackedVector2Array in polygons:
		if polygon.size() >= 3:
			canvas.draw_colored_polygon(polygon, color)
