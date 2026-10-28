extends RefCounted
## Capital Mansion costume pieces (docs/DESIGN.md "Pill robots"), drawn in
## code: the drone pill's rotor and searchlight, the clerk's paper stacks,
## the bouncer's briefcase shield, the chandelier the ceiling pill hangs in
## and the camera housing. Navy and white; no seals, flags, logos or text.

const ROTOR := Color(0.3, 0.32, 0.4)
const LIGHT := Color(1.0, 0.95, 0.7, 0.35)
const LIGHT_CORE := Color(1.0, 1.0, 0.85)
const PAPER := Color(0.97, 0.97, 0.95)
const PAPER_SHADE := Color(0.78, 0.8, 0.86)
const LEATHER := Color(0.36, 0.2, 0.12)
const LEATHER_LIGHT := Color(0.52, 0.32, 0.2)
const BRASS := Color(0.95, 0.8, 0.4)
const CRYSTAL := Color(0.85, 0.92, 1.0)
const CRYSTAL_SHADE := Color(0.6, 0.72, 0.9)


## A rotor on a mast above a capsule of radius `r`; `spin` is a phase.
static func draw_rotor(canvas: CanvasItem, r: float, spin: float) -> void:
	canvas.draw_line(Vector2(0, -r - 1.0), Vector2(0, -r - 5.0), PillArt.OUTLINE, 2.0)
	var blade := absf(cos(spin)) * 11.0 + 2.0
	canvas.draw_rect(Rect2(-blade, -r - 7.0, blade * 2.0, 2.0), PillArt.OUTLINE)
	canvas.draw_rect(Rect2(-blade + 1.0, -r - 6.5, blade * 2.0 - 2.0, 1.0), ROTOR)


## A searchlight cone from `from` towards `dir` (unit), `length` px long.
static func draw_searchlight(canvas: CanvasItem, from: Vector2, dir: Vector2, length: float, lit := true) -> void:
	var side := dir.orthogonal() * (length * 0.22)
	var cone := PackedVector2Array([from, from + dir * length + side, from + dir * length - side])
	canvas.draw_colored_polygon(cone, LIGHT if lit else Color(LIGHT, 0.15))
	canvas.draw_circle(from, 2.5, PillArt.OUTLINE)
	canvas.draw_circle(from, 1.5, LIGHT_CORE if lit else PillArt.METAL)


## Stacks of paper balanced on the clerk's base, in the body frame (facing +x).
static func draw_paper_stacks(canvas: CanvasItem, shake: float) -> void:
	for k in 2:
		var x := -12.0 + k * 20.0 + shake * (1.0 if k == 0 else -1.0)
		canvas.draw_rect(Rect2(x - 5.0, -9.0 - k * 2.0, 10.0, 9.0 + k * 2.0), PillArt.OUTLINE)
		canvas.draw_rect(Rect2(x - 4.0, -8.0 - k * 2.0, 8.0, 8.0 + k * 2.0), PAPER)
		for y in range(-7 - k * 2, -1, 2):
			canvas.draw_line(Vector2(x - 4.0, y), Vector2(x + 4.0, y), PAPER_SHADE, 1.0)


## A briefcase held up as a shield on the front (body frame, facing +x).
static func draw_briefcase(canvas: CanvasItem, x: float) -> void:
	var r := Rect2(x - 1.0, -10.0, 7.0, 20.0)
	canvas.draw_rect(r.grow(1.0), PillArt.OUTLINE)
	canvas.draw_rect(r, LEATHER)
	canvas.draw_rect(Rect2(r.position + Vector2(1.0, 1.0), Vector2(5.0, 2.0)), LEATHER_LIGHT)
	canvas.draw_rect(Rect2(x + 1.0, -1.5, 3.0, 3.0), BRASS)
	canvas.draw_rect(Rect2(x + 1.0, -13.0, 3.0, 3.0), PillArt.OUTLINE, false, 1.0)


## A crystal chandelier around a hanging capsule (centre at the origin).
static func draw_chandelier(canvas: CanvasItem, r: float, sway: float) -> void:
	var arm_y := 2.0
	canvas.draw_line(Vector2(-16.0 + sway, arm_y), Vector2(16.0 + sway, arm_y), PillArt.OUTLINE, 4.0)
	canvas.draw_line(Vector2(-16.0 + sway, arm_y), Vector2(16.0 + sway, arm_y), BRASS, 2.0)
	for x in [-16.0, -8.0, 8.0, 16.0]:
		var top := Vector2(x + sway, arm_y)
		var crystal := PackedVector2Array([top + Vector2(-2.5, 1.0), top + Vector2(2.5, 1.0), top + Vector2(0.0, 9.0)])
		canvas.draw_colored_polygon(crystal, CRYSTAL)
		canvas.draw_polyline(crystal + PackedVector2Array([crystal[0]]), CRYSTAL_SHADE, 1.0)
		canvas.draw_circle(top + Vector2(0.0, -4.0), 2.0, PillArt.OUTLINE)
		canvas.draw_circle(top + Vector2(0.0, -4.0), 1.2, LIGHT_CORE)


## A dark camera housing with a lens ring, in the turret's frame (origin at its base).
static func draw_camera_housing(canvas: CanvasItem, body_y: float, aim: Vector2) -> void:
	canvas.draw_rect(Rect2(-10.0, body_y - 11.0, 20.0, 22.0), PillArt.OUTLINE)
	canvas.draw_rect(Rect2(-9.0, body_y - 10.0, 18.0, 20.0), ROTOR)
	canvas.draw_rect(Rect2(-9.0, body_y - 10.0, 18.0, 3.0), PillArt.METAL)
	var lens := Vector2(0.0, body_y) + aim * 9.0
	canvas.draw_circle(lens, 4.5, PillArt.OUTLINE)
	canvas.draw_circle(lens, 3.5, PillArt.VISOR)
	canvas.draw_circle(lens + Vector2(-1.0, -1.0), 1.0, CRYSTAL)
