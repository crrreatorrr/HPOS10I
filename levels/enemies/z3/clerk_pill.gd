extends "res://levels/enemies/pellet_pill.gd"
## Clerk pill (Capital Mansion, tier 2): the Pellet pill behaviour in the zone
## costume, throwing sheets of paper in an arc instead of rolling pellets.
## The throw is aimed at where Sproto stood when the telegraph started (the
## fairness rule for aimed attacks): a sheet flies a parabola to that spot,
## so moving after the flash avoids it. Paper stacks shake while it winds up.

const ART := preload("res://levels/enemies/z3/mansion_art.gd")
const PAPER := "res://levels/enemies/paper_sheet.tscn"
## Frames the sheet takes to reach the spot (at difficulty 1; quicker later).
const FLIGHT := 60.0


func fire() -> Node2D:
	if not ResourceLoader.exists(PAPER):
		return null
	var sheet: Node2D = (load(PAPER) as PackedScene).instantiate()
	var from := global_position + Vector2(facing * (HALF_LENGTH + 4.0), BODY_Y - 10.0)
	var frames := maxf(FLIGHT / sqrt(Difficulty.speed_mult(local_difficulty())), 20.0)
	var gravity: float = sheet.get(&"GRAVITY")
	var d := aim - from
	sheet.set(&"velocity", Vector2(d.x / frames, d.y / frames - 0.5 * gravity * frames))
	sheet.position = from
	get_parent().add_child(sheet)
	sheet.reset_physics_interpolation()
	_recoil = 6
	return sheet


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position + Vector2(0.0, BODY_Y), Vector2.UP,
			HALF_LENGTH, RADIUS, PillArt.WHITE, PillArt.NAVY, PillArt.OUTLINE)


func _draw() -> void:
	var glow := is_telegraphing() and (_timer / 3) % 2 == 0
	draw_rect(Rect2(-9, -3, 18, 3), PillArt.OUTLINE)
	draw_rect(Rect2(-8, -2, 16, 1), PillArt.METAL_DARK)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(facing, 1.0))
	ART.draw_paper_stacks(self, (float(_timer % 2) - 0.5) if is_telegraphing() else 0.0)
	draw_set_transform(Vector2.ZERO)
	draw_set_transform(Vector2(0.0, BODY_Y), -PI * 0.5, Vector2.ONE)
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, PillArt.MANSION)
	draw_set_transform(Vector2.ZERO)
	PillArt.draw_visor(self, Vector2(facing * 1.5, BODY_Y - HALF_LENGTH - 1.0), 8.0, 2, false, glow)
	# A raised arm holding the next sheet, lit while winding up.
	var hand := Vector2(facing * 9.0, BODY_Y - 12.0 - float(_recoil))
	draw_line(Vector2(facing * 4.0, BODY_Y - 4.0), hand, PillArt.OUTLINE, 2.0)
	draw_rect(Rect2(hand + Vector2(-3.0, -8.0), Vector2(6.0, 8.0)), PillArt.FLASH if glow else ART.PAPER)
