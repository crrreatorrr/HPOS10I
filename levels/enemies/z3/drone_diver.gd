extends "res://levels/enemies/diver.gd"
## Drone pill, diving kind (Capital Mansion, tier 3): the Diver behaviour in
## the zone costume: a navy and white capsule under a rotor whose searchlight
## snaps onto the marked spot during the telegraph.

const ART := preload("res://levels/enemies/z3/mansion_art.gd")


func _palette() -> Array:
	return PillArt.MANSION


func _draw() -> void:
	_draw_target()
	var dir := (target - global_position).normalized() if mode == Mode.TELEGRAPH else Vector2(sin(_flap * 0.5) * 0.4, 1.0).normalized()
	ART.draw_searchlight(self, Vector2(0.0, RADIUS), dir, 64.0 if mode == Mode.TELEGRAPH else 48.0, mode != Mode.REST)
	ART.draw_rotor(self, RADIUS, _flap * 2.0)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(_facing, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, PillArt.MANSION)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 1.0, -1.0), 6.0, 2, false, _visor_flash())
	draw_set_transform(Vector2.ZERO)
