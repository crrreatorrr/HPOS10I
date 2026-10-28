extends "res://levels/enemies/sniper.gd"
## Camera pill (Capital Mansion, tier 4): the Sniper behaviour in the zone
## costume: a navy and white capsule inside a security-camera housing whose
## lens turns to follow Sproto and glows during the telegraph.

const ART := preload("res://levels/enemies/z3/mansion_art.gd")


func _palette() -> Array:
	return PillArt.MANSION


func _draw() -> void:
	_draw_sight()
	draw_rect(Rect2(-8.0, -3.0, 16.0, 3.0), PillArt.OUTLINE)
	draw_rect(Rect2(-7.0, -2.0, 14.0, 1.0), PillArt.METAL_DARK)
	draw_line(Vector2(0.0, -3.0), Vector2(0.0, BODY_Y + 8.0), PillArt.OUTLINE, 4.0)
	draw_line(Vector2(0.0, -3.0), Vector2(0.0, BODY_Y + 8.0), PillArt.METAL, 2.0)
	ART.draw_camera_housing(self, BODY_Y, _aim)
	draw_set_transform(Vector2(0.0, BODY_Y), -PI * 0.5, Vector2(0.8, 0.8))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, PillArt.MANSION)
	draw_set_transform(Vector2.ZERO)
	var lens := Vector2(0.0, BODY_Y) + _aim * 9.0
	if _flash():
		draw_circle(lens, 3.0, PillArt.FLASH)
