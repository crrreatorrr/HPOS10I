extends "res://levels/enemies/dropper.gd"
## Lantern pill (Wizard Academy, tier 4): the Dropper behaviour (hangs from
## the ceiling, shakes when Sproto moves in under it, then drops) in the zone
## costume: a purple and cream capsule in a little gold lantern cage that
## glows warmer while it shakes.

const ART := preload("res://levels/enemies/z2/spellbook_art.gd")
const GLOW := Color(1.0, 0.78, 0.36, 0.35)


func _palette() -> Array:
	return PillArt.WIZARD


func _draw() -> void:
	var shake := _shake()
	var glow_r := 13.0 + (2.0 if mode == Mode.SHAKING else 0.0)
	draw_circle(shake, glow_r, GLOW)
	super()
	# The cage: a cap, a base and four bars, in gold.
	var top := -HALF_LENGTH - RADIUS - 3.0
	var bottom := HALF_LENGTH + RADIUS + 2.0
	draw_rect(Rect2(shake + Vector2(-8.0, top - 1.0), Vector2(16.0, 3.0)), PillArt.OUTLINE)
	draw_rect(Rect2(shake + Vector2(-7.0, top), Vector2(14.0, 1.0)), ART.GOLD)
	draw_rect(Rect2(shake + Vector2(-8.0, bottom - 1.0), Vector2(16.0, 3.0)), PillArt.OUTLINE)
	draw_rect(Rect2(shake + Vector2(-7.0, bottom), Vector2(14.0, 1.0)), ART.GOLD)
	for x in [-9.0, 8.0]:
		draw_line(shake + Vector2(x + 0.5, top + 1.0), shake + Vector2(x + 0.5, bottom), ART.GOLD, 1.0)
