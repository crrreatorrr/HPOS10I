extends "res://levels/enemies/dropper.gd"
## Chandelier pill (Capital Mansion, tier 4): the Dropper behaviour in the
## zone costume: a navy and white capsule hanging inside a crystal
## chandelier, which rattles before it falls.

const ART := preload("res://levels/enemies/z3/mansion_art.gd")


func _palette() -> Array:
	return PillArt.MANSION


func _draw() -> void:
	super()
	ART.draw_chandelier(self, RADIUS, _shake().x)
