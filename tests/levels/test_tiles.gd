extends TestCase
## Terrain tiles: collision layers, exact slope seams (no 1 px steps), and
## runs across slope seams at several speeds that never leave the ground.

const W := preload("res://tests/levels/level_world.gd")
const TILESET := "res://levels/common/tiles/z1_retro_rush_hills_tiles.tres"

## Ground angles the hill below can produce (Physics Guide degrees).
const HILL_ANGLES := [0.0, 26.565, 45.0, 315.0, 333.435, 360.0]

var world: Node2D
var tiles: TileMapLayer


## A hill built from tiles: flat, gentle up 64, flat, steep up 64, flat,
## steep down 64, flat, gentle down 64, flat. Returns the analytic surface
## height at x (y of the ground line).
func _hill() -> Callable:
	world = W.new_world(self)
	tiles = TileMapLayer.new()
	tiles.tile_set = load(TILESET)
	world.add_child(tiles)
	var p := TilePainter.new(tiles, -256, 0, 160)
	p.flat(256).gentle_up(64).flat(64).steep_up(64).flat(96).steep_down(64).flat(64).gentle_down(64).flat(512)
	await physics_frames(3)
	return func(x: float) -> float:
		if x < 0.0:
			return 0.0
		if x < 128.0:
			return -x / 2.0
		if x < 192.0:
			return -64.0
		if x < 256.0:
			return -64.0 - (x - 192.0)
		if x < 352.0:
			return -128.0
		if x < 416.0:
			return -128.0 + (x - 352.0)
		if x < 480.0:
			return -64.0
		if x < 608.0:
			return -64.0 + (x - 480.0) / 2.0
		return 0.0


func test_tileset_layers_and_shapes() -> void:
	var tile_set := load(TILESET) as TileSet
	assert_eq(tile_set.tile_size, Vector2i(16, 16), "16 px tiles")
	assert_eq(tile_set.get_physics_layers_count(), 2, "two physics layers")
	assert_eq(tile_set.get_physics_layer_collision_layer(0), 1, "layer 0 is terrain_solid (bit 1)")
	assert_eq(tile_set.get_physics_layer_collision_layer(1), 8, "layer 1 is terrain_top_only (bit 4)")
	var source := tile_set.get_source(0) as TileSetAtlasSource
	for tile_name: StringName in TerrainTiles.TILES:
		var coords := TerrainTiles.coords(tile_name, Vector2i(3, 5))
		assert_true(source.has_tile(coords), "%s exists" % tile_name)
		var data := source.get_tile_data(coords, 0)
		var layer := TerrainTiles.physics_layer(tile_name)
		assert_eq(data.get_collision_polygons_count(layer), 1, "%s has its polygon" % tile_name)
		assert_eq(data.get_collision_polygon_points(layer, 0), TerrainTiles.polygon(tile_name), "%s shape" % tile_name)
	for tile_name in [&"plank_left", &"plank", &"plank_right"]:
		assert_eq(TerrainTiles.physics_layer(tile_name), TerrainTiles.PHYSICS_TOP_ONLY, "%s is top-only" % tile_name)


func test_slope_seams_have_no_steps() -> void:
	var surface: Callable = await _hill()
	var space := world.get_world_2d().direct_space_state
	var worst := 0.0
	var x := -64.0
	while x < 700.0:
		var query := PhysicsRayQueryParameters2D.create(Vector2(x, -300), Vector2(x, 100), 1)
		var hit := space.intersect_ray(query)
		if hit.is_empty():
			fail("no ground at x %.2f" % x)
			return
		worst = maxf(worst, absf(hit.position.y - surface.call(x)))
		x += 0.5
	assert_true(worst < 0.01, "the ground follows the slopes exactly, seams included (worst %.4f px)" % worst)


func test_slope_angles_are_exact_on_every_tile() -> void:
	await _hill()
	var space := world.get_world_2d().direct_space_state
	var x := 1.25
	while x < 600.0:
		var query := PhysicsRayQueryParameters2D.create(Vector2(x, -300), Vector2(x, 100), 1)
		var hit := space.intersect_ray(query)
		var angle := PlayerSensors.angle_from_normal(hit.normal)
		var ok := false
		for a in HILL_ANGLES:
			ok = ok or absf(angle - a) < 0.01
		assert_true(ok, "surface angle %.3f at x %.2f is one of the slope angles" % [angle, x])
		x += 4.0


func test_runs_across_slope_seams_never_leave_the_ground() -> void:
	for dir in [1, -1]:
		for speed in [4.0, 6.0, 8.0, 10.0, 12.0]:
			await _run(speed, dir)
			world.queue_free()
			await physics_frames(2)


## Straight stretches of the hill: [x0, x1, dy/dx]. Inside them (away from the
## corners by more than the floor sensors' reach) every frame's motion must
## follow the slope exactly: a step at a tile seam would show up here.
const STRETCHES := [[-250.0, 0.0, 0.0], [0.0, 128.0, -0.5], [128.0, 192.0, 0.0], [192.0, 256.0, -1.0],
		[256.0, 352.0, 0.0], [352.0, 416.0, 1.0], [416.0, 480.0, 0.0], [480.0, 608.0, 0.5], [608.0, 1100.0, 0.0]]
const CORNER_MARGIN := 12.0


func _run(speed: float, dir: int) -> void:
	await _hill()
	var start := Vector2(-150.0 if dir > 0 else 750.0, 0.0)
	var player := W.spawn_player(world, start)
	await W.settle(self, player, start)
	player.ground_speed = speed * dir
	var action := &"move_right" if dir > 0 else &"move_left"
	press(action)
	var last := player.global_position
	var frames := 0
	while frames < 600:
		await physics_frames(1)
		frames += 1
		var at := player.global_position
		var label := "%s at %.0f px/f, x %.1f" % ["right" if dir > 0 else "left", speed, at.x]
		if not player.grounded:
			fail("left the ground: " + label)
			break
		var ok := false
		for a in HILL_ANGLES:
			ok = ok or absf(player.ground_angle - a) < 0.5
		if not ok:
			fail("odd ground angle %.2f: %s" % [player.ground_angle, label])
			break
		var slope := _stretch_slope(last.x, at.x)
		if not is_nan(slope) and absf((at.y - last.y) - slope * (at.x - last.x)) > 0.05:
			fail("off the slope by %.3f px: %s" % [(at.y - last.y) - slope * (at.x - last.x), label])
			break
		last = at
		if (dir > 0 and at.x > 700.0) or (dir < 0 and at.x < -100.0):
			break
	release(action)
	assert_true((dir > 0 and player.global_position.x > 700.0) or (dir < 0 and player.global_position.x < -100.0),
			"crossed the hill (%s at %.0f px/f)" % ["right" if dir > 0 else "left", speed])


## The slope of the straight stretch containing both x positions (with the
## margin), or NAN.
static func _stretch_slope(x0: float, x1: float) -> float:
	for s in STRETCHES:
		var lo: float = s[0] + CORNER_MARGIN
		var hi: float = s[1] - CORNER_MARGIN
		if minf(x0, x1) >= lo and maxf(x0, x1) <= hi:
			return s[2]
	return NAN


func test_top_only_planks() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	tiles = TileMapLayer.new()
	tiles.tile_set = load(TILESET)
	world.add_child(tiles)
	TilePainter.new(tiles).planks(-64, 64, -64)
	var player := W.spawn_player(world, Vector2(0, 0))
	await W.settle(self, player, Vector2(0, 0))
	press(&"jump")
	var landed := false
	for i in 90:
		await physics_frames(1)
		if player.grounded and absf(player.global_position.y + 64.0 + Tuning.physics.height_radius) < 0.5:
			landed = true
			break
	release(&"jump")
	assert_true(landed, "jumped up through the planks and landed on top")
