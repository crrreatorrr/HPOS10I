extends "res://levels/enemies/floater.gd"
## Spellbook pill (Wizard Academy, tier 2): the Floater behaviour (a sine
## path around where it was placed) in the zone costume: a purple and cream
## capsule riding an enchanted book that flaps its covers like wings.

const ART := preload("res://levels/enemies/z2/spellbook_art.gd")


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position, Vector2.RIGHT, HALF_LENGTH, RADIUS,
			PillArt.CREAM if _facing > 0 else PillArt.PURPLE, PillArt.PURPLE if _facing > 0 else PillArt.CREAM,
			PillArt.OUTLINE)


func _draw() -> void:
	ART.draw_book(self, Vector2(0.0, RADIUS + 3.0), _spin * 0.5)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(_facing, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, PillArt.WIZARD)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 1.0, -1.0), 6.0, 1)
	PillArt.draw_antenna(self, Vector2(-HALF_LENGTH + 1.0, -RADIUS - 1.0), 4.0, sin(_spin * 0.5))
	draw_set_transform(Vector2.ZERO)
