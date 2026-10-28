extends TestCase
## LevelRoot: spawning, camera, backdrop, pits, the death flow and respawning
## at a checkpoint (docs/CONTRACTS.md, "Levels").

const W := preload("res://tests/levels/level_world.gd")


func test_spawns_player_standing_at_player_start() -> void:
	var level := await W.mini_level(self, Vector2(200, -19))
	var player := level.player
	assert_true(player != null and player.is_inside_tree(), "player spawned")
	assert_true(player.is_in_group(&"player"), "in group player")
	assert_eq(get_tree_players().size(), 1, "exactly one player")
	await physics_frames(30)
	assert_true(player.grounded, "standing on the floor")
	assert_near(player.global_position.x, 200.0, 0.01, "at PlayerStart x")
	assert_near(player.global_position.y, -Tuning.physics.height_radius, 0.01, "feet on the floor")


func test_marker_on_the_ground_line_is_lifted_onto_the_floor() -> void:
	var level := await W.mini_level(self, Vector2(300, 0))
	await physics_frames(10)
	assert_true(level.player.grounded, "standing")
	assert_near(level.player.global_position.y, -Tuning.physics.height_radius, 0.01, "lifted out of the floor")


func test_spawns_at_the_checkpoint_when_one_is_set() -> void:
	GameState.checkpoint_position = Vector2(900, -19)
	var level := await W.mini_level(self, Vector2(64, -19))
	await physics_frames(10)
	assert_near(level.player.global_position.x, 900.0, 0.01, "at the checkpoint")
	assert_true(level.player.grounded, "standing")


func test_camera_limits_are_the_bounds() -> void:
	var level := await W.mini_level(self)
	var camera := level.camera
	assert_true(camera != null and camera.is_current(), "a current camera")
	var bounds := level.get_bounds()
	assert_eq(camera.limit_left, int(bounds.position.x), "left limit")
	assert_eq(camera.limit_top, int(bounds.position.y), "top limit")
	assert_eq(camera.limit_right, int(bounds.end.x), "right limit")
	assert_eq(camera.limit_bottom, int(bounds.end.y), "bottom limit")
	# Walk to the far end: the view never leaves the bounds.
	press(&"move_right")
	for i in 400:
		await physics_frames(1)
		var view := camera.get_screen_center_position()
		var half := camera.get_viewport_rect().size / 2.0
		if view.x - half.x < bounds.position.x - 0.5 or view.x + half.x > bounds.end.x + 0.5 \
				or view.y - half.y < bounds.position.y - 0.5 or view.y + half.y > bounds.end.y + 0.5:
			fail("view %s left the bounds %s at frame %d" % [view, bounds, i])
			return


func test_backdrop_and_hud_stand_ins() -> void:
	var level := await W.mini_level(self)
	var backdrop := level.get_node_or_null(^"Backdrop")
	assert_true(backdrop != null, "backdrop added")
	var layers := backdrop.find_children("*", "Parallax2D", false, false)
	assert_eq(layers.size(), 4, "four parallax layers")
	var scales: Array[float] = []
	for layer in layers:
		scales.append((layer as Parallax2D).scroll_scale.x)
		assert_true((layer as Parallax2D).repeat_size.x > 0.0, "layers repeat horizontally")
	var expected := [0.1, 0.3, 0.6, 0.9]
	for i in mini(scales.size(), expected.size()):
		assert_near(scales[i], expected[i], 1e-5, "contract scroll scale %d" % i)
	if not ResourceLoader.exists(LevelRoot.HUD_SCENE):
		assert_true(level.get_node_or_null(^"DebugHud") != null, "debug HUD stands in for the HUD")


func test_falling_below_bounds_kills_then_respawns_once_after_two_seconds() -> void:
	# A pit from x 400 to 500.
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		var terrain := root.get_node(^"Terrain")
		for child in terrain.get_children():
			child.free()
		W.add_rect(terrain, Rect2(0, 0, 400, 200))
		W.add_rect(terrain, Rect2(500, 0, 1500, 200)))
	var player := level.player
	var lives := GameState.lives
	var events := []
	player.died.connect(func() -> void: events.append(["died", Engine.get_physics_frames()]))
	level.respawn_requested.connect(func() -> void: events.append(["respawn", Engine.get_physics_frames()]))
	var kill := []
	player.state_changed.connect(func(_old: StringName, new: StringName) -> void:
		if new == &"dead" and kill.is_empty():
			kill.append(Engine.get_physics_frames())
			kill.append(player.global_position.y - Tuning.physics.height_radius))
	player.respawn_at(Vector2(450, -100))
	for i in 400:
		await physics_frames(1)
		if events.size() >= 2:
			break
	var killed_at: int = kill[0] if not kill.is_empty() else -1
	if not kill.is_empty():
		assert_true(kill[1] > level.get_bounds().end.y, "killed once fully below the bounds")
	assert_true(killed_at > 0, "the pit killed him")
	assert_eq(events.size(), 2, "died, then one respawn request")
	if events.size() == 2:
		assert_near(events[0][1] - killed_at, 60.0, 5.0, "died about 1 s after kill()")
		assert_near(events[1][1] - events[0][1], 60.0, 10.0, "respawn about 1 s after died")
	assert_true(not GameState.timer_running, "timer stopped after died")
	await physics_frames(120)
	assert_eq(events.size(), 2, "respawn requested exactly once")
	assert_eq(GameState.lives, lives, "LevelRoot never takes a life itself")


func test_pausing_pauses_the_death_wait() -> void:
	var level := await W.mini_level(self)
	var requests := [0]
	level.respawn_requested.connect(func() -> void: requests[0] += 1)
	level.player.kill()
	await physics_frames(70)  # died has fired
	tree.paused = true
	await physics_frames(200)
	assert_eq(requests[0], 0, "no respawn while paused")
	tree.paused = false
	await physics_frames(80)
	assert_eq(requests[0], 1, "respawn after unpausing")


## The real zone flow: die after the checkpoint, SceneRouter.respawn() takes
## a life and reloads the act, Sproto starts at the checkpoint, the checkpoint
## is kept, tickets reset, the timer resumes from the checkpoint time.
func test_death_after_checkpoint_respawns_there_through_scene_router() -> void:
	SceneRouter.zone_id = "test_zone"
	SceneRouter.stage = 1
	GameState.start_level("test_zone", 1)
	var level := await W.test_zone(self)
	level.use_scene_router = true
	var checkpoint := level.get_node(^"Objects/Checkpoint") as Checkpoint
	GameState.level_time = 12.0
	level.player.respawn_at(checkpoint.global_position + Vector2(-40, 0))
	level.player.ground_speed = 4.0
	press(&"move_right")
	await physics_frames(30)
	release(&"move_right")
	assert_true(checkpoint.is_active(), "checkpoint touched")
	assert_eq(GameState.checkpoint_position, checkpoint.global_position, "checkpoint stored")
	var checkpoint_time := GameState.checkpoint_time
	GameState.add_tickets(5)
	var lives := GameState.lives
	level.player.kill()
	var reloaded: Node = null
	for i in 240:
		await physics_frames(1)
		if tree.current_scene != null and tree.current_scene != level and tree.current_scene is LevelRoot:
			reloaded = tree.current_scene
			break
	assert_true(reloaded != null, "the act reloaded")
	if reloaded == null:
		return
	await physics_frames(LevelRoot.SPAWN_SETTLE_FRAMES + 4)
	var player := (reloaded as LevelRoot).player
	assert_near(player.global_position.x, checkpoint.global_position.x, 0.01, "respawned at the checkpoint")
	assert_true(player.grounded, "standing")
	assert_eq(GameState.lives, lives - 1, "respawn() took one life")
	assert_eq(GameState.tickets, 0, "tickets reset")
	assert_eq(GameState.checkpoint_position, checkpoint.global_position, "checkpoint kept")
	assert_true(GameState.level_time >= checkpoint_time and GameState.level_time < checkpoint_time + 0.3,
			"timer resumes from the checkpoint time (%.2f, checkpoint %.2f)" % [GameState.level_time, checkpoint_time])
	assert_true(GameState.timer_running, "timer running again")
	var again := (reloaded as LevelRoot).get_node(^"Objects/Checkpoint") as Checkpoint
	assert_true(again.is_active(), "checkpoint shows as passed")
	(reloaded as LevelRoot).use_scene_router = false
	tree.unload_current_scene()


func get_tree_players() -> Array[Node]:
	return tree.get_nodes_in_group(&"player")
