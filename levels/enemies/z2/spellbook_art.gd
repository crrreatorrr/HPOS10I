extends RefCounted
## Wizard Academy costume pieces (docs/DESIGN.md "Pill robots"), drawn in
## code: the enchanted book a spellbook pill rides, and the knight pill's
## helmet and breastplate. Purple and cream; no lettering, crests or symbols.

const COVER := Color(0.42, 0.24, 0.66)
const COVER_LIGHT := Color(0.6, 0.38, 0.86)
const PAGES := Color(0.98, 0.93, 0.8)
const PAGES_SHADE := Color(0.84, 0.76, 0.6)
const GOLD := Color(0.98, 0.8, 0.3)
const STEEL := Color(0.72, 0.74, 0.82)
const STEEL_DARK := Color(0.44, 0.46, 0.56)


## An open book flapping its covers like wings, its spine at `at`.
## `flap` is a phase (radians); the halves swing between about -10 and +30
## degrees above flat.
static func draw_book(canvas: CanvasItem, at: Vector2, flap: float) -> void:
	var angle := deg_to_rad(10.0 + sin(flap) * 20.0)
	for side: float in [-1.0, 1.0]:
		var dir := Vector2(cos(angle) * side, -sin(angle))
		var up := Vector2(-dir.y, dir.x) * (-side)  # perpendicular, pointing up
		# Cover (purple, thick) with the pages (cream) lying on top of it.
		var cover := PackedVector2Array([at, at + dir * 14.0, at + dir * 14.0 - up * 4.0, at - up * 4.0])
		var pages := PackedVector2Array([at + up * 0.5, at + dir * 12.0 + up * 0.5, at + dir * 12.0 + up * 3.5, at + up * 3.5])
		canvas.draw_colored_polygon(cover, COVER)
		canvas.draw_polyline(cover + PackedVector2Array([cover[0]]), PillArt.OUTLINE, 1.0)
		canvas.draw_colored_polygon(pages, PAGES)
		canvas.draw_polyline(pages + PackedVector2Array([pages[0]]), PillArt.OUTLINE, 1.0)
		canvas.draw_line(at + dir * 3.0 + up * 2.0, at + dir * 10.0 + up * 2.0, PAGES_SHADE, 1.0)
		canvas.draw_line(at + dir * 2.0 - up * 2.0, at + dir * 13.0 - up * 2.0, COVER_LIGHT, 1.0)
	canvas.draw_rect(Rect2(at + Vector2(-1.5, -1.0), Vector2(3.0, 4.0)), GOLD)


## A rounded knight helmet over a capsule of radius `r` (body frame, facing
## +x), with a visor slot cut by the caller's visor and a purple plume.
static func draw_helmet(canvas: CanvasItem, r: float, sway: float) -> void:
	var dome := PackedVector2Array()
	for k in 9:
		var a := PI + PI * k / 8.0
		dome.append(Vector2(cos(a) * (r + 3.0) - 1.0, sin(a) * (r + 2.0) - 1.0))
	canvas.draw_colored_polygon(dome, STEEL)
	canvas.draw_polyline(dome, PillArt.OUTLINE, 1.0)
	canvas.draw_line(Vector2(-r - 4.0, -1.0), Vector2(r + 2.0, -1.0), STEEL_DARK, 2.0)
	var plume := PackedVector2Array([Vector2(-2.0, -r - 2.0), Vector2(-6.0 + sway, -r - 9.0),
			Vector2(-11.0 + sway, -r - 7.0), Vector2(-6.0, -r - 1.0)])
	canvas.draw_colored_polygon(plume, COVER_LIGHT)
	canvas.draw_polyline(plume + PackedVector2Array([plume[0]]), PillArt.OUTLINE, 1.0)


## A breastplate band around the capsule's middle.
static func draw_breastplate(canvas: CanvasItem, r: float) -> void:
	canvas.draw_rect(Rect2(-4.0, -r + 1.0, 8.0, r * 2.0 - 2.0), STEEL)
	canvas.draw_rect(Rect2(-4.0, -r + 1.0, 8.0, 1.0), Color.WHITE)
	canvas.draw_line(Vector2(-4.0, -r + 1.0), Vector2(-4.0, r - 1.0), PillArt.OUTLINE, 1.0)
	canvas.draw_line(Vector2(4.0, -r + 1.0), Vector2(4.0, r - 1.0), PillArt.OUTLINE, 1.0)
	canvas.draw_rect(Rect2(-1.0, 1.0, 2.0, 2.0), GOLD)
