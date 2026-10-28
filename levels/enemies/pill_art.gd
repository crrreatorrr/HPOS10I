class_name PillArt
extends RefCounted
## Code-drawn pill robots (docs/DESIGN.md, "Pill robots"): a rounded capsule
## split across the middle into two colours, a thick dark outline, a soft
## shadow along the lower side, a white dashed shine on the coloured half, a
## seam band with bolts, a dark visor slit with glowing eye dots and a small
## antenna. No text or markings. Palettes: the basic mint/white set (Zone 1
## and the test zone), Wizard Academy's purple/cream and Capital Mansion's
## navy/white.

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
## Telegraph flash (visor, spike tips, cannon glow).
const FLASH := Color(1.0, 0.95, 0.55)
const SPIKE := Color(1.0, 0.56, 0.12)
const SPIKE_DARK := Color(0.72, 0.3, 0.06)
## Wizard Academy (docs/DESIGN.md): purple and cream.
const PURPLE := Color(0.6, 0.38, 0.86)
const PURPLE_SHADE := Color(0.42, 0.24, 0.66)
const PURPLE_DARK := Color(0.28, 0.14, 0.44)
const CREAM := Color(0.98, 0.93, 0.8)
const CREAM_SHADE := Color(0.84, 0.76, 0.6)
const GOLD := Color(0.98, 0.8, 0.3)

## Capital Mansion (docs/DESIGN.md): navy and white.
const NAVY := Color(0.18, 0.26, 0.52)
const NAVY_SHADE := Color(0.1, 0.15, 0.36)
const SILVER := Color(0.8, 0.84, 0.9)

## [coloured half, its shade, white half, its shade].
const BASIC := [MINT, MINT_SHADE, WHITE, WHITE_SHADE]
const WIZARD := [PURPLE, PURPLE_SHADE, CREAM, CREAM_SHADE]
const MANSION := [NAVY, NAVY_SHADE, WHITE, WHITE_SHADE]


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
## (mint) half: +1 the right half, -1 the left half. `palette` is BASIC,
## WIZARD or another [coloured, coloured shade, white, white shade].
static func draw_capsule(canvas: CanvasItem, half_length: float, r: float, front: int, palette: Array = BASIC) -> void:
	var outline := capsule_points(half_length, r + 1.5)
	canvas.draw_colored_polygon(outline, OUTLINE)
	var body := capsule_points(half_length, r)
	var right_half := Geometry2D.intersect_polygons(body, _rect(0.0, -r - 2.0, half_length + r + 2.0, r + 2.0))
	var left_half := Geometry2D.intersect_polygons(body, _rect(-half_length - r - 2.0, -r - 2.0, 0.0, r + 2.0))
	var mint_half := right_half if front > 0 else left_half
	var white_half := left_half if front > 0 else right_half
	_fill(canvas, white_half, palette[2])
	_fill(canvas, mint_half, palette[0])
	# Soft shadow along the lower side.
	var lower := _rect(-half_length - r - 2.0, r * 0.35, half_length + r + 2.0, r + 2.0)
	for part in white_half:
		_fill(canvas, Geometry2D.intersect_polygons(part, lower), palette[3])
	for part in mint_half:
		_fill(canvas, Geometry2D.intersect_polygons(part, lower), palette[1])
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
## `flash` lights the whole slit (a telegraph before an attack).
static func draw_visor(canvas: CanvasItem, at: Vector2, width: float, eyes: int, blink := false, flash := false) -> void:
	canvas.draw_rect(Rect2(at - Vector2(width / 2.0 + 1.0, 2.5), Vector2(width + 2.0, 5.0)), OUTLINE)
	canvas.draw_rect(Rect2(at - Vector2(width / 2.0, 1.5), Vector2(width, 3.0)), FLASH if flash else VISOR)
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
