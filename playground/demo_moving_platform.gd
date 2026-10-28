extends AnimatableBody2D
## A minimal moving platform for the physics playground and tests, and a
## reference for the zones' moving objects (docs/CONTRACTS.md, "Moving
## terrain"): an AnimatableBody2D with sync_to_physics, moved only in
## _physics_process, exposing platform_delta().
##
## It shuttles between its start and start + `travel`: linear with an instant
## turn, or eased (sine). Tests can drive it frame by frame with `offset_at`.
## The origin is the middle of the top surface.

## Size of the platform (the top surface is the origin's y).
@export var size := Vector2(64.0, 12.0)
## Offset of the far end of the trip.
@export var travel := Vector2(160.0, 0.0)
## Frames for a full trip there and back.
@export var period_frames := 240
## Ease in and out (sine) instead of turning instantly.
@export var eased := false
## Jump-through from below (Layers.TERRAIN_TOP_ONLY) instead of solid.
@export var top_only := false
@export var color := Color(0.85, 0.55, 0.25)

## Optional script: frame number -> offset from the start (overrides travel).
var offset_at: Callable

## Physics ticks since it started (tests may reset it to 0).
var frame := 0

var _start := Vector2.ZERO
var _target := Vector2.ZERO
var _delta := Vector2.ZERO


func _ready() -> void:
	sync_to_physics = true
	collision_layer = Layers.TERRAIN_TOP_ONLY if top_only else Layers.TERRAIN_SOLID
	collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	shape.position = Vector2(0.0, size.y / 2.0)
	add_child(shape)
	var visual := Polygon2D.new()
	visual.color = color
	visual.polygon = PackedVector2Array([Vector2(-size.x / 2.0, 0.0), Vector2(size.x / 2.0, 0.0),
			Vector2(size.x / 2.0, size.y), Vector2(-size.x / 2.0, size.y)])
	add_child(visual)
	var lip := Line2D.new()
	lip.points = PackedVector2Array([Vector2(-size.x / 2.0, 1.0), Vector2(size.x / 2.0, 1.0)])
	lip.width = 2.0
	lip.default_color = color.lightened(0.4)
	add_child(lip)
	_start = position
	_target = position


## The displacement applied this physics tick (the contract).
func platform_delta() -> Vector2:
	return _delta


## Where the platform is going this tick (its node position only updates after
## the physics step, with sync_to_physics).
func target_position() -> Vector2:
	return _target


func _physics_process(_delta_time: float) -> void:
	frame += 1
	var next := _start + _offset(frame)
	_delta = next - _target
	_target = next
	position = next


func _offset(at: int) -> Vector2:
	if offset_at.is_valid():
		return offset_at.call(at)
	if period_frames <= 0:
		return Vector2.ZERO
	var phase := float(at % period_frames) / float(period_frames)
	var amount := (1.0 - cos(phase * TAU)) / 2.0 if eased else 1.0 - absf(1.0 - 2.0 * phase)
	return travel * amount
