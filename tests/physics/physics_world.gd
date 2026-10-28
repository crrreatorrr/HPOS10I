extends RefCounted
## Helpers for the physics tests: build terrain in code and spawn Sproto.
## Not a test file itself (the runner only collects test_*.gd).

const PLAYER_SCENE := preload("res://player/player.tscn")
const LOOP_SCENE := preload("res://terrain/loop.tscn")

const SOLID := Layers.TERRAIN_SOLID
const PATH_A := Layers.TERRAIN_PATH_A
const PATH_B := Layers.TERRAIN_PATH_B
const TOP_ONLY := Layers.TERRAIN_TOP_ONLY


static func new_world(test: TestCase) -> Node2D:
	var world := Node2D.new()
	world.name = "TestWorld"
	test.add_node(world)
	return world


static func add_polygon(world: Node2D, points: PackedVector2Array, layer := SOLID) -> StaticBody2D:
	var body := StaticBody2D.new()
	body.collision_layer = layer
	body.collision_mask = 0
	var shape := CollisionPolygon2D.new()
	shape.polygon = points
	body.add_child(shape)
	world.add_child(body)
	return body


static func add_rect(world: Node2D, rect: Rect2, layer := SOLID) -> StaticBody2D:
	return add_polygon(world, PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y),
			rect.end, Vector2(rect.position.x, rect.end.y)]), layer)


## Flat floor with its top at y.
static func add_floor(world: Node2D, from_x := -4000.0, to_x := 4000.0, y := 0.0) -> StaticBody2D:
	return add_rect(world, Rect2(from_x, y, to_x - from_x, 200.0))


## Straight slope through (0, 0) rising to the right at `angle_deg`
## (Physics Guide angle: positive = "/" slope).
static func add_slope(world: Node2D, angle_deg: float, half_length := 600.0) -> StaticBody2D:
	var d := Vector2(cos(deg_to_rad(angle_deg)), -sin(deg_to_rad(angle_deg))) * half_length
	var bottom := absf(d.y) + 300.0
	return add_polygon(world, PackedVector2Array([-d, d, Vector2(d.x, bottom), Vector2(-d.x, bottom)]))


static func add_loop(world: Node2D, bottom_center: Vector2) -> Node2D:
	var loop: Node2D = LOOP_SCENE.instantiate()
	loop.position = bottom_center
	world.add_child(loop)
	return loop


static func spawn_player(world: Node2D, feet: Vector2) -> Player:
	var player: Player = PLAYER_SCENE.instantiate()
	world.add_child(player)
	player.respawn_at(feet - Vector2(0.0, Tuning.physics.height_radius))
	return player


## Lets the physics server register new bodies, puts the player back with its
## feet at `feet` and lets it land. Afterwards the test runs inside the physics
## tick, so `await physics_frames(n)` advances the player exactly n steps.
static func settle(test: TestCase, player: Player, feet: Vector2) -> void:
	await test.physics_frames(2)
	player.respawn_at(feet - Vector2(0.0, Tuning.physics.height_radius))
	await test.physics_frames(2)


## Bottom of the player's sensor box.
static func feet_y(player: Player) -> float:
	return player.global_position.y + player.get_radii().y


## A quarter pipe (CurveTerrain) with its bottom at `bottom`, curving up to the
## right (or left) over `radius`, with a vertical wall of `wall_height` above.
static func add_quarter_pipe(world: Node2D, bottom: Vector2, radius: float, rises_to_right: bool,
		wall_height := 0.0) -> StaticBody2D:
	var piece := CurveTerrain.new()
	piece.shape = CurveTerrain.Shape.QUARTER_PIPE
	piece.radius = radius
	piece.rises_to_right = rises_to_right
	piece.wall_height = wall_height
	piece.thickness = 48.0
	piece.depth = 64.0
	piece.position = bottom
	world.add_child(piece)
	return piece


## True when the player's centre is inside solid terrain of its path.
static func centre_in_terrain(player: Player) -> bool:
	var query := PhysicsPointQueryParameters2D.new()
	query.collide_with_bodies = true
	query.collision_mask = SOLID | (PATH_A if player.collision_path == Player.PATH_A else PATH_B)
	query.position = player.global_position
	return not player.get_world_2d().direct_space_state.intersect_point(query, 1).is_empty()
