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


# --- Re-check #2 @ 94dcac3: BUG-01-06..09 and the new head-height wall ray ---------

## Flat floor with a 32 px low tunnel from x 100 (ceiling bottom at y -32).
func _low_tunnel(length := 400.0, closed := false) -> Node2D:
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(100, -332, length, 300))
	if closed:
		L.rect(w, Rect2(100 + length, -400, 100, 400))
	return w


func _roll_in(w: Node2D, speed := 3.0) -> Node2D:
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = speed
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	return p


func test_bug_01_06_low_dead_end_can_be_left() -> void:
	if _skip():
		return
	# Holding the other way.
	var p = await _roll_in(_low_tunnel(300.0, true), 4.0)
	await physics_frames(240)
	var x0: float = p.global_position.x
	press(&"move_left")
	await physics_frames(120)
	release(&"move_left")
	assert_true(p.global_position.x < x0 - 20.0, "holding left backs out (x %.1f -> %.1f)" % [x0, p.global_position.x])
	# No input: turns back off the wall and leaves.
	p = await _roll_in(_low_tunnel(300.0, true), 4.0)
	await physics_frames(900)
	assert_true(p.global_position.x < 100.0, "no input: creeps back out of the entrance (x %.1f)" % p.global_position.x)
	# Down + jump spin dashes out of a force-roll.
	p = await _roll_in(_low_tunnel(300.0, true), 4.0)
	await physics_frames(240)
	press(&"move_left")
	await physics_frames(2)
	release(&"move_left")
	Dev.send_action(&"move_down", true)
	await physics_frames(2)
	Dev.send_action(&"jump", true)
	await physics_frames(1)
	Dev.send_action(&"jump", false)
	await physics_frames(2)
	assert_eq(p.state, &"spindash", "down + jump starts a spin dash from a force-roll")
	Dev.send_action(&"move_down", false)
	await physics_frames(60)
	assert_true(p.global_position.x < 100.0, "spin dashed out (x %.1f)" % p.global_position.x)


func test_force_roll_open_tunnel_every_input() -> void:
	if _skip():
		return
	for mode in ["none", "forward", "back"]:
		var p = await _roll_in(_low_tunnel())
		for i in 200:
			await physics_frames(1)
			if absf(p.ground_speed) <= 0.51:
				break
		if mode == "forward":
			press(&"move_right")
		elif mode == "back":
			press(&"move_left")
		for i in 900:
			await physics_frames(1)
			var head: float = p.global_position.y - p.get_radii().y
			assert_true(not (p.global_position.x > 100 and p.global_position.x < 500 and head < -32.01),
					"%s: head inside the ceiling at x %.1f" % [mode, p.global_position.x])
			if p.global_position.x > 560 or p.global_position.x < 40:
				break
		release(&"move_right")
		release(&"move_left")
		if mode == "back":
			assert_true(p.global_position.x < 100.0, "back: out of the entrance (x %.1f)" % p.global_position.x)
		else:
			assert_true(p.global_position.x > 500.0, "%s: out of the far end (x %.1f)" % [mode, p.global_position.x])


func test_bug_01_07_radius_48_always_exits() -> void:
	if _skip(true):
		return
	for speed in [8.0, 10.0, 12.0]:
		for phase in [0.0, 3.0, 7.0]:
			var made := await _loop_world(Vector2(-400.0 - phase, 0), 48.0)
			var lp: Node2D = made[0]
			var p = made[1]
			p.ground_speed = speed
			press(&"move_right")
			var exit_x: float = lp.radius + lp.thickness + lp.floor_margin + 40.0
			var done := false
			for i in 300:
				await physics_frames(1)
				if p.global_position.x > exit_x:
					done = true
					break
			release(&"move_right")
			assert_true(done, "speed %s phase %s: exits the radius-48 loop" % [speed, phase])


func test_bug_01_08_small_loop_entry_has_no_angle_spike() -> void:
	if _skip(true):
		return
	for radius in [64.0, 80.0]:
		for phase in [0.0, 1.3, 3.7]:
			var made := await _loop_world(Vector2(-400.0 - phase, 0), radius)
			var lp: Node2D = made[0]
			var p = made[1]
			p.ground_speed = 10.0
			press(&"move_right")
			var exit_x: float = lp.radius + lp.thickness + lp.floor_margin + 40.0
			var last: float = p.ground_angle
			var was_grounded := true
			var worst := 0.0
			for i in 300:
				await physics_frames(1)
				if p.grounded and was_grounded:
					worst = maxf(worst, absf(wrapf(p.ground_angle - last, -180.0, 180.0)))
				last = p.ground_angle
				was_grounded = p.grounded
				if p.global_position.x > exit_x:
					break
			release(&"move_right")
			assert_true(worst < 40.0, "radius %s phase %s: largest grounded angle step %.1f" % [radius, phase, worst])
			assert_true(p.global_position.x > exit_x, "radius %s phase %s: completed" % [radius, phase])


func test_bug_01_09_spring_under_a_narrow_column() -> void:
	if _skip():
		return
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(-8, -400, 16, 300))  # column down to y -100
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.launch(Vector2(0, -10))
	for i in 60:
		await physics_frames(1)
		var head: float = p.global_position.y - p.get_radii().y
		assert_true(head >= -100.5 and not L.centre_in_terrain(p), "frame %d: head %.1f above the column's bottom" % [i, head])
		if head < -100.5:
			break


func test_walkers_stop_at_low_tunnel_mouths_only() -> void:
	if _skip():
		return
	for h in [32.0, 37.0, 38.0, 48.0]:
		var w := L.world(self)
		L.floor_at(w)
		L.rect(w, Rect2(100, -h - 300, 400, 300))
		var p = await L.spawn(self, w, Vector2.ZERO)
		p.ground_speed = 3.0
		press(&"move_right")
		await physics_frames(120)
		release(&"move_right")
		if h < 37.5:
			assert_near(p.global_position.x, 90.0, 0.01, "%s px mouth blocks a walker" % h)
		else:
			assert_true(p.global_position.x > 400.0, "%s px mouth lets a walker in" % h)
	# Fast runners stop at the mouth too, and can still jump there.
	var w2 := L.world(self)
	L.floor_at(w2)
	L.rect(w2, Rect2(100, -332, 400, 300))
	var q = await L.spawn(self, w2, Vector2.ZERO)
	q.ground_speed = 16.0
	await physics_frames(30)
	assert_true(q.global_position.x < 100.0 and not L.centre_in_terrain(q), "16 px/f stops at the mouth")
	press(&"jump")
	await physics_frames(3)
	release(&"jump")
	assert_true(not q.grounded, "can jump at the mouth")


func test_head_height_ray_ignores_top_only_and_other_path() -> void:
	if _skip():
		return
	for layer in [L.TOP_ONLY, L.PATH_B, L.PATH_A]:
		var w := L.world(self)
		L.floor_at(w)
		L.rect(w, Rect2(100, -40, 400, 10), layer)  # bottom 30 px above the floor
		var p = await L.spawn(self, w, Vector2.ZERO)
		p.ground_speed = 3.0
		press(&"move_right")
		await physics_frames(120)
		release(&"move_right")
		if layer == L.PATH_A:
			assert_true(p.global_position.x < 100.0, "own path at head height blocks")
		else:
			assert_true(p.global_position.x > 300.0, "layer %d at head height does not block" % layer)


# --- Re-check #3 @ 4eead62: BUG-01-10, BUG-01-11 and the V-valley rule ---------------

## A V with its bottom at (0, 0): left side `a` deg, right side `b` deg, depth `h`,
## optional fillet `f` (symmetric sides only), on collision layer `layer`.
func _v_world(a: float, b: float, h: float, f := 0.0, layer := L.SOLID) -> Node2D:
	var w := L.world(self)
	var left := -h / tan(deg_to_rad(a))
	var right := h / tan(deg_to_rad(b))
	var pts := PackedVector2Array([Vector2(left - 400, -h), Vector2(left, -h)])
	if f > 0.0:
		var c := f / cos(deg_to_rad(a))
		var dt := f * sin(deg_to_rad(a))
		for k in 25:
			var d := -dt + 2.0 * dt * k / 24.0
			pts.append(Vector2(d, -c + sqrt(f * f - d * d)))
	else:
		pts.append(Vector2.ZERO)
	pts.append_array(PackedVector2Array([Vector2(right, -h), Vector2(right + 400, -h),
			Vector2(right + 400, 400), Vector2(left - 400, 400)]))
	L.poly(w, pts, layer)
	return w


func _not_in_valley(p: Node2D) -> bool:
	return p.get(&"_in_valley") != true  # null (renamed internals) counts as unknown


func test_bug_01_10_sharp_45_crests_and_valleys() -> void:
	if _skip():
		return
	for valley in [false, true]:
		for dir in [1, -1]:
			for speed in [4.0, 6.0, 10.0, 14.0]:
				var w: Node2D
				if valley:
					w = _v_world(45.0, 45.0, 150.0)
				else:
					w = L.world(self)
					L.floor_at(w, -3000, 3000)
					L.poly(w, PackedVector2Array([Vector2(-150, 0), Vector2(0, -150), Vector2(150, 0)]))
				var p = await L.spawn(self, w, Vector2(-350.0 * dir, -150.0 if valley else 0.0))
				p.ground_speed = speed * dir
				var action := &"move_right" if dir > 0 else &"move_left"
				press(action)
				var drop := 0.0
				var walls := false
				var last: float = absf(p.ground_speed)
				for i in 150:
					await physics_frames(1)
					if p.grounded:
						drop = maxf(drop, last - absf(p.ground_speed))
						walls = walls or p.collision_mode != L.FLOOR
					last = absf(p.ground_speed)
				release(action)
				var label := "%s dir %d at %s" % ["45 valley" if valley else "45 crest", dir, speed]
				assert_true(not walls, "%s: stays in floor mode" % label)
				assert_true(drop < 0.2, "%s: lost %.2f px/frame in one frame" % [label, drop])


func test_bug_01_11_sharp_v_valleys_can_be_left() -> void:
	if _skip():
		return
	# Run in, settle, then jump out holding right (shallow V) or spin dash out (deep).
	for c in [[50.0, 50.0, 150.0, "spindash"], [60.0, 60.0, 150.0, "spindash"],
			[70.0, 50.0, 64.0, "jump"], [60.0, 60.0, 64.0, "jump"]]:
		var w := _v_world(c[0], c[1], c[2])
		var p = await L.spawn(self, w, Vector2(-c[2] / tan(deg_to_rad(c[0])) - 100.0, -c[2]))
		p.ground_speed = 6.0
		press(&"move_right")
		await physics_frames(200)
		release(&"move_right")
		await physics_frames(120)
		if c[3] == "jump":
			press(&"move_right")
			press(&"jump")
			await physics_frames(25)
			release(&"jump")
			await physics_frames(120)
			release(&"move_right")
		else:
			Dev.send_action(&"move_down", true)
			await physics_frames(3)
			for k in 6:
				Dev.send_action(&"jump", true)
				await physics_frames(1)
				Dev.send_action(&"jump", false)
				await physics_frames(1)
			Dev.send_action(&"move_down", false)
			await physics_frames(200)
		var out: bool = p.global_position.y < -c[2] - 10.0 or absf(p.global_position.x) > c[2] * 2.0
		assert_true(out, "V %s/%s depth %s: out by %s (at %s, %s)" % [c[0], c[1], c[2], c[3], p.global_position, p.state])


func test_v_rule_stays_off_on_loops_and_quarter_pipes() -> void:
	if _skip(true):
		return
	for radius in [48.0, 112.0]:
		for speed in [0.0, 1.0, 4.0]:
			var made := await _loop_world(Vector2(-20.0, 0), radius)
			var p = made[1]
			p.ground_speed = speed
			for i in 300:
				await physics_frames(1)
				assert_true(_not_in_valley(p) and not L.centre_in_terrain(p),
						"loop r%s from %s px/f: frame %d" % [radius, speed, i])
				if not _not_in_valley(p) or L.centre_in_terrain(p):
					break
	for speed in [0.5, 2.0, 5.0]:
		var w := L.world(self)
		L.floor_at(w, -2000, 0)
		L.curve_terrain(w, Vector2.ZERO, {shape = 1, radius = 96.0, thickness = 48.0, wall_height = 224.0})
		var q = await L.spawn(self, w, Vector2(-40, 0))
		q.ground_speed = speed
		for i in 300:
			await physics_frames(1)
			assert_true(_not_in_valley(q), "quarter pipe bottom from %s px/f: frame %d" % [speed, i])
			if not _not_in_valley(q):
				break


func test_v_valley_layers_and_landings() -> void:
	if _skip():
		return
	# Path B V is not solid for a path A player; a top-only V is stood on.
	for layer in [L.TOP_ONLY, L.PATH_B]:
		var w := _v_world(60.0, 60.0, 150.0, 0.0, layer)
		var p = await L.spawn(self, w, Vector2(-200, -150))
		p.respawn_at(Vector2(0, -150))
		await physics_frames(120)
		if layer == L.PATH_B:
			assert_true(p.global_position.y > 300.0, "path B V: fell through on path A")
		else:
			assert_true(p.grounded and not L.centre_in_terrain(p), "top-only V: standing in it")
	# Landing in a sharp V after a hit or a spring.
	for how in ["hurt", "spring"]:
		var w2 := _v_world(60.0, 60.0, 150.0)
		var q = await L.spawn(self, w2, Vector2(-200, -150))
		GameState.add_coins(5)
		q.respawn_at(Vector2(-30, -120))
		await physics_frames(1)
		if how == "hurt":
			q.hurt(q.global_position + Vector2(-20, 0))
		else:
			q.launch(Vector2(1.0, -3.0))
		for i in 240:
			await physics_frames(1)
			assert_true(not L.centre_in_terrain(q), "%s landing: frame %d inside terrain" % [how, i])
			if L.centre_in_terrain(q):
				break
		assert_true(q.grounded and q.state != &"hurt" and q.state != &"spring", "%s: landed (%s)" % [how, q.state])
