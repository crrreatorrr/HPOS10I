extends RefCounted
## QA helpers for the physics regression tests and bug repros. Owned by QA.
## No Player class references, so files using this parse (and skip) on a
## branch where the physics agent's player does not exist yet.

const PLAYER_SCENE := "res://player/player.tscn"
const LOOP_SCENE := "res://terrain/loop.tscn"
const CURVE_SCRIPT := "res://terrain/curve_terrain.gd"
const SOLID := 1
const PATH_A := 2
const PATH_B := 4
const TOP_ONLY := 8
const FLOOR := 0
const RIGHT_WALL := 1
const CEILING := 2
const LEFT_WALL := 3


static func available() -> bool:
	return ResourceLoader.exists(PLAYER_SCENE)


## A fresh world. Removes the previous QA world first: worlds share one
## physics space, so old terrain (and old players) would leak into new runs.
static func world(test: TestCase) -> Node2D:
	for old in test.tree.root.get_children():
		if old.name.begins_with("QAWorld"):
			test.tree.root.remove_child(old)
			old.queue_free()
	var w := Node2D.new()
	w.name = "QAWorld"
	test.add_node(w)
	return w


static func poly(w: Node2D, points: PackedVector2Array, layer := SOLID) -> StaticBody2D:
	var body := StaticBody2D.new()
	body.collision_layer = layer
	body.collision_mask = 0
	var shape := CollisionPolygon2D.new()
	shape.polygon = points
	body.add_child(shape)
	w.add_child(body)
	return body


static func rect(w: Node2D, r: Rect2, layer := SOLID) -> StaticBody2D:
	return poly(w, PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end,
			Vector2(r.position.x, r.end.y)]), layer)


static func floor_at(w: Node2D, from_x := -6000.0, to_x := 6000.0, y := 0.0) -> StaticBody2D:
	return rect(w, Rect2(from_x, y, to_x - from_x, 300.0))


## Straight slope through (0, 0); positive angle rises to the right.
static func slope(w: Node2D, angle_deg: float, half_length := 800.0) -> StaticBody2D:
	var d := Vector2(cos(deg_to_rad(angle_deg)), -sin(deg_to_rad(angle_deg))) * half_length
	var bottom := absf(d.y) + 300.0
	return poly(w, PackedVector2Array([-d, d, Vector2(d.x, bottom), Vector2(-d.x, bottom)]))


static func loop(w: Node2D, at: Vector2, radius := 112.0) -> Node2D:
	var l: Node2D = load(LOOP_SCENE).instantiate()
	l.position = at
	w.add_child(l)
	l.set(&"radius", radius)
	return l


static func curve_terrain(w: Node2D, at: Vector2, props: Dictionary) -> StaticBody2D:
	var body := StaticBody2D.new()
	body.set_script(load(CURVE_SCRIPT))
	for key in props:
		body.set(key, props[key])
	body.position = at
	w.add_child(body)
	return body


static func spawn(test: TestCase, w: Node2D, feet: Vector2) -> Node2D:
	var player: Node2D = load(PLAYER_SCENE).instantiate()
	w.add_child(player)
	player.respawn_at(feet - Vector2(0.0, Tuning.physics.height_radius))
	await test.physics_frames(2)
	player.respawn_at(feet - Vector2(0.0, Tuning.physics.height_radius))
	await test.physics_frames(2)
	return player


static func feet_y(player: Node2D) -> float:
	return player.global_position.y + player.get_radii().y


## True when the player's centre is inside solid terrain on its path (the
## sensors cannot recover from that).
static func centre_in_terrain(player: Node2D) -> bool:
	var q := PhysicsPointQueryParameters2D.new()
	q.collide_with_bodies = true
	q.collision_mask = SOLID | (PATH_A if player.collision_path == 0 else PATH_B)
	q.position = player.global_position
	return not player.get_world_2d().direct_space_state.intersect_point(q, 1).is_empty()
