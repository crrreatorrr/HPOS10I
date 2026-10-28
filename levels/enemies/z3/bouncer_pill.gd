extends "res://levels/enemies/armored.gd"
## Bouncer pill (Capital Mansion, tier 3): the Armored behaviour in the zone
## costume: a navy and white capsule in a dark tie holding a briefcase up as
## its shield.

const ART := preload("res://levels/enemies/z3/mansion_art.gd")


func _palette() -> Array:
	return PillArt.MANSION


func _draw_over_body() -> void:
	# A tie down the seam.
	draw_colored_polygon(PackedVector2Array([Vector2(-1.5, -RADIUS + 1.0), Vector2(1.5, -RADIUS + 1.0),
			Vector2(2.0, RADIUS - 2.0), Vector2(0.0, RADIUS), Vector2(-2.0, RADIUS - 2.0)]), PillArt.VISOR)
	_draw_shield()


func _draw_shield() -> void:
	ART.draw_briefcase(self, HALF_LENGTH + RADIUS + 2.0)
