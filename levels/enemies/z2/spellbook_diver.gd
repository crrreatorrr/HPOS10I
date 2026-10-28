extends "res://levels/enemies/diver.gd"
## Spellbook pill, diving kind (Wizard Academy, tier 3): the Diver behaviour
## (marks where Sproto is, telegraphs, swoops at that spot) in the zone
## costume: a purple and cream capsule riding an enchanted book whose covers
## beat faster in a swoop.

const ART := preload("res://levels/enemies/z2/spellbook_art.gd")


func _palette() -> Array:
	return PillArt.WIZARD


func _draw() -> void:
	_draw_target()
	ART.draw_book(self, Vector2(0.0, RADIUS + 3.0), _flap)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(_facing, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, PillArt.WIZARD)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 1.0, -1.0), 6.0, 2, false, _visor_flash())
	PillArt.draw_antenna(self, Vector2(-HALF_LENGTH + 1.0, -RADIUS - 1.0), 4.0)
	draw_set_transform(Vector2.ZERO)
