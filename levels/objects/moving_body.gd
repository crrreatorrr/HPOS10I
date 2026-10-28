class_name MovingBody
extends AnimatableBody2D
## Base for moving terrain pieces (docs/CONTRACTS.md, "Moving terrain"; the
## reference is playground/demo_moving_platform.gd): an AnimatableBody2D with
## sync_to_physics on the terrain bits, moved only from _physics_process
## through move_to(), exposing platform_delta() (which marks it as moving
## terrain for the player) and target_position() (the node position only
## updates after the physics step). Teleports go through teleport(), which
## resets interpolation and doesn't carry the player.
##
## The owner (the piece itself or a parent like a staircase) calls
## move_to() every physics tick, with the same position when it stays put,
## so platform_delta() is always this tick's displacement.

## Jump-through from below (Layers.TERRAIN_TOP_ONLY) instead of solid.
@export var top_only := false

var _target := Vector2.ZERO
var _delta := Vector2.ZERO


func _notification(what: int) -> void:
	if what == NOTIFICATION_READY:
		sync_to_physics = true
		collision_layer = Layers.TERRAIN_TOP_ONLY if top_only else Layers.TERRAIN_SOLID
		collision_mask = 0
		_target = position


## The displacement applied this physics tick (the contract).
func platform_delta() -> Vector2:
	return _delta


## Where the body is going this tick (its local position).
func target_position() -> Vector2:
	return _target


## Moves to `local_position` this tick (call from _physics_process).
func move_to(local_position: Vector2) -> void:
	_delta = local_position - _target
	_target = local_position
	position = local_position


## Jumps to `local_position` without carrying anything (resets interpolation).
func teleport(local_position: Vector2) -> void:
	_delta = Vector2.ZERO
	_target = local_position
	position = local_position
	reset_physics_interpolation()


## Adds a rectangle collision shape of `size` with its top-left at `top_left`.
func add_box(size: Vector2, top_left := Vector2.ZERO) -> CollisionShape2D:
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	shape.position = top_left + size / 2.0
	add_child(shape)
	return shape
