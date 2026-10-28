class_name PlayerSensors
extends RefCounted
## Raycast sensors in the community Physics Guide layout:
##   A/B  floor sensors, left/right of the centre, cast "down" for the current mode
##   C/D  ceiling sensors, left/right of the centre, cast "up"
##   E/F  wall sensors, from the centre, cast left/right
## All casts use PhysicsDirectSpaceState2D.intersect_ray and are recorded each
## frame so the debug overlay can draw them in world space.

## Offset of the two side rays used to re-measure a surface angle.
const SURFACE_PROBE_OFFSET := 0.5
## A re-measured angle this close (degrees) to the reported one confirms it.
const SURFACE_AGREEMENT := 1.0


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
	## The body hit (for moving terrain and conveyors).
	var collider: Object
	## The ray that found it (for re-measuring the surface angle).
	var origin: Vector2
	var dir: Vector2
	var length: float
	var mask: int


## Every cast this frame: {label, from, to, hit (bool), point}, kept only while
## `recording` is on (the debug overlay turns it on while visible).
var casts: Array[Dictionary] = []
var recording := false
## The two side hits (or nulls) of the last cast_pair(), in label order.
var last_pair: Array[Hit] = [null, null]

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
	var mask := Layers.TERRAIN_SOLID | (Layers.TERRAIN_PATH_A if path == 0 else Layers.TERRAIN_PATH_B)
	if top_only:
		mask |= Layers.TERRAIN_TOP_ONLY
	return mask


## Casts one ray. Returns null when nothing is hit.
func cast(label: String, from: Vector2, dir: Vector2, length: float, mask: int) -> Hit:
	var to := from + dir * length
	var record: Dictionary = {}
	if recording:
		record = {label = label, from = from, to = to, hit = false, point = to}
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
	hit.origin = from
	hit.dir = dir
	hit.length = length
	hit.mask = mask
	hit.collider = result.collider
	var layer := PhysicsServer2D.body_get_collision_layer(result.rid)
	hit.top_only = (layer & Layers.TERRAIN_TOP_ONLY) != 0 \
			and (layer & (Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B)) == 0
	# A ray that really enters a solid always crosses a surface facing it. A
	# normal facing along the ray comes from a convex piece the ray only grazes
	# at a shared vertex (an internal edge of the polygon's decomposition), so
	# measure the surface instead.
	if hit.normal.dot(dir) > -0.001:
		hit.angle = surface_angle(hit)
	if recording:
		record.hit = true
		record.point = hit.position
	return hit


## Surface angle at a hit, measured from two parallel rays 0.5 px either side
## of the original one: the line through their hits is the surface, whatever
## normal the physics server reported at a polygon vertex. The reported angle
## is kept when it faces the ray and matches the surface on either side of the
## hit (a real corner, where the probe may straddle the vertex). Falls back to
## the reported angle when a side ray misses.
func surface_angle(hit: Hit) -> float:
	var side := hit.dir.orthogonal() * SURFACE_PROBE_OFFSET
	var length := hit.length + SURFACE_PROBE_OFFSET * 4.0
	var points: Array[Vector2] = []
	for offset: Vector2 in [side, -side]:
		_query.from = hit.origin + offset
		_query.to = hit.origin + offset + hit.dir * length
		_query.collision_mask = hit.mask
		var result := _space.intersect_ray(_query)
		if result.is_empty():
			return hit.angle
		points.append(result.position)
	var measured := _secant_angle(points[0], points[1], hit.dir)
	if is_nan(measured):
		return hit.angle
	if hit.normal.dot(hit.dir) < -0.001:
		for check in [measured, _secant_angle(points[0], hit.position, hit.dir),
				_secant_angle(hit.position, points[1], hit.dir)]:
			if not is_nan(check) and absf(wrapf(check - hit.angle, -180.0, 180.0)) < SURFACE_AGREEMENT:
				return hit.angle
	return measured


## Angle of the surface through two hit points, facing against `dir`; NAN when
## the points are too close to define a line.
static func _secant_angle(from: Vector2, to: Vector2, dir: Vector2) -> float:
	var tangent := to - from
	if tangent.length_squared() < 0.01:
		return NAN
	var normal := tangent.orthogonal().normalized()
	if normal.dot(dir) > 0.0:
		normal = -normal
	return angle_from_normal(normal)


## Casts a pair of parallel rays (A/B or C/D) offset by +/- half_width along
## `side`, both towards `dir`. Returns the nearer hit, or null. With a third
## label, a centre ray is cast when both miss, so terrain narrower than the
## pair (e.g. a thin pillar) is still found.
func cast_pair(labels: PackedStringArray, center: Vector2, side: Vector2, dir: Vector2,
		half_width: float, length: float, mask: int) -> Hit:
	var first := cast(labels[0], center - side * half_width, dir, length, mask)
	var second := cast(labels[1], center + side * half_width, dir, length, mask)
	last_pair[0] = first
	last_pair[1] = second
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


## True when `point` is inside a body of `mask` that is moving terrain (has
## platform_delta()).
func moving_body_at(point: Vector2, mask: int) -> bool:
	if _space == null:
		return false
	_point_query.position = point
	_point_query.collision_mask = mask
	for result in _space.intersect_point(_point_query, 4):
		var body: Object = result.collider
		if body != null and body.has_method(&"platform_delta"):
			return true
	return false
