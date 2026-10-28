extends RefCounted
## Helpers for the level tests: small worlds built in code, Sproto, objects
## and a minimal LevelRoot. Not a test file (the runner only collects test_*.gd).

const PLAYER_SCENE := preload("res://player/player.tscn")
const LEVEL_ROOT := preload("res://levels/common/level_root.gd")
const TEST_ZONE := "res://levels/test_zone/test_zone.tscn"

const SOLID := 1
const TOP_ONLY := 8


static func new_world(test: TestCase) -> Node2D:
	var world := Node2D.new()
	world.name = "LevelTestWorld"
	test.add_node(world)
	return world


static func add_rect(world: Node, rect: Rect2, layer := SOLID) -> StaticBody2D:
	var body := StaticBody2D.new()
	body.collision_layer = layer
	body.collision_mask = 0
	var shape := CollisionPolygon2D.new()
	shape.polygon = PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y),
			rect.end, Vector2(rect.position.x, rect.end.y)])
	body.add_child(shape)
	world.add_child(body)
	return body


## Flat floor with its top at y = 0 from x0 to x1.
static func add_floor(world: Node, x0 := -2000.0, x1 := 4000.0) -> StaticBody2D:
	return add_rect(world, Rect2(x0, 0.0, x1 - x0, 200.0))


static func spawn_player(world: Node, feet: Vector2) -> Player:
	var player: Player = PLAYER_SCENE.instantiate()
	world.add_child(player)
	player.respawn_at(feet - Vector2(0.0, Tuning.physics.height_radius))
	return player


## Lets new bodies register, then puts Sproto back with his feet at `feet`.
static func settle(test: TestCase, player: Player, feet: Vector2) -> void:
	await test.physics_frames(2)
	player.respawn_at(feet - Vector2(0.0, Tuning.physics.height_radius))
	await test.physics_frames(2)


static func place(world: Node, path: String, at: Vector2, props := {}) -> Node2D:
	var node: Node2D = (load(path) as PackedScene).instantiate()
	for key: String in props:
		node.set(key, props[key])
	node.position = at
	world.add_child(node)
	return node


## A LevelRoot built in code: flat floor (y = 0) from x0 to x1 with a wall at
## each end, Bounds from x0 to x1 and y -400 to 64, PlayerStart at `start`
## (Sproto's centre). `before_ready` can add terrain and objects before
## LevelRoot spawns Sproto. Scene changes are off (use_scene_router = false).
static func mini_level(test: TestCase, start := Vector2(64, -19), x0 := 0.0, x1 := 2000.0,
		before_ready := Callable()) -> LevelRoot:
	var level := Node2D.new()
	level.set_script(LEVEL_ROOT)
	level.name = "MiniLevel"
	var root := level as LevelRoot
	root.use_scene_router = false
	root.zone_id = "test_zone"
	var marker := Marker2D.new()
	marker.name = "PlayerStart"
	marker.position = start
	level.add_child(marker)
	var bounds := ReferenceRect.new()
	bounds.name = "Bounds"
	bounds.position = Vector2(x0, -400.0)
	bounds.size = Vector2(x1 - x0, 464.0)
	level.add_child(bounds)
	var terrain := Node2D.new()
	terrain.name = "Terrain"
	level.add_child(terrain)
	add_floor(terrain, x0, x1)
	add_rect(terrain, Rect2(x0 - 32.0, -400.0, 32.0, 600.0))
	add_rect(terrain, Rect2(x1, -400.0, 32.0, 600.0))
	if before_ready.is_valid():
		before_ready.call(level)
	test.add_node(level)
	await test.physics_frames(LevelRoot.SPAWN_SETTLE_FRAMES + 2)
	return root


## The test zone as a node (scene changes off).
static func test_zone(test: TestCase) -> LevelRoot:
	var level := (load(TEST_ZONE) as PackedScene).instantiate() as LevelRoot
	level.use_scene_router = false
	test.add_node(level)
	await test.physics_frames(LevelRoot.SPAWN_SETTLE_FRAMES + 2)
	return level


## Runs until `condition` is true or `max_frames` pass; returns the frames used (-1 = timed out).
static func wait_for(test: TestCase, condition: Callable, max_frames: int) -> int:
	for i in max_frames:
		if condition.call():
			return i
		await test.physics_frames(1)
	return -1 if not condition.call() else max_frames
