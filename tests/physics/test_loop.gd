extends TestCase
## Full loop traversal with path switching (terrain/loop.tscn).

const W := preload("res://tests/physics/physics_world.gd")

var world: Node2D
var player: Player
var loop: TerrainLoop


func _setup(start_x: float) -> void:
	world = W.new_world(self)
	W.add_floor(world, -3000.0, 3000.0)
	loop = W.add_loop(world, Vector2.ZERO)
	player = W.spawn_player(world, Vector2(start_x, 0))
	await W.settle(self, player, Vector2(start_x, 0))


## Runs until the player passes `goal_x` in `direction` (or the limit). Returns
## the collision modes seen and whether the player was ever airborne.
func _run(direction: int, goal_x: float, limit := 600) -> Dictionary:
	var modes := {}
	var airborne := false
	var lowest := INF
	for i in limit:
		await physics_frames(1)
		modes[player.collision_mode] = true
		airborne = airborne or not player.grounded
		if player.global_position.x * direction > goal_x * direction:
			break
	return {modes = modes, airborne = airborne}


func _exit_x() -> float:
	return loop.radius + loop.thickness + loop.floor_margin + 40.0


func test_loop_at_top_speed_left_to_right() -> void:
	await _setup(-500.0)
	player.ground_speed = 6.0
	press(&"move_right")
	var result := await _run(1, _exit_x())
	for mode in [Player.RIGHT_WALL, Player.CEILING, Player.LEFT_WALL]:
		assert_true(result.modes.has(mode), "passed through mode %d" % mode)
	assert_true(not result.airborne, "never left the ground")
	assert_true(player.global_position.x > _exit_x(), "exited on the far side")
	assert_true(player.grounded, "grounded after the loop")
	assert_true(player.ground_speed > 0.0, "moving right")
	assert_eq(player.collision_path, Player.PATH_A, "back on path A")


func test_loop_right_to_left() -> void:
	await _setup(500.0)
	player.ground_speed = -6.0
	press(&"move_left")
	var result := await _run(-1, -_exit_x())
	for mode in [Player.RIGHT_WALL, Player.CEILING, Player.LEFT_WALL]:
		assert_true(result.modes.has(mode), "passed through mode %d" % mode)
	assert_true(not result.airborne, "never left the ground")
	assert_true(player.global_position.x < -_exit_x(), "exited on the far side")
	assert_true(player.grounded and player.ground_speed < 0.0, "grounded and moving left")
	assert_eq(player.collision_path, Player.PATH_A, "back on path A")


func test_loop_after_spindash() -> void:
	await _setup(-400.0)
	press(&"move_down")
	await physics_frames(2)
	for i in 6:
		press(&"jump")
		await physics_frames(1)
		release(&"jump")
		await physics_frames(1)
	release(&"move_down")
	await physics_frames(1)
	assert_near(player.ground_speed, 12.0, 1e-6, "spin dash")
	var result := await _run(1, _exit_x())
	for mode in [Player.RIGHT_WALL, Player.CEILING, Player.LEFT_WALL]:
		assert_true(result.modes.has(mode), "passed through mode %d" % mode)
	assert_true(not result.airborne, "never left the ground")
	assert_true(player.global_position.x > _exit_x() and player.grounded, "rolled out the far side")


func test_too_slow_falls_off_the_loop() -> void:
	await _setup(-100.0)
	# Enough to climb past the 69 degree fall angle, too little to get round.
	player.ground_speed = 7.0
	var climbed := false
	var fell := false
	for i in 400:
		await physics_frames(1)
		if player.grounded and player.collision_mode == Player.RIGHT_WALL:
			climbed = true
		if climbed and not player.grounded:
			fell = true
	assert_true(climbed, "started up the loop")
	assert_true(fell, "detached and fell")
	assert_true(player.global_position.x < loop.radius, "did not get round")
	assert_true(player.grounded, "back on the floor")


func test_ground_angle_is_smooth_around_the_loop() -> void:
	await _setup(-500.0)
	player.ground_speed = 6.0
	press(&"move_right")
	var last := player.ground_angle
	var largest_step := 0.0
	var unwrapped := 0.0
	for i in 400:
		await physics_frames(1)
		var step := wrapf(player.ground_angle - last, -180.0, 180.0)
		last = player.ground_angle
		unwrapped += step
		largest_step = maxf(largest_step, absf(step))
		assert_true(step >= -0.5, "angle never steps backwards (%.2f at frame %d)" % [step, i])
		if player.global_position.x > _exit_x():
			break
	assert_near(unwrapped, 360.0, 1.0, "turned a full circle")
	# Where the nearer of A/B swaps (at 90, 180 and 270 degrees) the reading
	# jumps by about 2 * asin(width / radius), as in the classic games.
	var swap := rad_to_deg(2.0 * asin(Tuning.physics.width_radius / (loop.radius - 19.0))) + 2.5
	assert_true(largest_step < swap, "no angle jumps beyond the A/B swap (largest %.2f)" % largest_step)


func test_jump_into_steep_ceiling_attaches() -> void:
	await _setup(-500.0)
	# Inside the loop under its upper-right part (surface angle about 127 degrees).
	player.respawn_at(Vector2(loop.radius * 0.8, -loop.radius))
	player.velocity = Vector2(0.0, -8.0)
	for i in 30:
		await physics_frames(1)
		if player.grounded:
			break
	assert_true(player.grounded, "landed on the ceiling")
	assert_true(player.ground_angle > 90.0 and player.ground_angle < 135.0, "steep ceiling angle (%s)" % player.ground_angle)
	assert_true(player.ground_speed > 0.0, "upward speed carried along the ceiling")
