extends TestCase
## Terrain materials (TerrainArt / CurveTerrain visuals) and feel effects:
## world-space UVs, the lip only on top-facing edges, clean fallbacks, hidden
## seams, and art and effects never changing physics.

const W := preload("res://tests/physics/physics_world.gd")
const ROOT := "user://terrain_art_test"
const ZONE := "test_zone_art"
const FILL_SIZE := 32
const TOP_SIZE := Vector2i(16, 12)

var world: Node2D


func before_each() -> void:
	DirAccess.make_dir_recursive_absolute(ROOT + "/" + ZONE)
	for item in [["fill", Vector2i(FILL_SIZE, FILL_SIZE)], ["top", TOP_SIZE], ["side", Vector2i(16, 16)]]:
		var image := Image.create(item[1].x, item[1].y, false, Image.FORMAT_RGBA8)
		image.fill(Color(0.8, 0.5, 0.2))
		image.save_png("%s/%s/%s.png" % [ROOT, ZONE, item[0]])
	TerrainArt.material_root = ROOT
	TerrainArt.clear_cache()


func after_each() -> void:
	TerrainArt.material_root = "res://assets/terrain"
	TerrainArt.clear_cache()
	Effects.enabled = true


func _piece(props: Dictionary, at: Vector2, zone := ZONE) -> CurveTerrain:
	var piece := CurveTerrain.new()
	for key in props:
		piece.set(key, props[key])
	piece.position = at
	piece.art_zone = zone
	world.add_child(piece)
	return piece


func _visual(piece: CurveTerrain, prefix: String) -> Array:
	var found := []
	for child in piece.get_children(true):
		if child.has_meta(&"curve_terrain_visual") and String(child.name).begins_with(prefix):
			found.append(child)
	return found


## Top-row vertices (the surface) of every lip strip of a piece, in local space.
func _lip_tops(piece: CurveTerrain) -> PackedVector2Array:
	var tops := PackedVector2Array()
	for lip in _visual(piece, "Lip"):
		var vertices: PackedVector2Array = (lip as MeshInstance2D).mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		for i in range(0, vertices.size(), 2):
			tops.append(vertices[i])
	return tops


func test_fill_and_lip_use_world_coordinates() -> void:
	world = W.new_world(self)
	var left := _piece({shape = CurveTerrain.Shape.BLOCK, size = Vector2(64, 32)}, Vector2(0, 0))
	var right := _piece({shape = CurveTerrain.Shape.BLOCK, size = Vector2(64, 32)}, Vector2(64, 0))
	await physics_frames(2)
	var left_fill: Polygon2D = _visual(left, "Fill")[0]
	var right_fill: Polygon2D = _visual(right, "Fill")[0]
	assert_true(left_fill.texture != null and left_fill.texture_repeat == CanvasItem.TEXTURE_REPEAT_ENABLED,
			"fill textured and repeating")
	for i in left_fill.polygon.size():
		assert_eq(left_fill.uv[i], left.global_transform * left_fill.polygon[i], "left uv = world position")
	for i in right_fill.polygon.size():
		assert_eq(right_fill.uv[i], right.global_transform * right_fill.polygon[i], "right uv = world position")
	# The lip's texture runs on across the seam: left ends where right starts.
	var left_uv: PackedVector2Array = (_visual(left, "Lip")[0] as MeshInstance2D).mesh.surface_get_arrays(0)[Mesh.ARRAY_TEX_UV]
	var right_uv: PackedVector2Array = (_visual(right, "Lip")[0] as MeshInstance2D).mesh.surface_get_arrays(0)[Mesh.ARRAY_TEX_UV]
	assert_near(left_uv[left_uv.size() - 2].x, right_uv[0].x, 0.0001, "lip continues across pieces")
	assert_near(right_uv[0].x * TOP_SIZE.x, 64.0, 0.001, "lip u = world x on flat ground")


func test_lip_only_on_top_facing_edges() -> void:
	world = W.new_world(self)
	var block := _piece({shape = CurveTerrain.Shape.BLOCK, size = Vector2(80, 40)}, Vector2(0, 0))
	var gentle := _piece({slope_angle = 45.0, run_length = 60.0, lead_in = 20.0, lead_out = 20.0,
			fillet_radius = 0.0}, Vector2(300, 0))
	var steep := _piece({slope_angle = 70.0, run_length = 30.0, lead_in = 20.0, lead_out = 20.0,
			fillet_radius = 0.0}, Vector2(600, 0))
	await physics_frames(2)
	for top in _lip_tops(block):
		assert_near(top.y, 0.0, 0.001, "block: lip only on the top edge")
	assert_eq(_visual(block, "Lip").size(), 1, "block: one lip")
	assert_eq(_visual(gentle, "Lip").size(), 1, "45 deg ramp: one lip over flat, slope and flat")
	assert_eq(_visual(steep, "Lip").size(), 2, "70 deg ramp: lips on the two flats only")
	var rise := 30.0 * tan(deg_to_rad(70.0))
	for top in _lip_tops(steep):
		assert_true(is_equal_approx(top.y, 0.0) or is_equal_approx(top.y, -rise),
				"70 deg ramp: no lip on the steep face (%s)" % top)
	# A loop piece: the lip runs along the whole inner (running) surface.
	var ring := _piece({shape = CurveTerrain.Shape.LOOP, radius = 80.0, thickness = 16.0,
			arc_start = 90.0, arc_end = 270.0}, Vector2(1000, 0))
	await physics_frames(2)
	var tops := _lip_tops(ring)
	assert_true(tops.size() > 20, "ring: lip present")
	for top in tops:
		assert_near(top.distance_to(Vector2(0, -80)), 80.0, 0.01, "ring: lip on the inner radius only")


func test_missing_textures_fall_back() -> void:
	world = W.new_world(self)
	var piece := _piece({shape = CurveTerrain.Shape.BLOCK, size = Vector2(64, 32)}, Vector2.ZERO, "no_such_zone")
	await physics_frames(2)
	var fill: Polygon2D = _visual(piece, "Fill")[0]
	assert_eq(fill.texture, null, "no fill texture")
	assert_eq(fill.color, piece.fill_color, "flat fill colour")
	var lip: MeshInstance2D = _visual(piece, "Lip")[0]
	assert_eq(lip.texture, TerrainArt.fallback_lip(), "2-tone placeholder lip")
	var edges := 0
	for child in piece.get_children(true):
		edges += 1 if child is Line2D else 0
	assert_eq(edges, 1, "edge line kept")
	piece.set_art_zone(ZONE)
	await physics_frames(2)
	assert_true((_visual(piece, "Fill")[0] as Polygon2D).texture != null, "switching the zone picks up the materials")


func test_seams_between_pieces_have_no_side_band() -> void:
	world = W.new_world(self)
	var left := _piece({shape = CurveTerrain.Shape.BLOCK, size = Vector2(64, 64)}, Vector2(0, 0))
	_piece({shape = CurveTerrain.Shape.BLOCK, size = Vector2(64, 64)}, Vector2(64, 0))
	await physics_frames(2)
	var bands := 0
	for child in left.get_children(true):
		if child is MeshInstance2D and not String(child.name).begins_with("Lip"):
			var vertices: PackedVector2Array = child.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
			for v in vertices:
				assert_true(v.x < 63.0, "no band along the shared side (%s)" % v)
			bands += 1
	assert_eq(bands, 1, "only the open left side gets a band")


func test_art_never_changes_collision() -> void:
	world = W.new_world(self)
	var plain := _piece({slope_angle = 30.0}, Vector2.ZERO, "")
	var textured := _piece({slope_angle = 30.0}, Vector2.ZERO)
	await physics_frames(2)
	var shapes := []
	for piece in [plain, textured]:
		var polygons := []
		for child in piece.get_children(true):
			if child is CollisionPolygon2D:
				polygons.append(child.polygon)
		shapes.append(polygons)
	assert_eq(shapes[0], shapes[1], "identical collision with and without materials")


## Runs a fixed course (spin dash, high speed, skid, hard landing, ticket
## pickup) and returns Sproto's position and speeds every frame.
func _course(effects_on: bool) -> Array:
	Effects.enabled = effects_on
	world = W.new_world(self)
	W.add_floor(world)
	var ticket: ScatteredTicket = load(ScatteredTicket.SCENE_PATH).instantiate()
	ticket.position = Vector2(400, -10)
	world.add_child(ticket)
	var player := W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)
	var trace := []
	var script := {2: [&"move_down", true], 36: [&"move_down", false], 120: [&"move_left", true],
			150: [&"move_left", false], 160: [&"jump", true], 200: [&"jump", false]}
	for k in 7:  # start the spin dash, then charge it fully
		script[6 + k * 4] = [&"jump", true]
		script[8 + k * 4] = [&"jump", false]
	for i in 260:
		if script.has(i):
			if script[i][1]:
				press(script[i][0])
			else:
				release(script[i][0])
		if i == 170:
			player.velocity = Vector2(player.velocity.x, -9.0)  # a high hop for a hard landing
		await physics_frames(1)
		trace.append([player.global_position, player.ground_speed, player.velocity, player.state])
	world.queue_free()
	await physics_frames(1)
	return trace


func test_effects_never_change_the_trajectory() -> void:
	var with_effects := await _course(true)
	var without := await _course(false)
	assert_eq(with_effects.size(), without.size(), "same length")
	var first_difference := -1
	for i in with_effects.size():
		if with_effects[i] != without[i]:
			first_difference = i
			break
	assert_eq(first_difference, -1, "identical frame by frame")
	var top_speed := 0.0
	for row in with_effects:
		top_speed = maxf(top_speed, absf(row[1]))
	assert_true(top_speed > 10.0, "the course reached afterimage speed (%s)" % top_speed)
