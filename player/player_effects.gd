extends Node
## Watches Sproto and spawns feel effects: dust on skids, hard landings and
## spin dash charges and releases. It only reads the player's public state,
## after the player has moved each tick, so physics is never affected.

## A landing faster than this (px/frame, downwards) raises dust.
const HARD_LANDING_SPEED := 6.0
## While skidding, a puff every this many frames.
const SKID_PUFF_FRAMES := 4

var _player: Player
var _was_grounded := true
var _fall_speed := 0.0
var _charge := 0.0
var _frame := 0


func _ready() -> void:
	_player = get_parent() as Player
	process_physics_priority = 50  # after the player, before the camera
	_player.state_changed.connect(_on_state_changed)


func _physics_process(_delta: float) -> void:
	_frame += 1
	if Effects.enabled and _player.state != &"dead":
		var feet := _feet()
		if _player.state == &"skid" and _frame % SKID_PUFF_FRAMES == 0:
			Effects.dust(_player.get_parent(), feet, float(_player.facing), 1)
		if _player.grounded and not _was_grounded and _fall_speed >= HARD_LANDING_SPEED:
			Effects.dust(_player.get_parent(), feet + Vector2(-5, 0), -1.0, 2)
			Effects.dust(_player.get_parent(), feet + Vector2(5, 0), 1.0, 2)
		if _player.state == &"spindash" and _player.spindash_charge > _charge + 0.5:
			Effects.dust(_player.get_parent(), feet, -float(_player.facing), 2)
	_charge = _player.spindash_charge
	_was_grounded = _player.grounded
	_fall_speed = _player.velocity.y


func _on_state_changed(old: StringName, new: StringName) -> void:
	if Effects.enabled and old == &"spindash" and new == &"roll":
		Effects.dust(_player.get_parent(), _feet() - Vector2(_player.facing * 6.0, 0.0),
				-float(_player.facing), 4, 1.4)


## Bottom of the hitbox, on the side of the current floor.
func _feet() -> Vector2:
	return _player.global_position + Player.mode_down(_player.collision_mode) * _player.get_radii().y
