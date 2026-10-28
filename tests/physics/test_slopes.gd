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


## A crest (up = true) or valley of two straight sides meeting at a sharp
## vertex, `height` px high or deep, starting at x 100 on a flat floor at y 0.
## Returns the x where it ends.
func _sharp_shape(left_deg: float, right_deg: float, height: float, up: bool) -> float:
	var x1 := 100.0 + height / tan(deg_to_rad(left_deg))
	var x2 := x1 + height / tan(deg_to_rad(right_deg))
	var tip := Vector2(x1, -height if up else height)
	if up:
		W.add_floor(world)
		W.add_polygon(world, PackedVector2Array([Vector2(100, 0), tip, Vector2(x2, 0)]))
	else:
		W.add_floor(world, -3000.0, 100.0)
		W.add_floor(world, x2, 3000.0)
		W.add_polygon(world, PackedVector2Array([Vector2(100, 0), tip, Vector2(x2, 0),
				Vector2(x2, 300), Vector2(100, 300)]))
	return x2


func _run_over_sharp_shapes(up: bool) -> void:
	for sides in [[45.0, 45.0], [45.0, 22.5], [26.6, 26.6]]:
		for dir in [1, -1]:
			for speed in [2.0, 4.0, 6.0, 10.0, 16.0]:
				world = W.new_world(self)
				var far := _sharp_shape(sides[0], sides[1], 24.0, up)
				var start := Vector2(0.0 if dir > 0 else far + 100.0, 0.0)
				player = W.spawn_player(world, start)
				await W.settle(self, player, start)
				player.ground_speed = speed * dir
				var action := &"move_right" if dir > 0 else &"move_left"
				press(action)
				var label := "%s %s/%s dir %d speed %s" % ["crest" if up else "valley", sides[0], sides[1], dir, speed]
				var worst := 0.0
				var last := absf(player.ground_speed)
				for i in 120:
					await physics_frames(1)
					if player.grounded:
						worst = maxf(worst, last - absf(player.ground_speed))
					last = absf(player.ground_speed)
				release(action)
				# Holding forward, a frame can lose at most the slope factor on 45 deg.
				assert_true(worst <= 0.125 * sin(deg_to_rad(45.0)) + 0.001,
						"%s: lost %.3f px/frame in one frame" % [label, worst])
				var past := player.global_position.x > far + 20.0 if dir > 0 else player.global_position.x < 80.0
				assert_true(past and player.grounded, "%s: got over (x %.1f)" % [label, player.global_position.x])
				world.queue_free()
				await physics_frames(1)


func test_sharp_crests_keep_speed() -> void:
	await _run_over_sharp_shapes(true)


func test_sharp_valleys_keep_speed() -> void:
	await _run_over_sharp_shapes(false)


const V_DEPTH := 64.0


## A sharp V of `side_deg` sides, V_DEPTH deep, between two floors at the top.
## Returns [vertex x, half width].
func _v_valley(side_deg: float) -> Array:
	world = W.new_world(self)
	var half := V_DEPTH / tan(deg_to_rad(side_deg))
	W.add_floor(world, -3000.0, 0.0, -V_DEPTH)
	W.add_polygon(world, PackedVector2Array([Vector2(0, -V_DEPTH), Vector2(half, 0),
			Vector2(2.0 * half, -V_DEPTH), Vector2(2.0 * half, 300), Vector2(0, 300)]))
	W.add_floor(world, 2.0 * half, 3000.0, -V_DEPTH)
	return [half, half]


## Drops Sproto into the V and waits for him to come to rest at the bottom.
func _rest_in_v(side_deg: float) -> Array:
	var v := _v_valley(side_deg)
	player = W.spawn_player(world, Vector2(-100.0, -V_DEPTH))
	await W.settle(self, player, Vector2(-100.0, -V_DEPTH))
	player.respawn_at(Vector2(v[0] - 3.0, -40.0))
	var still := 0
	for i in 900:
		await physics_frames(1)
		still = still + 1 if player.grounded and player.state == &"idle" else 0
		if still >= 10:
			break
	assert_true(still >= 10, "%s deg V: at rest at the bottom (%s)" % [side_deg, player.state])
	assert_eq(player.ground_angle, 0.0, "%s deg V: settled flat" % side_deg)
	return v


## Out = standing on the floor at the top, at or beyond the V's rim.
func _assert_out_of_v(v: Array, label: String) -> void:
	assert_true(player.grounded and absf(W.feet_y(player) + V_DEPTH) < 0.1,
			"%s: on the floor at the top (feet %.1f, x %.1f)" % [label, W.feet_y(player), player.global_position.x])
	assert_true(absf(player.global_position.x - v[0]) >= v[1] - player.get_radii().x,
			"%s: at or beyond the rim (x %.1f, vertex %.1f)" % [label, player.global_position.x, v[0]])


## Running into a V at 8 px/f carries him out the far side up to 55 degree
## sides. On 60 degrees and steeper he leaves the lip, lands on the far side
## and the steep landing sends him back down (the classic bands), so the
## bounces die out at the bottom and he must jump or spin dash out (the tests
## below); he must never end up inside the terrain.
func test_v_valleys_run_out_with_momentum() -> void:
	for side in range(30, 75, 5):
		for dir in [1, -1]:
			var v := _v_valley(float(side))
			var start := Vector2(-150.0 if dir > 0 else 2.0 * v[1] + 150.0, -V_DEPTH)
			player = W.spawn_player(world, start)
			await W.settle(self, player, start)
			player.ground_speed = 8.0 * dir
			var action := &"move_right" if dir > 0 else &"move_left"
			press(action)
			var buried := false
			for i in 90:
				await physics_frames(1)
				buried = buried or W.centre_in_terrain(player)
			release(action)
			await physics_frames(20)
			var label := "%d deg V running dir %d" % [side, dir]
			if side < 60:
				_assert_out_of_v(v, label)
			else:
				# The bounces die out: at rest at the bottom within 10 s.
				for i in 600:
					await physics_frames(1)
					buried = buried or W.centre_in_terrain(player)
					if player.grounded and player.state == &"idle":
						break
				assert_true(player.grounded and player.state == &"idle",
						"%s: comes to rest in the V (%s %s)" % [label, player.state, player.global_position])
			assert_true(not buried, "%s: never inside the terrain" % label)
			world.queue_free()
			await physics_frames(1)


func test_v_valleys_jump_out() -> void:
	for side in range(30, 75, 5):
		var v := await _rest_in_v(float(side))
		press(&"move_right")
		press(&"jump")
		await physics_frames(100)
		release(&"jump")
		release(&"move_right")
		await physics_frames(40)
		_assert_out_of_v(v, "%d deg V jump" % side)
		world.queue_free()
		await physics_frames(1)


func test_v_valleys_spindash_out() -> void:
	for side in range(30, 75, 5):
		var v := await _rest_in_v(float(side))
		press(&"move_down")
		await physics_frames(2)
		for i in 3:
			press(&"jump")
			await physics_frames(2)
			release(&"jump")
			await physics_frames(2)
		assert_eq(player.state, &"spindash", "%d deg V: spin dash charging" % side)
		release(&"move_down")
		await physics_frames(150)
		_assert_out_of_v(v, "%d deg V spin dash" % side)
		world.queue_free()
		await physics_frames(1)


## Rolls or runs into a sharp flat-to-`slope_deg` corner at every speed and
## sub-step phase; the loss per frame near the corner must stay within the
## slope factor (plus friction).
func _sharp_corner_onto_slope(slope_deg: float) -> void:
	var s := sin(deg_to_rad(slope_deg))
	for roll in [true, false]:
		var bound: float = (0.078125 * s + 0.0234375) if roll else (0.125 * s + 0.046875)
		for speed in [2.0, 4.0, 6.0, 8.0, 10.0, 12.0]:
			for phase in 8:
				world = W.new_world(self)
				W.add_floor(world, -3000.0, 200.0)
				var rise := 200.0 * tan(deg_to_rad(slope_deg))
				W.add_polygon(world, PackedVector2Array([Vector2(200, 0), Vector2(400, -rise),
						Vector2(400, 300), Vector2(200, 300)]))
				W.add_floor(world, 400.0, 3000.0, -rise)
				var start := Vector2(130.0 - phase, 0.0)
				player = W.spawn_player(world, start)
				await W.settle(self, player, start)
				player.ground_speed = speed
				if roll:
					press(&"move_down")
					await physics_frames(1)
					release(&"move_down")
				var worst := 0.0
				var last := absf(player.ground_speed)
				for i in 30:
					await physics_frames(1)
					if player.global_position.x > 170.0 and player.global_position.x < 240.0:
						worst = maxf(worst, last - absf(player.ground_speed))
					last = absf(player.ground_speed)
				assert_true(worst <= bound + 0.001, "%s deg %s at %s px/f, phase %d: lost %.3f in a frame" % [
						slope_deg, "roll" if roll else "run", speed, phase, worst])
				world.queue_free()
				await physics_frames(1)


func test_sharp_corner_onto_45_degrees_keeps_speed() -> void:
	await _sharp_corner_onto_slope(45.0)


func test_sharp_corner_onto_26_degrees_keeps_speed() -> void:
	await _sharp_corner_onto_slope(26.6)
