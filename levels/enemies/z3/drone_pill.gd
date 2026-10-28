extends "res://levels/enemies/floater.gd"
## Drone pill (Capital Mansion, tier 2): the Floater behaviour in the zone
## costume: a navy and white capsule under a rotor, sweeping a searchlight
## cone below it as it drifts.

const ART := preload("res://levels/enemies/z3/mansion_art.gd")


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position, Vector2.RIGHT, HALF_LENGTH, RADIUS,
			PillArt.WHITE if _facing > 0 else PillArt.NAVY, PillArt.NAVY if _facing > 0 else PillArt.WHITE, PillArt.OUTLINE)


func _draw() -> void:
	ART.draw_searchlight(self, Vector2(0.0, RADIUS), Vector2(sin(_spin * 0.3) * 0.4, 1.0).normalized(), 56.0)
	ART.draw_rotor(self, RADIUS, _spin)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(_facing, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, PillArt.MANSION)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 1.0, -1.0), 6.0, 1)
	draw_set_transform(Vector2.ZERO)
