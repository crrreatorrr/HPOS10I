extends TestCase
## QA regression guards for the player controller and terrain helpers
## (qa/checklists/01-physics.md). Every check here passed on physics @ 3aa4be3
## (qa/reports/01-physics.md); they cover what the physics agent's own tests
## do not. All checks SKIP while res://player/player.tscn does not exist.
## Owned by QA.
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd -- --filter=physics_regression

const L := preload("res://tests/qa/qa_physics_lib.gd")

var w: Node2D
var p: Node2D


func before_each() -> void:
	GameState.tickets = 0


func after_each() -> void:
	GameState.tickets = 0
	tree.paused = false
	for action in [&"move_down", &"jump"]:
		Dev.send_action(action, false)


func _skip(needs_loop := false) -> bool:
	if not L.available() or (needs_loop and not ResourceLoader.exists(L.LOOP_SCENE)):
		print("  SKIP qa/test_physics_regression.gd: no player (or loop) scene yet")
		return true
	return false


func _flat(feet := Vector2.ZERO) -> void:
	w = L.world(self)
	L.floor_at(w)
	p = await L.spawn(self, w, feet)


## Crouch, then one press of jump: the spin dash starts (input events, as a timeline sends them).
## Dev.send_action queues an event that Godot applies on the next process
## frame. At a low render rate (--fixed-fps 30: 2 physics ticks per frame)
## that is too late for a 1-2 tick wait, so flush it at once.
func _send(action: StringName, pressed: bool) -> void:
	Dev.send_action(action, pressed)
	Input.flush_buffered_events()


func _start_spindash() -> void:
	_send(&"move_down", true)
	await physics_frames(3)
	_send(&"jump", true)
	await physics_frames(1)
	_send(&"jump", false)
	await physics_frames(2)


func _release_all() -> void:
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		release(action)


# --- Ground (PHY-B) -------------------------------------------------------------

func test_skid_threshold_is_4() -> void:
	if _skip():
		return
	await _flat()
	p.ground_speed = 3.99
	press(&"move_left")
	await physics_frames(1)
	assert_true(p.state != &"skid", "no skid at 3.99 (%s)" % p.state)
	release(&"move_left")
	await _flat()
	p.ground_speed = 4.0
	press(&"move_left")
	await physics_frames(1)
	assert_eq(p.state, &"skid", "skid at 4")


func test_speed_above_top_is_kept_while_holding_forward() -> void:
	if _skip():
		return
	await _flat()
	p.ground_speed = 10.0
	press(&"move_right")
	await physics_frames(60)
	assert_near(p.ground_speed, 10.0, 1e-6, "ground")
	p.respawn_at(Vector2(0, -600))
	p.velocity = Vector2(8.0, 1.0)
	await physics_frames(5)
	assert_near(p.velocity.x, 8.0, 1e-6, "air, falling")
	p.velocity = Vector2(5.9, 1.0)
	await physics_frames(5)
	assert_near(p.velocity.x, 6.0, 1e-6, "air input caps at 6")


func test_left_and_right_together_is_no_input() -> void:
	if _skip():
		return
	await _flat()
	press(&"move_left")
	press(&"move_right")
	var states := {}
	for i in 30:
		await physics_frames(1)
		states[p.state] = true
	assert_eq(p.ground_speed, 0.0, "stays still")
	assert_eq(states.keys(), [&"idle"], "no state flicker")
	p.ground_speed = 4.0
	await physics_frames(1)
	assert_near(p.ground_speed, 4.0 - 0.046875, 1e-6, "friction only")


func test_velocity_is_ground_speed_projected() -> void:
	if _skip():
		return
	w = L.world(self)
	L.slope(w, 30.0)
	p = await L.spawn(self, w, Vector2(0, -2))
	p.ground_speed = 4.0
	press(&"move_right")
	var worst := 0.0
	for i in 20:
		await physics_frames(1)
		var a := deg_to_rad(p.ground_angle)
		var expect: Vector2 = Vector2(cos(a), -sin(a)) * p.ground_speed
		worst = maxf(worst, (p.velocity - expect).length())
	assert_true(worst < 0.001, "projection error %s" % worst)


func test_run_off_ledge_keeps_speed() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w, -2000.0, 100.0)
	p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = 4.0
	var gsp: float = p.ground_speed
	for i in 60:
		await physics_frames(1)
		if not p.grounded:
			assert_near(p.velocity.x, gsp - 0.046875, 1e-6, "x speed = last ground speed (one friction step)")
			assert_true(p.velocity.y >= 0.0 and p.velocity.y < 0.25, "y speed starts near 0 (%s)" % p.velocity.y)
			return
		gsp = p.ground_speed
	fail("never left the ledge")


func test_steps_up_to_10px_are_climbed() -> void:
	if _skip():
		return
	for h in [6.0, 10.0]:
		w = L.world(self)
		L.floor_at(w)
		L.rect(w, Rect2(200, -h, 400, h))
		p = await L.spawn(self, w, Vector2.ZERO)
		p.ground_speed = 6.0
		press(&"move_right")
		await physics_frames(60)
		release(&"move_right")
		assert_true(p.global_position.x > 300.0, "%s px step climbed at 6 px/f" % h)


func test_balances_on_a_ledge_with_one_sensor() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w, -2000.0, 100.0)
	p = await L.spawn(self, w, Vector2(104, 0))
	await physics_frames(60)
	assert_true(p.grounded, "still on the ledge")


# --- Air (PHY-C) ----------------------------------------------------------------

func test_full_jump_air_time() -> void:
	if _skip():
		return
	await _flat()
	press(&"jump")
	var frames := 0
	for i in 120:
		await physics_frames(1)
		if not p.grounded:
			frames += 1
		elif frames > 0:
			break
	assert_true(frames >= 59 and frames <= 61, "air time %d frames" % frames)


func test_release_after_apex_changes_nothing() -> void:
	if _skip():
		return
	await _flat()
	press(&"jump")
	for i in 40:
		await physics_frames(1)
		if not p.grounded and p.velocity.y > 0.5:
			break
	var vy: float = p.velocity.y
	release(&"jump")
	await physics_frames(1)
	assert_near(p.velocity.y, vy + 0.21875, 1e-6, "only gravity")


func test_air_acceleration_and_terminal_speed() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w, -200, 200, 4000)
	p = await L.spawn(self, w, Vector2(0, 4000))
	p.respawn_at(Vector2(0, -2000))
	press(&"move_right")
	await physics_frames(2)
	var vx: float = p.velocity.x
	await physics_frames(1)
	assert_near(p.velocity.x - vx, 0.09375, 1e-6, "air acceleration")
	release(&"move_right")
	var top := 0.0
	for i in 300:
		await physics_frames(1)
		top = maxf(top, p.velocity.y)
		if p.grounded:
			break
	assert_near(top, 16.0, 1e-6, "terminal fall speed")


func test_jump_leaves_perpendicular_to_slope() -> void:
	if _skip():
		return
	for angle in [22.0, -22.0]:
		w = L.world(self)
		L.slope(w, angle)
		p = await L.spawn(self, w, Vector2(0, -2))
		await physics_frames(5)
		var gsp: float = p.ground_speed
		var a := deg_to_rad(p.ground_angle)
		press(&"jump")
		for i in 3:
			await physics_frames(1)
			if not p.grounded:
				break
		release(&"jump")
		var expect: Vector2 = Vector2(gsp * cos(a), -gsp * sin(a)) - Vector2(sin(a), cos(a)) * 6.5
		assert_true((p.velocity - expect).length() < 0.01, "%s deg: %s vs %s" % [angle, p.velocity, expect])


func test_no_double_jump() -> void:
	if _skip():
		return
	await _flat()
	press(&"jump")
	await physics_frames(10)
	release(&"jump")
	await physics_frames(2)
	var vy: float = p.velocity.y
	press(&"jump")
	await physics_frames(2)
	assert_true(p.velocity.y > vy, "second press ignored")


func test_jump_against_a_wall_does_not_stick_or_jitter() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(100, -300, 40, 300))
	p = await L.spawn(self, w, Vector2(80, 0))
	press(&"move_right")
	await physics_frames(30)
	var x: float = p.global_position.x
	press(&"jump")
	var drift := 0.0
	for i in 80:
		await physics_frames(1)
		drift = maxf(drift, absf(p.global_position.x - x))
	assert_true(drift < 0.01, "x drift %s" % drift)
	assert_true(p.grounded, "landed")


# --- Slopes (PHY-D) ---------------------------------------------------------------

func test_mirrored_slope_angle() -> void:
	if _skip():
		return
	w = L.world(self)
	L.slope(w, -22.0)
	p = await L.spawn(self, w, Vector2(0, -2))
	assert_near(p.ground_angle, 338.0, 0.01, "360 - 22")


func test_ramps_at_speed_stay_grounded() -> void:
	if _skip():
		return
	for fillet in [16.0, 48.0]:
		for angle in [22.0, 45.0, -45.0]:
			w = L.world(self)
			L.floor_at(w, -3000, 0)
			L.curve_terrain(w, Vector2.ZERO, {shape = 2, slope_angle = angle, run_length = 200.0,
					lead_in = 64.0, lead_out = 3000.0, fillet_radius = fillet})
			p = await L.spawn(self, w, Vector2(-200, 0))
			p.ground_speed = 12.0
			press(&"move_right")
			var air := 0
			for i in 60:
				await physics_frames(1)
				if not p.grounded:
					air += 1
			release(&"move_right")
			assert_eq(air, 0, "ramp %s deg, fillet %s, 12 px/f: airborne frames" % [angle, fillet])


# --- Collision (PHY-E) ------------------------------------------------------------

func test_no_tunnelling_through_thin_walls_at_16() -> void:
	if _skip():
		return
	for t in [1.0, 8.0]:
		for phase in range(0, 16, 3):
			w = L.world(self)
			L.floor_at(w)
			L.rect(w, Rect2(400 + phase, -100, t, 100))
			p = await L.spawn(self, w, Vector2.ZERO)
			p.ground_speed = 16.0
			await physics_frames(40)
			assert_true(p.global_position.x < 400 + phase, "ground: %s px wall, phase %d" % [t, phase])
			w = L.world(self)
			L.floor_at(w, -2000, 2000, 400)
			L.rect(w, Rect2(300 + phase, -400, t, 800))
			p = await L.spawn(self, w, Vector2(0, 400))
			p.respawn_at(Vector2(0, -100))
			p.velocity = Vector2(16.0, -2.0)
			await physics_frames(40)
			assert_true(p.global_position.x < 300 + phase, "air: %s px wall, phase %d" % [t, phase])


func test_no_tunnelling_through_ceilings_at_16() -> void:
	if _skip():
		return
	for t in [1.0, 8.0, 16.0]:
		for phase in range(0, 8, 3):
			w = L.world(self)
			L.floor_at(w)
			L.rect(w, Rect2(-200, -200 - phase - t, 400, t))
			p = await L.spawn(self, w, Vector2.ZERO)
			p.launch(Vector2(0, -16))
			await physics_frames(40)
			assert_true(p.global_position.y > -200 - phase, "%s px ceiling, phase %d" % [t, phase])


func test_top_only_platforms() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(200, -60, 200, 10), L.TOP_ONLY)
	p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = 6.0
	press(&"move_right")
	var worst := 0.0
	for i in 90:
		await physics_frames(1)
		worst = maxf(worst, absf(L.feet_y(p)))
	release(&"move_right")
	assert_true(worst < 0.05, "no snap up when running under it (%s)" % worst)
	for vy in [8.0, 16.0]:
		for phase in range(0, 8, 3):
			w = L.world(self)
			L.floor_at(w, -2000, 2000, 400)
			L.rect(w, Rect2(-100, 0, 200, 8), L.TOP_ONLY)
			p = await L.spawn(self, w, Vector2(0, 400))
			p.respawn_at(Vector2(0, -120 - phase))
			p.velocity = Vector2(0, vy)
			for i in 60:
				await physics_frames(1)
				if p.grounded:
					break
			assert_near(L.feet_y(p), 0.0, 0.05, "lands on it at %s px/f (phase %d)" % [vy, phase])


# --- Loops and terrain helpers (PHY-F, terrain/loop.tscn) --------------------------

func _loop_run(start_x: float, speed: float, radius := 112.0) -> Dictionary:
	w = L.world(self)
	L.floor_at(w, -5000, 5000)
	var lp := L.loop(w, Vector2.ZERO, radius)
	p = await L.spawn(self, w, Vector2(start_x, 0))
	var dir := int(signf(speed))
	p.ground_speed = speed
	var action := &"move_right" if dir > 0 else &"move_left"
	press(action)
	var exit_x: float = (lp.radius + lp.thickness + lp.floor_margin + 40.0) * dir
	var modes := {}
	var airborne := false
	var done := false
	for i in 900:
		await physics_frames(1)
		modes[p.collision_mode] = true
		airborne = airborne or not p.grounded
		if p.global_position.x * dir > exit_x * dir:
			done = true
			break
	release(action)
	return {done = done, airborne = airborne, path = p.collision_path,
			full = modes.has(L.RIGHT_WALL) and modes.has(L.CEILING) and modes.has(L.LEFT_WALL)}


func test_loop_both_ways_at_8_and_16() -> void:
	if _skip(true):
		return
	for speed in [8.0, -8.0, 16.0, -16.0]:
		var r := await _loop_run(-500.0 * signf(speed), speed)
		assert_true(r.done and r.full and not r.airborne, "speed %s: full loop on the ground" % speed)
		assert_eq(r.path, 0, "speed %s: path A after the loop;" % speed)


func test_loop_radii() -> void:
	if _skip(true):
		return
	for radius in [48.0, 80.0, 160.0, 220.0]:
		for speed in [10.0, -10.0]:
			var r := await _loop_run(-700.0 * signf(speed), speed, radius)
			assert_true(r.done and r.full and not r.airborne and r.path == 0, "radius %s speed %s" % [radius, speed])


func test_path_switchers_at_16_every_phase() -> void:
	if _skip(true):
		return
	for phase in range(0, 16, 2):
		for dir in [1, -1]:
			var r := await _loop_run(-(600.0 + phase) * dir, 16.0 * dir)
			assert_true(r.done and not r.airborne and r.path == 0, "dir %d phase %d" % [dir, phase])


func test_two_loops_in_a_row_at_16() -> void:
	if _skip(true):
		return
	for phase in range(0, 16, 3):
		w = L.world(self)
		L.floor_at(w, -4000, 6000)
		L.loop(w, Vector2.ZERO)
		var second := L.loop(w, Vector2(700, 0))
		p = await L.spawn(self, w, Vector2(-600.0 - phase, 0))
		p.ground_speed = 16.0
		press(&"move_right")
		var airborne := false
		var goal: float = 700.0 + second.radius + second.thickness + second.floor_margin + 40.0
		for i in 400:
			await physics_frames(1)
			airborne = airborne or not p.grounded
			if p.global_position.x > goal:
				break
		release(&"move_right")
		assert_true(p.global_position.x > goal and not airborne, "phase %d: second loop completed" % phase)


func test_loop_radius_set_before_entering_tree() -> void:
	if _skip(true):
		return
	w = L.world(self)
	L.floor_at(w, -4000, 4000)
	var lp: Node2D = load(L.LOOP_SCENE).instantiate()
	lp.set(&"radius", 80.0)
	w.add_child(lp)
	p = await L.spawn(self, w, Vector2(-600, 0))
	p.ground_speed = 10.0
	press(&"move_right")
	var ceiling := false
	for i in 400:
		await physics_frames(1)
		ceiling = ceiling or p.collision_mode == L.CEILING
		if p.global_position.x > 250:
			break
	release(&"move_right")
	assert_true(ceiling, "went round")


func test_jump_inside_the_loop_leaves_along_the_normal() -> void:
	if _skip(true):
		return
	for target in [90.0, 180.0, 270.0]:
		w = L.world(self)
		L.floor_at(w, -4000, 4000)
		L.loop(w, Vector2.ZERO)
		p = await L.spawn(self, w, Vector2(-500, 0))
		p.ground_speed = 9.0
		press(&"move_right")
		var jumped := false
		for i in 400:
			await physics_frames(1)
			if p.grounded and absf(wrapf(p.ground_angle - target, -180, 180)) < 14.0:
				press(&"jump")
				for k in 3:
					await physics_frames(1)
					if not p.grounded:
						break
				var a := deg_to_rad(p.ground_angle)
				var v: Vector2 = p.velocity
				assert_near(v.dot(Vector2(-sin(a), -cos(a))), 6.5, 0.01, "jump at %s deg" % target)
				jumped = true
				break
		_release_all()
		assert_true(jumped, "reached %s deg" % target)
		for i in 120:
			await physics_frames(1)
			assert_true(not L.centre_in_terrain(p), "never inside terrain after the jump at %s" % target)
			if L.centre_in_terrain(p):
				break


func test_reversing_mid_loop_falls_back_cleanly() -> void:
	if _skip(true):
		return
	w = L.world(self)
	L.floor_at(w, -4000, 4000)
	L.loop(w, Vector2.ZERO)
	p = await L.spawn(self, w, Vector2(-400, 0))
	p.ground_speed = 9.0
	press(&"move_right")
	for i in 300:
		await physics_frames(1)
		if p.collision_mode == L.RIGHT_WALL and p.ground_angle > 60.0:
			break
	release(&"move_right")
	press(&"move_left")
	var ok := false
	for i in 400:
		await physics_frames(1)
		assert_true(not L.centre_in_terrain(p), "not inside terrain")
		if p.grounded and p.collision_mode == L.FLOOR and absf(p.ground_angle) < 1.0:
			ok = true
			break
	release(&"move_left")
	assert_true(ok, "back on the floor")


func test_quarter_pipe() -> void:
	if _skip():
		return
	for speed in [10.0, 4.0]:
		w = L.world(self)
		L.floor_at(w, -2000, 0)
		L.curve_terrain(w, Vector2.ZERO, {shape = 1, radius = 96.0, thickness = 48.0, wall_height = 224.0})
		p = await L.spawn(self, w, Vector2(-300, 0))
		p.ground_speed = speed
		var rising_vx := 0.0
		var went_up := false
		for i in 400:
			await physics_frames(1)
			if not p.grounded and p.velocity.y < -1.0:
				went_up = true
				rising_vx = maxf(rising_vx, absf(p.velocity.x))
		if speed > 5.0:
			assert_true(went_up and rising_vx < 0.5, "10 px/f: straight-up launch (|vx| %s)" % rising_vx)
		assert_true(p.grounded and p.global_position.x < 0.0 and not L.centre_in_terrain(p),
				"%s px/f: back on the floor left of the pipe" % speed)


# --- Rolling and spin dash (PHY-G, PHY-H) --------------------------------------------

func test_roll_decel_friction_and_no_forward_accel() -> void:
	if _skip():
		return
	await _flat()
	p.ground_speed = 6.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	press(&"move_left")
	var before: float = p.ground_speed
	await physics_frames(1)
	assert_near(p.ground_speed - before, -0.125 - 0.0234375, 1e-6, "decel + friction")
	release(&"move_left")
	press(&"move_right")
	before = p.ground_speed
	await physics_frames(1)
	assert_near(p.ground_speed - before, -0.0234375, 1e-6, "no forward acceleration")


func test_feet_stay_put_on_roll_and_unroll() -> void:
	if _skip():
		return
	await _flat()
	var feet := L.feet_y(p)
	p.ground_speed = 2.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	assert_near(L.feet_y(p), feet, 0.01, "roll")
	for i in 200:
		await physics_frames(1)
		if p.state != &"roll":
			break
	assert_near(L.feet_y(p), feet, 0.01, "unroll")


func test_is_attacking_only_in_ball_states() -> void:
	if _skip():
		return
	await _flat()
	assert_true(not p.is_attacking(), "idle")
	p.launch(Vector2(0, -6))
	assert_true(not p.is_attacking(), "spring")
	await physics_frames(60)
	GameState.add_tickets(1)
	p.hurt(p.global_position + Vector2(10, 0))
	assert_true(not p.is_attacking(), "hurt")
	p.kill()
	assert_true(not p.is_attacking(), "dead")


func test_spindash_jump_spam_clamps_charge() -> void:
	if _skip():
		return
	await _flat()
	await _start_spindash()
	var top := 0.0
	for i in 120:
		Dev.send_action(&"jump", i % 2 == 0)
		await physics_frames(1)
		top = maxf(top, p.spindash_charge)
		if p.state != &"spindash":
			break
	assert_eq(p.state, &"spindash", "still charging, never jumped")
	assert_true(top <= 8.0 + 1e-9, "charge <= 8 (%s)" % top)
	Dev.send_action(&"jump", false)
	Dev.send_action(&"move_down", false)
	await physics_frames(2)  # an input event reaches the player on the next tick
	# Charge decays between the last press and the release: 8 + floor(7..8) / 2.
	assert_true(p.ground_speed >= 11.45 and p.ground_speed <= 12.0, "near-max release (%s)" % p.ground_speed)


func test_spindash_release_and_jump_on_the_same_frame() -> void:
	if _skip():
		return
	await _flat()
	await _start_spindash()
	assert_eq(p.state, &"spindash", "charging")
	Dev.send_action(&"move_down", false)
	Dev.send_action(&"jump", true)
	await physics_frames(3)
	assert_true(p.grounded and p.state == &"roll", "released into a roll, no jump (%s)" % p.state)


func test_spindash_uphill_on_22_degrees() -> void:
	if _skip():
		return
	for angle in [22.0, -22.0]:
		w = L.world(self)
		L.slope(w, angle)
		p = await L.spawn(self, w, Vector2(0, -2))
		var uphill := &"move_right" if angle > 0.0 else &"move_left"
		press(uphill)
		await physics_frames(1)
		release(uphill)
		await physics_frames(30)
		await _start_spindash()
		assert_eq(p.state, &"spindash", "%s deg: spin dash starts facing uphill" % angle)
		_send(&"move_down", false)
		await physics_frames(2)
		assert_near(absf(p.ground_speed), 8.0, 0.2, "%s deg: release speed" % angle)


func test_spindash_against_a_wall() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(100, -100, 40, 100))
	p = await L.spawn(self, w, Vector2(90, 0))
	press(&"move_right")
	await physics_frames(10)
	release(&"move_right")
	var x: float = p.global_position.x
	await _start_spindash()
	Dev.send_action(&"move_down", false)
	var drift := 0.0
	for i in 30:
		await physics_frames(1)
		drift = maxf(drift, absf(p.global_position.x - x))
	assert_true(drift < 0.01 and p.global_position.x < 100.0, "no tunnel or jitter (%s)" % drift)


# --- Damage, API and pause (PHY-I, PHY-J) ---------------------------------------------

func test_hurt_and_kill_edge_cases() -> void:
	if _skip():
		return
	await _flat()
	GameState.add_tickets(3)
	p.hurt(p.global_position + Vector2(20, 0))
	assert_true(p.is_invincible(), "invincible after a hit")
	p.kill()
	assert_eq(p.state, &"dead", "kill ignores invincibility")
	for order in ["hurt_kill", "kill_hurt"]:
		await _flat()
		GameState.add_tickets(3)
		var died := [0]
		p.died.connect(func() -> void: died[0] += 1)
		if order == "hurt_kill":
			p.hurt(p.global_position)
			p.kill()
		else:
			p.kill()
			p.hurt(p.global_position)
		await physics_frames(90)
		assert_eq(died[0], 1, "%s on one frame: one death" % order)
	await _flat()
	p.kill()
	var vy: float = p.velocity.y
	p.launch(Vector2(0, -16))
	assert_eq(p.state, &"dead", "a spring does not revive")
	assert_near(p.velocity.y, vy, 1e-6, "no launch while dead")


func test_hurt_from_every_state_lands_cleanly() -> void:
	if _skip():
		return
	for s in ["idle", "run", "skid", "jump", "roll", "spindash", "spring"]:
		await _flat()
		GameState.add_tickets(5)
		match s:
			"run":
				p.ground_speed = 4.0
				press(&"move_right")
				await physics_frames(2)
			"skid":
				p.ground_speed = 6.0
				press(&"move_left")
				await physics_frames(1)
			"jump":
				press(&"jump")
				await physics_frames(4)
			"roll":
				p.ground_speed = 5.0
				press(&"move_down")
				await physics_frames(1)
				release(&"move_down")
			"spindash":
				await _start_spindash()
			"spring":
				p.launch(Vector2(0, -8))
				await physics_frames(2)
		assert_eq(p.state, StringName(s), "setup %s" % s)
		p.hurt(p.global_position + Vector2(20, 0))
		assert_eq(p.state, &"hurt", "hurt from %s" % s)
		_release_all()
		Dev.send_action(&"move_down", false)
		var landed := false
		for i in 200:
			await physics_frames(1)
			if p.grounded:
				landed = true
				break
		assert_true(landed and p.state == &"idle", "%s: lands and goes idle (%s)" % [s, p.state])


func test_hurt_on_the_loop_ceiling() -> void:
	if _skip(true):
		return
	w = L.world(self)
	L.floor_at(w, -4000, 4000)
	L.loop(w, Vector2.ZERO)
	p = await L.spawn(self, w, Vector2(-500, 0))
	GameState.add_tickets(5)
	p.ground_speed = 9.0
	press(&"move_right")
	for i in 300:
		await physics_frames(1)
		if p.collision_mode == L.CEILING:
			break
	p.hurt(p.global_position + Vector2(-20, 0))
	release(&"move_right")
	assert_eq(p.collision_mode, L.FLOOR, "mode reset")
	var landed := false
	for i in 300:
		await physics_frames(1)
		assert_true(not L.centre_in_terrain(p), "never inside terrain")
		if L.centre_in_terrain(p):
			break
		if p.grounded:
			landed = true
			break
	assert_true(landed, "landed inside the loop")


func test_control_locks() -> void:
	if _skip():
		return
	await _flat()
	p.set_control_lock(10)
	press(&"move_left")
	await physics_frames(10)
	assert_eq(p.ground_speed, 0.0, "left ignored for 10 frames")
	await physics_frames(3)
	assert_true(p.ground_speed < 0.0, "control back")
	release(&"move_left")
	await _flat()
	p.push_ground(8.0, 30)
	press(&"jump")
	var jumped := false
	for i in 4:
		await physics_frames(1)
		jumped = jumped or not p.grounded
	assert_true(jumped, "jump works during a push_ground lock")


func test_clamp_rect_right_and_top_edges() -> void:
	if _skip():
		return
	await _flat()
	p.clamp_rect = Rect2(-100, -200, 200, 400)
	p.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(60)
	release(&"move_right")
	assert_near(p.global_position.x, 100.0 - p.get_radii().x, 0.01, "held at the right edge")
	assert_true(p.state != &"dead", "not crushed at the right edge")
	p.launch(Vector2(0, -12))
	var top := 0.0
	for i in 60:
		await physics_frames(1)
		top = minf(top, p.global_position.y - p.get_radii().y)
	assert_true(top >= -200.01, "kept below the top edge (%s)" % top)


func test_pause_freezes_every_state_and_drops_presses() -> void:
	if _skip():
		return
	for s in ["idle", "run", "skid", "jump", "roll", "spindash", "spring", "hurt", "dead"]:
		await _flat()
		GameState.add_tickets(5)
		match s:
			"run":
				p.ground_speed = 4.0
				press(&"move_right")
				await physics_frames(2)
			"skid":
				p.ground_speed = 6.0
				press(&"move_left")
				await physics_frames(1)
			"jump":
				press(&"jump")
				await physics_frames(4)
			"roll":
				p.ground_speed = 5.0
				press(&"move_down")
				await physics_frames(1)
				release(&"move_down")
			"spindash":
				await _start_spindash()
			"spring":
				p.launch(Vector2(0, -8))
				await physics_frames(2)
			"hurt":
				p.hurt(p.global_position + Vector2(20, 0))
				await physics_frames(2)
			"dead":
				p.kill()
				await physics_frames(2)
		var snapshot := [p.global_position, p.velocity, p.state, p.ground_speed, p.grounded]
		tree.paused = true
		press(&"jump")
		await physics_frames(30)
		assert_eq([p.global_position, p.velocity, p.state, p.ground_speed, p.grounded], snapshot, "%s: frozen while paused" % s)
		tree.paused = false
		await physics_frames(2)
		if s in ["idle", "run", "roll"]:
			assert_true(p.grounded, "%s: a jump pressed during pause does not fire" % s)
		_release_all()
		Dev.send_action(&"move_down", false)


func test_tuning_is_read_every_frame() -> void:
	if _skip():
		return
	await _flat()
	var old: float = Tuning.physics.top_speed
	Tuning.physics.top_speed = 8.0
	press(&"move_right")
	await physics_frames(200)
	var reached: float = p.ground_speed
	Tuning.physics.top_speed = old
	assert_near(reached, 8.0, 1e-6, "a runtime top_speed change applies at once")


func test_steady_motion_far_from_the_origin() -> void:
	if _skip():
		return
	w = L.world(self)
	L.floor_at(w, 49000, 60000)
	p = await L.spawn(self, w, Vector2(50000, 0))
	p.ground_speed = 0.5
	var worst := 0.0
	var last: float = p.global_position.x
	for i in 30:
		await physics_frames(1)
		worst = maxf(worst, absf((p.global_position.x - last) - p.ground_speed))
		last = p.global_position.x
	assert_true(worst < 0.02, "per-frame error at x = 50000: %s" % worst)
