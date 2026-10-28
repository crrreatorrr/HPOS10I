extends "res://levels/enemies/walker.gd"
## Armored pill robot (tier 3, docs/LEVELS.md): a slow walker with a shield
## on its front (the way it faces). From the front the shield hurts Sproto
## even when he jumps or rolls into it, unless he comes down on it from
## above, or rolls into it on the ground at BREAK_SPEED (4.5 px/frame) or
## more; a full spin dash does that. From behind or above it is destroyed
## like any pill. A roll that is too slow bounces off the shield and hurts
## him (knockback and invincibility, so never a double hit).
## Zone costumes extend this script and draw their own look.

const BREAK_SPEED := 4.5

## True when this touch meets the shield and doesn't break it.
func is_harmful(player: Player) -> bool:
	return shield_faces(player) and not breaks_shield(player)


## Sproto is in front of it (the way it faces) and not coming down from above.
func shield_faces(player: Player) -> bool:
	var dx := player.global_position.x - global_position.x
	if from_above(player):
		return false
	return dx == 0.0 or signf(dx) == float(direction)


## Falling onto it: moving down with his centre above the capsule's middle.
func from_above(player: Player) -> bool:
	return player.velocity.y > 0.0 and not player.grounded \
			and player.global_position.y < global_position.y + BODY_Y


## Rolling (or spin dashing) along the ground at BREAK_SPEED or more.
func breaks_shield(player: Player) -> bool:
	return player.grounded and player.state in [&"roll", &"spindash"] \
			and absf(player.ground_speed) >= BREAK_SPEED


func _draw_over_body() -> void:
	_draw_shield()


## A plain shield on the front (local +x in the body's frame).
func _draw_shield() -> void:
	var x := HALF_LENGTH + RADIUS + 2.0
	var shield := PackedVector2Array([Vector2(x, -9.0), Vector2(x + 4.0, -8.0), Vector2(x + 4.0, 4.0),
			Vector2(x + 1.0, 9.0), Vector2(x - 1.0, 4.0), Vector2(x - 1.0, -8.0)])
	draw_colored_polygon(shield, _shield_color())
	draw_polyline(shield + PackedVector2Array([shield[0]]), PillArt.OUTLINE, 1.0)
	draw_line(Vector2(x + 2.0, -6.0), Vector2(x + 2.0, 3.0), PillArt.WHITE, 1.0)


func _shield_color() -> Color:
	return PillArt.METAL
