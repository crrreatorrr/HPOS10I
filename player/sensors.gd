class_name PlayerSensors
extends RefCounted
## Raycast sensors in the community Physics Guide layout:
##   A/B  floor sensors, left/right of the centre, cast "down" for the current mode
##   C/D  ceiling sensors, left/right of the centre, cast "up"
##   E/F  wall sensors, from the centre, cast left/right
## All casts use PhysicsDirectSpaceState2D.intersect_ray and are recorded each
## frame so the debug overlay can draw them in world space.

const BIT_SOLID := 1
const BIT_PATH_A := 2
const BIT_PATH_B := 4
const BIT_TOP_ONLY := 8


## One sensor result.
class Hit:
	extends RefCounted
	var position: Vector2
	var normal: Vector2
	## Distance from the ray origin to the hit.
	var distance: float
	## Ground angle of the surface (Physics Guide degrees).
	var angle: float
	## True when the surface is a one-way (top-only) platform.
	var top_only: bool


## Every cast this frame: {label, from, to, hit (bool), point}.
var casts: Array[Dictionary] = []

var _space: PhysicsDirectSpaceState2D
var _query := PhysicsRayQueryParameters2D.new()
var _point_query := PhysicsPointQueryParameters2D.new()


func _init() -> void:
	_query.collide_with_areas = false
	_query.collide_with_bodies = true
	_query.hit_from_inside = false
	_point_query.collide_with_areas = false
	_point_query.collide_with_bodies = true


## Call once per physics tick before casting.
func begin_frame(space: PhysicsDirectSpaceState2D) -> void:
	_space = space
	casts.clear()


## Physics Guide angle from a surface normal: 0 = flat floor, 90 = right wall,
## 180 = ceiling, 270 = left wall (counter-clockwise).
static func angle_from_normal(n: Vector2) -> float:
	var a := fposmod(rad_to_deg(atan2(-n.x, -n.y)), 360.0)
	return 0.0 if a >= 359.9999 else a


## Terrain mask for the given collision path (0 = A, 1 = B).
static func terrain_mask(path: int, top_only: bool) -> int:
	var mask := BIT_SOLID | (BIT_PATH_A if path == 0 else BIT_PATH_B)
	if top_only:
		mask |= BIT_TOP_ONLY
	return mask


## Casts one ray. Returns null when nothing is hit.
func cast(label: String, from: Vector2, dir: Vector2, length: float, mask: int) -> Hit:
	var to := from + dir * length
	var record := {label = label, from = from, to = to, hit = false, point = to}
	casts.append(record)
	if _space == null:
		return null
	_query.from = from
	_query.to = to
	_query.collision_mask = mask
	var result := _space.intersect_ray(_query)
	if result.is_empty():
		return null
	var hit := Hit.new()
	hit.position = result.position
	hit.normal = result.normal
	hit.distance = from.distance_to(hit.position)
	hit.angle = angle_from_normal(hit.normal)
	var layer := PhysicsServer2D.body_get_collision_layer(result.rid)
	hit.top_only = (layer & BIT_TOP_ONLY) != 0 and (layer & (BIT_SOLID | BIT_PATH_A | BIT_PATH_B)) == 0
	record.hit = true
	record.point = hit.position
	return hit


## Casts a pair of parallel rays (A/B or C/D) offset by +/- half_width along
## `side`, both towards `dir`. Returns the nearer hit, or null. With a third
## label, a centre ray is cast when both miss, so terrain narrower than the
## pair (e.g. a thin pillar) is still found.
func cast_pair(labels: PackedStringArray, center: Vector2, side: Vector2, dir: Vector2,
		half_width: float, length: float, mask: int) -> Hit:
	var first := cast(labels[0], center - side * half_width, dir, length, mask)
	var second := cast(labels[1], center + side * half_width, dir, length, mask)
	if first == null and second == null and labels.size() > 2:
		return cast(labels[2], center, dir, length, mask)
	if first == null:
		return second
	if second == null:
		return first
	return first if first.distance <= second.distance else second


## True when `point` is inside solid terrain (used for crush checks).
func point_in_terrain(point: Vector2, mask: int) -> bool:
	if _space == null:
		return false
	_point_query.position = point
	_point_query.collision_mask = mask
	return not _space.intersect_point(_point_query, 1).is_empty()
