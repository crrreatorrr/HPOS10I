extends TestCase
## GameCamera: deadzone, look-ahead, catch-up caps, vertical follow, air window,
## clamping, locks, autoscroll, shake, pixel snapping, spin dash hold and
## look up / down.

const W := preload("res://tests/physics/physics_world.gd")
const CAMERA_SCENE := preload("res://camera/game_camera.tscn")

var world: Node2D
var player: Player
var camera: GameCamera


## Frees the previous world, so the new camera can only find the new player.
func _fresh_world() -> void:
	if world != null and is_instance_valid(world):
		world.queue_free()
		await physics_frames(1)
	world = W.new_world(self)


func _setup(feet := Vector2.ZERO, floor_from := -4000.0, floor_to := 8000.0) -> void:
	await _fresh_world()
	W.add_floor(world, floor_from, floor_to)
	player = W.spawn_player(world, feet)
	camera = CAMERA_SCENE.instantiate()
	world.add_child(camera)
	await W.settle(self, player, feet)
	await physics_frames(2)


func _view() -> Vector2:
	return camera.get_viewport_rect().size


func test_camera_contract() -> void:
	await _setup()
	assert_eq(GameCamera.current(), camera, "current()")
	assert_true(camera.is_in_group(&"game_camera"), "group game_camera")
	assert_true(camera.is_current(), "made current")
	assert_eq(_view(), Vector2(424, 240), "viewport size")
	# Centred on Sproto, who is held vertical_offset above the centre.
	var expected := player.global_position + Vector2(0.0, camera.vertical_offset)
	assert_true(camera.global_position.distance_to(expected) < 0.01,
			"starts on the player (%s vs %s)" % [camera.global_position, expected])


func test_deadzone_holds_for_small_moves() -> void:
	await _setup()
	var start := camera.global_position
	player.respawn_at(player.global_position + Vector2(camera.deadzone_width / 2.0 - 1.0, 0.0))
	await physics_frames(10)
	assert_eq(camera.global_position, start, "inside the deadzone the camera holds still")
	player.respawn_at(player.global_position + Vector2(12.0, 0.0))
	await physics_frames(10)
	assert_true(camera.global_position.x > start.x, "outside it the camera follows")


func test_look_ahead_direction_and_size() -> void:
	for dir in [1, -1]:
		await _setup()
		player.ground_speed = 10.0 * dir
		press(&"move_right" if dir > 0 else &"move_left")
		await physics_frames(150)
		release(&"move_right" if dir > 0 else &"move_left")
		var expected := camera.look_ahead_max * (10.0 - camera.look_ahead_start_speed) \
				/ (camera.look_ahead_full_speed - camera.look_ahead_start_speed)
		assert_near(camera.look_ahead, expected * dir, 0.5, "dir %d: look-ahead at 10 px/frame" % dir)
		var lead: float = (camera.global_position.x - player.global_position.x) * dir
		assert_near(lead, expected - camera.deadzone_width / 2.0, 1.5, "dir %d: view ahead of Sproto" % dir)


func test_look_ahead_eases_without_jumps() -> void:
	await _setup()
	player.ground_speed = 12.0
	press(&"move_right")
	var last := camera.look_ahead
	var biggest := 0.0
	for i in 90:
		await physics_frames(1)
		biggest = maxf(biggest, absf(camera.look_ahead - last))
		last = camera.look_ahead
	release(&"move_right")
	# Reverse hard: the shift swings back smoothly, never faster than its cap.
	press(&"move_left")
	for i in 200:
		await physics_frames(1)
		biggest = maxf(biggest, absf(camera.look_ahead - last))
		last = camera.look_ahead
	release(&"move_left")
	assert_true(biggest <= camera.look_ahead_max_rate + 0.001, "largest shift change %.2f px/frame" % biggest)
	assert_true(camera.look_ahead < 0.0, "now looking left")


func test_horizontal_catch_up_is_capped() -> void:
	await _setup()
	var start_x := camera.global_position.x
	player.respawn_at(player.global_position + Vector2(200.0, 0.0))
	var last := camera.global_position.x
	var steps := []
	for i in 20:
		await physics_frames(1)
		steps.append(camera.global_position.x - last)
		last = camera.global_position.x
	assert_eq(steps[0], camera.max_speed_x, "first frame moves the cap")
	for step in steps:
		assert_true(step <= camera.max_speed_x, "never faster than %s px/frame (%s)" % [camera.max_speed_x, step])
	assert_near(camera.global_position.x - start_x, 200.0 - camera.deadzone_width / 2.0, 1.0, "caught up")


func test_vertical_ground_follow_caps() -> void:
	for fast in [false, true]:
		await _fresh_world()
		W.add_floor(world, -4000.0, 8000.0, 0.0)
		player = W.spawn_player(world, Vector2(0, -150))
		W.add_rect(world, Rect2(-50, -150, 100, 20))  # a ledge to start on
		camera = CAMERA_SCENE.instantiate()
		world.add_child(camera)
		await W.settle(self, player, Vector2(0, -150))
		await physics_frames(2)
		# Drop to the floor 150 px below and run along it.
		player.respawn_at(Vector2(120, -19))
		var speed := 9.0 if fast else 3.0
		player.velocity = Vector2(speed, 0.0)  # lands at this ground speed
		player.ground_speed = speed
		press(&"move_right")
		await physics_frames(1)
		var steps := []
		var last := camera.global_position.y
		for i in 12:
			await physics_frames(1)
			steps.append(camera.global_position.y - last)
			last = camera.global_position.y
		release(&"move_right")
		var cap := camera.ground_follow_fast if fast else camera.ground_follow_slow
		assert_eq(steps[3], cap, "%s: catches up at %s px/frame" % ["fast" if fast else "slow", cap])
		for step in steps:
			assert_true(step <= cap + 1.0, "never faster than the cap (%s)" % step)


func test_air_window() -> void:
	await _setup()
	var start_y := camera.global_position.y
	# A short hop stays inside the window: the camera holds still.
	player.launch(Vector2(0.0, -3.0))
	for i in 30:
		await physics_frames(1)
		assert_eq(camera.global_position.y, start_y, "frame %d: inside the air window" % i)
		if player.grounded:
			break
	# A full spring leaves it: the camera follows, keeping him within the window.
	player.launch(Vector2(0.0, -10.0))
	var moved := false
	for i in 40:
		await physics_frames(1)
		var focus_y := player.global_position.y + camera.vertical_offset
		assert_true(absf(focus_y - camera.global_position.y) <= camera.air_window + 1.0, "frame %d: within the window" % i)
		moved = moved or camera.global_position.y < start_y
	assert_true(moved, "followed the high jump")


func test_bounds_clamp_and_small_levels() -> void:
	await _setup(Vector2(30, 0))
	camera.set_level_bounds(Rect2(0, -400, 2000, 464))
	await physics_frames(2)
	var view := _view()
	assert_eq(camera.global_position.x, view.x / 2.0, "left edge: shows from x 0")
	assert_eq(camera.global_position.y, 64.0 - view.y / 2.0, "bottom edge: shows down to y 64")
	# A level smaller than the screen is centred.
	camera.set_level_bounds(Rect2(-100, -150, 200, 150))
	await physics_frames(2)
	assert_eq(camera.global_position, Vector2(0, -75), "small level centred")
	player.respawn_at(Vector2(90, -19))
	await physics_frames(20)
	assert_eq(camera.global_position, Vector2(0, -75), "and stays centred")


func test_lock_to_and_unlock() -> void:
	await _setup()
	var view := _view()
	var arena := Rect2(Vector2(300, -200), view)  # exactly one screen
	var distance := camera.global_position.distance_to(arena.get_center())
	camera.lock_to(arena, 0.5)
	var last := camera.global_position
	var biggest := 0.0
	for i in 30:
		await physics_frames(1)
		biggest = maxf(biggest, camera.global_position.distance_to(last))
		last = camera.global_position
	assert_eq(camera.global_position, arena.get_center(), "ends exactly on the arena")
	# Eased (smoothstep): the fastest frame is 1.5x the average, no jump.
	assert_true(biggest <= distance / 30.0 * 1.5 + 2.0, "slides in smoothly (largest step %.1f px)" % biggest)
	await physics_frames(10)
	assert_eq(camera.global_position, arena.get_center(), "held there")
	camera.unlock(0.5)
	await physics_frames(90)
	assert_near(camera.global_position.x, player.global_position.x, camera.deadzone_width, "back on Sproto")


func test_autoscroll_pushes_and_crushes() -> void:
	await _setup()
	W.add_rect(world, Rect2(400, -200, 40, 200))  # wall ahead
	var start_x := camera.global_position.x
	camera.start_autoscroll(Vector2(120.0, 0.0))
	await physics_frames(60)
	assert_near(camera.global_position.x - start_x, 120.0, 1.0, "scrolls 120 px in a second")
	assert_eq(player.clamp_rect, camera.view_rect(), "player kept inside the view")
	assert_true(player.global_position.x >= camera.view_rect().position.x + Tuning.physics.width_radius - 0.01,
			"pushed by the left edge")
	var dead := false
	for i in 300:
		await physics_frames(1)
		if player.state == &"dead":
			dead = true
			break
	assert_true(dead, "crushed against the wall")
	camera.stop_autoscroll()
	assert_eq(player.clamp_rect, Rect2(), "clamp cleared")


func test_shake_returns_to_rest() -> void:
	await _setup()
	var at := camera.global_position
	camera.shake(6.0, 0.5)
	var shook := false
	for i in 20:
		await physics_frames(1)
		shook = shook or camera.offset != Vector2.ZERO
		assert_true(absf(camera.offset.x) <= 6.0 and absf(camera.offset.y) <= 6.0, "within the strength")
	await physics_frames(20)
	assert_true(shook, "shook")
	assert_eq(camera.offset, Vector2.ZERO, "back at rest")
	assert_eq(camera.global_position, at, "position unaffected")


func test_no_pixel_jitter_at_constant_speed() -> void:
	for speed in [3.0, 6.0, 7.3]:
		await _setup()
		player.ground_speed = speed
		press(&"move_right")
		await physics_frames(200)  # look-ahead settled
		var last := camera.global_position.x
		var offsets := {}
		for i in 120:
			await physics_frames(1)
			assert_true(camera.global_position.x >= last, "speed %s: snapped x never steps back" % speed)
			last = camera.global_position.x
			# Sproto's screen pixel, as the renderer snaps it.
			offsets[roundf(player.global_position.x - camera.global_position.x)] = true
			assert_eq(camera.global_position.x - player.global_position.x,
					roundf(camera.global_position.x - player.global_position.x), "whole-pixel offset")
		release(&"move_right")
		assert_eq(offsets.size(), 1, "speed %s: Sproto keeps the same screen pixel %s" % [speed, offsets.keys()])


func test_no_pixel_jitter_on_a_slope() -> void:
	await _fresh_world()
	W.add_slope(world, 22.0, 3000.0)
	player = W.spawn_player(world, Vector2(-600, 600 * tan(deg_to_rad(22.0))))
	camera = CAMERA_SCENE.instantiate()
	world.add_child(camera)
	await W.settle(self, player, Vector2(-600, 600 * tan(deg_to_rad(22.0)) - 2.0))
	player.ground_speed = 4.0
	press(&"move_right")
	await physics_frames(200)
	var last := camera.global_position
	var screen := {}
	for i in 120:
		await physics_frames(1)
		assert_true(camera.global_position.x >= last.x and camera.global_position.y <= last.y,
				"moves only right and up (%s -> %s)" % [last, camera.global_position])
		last = camera.global_position
		screen[(player.global_position - camera.global_position).round()] = true
	release(&"move_right")
	assert_eq(screen.size(), 1, "Sproto keeps the same screen pixel on the slope %s" % [screen.keys()])


func test_spindash_hold() -> void:
	await _setup()
	press(&"move_down")
	await physics_frames(2)
	for i in 6:
		press(&"jump")
		await physics_frames(1)
		release(&"jump")
		await physics_frames(1)
	var x := camera.global_position.x
	release(&"move_down")
	await physics_frames(1)
	assert_near(player.ground_speed, 12.0, 1e-6, "full spin dash")
	# 16 frames minus half the charge (4): 12 frames, the release frame included.
	assert_eq(camera.hold_frames, camera.spindash_hold_frames - 4 - 1, "hold started")
	await physics_frames(10)
	assert_eq(camera.global_position.x, x, "held while Sproto shoots off")
	await physics_frames(3)
	assert_true(camera.global_position.x > x, "then follows")


func test_look_up_and_down_after_the_delay() -> void:
	await _setup()
	var y := camera.global_position.y
	press(&"move_up")
	await physics_frames(camera.look_delay_frames - 1)
	assert_eq(camera.global_position.y, y, "no pan before the delay")
	await physics_frames(80)
	assert_eq(camera.look_shift, -camera.look_up_distance, "panned up")
	assert_near(camera.global_position.y, y - camera.look_up_distance, 1.0, "view moved up")
	release(&"move_up")
	await physics_frames(80)
	assert_eq(camera.look_shift, 0.0, "returns when released")
	press(&"move_down")
	await physics_frames(camera.look_delay_frames + 60)
	assert_true(player.crouching, "crouching")
	assert_eq(camera.look_shift, camera.look_down_distance, "panned down while crouching")
	# Crouch -> spin dash still works, and the view comes back.
	press(&"jump")
	await physics_frames(2)
	release(&"jump")
	assert_eq(player.state, &"spindash", "spin dash from the crouch")
	release(&"move_down")
	await physics_frames(60)
	assert_eq(camera.look_shift, 0.0, "view back after the spin dash")


func test_respawn_snaps_instead_of_scrolling() -> void:
	await _setup()
	player.respawn_at(Vector2(3000, -19))
	await physics_frames(1)
	assert_eq(camera.global_position.x, 3000.0, "snapped to the new spot")


func test_respawn_snap_is_a_clean_cut_with_interpolation_on() -> void:
	tree.physics_interpolation = true
	await _setup()
	# The snap must place the camera itself, before it resets interpolation,
	# so the renderer cuts straight to the new view (no sweep from the old one).
	player.global_position = Vector2(2400, -19)
	camera._target = player
	camera._snap_to_target()
	assert_eq(camera.global_position, Vector2(2400, -19 + camera.vertical_offset), "placed inside the snap")
	# And the whole respawn flow with interpolation on.
	player.respawn_at(Vector2(-1500, -19))
	await physics_frames(1)
	assert_eq(camera.global_position.x, -1500.0, "snapped to the respawn spot")
	await physics_frames(5)
	assert_eq(camera.global_position.x, -1500.0, "and stays there")
	tree.physics_interpolation = false
