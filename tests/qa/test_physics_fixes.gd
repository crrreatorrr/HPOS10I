extends TestCase
## QA regression guards for the bugs fixed after review 01 (physics @ 9f3303c,
## qa/reports/01-physics.md "Re-check"), the new loop geometry and the
## constants moved into PhysicsConstants. All checks SKIP while the player
## (or loop) scene does not exist. Owned by QA.
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd -- --filter=physics_fixes

const L := preload("res://tests/qa/qa_physics_lib.gd")
const COIN_SCRIPT := "res://player/scattered_coin.gd"


func before_each() -> void:
	GameState.coins = 0


func after_each() -> void:
	GameState.coins = 0
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		Dev.send_action(action, false)


func _skip(needs_loop := false) -> bool:
	if not L.available() or (needs_loop and not ResourceLoader.exists(L.LOOP_SCENE)):
		print("  SKIP qa/test_physics_fixes.gd: no player (or loop) scene yet")
		return true
	return false


func _loop_world(start: Vector2, radius := 112.0) -> Array:
	var w := L.world(self)
	L.floor_at(w, -5000, 5000)
	var lp := L.loop(w, Vector2.ZERO, radius)
	var p = await L.spawn(self, w, start)
	return [lp, p]


# --- BUG-01-01: running off the loop top ------------------------------------------

func test_bug_01_01_off_the_loop_top_lands_on_the_floor() -> void:
	if _skip(true):
		return
	for dir in [1, -1]:
		for path in [0, 1]:
			var made := await _loop_world(Vector2(-600, 0))
			var lp: Node2D = made[0]
			var p = made[1]
			p.respawn_at(Vector2(0, -2.0 * lp.radius - lp.thickness - 40.0))
			p.set_collision_path(path)
			for i in 60:
				await physics_frames(1)
				if p.grounded:
					break
			p.ground_speed = 3.0 * dir
			var action := &"move_right" if dir > 0 else &"move_left"
			press(action)
			var buried := -1
			var air := 0
			for i in 300:
				await physics_frames(1)
				if buried < 0 and L.centre_in_terrain(p):
					buried = i
				if not p.grounded:
					air += 1
				if p.grounded and p.collision_mode == L.FLOOR and absf(L.feet_y(p)) < 0.05:
					break
			release(action)
			var label := "dir %d path %d" % [dir, path]
			assert_true(buried < 0, "%s: inside terrain from frame %d" % [label, buried])
			assert_true(p.grounded and absf(L.feet_y(p)) < 0.05, "%s: lands on the floor (%s)" % [label, p.global_position])
			if (dir > 0 and path == 0) or (dir < 0 and path == 1):
				assert_eq(air, 0, "%s: rides the hill foot down without leaving it;" % label)


func test_loop_feet_are_hills_from_outside() -> void:
	if _skip(true):
		return
	for speed in [3.0, 8.0]:
		var made := await _loop_world(Vector2(200, 0))
		var p = made[1]
		p.ground_speed = -speed
		press(&"move_left")
		for i in 200:
			await physics_frames(1)
			assert_true(not L.centre_in_terrain(p), "speed %s: never inside terrain (%s)" % [speed, p.global_position])
			if L.centre_in_terrain(p):
				break
		release(&"move_left")


func test_loop_top_switcher_paths() -> void:
	if _skip(true):
		return
	for dir in [1, -1]:
		var made := await _loop_world(Vector2(-400.0 * dir, 0))
		var p = made[1]
		p.ground_speed = 10.0 * dir
		var action := &"move_right" if dir > 0 else &"move_left"
		press(action)
		var descending := -1
		for i in 300:
			await physics_frames(1)
			if p.collision_mode == (L.LEFT_WALL if dir > 0 else L.RIGHT_WALL):
				descending = p.collision_path
			if p.global_position.x * dir > 300.0:
				break
		release(action)
		assert_eq(descending, 1 if dir > 0 else 0, "dir %d: path while coming down after the top;" % dir)
		assert_eq(p.collision_path, 0, "dir %d: path A after the loop;" % dir)


func test_loop_too_slow_fails_cleanly() -> void:
	if _skip(true):
		return
	for dir in [1, -1]:
		for speed in [5.0, 7.0, 8.5]:
			var made := await _loop_world(Vector2(-260.0 * dir, 0))
			var p = made[1]
			p.ground_speed = speed * dir
			for i in 600:
				await physics_frames(1)
				assert_true(not L.centre_in_terrain(p), "dir %d speed %s: never inside terrain" % [dir, speed])
				if L.centre_in_terrain(p):
					break
			assert_true(p.grounded and p.collision_mode == L.FLOOR and absf(L.feet_y(p)) < 2.0,
					"dir %d speed %s: back on the floor" % [dir, speed])


func test_loop_radii_52_to_200_every_speed() -> void:
	if _skip(true):
		return
	for radius in [52.0, 112.0, 200.0]:
		for speed in [8.0, 12.0, 16.0]:
			for dir in [1, -1]:
				var made := await _loop_world(Vector2(-(radius + 300.0) * dir, 0), radius)
				var lp: Node2D = made[0]
				var p = made[1]
				p.ground_speed = speed * dir
				var action := &"move_right" if dir > 0 else &"move_left"
				press(action)
				var exit_x: float = lp.radius + lp.thickness + lp.floor_margin + 40.0
				var modes := {}
				var air := false
				var done := false
				for i in 600:
					await physics_frames(1)
					modes[p.collision_mode] = true
					air = air or not p.grounded
					if p.global_position.x * dir > exit_x:
						done = true
						break
				release(action)
				var full := modes.has(L.RIGHT_WALL) and modes.has(L.CEILING) and modes.has(L.LEFT_WALL)
				assert_true(done and full and not air and p.collision_path == 0,
						"radius %s speed %s dir %d: done %s full %s air %s path %d" % [radius, speed, dir, done, full, air, p.collision_path])


# --- BUG-01-02: narrow terrain ------------------------------------------------------

func test_bug_01_02_lands_on_narrow_pillars() -> void:
	if _skip():
		return
	for width in [8.0, 16.0]:
		var w := L.world(self)
		L.floor_at(w, -2000, 2000, 300)
		L.rect(w, Rect2(-width / 2.0, 0, width, 300))
		var p = await L.spawn(self, w, Vector2(0, 300))
		p.respawn_at(Vector2(0, -80))
		for i in 90:
			await physics_frames(1)
			if L.centre_in_terrain(p):
				fail("%s px pillar: centre inside it at frame %d" % [width, i])
				break
			if p.grounded:
				break
		assert_near(L.feet_y(p), 0.0, 0.05, "%s px pillar: standing on top" % width)


# --- BUG-01-03: unrolling under a low ceiling --------------------------------------

func test_bug_01_03_keeps_rolling_under_a_low_ceiling() -> void:
	if _skip():
		return
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(100, -332, 400, 300))  # 32 px tunnel
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = 3.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	for i in 900:
		await physics_frames(1)
		var head: float = p.global_position.y - p.get_radii().y
		if p.global_position.x > 100 and p.global_position.x < 500 and head < -32.01:
			fail("frame %d: %s with the head at %.1f inside the ceiling (-32)" % [i, p.state, head])
			return
	assert_true(p.global_position.x > 500.0, "crept out of the far end (x %.1f)" % p.global_position.x)


# --- BUG-01-04: respawn_at from the ball hitbox --------------------------------------

func test_bug_01_04_respawn_at_is_exact_from_any_state() -> void:
	if _skip():
		return
	for setup in ["roll", "jump"]:
		var w := L.world(self)
		L.floor_at(w)
		var p = await L.spawn(self, w, Vector2.ZERO)
		if setup == "roll":
			p.ground_speed = 4.0
			press(&"move_down")
			await physics_frames(1)
			release(&"move_down")
		else:
			press(&"jump")
			await physics_frames(5)
			release(&"jump")
		assert_eq(p.state, StringName(setup), "setup")
		p.respawn_at(Vector2(300, -19))
		assert_eq(p.global_position, Vector2(300, -19), "respawn_at from %s" % setup)


# --- Constants now in PhysicsConstants (1c6e698) -------------------------------------

func test_moved_constants_are_read_live() -> void:
	if _skip() or not ResourceLoader.exists(COIN_SCRIPT):
		return
	var tp: Resource = Tuning.physics
	var saved := {}
	for key in ["skid_min_speed", "turnaround_speed", "coin_scatter_speed_first"]:
		saved[key] = tp.get(key)
	var w := L.world(self)
	L.floor_at(w)
	var p = await L.spawn(self, w, Vector2.ZERO)
	tp.set("skid_min_speed", 3.0)
	p.ground_speed = 3.5
	press(&"move_left")
	await physics_frames(1)
	var skid: StringName = p.state
	release(&"move_left")
	tp.set("turnaround_speed", 1.0)
	p.ground_speed = 0.25
	press(&"move_left")
	await physics_frames(1)
	var turned: float = p.ground_speed
	release(&"move_left")
	tp.set("coin_scatter_speed_first", 5.0)
	var coins: Array = load(COIN_SCRIPT).call(&"scatter", w, Vector2(0, -100), 1)
	var coin_speed: float = coins[0].velocity.length()
	for key in saved:
		tp.set(key, saved[key])
	assert_eq(skid, &"skid", "skid_min_speed")
	assert_near(turned, -1.0, 1e-6, "turnaround_speed")
	assert_near(coin_speed, 5.0, 1e-6, "coin_scatter_speed_first")
