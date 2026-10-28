extends "res://levels/enemies/armored.gd"
## Knight pill (Wizard Academy, tier 3): the Armored behaviour (a front
## shield that only a roll at 4.5+, a spin dash or a hit from above or
## behind gets past) in the zone costume: a purple and cream capsule in a
## little knight helmet with a plume, a breastplate and a plain shield.

const ART := preload("res://levels/enemies/z2/spellbook_art.gd")


func _palette() -> Array:
	return PillArt.WIZARD


func _draw_over_body() -> void:
	ART.draw_breastplate(self, RADIUS)
	ART.draw_helmet(self, RADIUS, sin(_roll * 0.2) * 1.5)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 2.0, -1.5), 6.0, 2, false, _visor_flash())
	_draw_shield()


func _shield_color() -> Color:
	return ART.STEEL
