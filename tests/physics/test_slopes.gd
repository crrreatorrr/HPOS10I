extends TestCase
## Slope factor, rolling on slopes and slipping off steep slopes.

const W := preload("res://tests/physics/physics_world.gd")

var world: Node2D
var player: Player


## Puts the player on a straight slope through the origin.
func _on_slope(angle: float, x := 0.0) -> void:
	world = W.new_world(self)
	W.add_slope(world, angle)
	var feet := Vector2(x, -x * tan(deg_to_rad(angle)) - 2.0)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)


func test_running_uphill_slows_by_slope_factor() -> void:
	await _on_slope(22.0)
	assert_true(player.grounded, "on the slope")
	assert_near(player.ground_angle, 22.0, 0.01, "slope angle")
	player.ground_speed = 4.0
	await physics_frames(1)
	var before := player.ground_speed
	await physics_frames(1)
	var expected := -0.125 * sin(deg_to_rad(22.0)) - 0.046875
	assert_near(player.ground_speed - before, expected, 1e-6, "uphill: slope factor + friction")


func test_running_downhill_speeds_up() -> void:
	await _on_slope(22.0)
	player.ground_speed = -2.0
	press(&"move_left")
	await physics_frames(1)
	var before := player.ground_speed
	await physics_frames(1)
	var expected := -0.125 * sin(deg_to_rad(22.0)) - 0.046875
	assert_near(player.ground_speed - before, expected, 1e-6, "downhill: slope factor adds to acceleration")
	assert_true(absf(expected) > 0.046875, "faster than on flat ground")


func test_rolling_uses_up_and_down_factors() -> void:
	await _on_slope(22.0)
	var s := sin(deg_to_rad(22.0))
	player.ground_speed = 6.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	assert_eq(player.state, &"roll", "rolling")
	var before := player.ground_speed
	await physics_frames(1)
	assert_near(player.ground_speed - before, -0.078125 * s - 0.0234375, 1e-6, "rolling uphill")
	player.ground_speed = -6.0
	await physics_frames(1)
	before = player.ground_speed
	await physics_frames(1)
	assert_near(player.ground_speed - before, -0.3125 * s + 0.0234375, 1e-6, "rolling downhill")


func test_standing_on_gentle_slope_does_not_slip() -> void:
	await _on_slope(22.0)
	var x := player.global_position.x
	await physics_frames(120)
	assert_true(player.grounded, "still grounded")
	assert_eq(player.ground_speed, 0.0, "not sliding")
	assert_near(player.global_position.x, x, 0.001, "did not move")
	assert_eq(player.control_lock, 0, "no slip lock")


func test_standing_on_steep_slope_slips() -> void:
	await _on_slope(55.0)
	var x := player.global_position.x
	var locked := false
	for i in 60:
		await physics_frames(1)
		locked = locked or player.control_lock > 0
	assert_true(locked, "slipping locks control")
	assert_true(player.global_position.x < x - 20.0, "slid down the slope (%s -> %s)" % [x, player.global_position.x])


func test_standing_on_very_steep_slope_falls() -> void:
	await _on_slope(75.0)
	var detached := false
	for i in 30:
		await physics_frames(1)
		detached = detached or not player.grounded
	assert_true(detached, "detached and fell off a 75 degree slope")


func test_slow_run_up_steep_slope_slips_back() -> void:
	world = W.new_world(self)
	W.add_floor(world, -2000.0, 0.0)
	W.add_slope(world, 55.0, 300.0)
	player = W.spawn_player(world, Vector2(-60, 0))
	await W.settle(self, player, Vector2(-60, 0))
	player.ground_speed = 4.0
	var top := 0.0
	for i in 240:
		await physics_frames(1)
		top = minf(top, W.feet_y(player))
	assert_true(top < -5.0, "got some way up")
	assert_true(top > -150.0, "but not over the top")
	assert_true(player.global_position.x < 0.0, "came back down")
