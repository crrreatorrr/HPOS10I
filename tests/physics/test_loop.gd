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
