extends TestCase
## Airborne physics: jump height, variable jump, air drag, ceilings,
## top-only platforms and landing speed conversion.

const W := preload("res://tests/physics/physics_world.gd")

var world: Node2D
var player: Player


func _spawn(feet := Vector2.ZERO) -> void:
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)


## Presses jump and waits until the player has left the ground.
func _jump() -> void:
	press(&"jump")
	for i in 3:
		await physics_frames(1)
		if not player.grounded:
			return


## Steps until grounded (or the limit). Returns the velocity of the frame
## before landing.
func _fall_until_grounded(limit := 300) -> Vector2:
	var before := player.velocity
	for i in limit:
		before = player.velocity
		await physics_frames(1)
		if player.grounded:
			break
	return before


func test_jump_apex_height() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	await _spawn()
	var start_feet := W.feet_y(player)
	await _jump()
	assert_near(player.velocity.y, -6.5, 1e-6, "jump force")
	var top := start_feet
	for i in 80:
		top = minf(top, W.feet_y(player))
		await physics_frames(1)
	# Continuous apex v^2 / 2g = 6.5^2 / (2 * 0.21875) = 96.57 px (bottom of the hitbox).
	assert_near(start_feet - top, 96.6, 1.5, "apex height")
	assert_true(player.grounded, "landed again")
	assert_near(W.feet_y(player), start_feet, 0.01, "back on the floor")


func test_releasing_jump_cuts_speed_to_4() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	await _spawn()
	await _jump()
	await physics_frames(4)
	assert_true(player.velocity.y < -4.0, "still rising fast")
	release(&"jump")
	await physics_frames(1)
	# Cut to -4 at the start of the frame, then one frame of gravity.
	assert_near(player.velocity.y, -4.0 + 0.21875, 1e-6, "upward speed cut to 4")


func test_air_drag_only_while_rising_slowly() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	await _spawn()
	player.ground_speed = 6.0
	await _jump()
	var dragged := 0
	var checked := 0
	while not player.grounded and checked < 120:
		var before := player.velocity
		await physics_frames(1)
		checked += 1
		if player.grounded:
			break
		if before.y < 0.0 and before.y > -4.0:
			var expected := before.x - float(int(before.x / 0.125)) / 256.0
			assert_near(player.velocity.x, expected, 1e-6, "drag at y speed %.3f" % before.y)
			dragged += 1
		else:
			assert_near(player.velocity.x, before.x, 1e-9, "no drag at y speed %.3f" % before.y)
	assert_true(dragged >= 15, "drag applied on the frames with -4 < y < 0 (%d)" % dragged)


func test_ceiling_stops_upward_speed() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	W.add_rect(world, Rect2(-200, -200, 400, 120))  # bottom at y = -80
	await _spawn()
	await _jump()
	var stopped := false
	for i in 60:
		var before := player.velocity.y
		await physics_frames(1)
		var head := player.global_position.y - player.get_radii().y
		assert_true(head >= -80.01, "head stays below the ceiling (%s)" % head)
		if before < -2.0 and player.velocity.y >= 0.0:
			stopped = true
			break
	assert_true(stopped, "upward speed set to 0 by the ceiling")


func test_top_only_platform_jump_through_and_land() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	W.add_rect(world, Rect2(-120, -60, 240, 12), W.TOP_ONLY)
	await _spawn()
	await _jump()
	var passed_above := false
	for i in 100:
		await physics_frames(1)
		if W.feet_y(player) < -60.0:
			passed_above = true
		if passed_above and player.grounded:
			break
	assert_true(passed_above, "jumped up through the platform")
	assert_true(player.grounded, "landed")
	assert_near(W.feet_y(player), -60.0, 0.05, "standing on the platform")
	# And it stays solid to walk on.
	press(&"move_right")
	await physics_frames(30)
	assert_true(player.grounded, "running along the top-only platform")
	assert_near(W.feet_y(player), -60.0, 0.05, "still on top")


func test_land_on_flat_keeps_x_speed() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	await _spawn(Vector2(0, -40))
	player.respawn_at(Vector2(0, -80))
	player.velocity = Vector2(3.0, 1.0)
	await _fall_until_grounded()
	assert_true(player.grounded, "landed")
	assert_near(player.ground_speed, 3.0, 1e-6, "flat landing: ground speed = x speed")


func test_land_on_slope_halves_y_speed() -> void:
	world = W.new_world(self)
	W.add_slope(world, 30.0)
	await _spawn(Vector2(0, -60))
	player.respawn_at(Vector2(0, -120))
	player.velocity = Vector2(0.0, 2.0)
	var before := await _fall_until_grounded()
	assert_true(player.grounded, "landed")
	assert_near(player.ground_angle, 30.0, 0.01, "slope angle")
	# 24-45 degrees, |x| <= y: gsp = y * 0.5 * -sign(sin(angle)).
	var y_at_landing := before.y + Tuning.physics.gravity
	assert_near(player.ground_speed, -0.5 * y_at_landing, 1e-3, "slope landing")


func test_land_on_slope_fast_x_keeps_x() -> void:
	world = W.new_world(self)
	W.add_slope(world, 30.0)
	await _spawn(Vector2(0, -60))
	# Just above the slope (surface y = 23 at x = -40), so y speed stays below x.
	player.respawn_at(Vector2(-40, 23.0 - 19.0 - 12.0))
	player.velocity = Vector2(5.0, 0.5)
	var before := await _fall_until_grounded()
	assert_true(before.y + Tuning.physics.gravity < 5.0, "y speed below x speed at landing")
	assert_true(player.grounded, "landed")
	assert_near(player.ground_speed, 5.0, 1e-6, "|x| > y keeps x speed")


func test_land_on_steep_slope_full_y_speed() -> void:
	world = W.new_world(self)
	W.add_slope(world, 60.0)
	await _spawn(Vector2(0, -60))
	player.respawn_at(Vector2(-40, -140))
	player.velocity = Vector2(0.0, 3.0)
	var before := await _fall_until_grounded()
	assert_true(player.grounded, "landed")
	assert_near(player.ground_angle, 60.0, 0.01, "steep angle")
	assert_eq(player.collision_mode, Player.RIGHT_WALL, "wall mode on 60 degrees")
	var y_at_landing := before.y + Tuning.physics.gravity
	assert_near(player.ground_speed, -y_at_landing, 1e-3, "steep landing: full y speed")


func test_fast_fall_does_not_tunnel() -> void:
	world = W.new_world(self)
	W.add_rect(world, Rect2(-200, 0, 400, 10))  # thin floor
	await _spawn()
	player.respawn_at(Vector2(0, -400))
	player.velocity = Vector2(0.0, 16.0)
	await _fall_until_grounded(60)
	assert_true(player.grounded, "landed at 16 px/frame on a 10 px floor")
	assert_near(W.feet_y(player), 0.0, 0.05, "on top of it")
