extends TestCase
## QA regression guards for the physics fixes in 53a6989 (bugs found by the
## level agent; qa/reports/03-camera.md 03d): a roll or run stopping dead at a
## sharp flat-to-slope corner, and fast launches ending inside ceilings or
## walls. Wider than the agent's own tests: both directions, run and roll,
## 30-45 degree corners, diagonal launches and walls. SKIP while the player
## scene does not exist. Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func after_each() -> void:
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		Dev.send_action(action, false)


func _skip() -> bool:
	if not L.available():
		print("  SKIP qa/test_physics_fixes_2.gd: no player scene yet")
		return true
	return false


## Flat floor meeting a straight slope at x = 0 with a sharp corner; the slope
## rises away from the start (dir 1: to the right, -1: to the left).
func _corner_world(angle_deg: float, dir: float) -> Node2D:
	var w := L.world(self)
	var h := 600.0 * tan(deg_to_rad(angle_deg))
	var pts := PackedVector2Array([
		Vector2(-3000, 0), Vector2(0, 0), Vector2(600, -h), Vector2(3000, -h),
		Vector2(3000, 300), Vector2(-3000, 300)])
	if dir < 0.0:
		for i in pts.size():
			pts[i].x = -pts[i].x
		pts.reverse()
	L.poly(w, pts)
	return w


## Runs (holding the direction) or rolls (no input) into the corner. Returns
## [furthest progress past the corner, stopped dead before it].
func _into_corner(angle_deg: float, dir: float, speed: float, roll: bool) -> Array:
	var w := _corner_world(angle_deg, dir)
	# Rolls lose speed to friction, so they start close enough to reach it.
	var start := 40.0 if roll else 200.0
	var p: Node2D = await L.spawn(self, w, Vector2(-dir * start, 0.0))
	var hold := &"move_right" if dir > 0.0 else &"move_left"
	p.ground_speed = dir * speed
	if roll:
		press(&"move_down")
		await physics_frames(1)
		release(&"move_down")
	else:
		press(hold)
	var furthest := -INF
	var stopped_before := false
	for i in 150:
		await physics_frames(1)
		var past := dir * p.global_position.x
		furthest = maxf(furthest, past)
		# Stopped on the flat without ever reaching the corner (rolling back
		# down after climbing a little is normal physics, not the bug).
		if furthest < 0.0 and past < -2.0 and absf(float(p.ground_speed)) < 0.01 and bool(p.grounded):
			stopped_before = true
			break
	if not roll:
		release(hold)
	return [furthest, stopped_before]


func test_running_onto_sharp_slope_corners() -> void:
	if _skip():
		return
	for angle in [30.0, 40.0, 45.0]:
		for dir in [1.0, -1.0]:
			for speed in [2.0, 4.0, 8.0, 12.0]:
				var r: Array = await _into_corner(angle, dir, speed, false)
				assert_true(not r[1] and r[0] > 16.0,
						"run %s px/f into a sharp %s deg corner (dir %d): got %.1f px past it, stopped before: %s" % [speed, angle, dir, r[0], r[1]])


func test_rolling_onto_sharp_slope_corners() -> void:
	if _skip():
		return
	for angle in [30.0, 40.0, 45.0]:
		for dir in [1.0, -1.0]:
			for speed in [2.0, 4.0, 8.0, 12.0]:
				var r: Array = await _into_corner(angle, dir, speed, true)
				var need := 16.0 if speed >= 4.0 else 0.0
				assert_true(not r[1] and r[0] > need,
						"roll %s px/f into a sharp %s deg corner (dir %d): got %.1f px past it, stopped before: %s" % [speed, angle, dir, r[0], r[1]])


func test_steep_corners_still_act_as_walls_at_a_crawl() -> void:
	# The fix must not make 60-90 deg faces walkable from flat ground.
	if _skip():
		return
	for angle in [70.0, 89.0]:
		var w := _corner_world(angle, 1.0)
		var p: Node2D = await L.spawn(self, w, Vector2(-60.0, 0.0))
		press(&"move_right")
		await physics_frames(90)
		release(&"move_right")
		assert_true(p.global_position.x < 0.0,
				"walking into a %s deg face does not get past it (x %.1f)" % [angle, p.global_position.x])
		assert_true(not L.centre_in_terrain(p), "not inside the %s deg face" % angle)


func test_diagonal_launches_never_end_inside_a_ceiling() -> void:
	if _skip():
		return
	var worst := 0.0
	var runs := 0
	for speed in [6.0, 10.0, 16.0]:
		for slant in [0.0, 0.5, 1.0]:
			for height in [40.0, 70.0, 110.0]:
				for phase in [0.0, 3.0, 5.0]:
					var w := L.world(self)
					L.floor_at(w)
					var bottom: float = -38.0 - height - phase
					L.rect(w, Rect2(-2000, bottom - 300.0, 4000, 300))
					var p: Node2D = await L.spawn(self, w, Vector2.ZERO)
					p.launch(Vector2(speed * slant, -speed))
					var hit_x := NAN
					for i in 24:
						await physics_frames(1)
						var head: float = p.global_position.y - p.get_radii().y
						worst = maxf(worst, bottom - head)
						if is_nan(hit_x) and head <= bottom + 0.5:
							hit_x = p.global_position.x
					runs += 1
					assert_true(not L.centre_in_terrain(p), "centre outside terrain (speed %s, slant %s)" % [speed, slant])
					if slant > 0.0 and not is_nan(hit_x):
						assert_true(p.global_position.x > hit_x + 4.0,
								"sideways motion goes on after the ceiling stops the rise (speed %s, slant %s)" % [speed, slant])
	print("  INFO %d launches under ceilings: deepest head penetration %.3f px" % [runs, worst])
	assert_true(worst <= 0.05, "head never goes into the ceiling (deepest %.3f px)" % worst)


func test_fast_sideways_launches_never_end_inside_a_wall() -> void:
	if _skip():
		return
	var worst := 0.0
	for speed in [8.0, 12.0, 16.0]:
		for gap in [20.0, 33.0, 47.0]:
			for rise in [-2.0, -6.0]:
				var w := L.world(self)
				L.floor_at(w)
				var wall_x: float = 10.0 + gap
				L.rect(w, Rect2(wall_x, -600, 300, 600))
				var p: Node2D = await L.spawn(self, w, Vector2.ZERO)
				p.launch(Vector2(speed, rise))
				for i in 20:
					await physics_frames(1)
					var right: float = p.global_position.x + p.get_radii().x
					worst = maxf(worst, right - wall_x)
				assert_true(not L.centre_in_terrain(p), "centre outside the wall (speed %s, gap %s)" % [speed, gap])
	print("  INFO sideways launches into walls: deepest body penetration %.3f px" % worst)
	assert_true(worst <= 1.0, "body stays out of the wall (deepest %.3f px)" % worst)
