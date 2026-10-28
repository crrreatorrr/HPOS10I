@tool
class_name CurveTerrain
extends StaticBody2D
## Builds collision (CollisionPolygon2D) and placeholder visuals (Polygon2D +
## an edge line) for curved terrain: a loop arc, a quarter pipe, a ramp with
## rounded ends, a free Curve2D profile or a plain block. Curves are cut into
## short segments (segment_length, ~5 px) so ground angles change smoothly.
##
## Origins:
##   LOOP          bottom inner point of the circle (where it meets the floor)
##   QUARTER_PIPE  start of the curve on the floor
##   RAMP          start of the lead-in on the floor
##   CURVE         the Curve2D's own local space
##   BLOCK         top-left corner
## Arc angles use the Physics Guide convention: 0 = bottom of the loop,
## 90 = right side, 180 = top, 270 = left side.

enum Shape { LOOP, QUARTER_PIPE, RAMP, CURVE, BLOCK }
enum PathLayer { BOTH, A, B }

const LAYER_SOLID := 1
const LAYER_PATH_A := 2
const LAYER_PATH_B := 4
const LAYER_TOP_ONLY := 8
## Pieces of a loop are at most this many degrees, keeping each polygon simple.
const MAX_ARC_CHUNK := 90.0

@export var shape := Shape.RAMP:
	set(value):
		shape = value
		_queue_rebuild()
## Which collision path the terrain is solid on.
@export var path_layer := PathLayer.BOTH:
	set(value):
		path_layer = value
		_queue_rebuild()
## One-way platform: only landed on from above.
@export var top_only := false:
	set(value):
		top_only = value
		_queue_rebuild()

@export_group("Loop and quarter pipe")
@export var radius := 128.0:
	set(value):
		radius = maxf(value, 8.0)
		_queue_rebuild()
@export var thickness := 16.0:
	set(value):
		thickness = maxf(value, 2.0)
		_queue_rebuild()
## Loop arc start/end (degrees, Physics Guide angle of the surface).
@export var arc_start := 0.0:
	set(value):
		arc_start = value
		_queue_rebuild()
@export var arc_end := 360.0:
	set(value):
		arc_end = value
		_queue_rebuild()
## Quarter pipe: true = the wall is on the right (rises when running right).
@export var rises_to_right := true:
	set(value):
		rises_to_right = value
		_queue_rebuild()
## Quarter pipe: straight vertical wall above the curve.
@export var wall_height := 0.0:
	set(value):
		wall_height = maxf(value, 0.0)
		_queue_rebuild()

@export_group("Ramp")
## Slope angle in degrees; positive rises to the right.
@export_range(-80.0, 80.0, 0.5) var slope_angle := 22.0:
	set(value):
		slope_angle = value
		_queue_rebuild()
## Horizontal length of the straight slope.
@export var run_length := 160.0:
	set(value):
		run_length = maxf(value, 1.0)
		_queue_rebuild()
@export var lead_in := 32.0:
	set(value):
		lead_in = maxf(value, 0.0)
		_queue_rebuild()
@export var lead_out := 32.0:
	set(value):
		lead_out = maxf(value, 0.0)
		_queue_rebuild()
## Radius of the rounded transitions at both ends of the slope.
@export var fillet_radius := 48.0:
	set(value):
		fillet_radius = maxf(value, 0.0)
		_queue_rebuild()

@export_group("Curve")
## Top surface, left to right. A closed curve is used as the outline instead.
@export var curve: Curve2D:
	set(value):
		if curve != null and curve.changed.is_connected(_queue_rebuild):
			curve.changed.disconnect(_queue_rebuild)
		curve = value
		if curve != null:
			curve.changed.connect(_queue_rebuild)
		_queue_rebuild()

@export_group("Block")
@export var size := Vector2(128.0, 32.0):
	set(value):
		size = value.max(Vector2.ONE)
		_queue_rebuild()

@export_group("Common")
## Solid fill below the lowest point of open profiles (quarter pipe, ramp, curve).
@export var depth := 64.0:
	set(value):
		depth = maxf(value, 1.0)
		_queue_rebuild()
@export_range(2.0, 16.0, 0.5) var segment_length := 5.0:
	set(value):
		segment_length = value
		_queue_rebuild()
@export var fill_color := Color(0.45, 0.32, 0.22):
	set(value):
		fill_color = value
		_queue_rebuild()
@export var edge_color := Color(0.36, 0.78, 0.36):
	set(value):
		edge_color = value
		_queue_rebuild()

var _rebuild_queued := false


func _ready() -> void:
	_rebuild()


## Every outline polygon of the current shape (local space).
func build_polygons() -> Array[PackedVector2Array]:
	match shape:
		Shape.LOOP:
			return _loop_polygons()
		Shape.QUARTER_PIPE:
			return [_quarter_pipe_polygon()]
		Shape.RAMP:
			return [_fill_below(_ramp_profile())]
		Shape.CURVE:
			return _curve_polygons()
	return [PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0.0), size, Vector2(0.0, size.y)])]


## The running surface as a polyline (for the edge visuals).
func build_surface() -> PackedVector2Array:
	match shape:
		Shape.LOOP:
			return _arc_points(arc_start, arc_end, radius)
		Shape.QUARTER_PIPE:
			return _quarter_pipe_surface()
		Shape.RAMP:
			return _ramp_profile()
		Shape.CURVE:
			return _curve_profile()
	return PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0.0)])


func _queue_rebuild() -> void:
	if _rebuild_queued or not is_inside_tree():
		return
	_rebuild_queued = true
	_rebuild.call_deferred()


func _rebuild() -> void:
	_rebuild_queued = false
	for child in get_children(true):
		if child.has_meta(&"curve_terrain_generated"):
			remove_child(child)
			child.queue_free()
	collision_mask = 0
	if top_only:
		collision_layer = LAYER_TOP_ONLY
	else:
		collision_layer = [LAYER_SOLID, LAYER_PATH_A, LAYER_PATH_B][path_layer]

	var tint := fill_color
	if path_layer == PathLayer.A:
		tint = fill_color.lerp(Color(0.3, 0.45, 0.9), 0.18)
	elif path_layer == PathLayer.B:
		tint = fill_color.lerp(Color(0.9, 0.35, 0.3), 0.18)
	if top_only:
		tint = Color(tint.lightened(0.25), 0.85)

	for polygon in build_polygons():
		if polygon.size() < 3:
			continue
		var collision := CollisionPolygon2D.new()
		collision.build_mode = CollisionPolygon2D.BUILD_SOLIDS
		collision.polygon = polygon
		_add_generated(collision)
		var visual := Polygon2D.new()
		visual.polygon = polygon
		visual.color = tint
		_add_generated(visual)
	var edge := Line2D.new()
	edge.points = build_surface()
	edge.width = 3.0
	edge.default_color = edge_color
	edge.joint_mode = Line2D.LINE_JOINT_ROUND
	_add_generated(edge)


func _add_generated(node: Node) -> void:
	node.set_meta(&"curve_terrain_generated", true)
	add_child(node, false, Node.INTERNAL_MODE_BACK)


# --- Shapes ---------------------------------------------------------------------

## Point on a loop circle at Physics Guide surface angle `deg` (centre above the origin).
func _circle_point(deg: float, r: float) -> Vector2:
	var a := deg_to_rad(deg)
	return Vector2(0.0, -radius) + Vector2(sin(a), cos(a)) * r


func _arc_points(from_deg: float, to_deg: float, r: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	var span := to_deg - from_deg
	var count := maxi(1, ceili(absf(deg_to_rad(span)) * r / segment_length))
	for i in count + 1:
		points.append(_circle_point(from_deg + span * i / count, r))
	return points


## A loop arc as ring pieces: inner surface at `radius`, outer at radius + thickness.
func _loop_polygons() -> Array[PackedVector2Array]:
	var polygons: Array[PackedVector2Array] = []
	var span := arc_end - arc_start
	if absf(span) < 0.1:
		return polygons
	var chunks := maxi(1, ceili(absf(span) / MAX_ARC_CHUNK))
	for i in chunks:
		var a0 := arc_start + span * i / chunks
		var a1 := arc_start + span * (i + 1) / chunks
		var inner := _arc_points(a0, a1, radius)
		var outer := _arc_points(a1, a0, radius + thickness)
		inner.append_array(outer)
		polygons.append(inner)
	return polygons


func _quarter_pipe_surface() -> PackedVector2Array:
	var points := _arc_points(0.0, 90.0, radius)
	if wall_height > 0.0:
		points.append(Vector2(radius, -radius - wall_height))
	if not rises_to_right:
		points = _mirror(points)
	return points


func _quarter_pipe_polygon() -> PackedVector2Array:
	var points := _arc_points(0.0, 90.0, radius)
	var top := -radius - wall_height
	if wall_height > 0.0:
		points.append(Vector2(radius, top))
	points.append_array(PackedVector2Array([Vector2(radius + thickness, top),
			Vector2(radius + thickness, depth), Vector2(0.0, depth)]))
	if not rises_to_right:
		points = _mirror(points)
		points.reverse()
	return points


func _mirror(points: PackedVector2Array) -> PackedVector2Array:
	var mirrored := PackedVector2Array()
	for point in points:
		mirrored.append(Vector2(-point.x, point.y))
	return mirrored


## Lead-in, straight slope, lead-out, with rounded transitions.
func _ramp_profile() -> PackedVector2Array:
	var rise := -tan(deg_to_rad(slope_angle)) * run_length
	var corners := PackedVector2Array([Vector2.ZERO, Vector2(lead_in, 0.0),
			Vector2(lead_in + run_length, rise), Vector2(lead_in + run_length + lead_out, rise)])
	return _fillet(corners, fillet_radius)


func _curve_profile() -> PackedVector2Array:
	if curve == null or curve.point_count < 2:
		return PackedVector2Array()
	return curve.tessellate_even_length(6, segment_length)


func _curve_polygons() -> Array[PackedVector2Array]:
	var profile := _curve_profile()
	if profile.size() < 2:
		return []
	if profile[0].distance_to(profile[profile.size() - 1]) < 0.5:
		profile.remove_at(profile.size() - 1)
		return [profile]
	return [_fill_below(profile)]


## Closes an open surface polyline downwards into a solid polygon.
func _fill_below(profile: PackedVector2Array) -> PackedVector2Array:
	if profile.size() < 2:
		return PackedVector2Array()
	var bottom := -INF
	for point in profile:
		bottom = maxf(bottom, point.y)
	bottom += depth
	var polygon := profile.duplicate()
	polygon.append(Vector2(profile[profile.size() - 1].x, bottom))
	polygon.append(Vector2(profile[0].x, bottom))
	return polygon


## Rounds every inner corner of a polyline with an arc of `r`, cut into short segments.
func _fillet(corners: PackedVector2Array, r: float) -> PackedVector2Array:
	var out := PackedVector2Array([corners[0]])
	for i in range(1, corners.size() - 1):
		var prev := corners[i - 1]
		var corner := corners[i]
		var next := corners[i + 1]
		var u := (corner - prev).normalized()
		var v := (next - corner).normalized()
		var turn := u.angle_to(v)
		if r <= 0.0 or absf(turn) < 0.001:
			out.append(corner)
			continue
		var t := minf(r * tan(absf(turn) / 2.0),
				minf(corner.distance_to(prev), corner.distance_to(next)) * 0.5)
		var rr := t / tan(absf(turn) / 2.0)
		var start := corner - u * t
		var normal := u.orthogonal() if turn < 0.0 else -u.orthogonal()
		var center := start + normal * rr
		var count := maxi(1, ceili(absf(turn) * rr / segment_length))
		var spoke := start - center
		for k in count + 1:
			out.append(center + spoke.rotated(turn * k / count))
	out.append(corners[corners.size() - 1])
	return out
