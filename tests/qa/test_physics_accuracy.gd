extends TestCase
## QA physics accuracy audit against the community Physics Guide
## (qa/reports/08-physics-accuracy.md). Independent of the physics agent's
## reference simulator: every expected value below is written straight from
## the Guide's rules (closed forms and one-frame deltas), then measured on the
## real Player in a physics_world. Tolerance 1/256 px (or px/frame).
## Deviations are reported with INFO lines and asserted where the Guide is
## unambiguous. Skips while the player scene does not exist. Owned by QA.

const W := preload("res://tests/physics/physics_world.gd")
const EPS := 1.0 / 256.0

var world: Node2D
var player: Player


func after_each() -> void:
	GameState.tickets = 0
	for action in [&"move_right", &"move_left", &"move_down", &"move_up", &"jump"]:
		Dev.send_action(action, false)
	Input.flush_buffered_events()


func _skip() -> bool:
	if not ResourceLoader.exists("res://player/player.tscn"):
		print("  SKIP qa/test_physics_accuracy.gd: no player yet")
		return true
	# Before physics 78070f8 (Guide gravity order, whole landing frame) the
	# air step was a trapezoid; these checks would only re-find that. They
	# arm themselves with the fix (its landing helper marks it).
	if not FileAccess.get_file_as_string("res://player/player.gd").contains("_finish_landing_frame"):
		print("  SKIP qa/test_physics_accuracy.gd: physics 78070f8 (Guide gravity order) not merged yet; see qa/reports/08-physics-accuracy.md for the baseline")
		return true
	return false


## A fresh world: the previous one is freed first, so terrain from an earlier
## case in the same test can't leak into this one.
func _new_world() -> Node2D:
	if world != null and is_instance_valid(world):
		world.queue_free()
		await physics_frames(1)
	world = W.new_world(self)
	return world


func _flat(feet := Vector2.ZERO) -> void:
	await _new_world()
	W.add_floor(world)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)


func _send(action: StringName, pressed: bool) -> void:
	Dev.send_action(action, pressed)
	Input.flush_buffered_events()


func _near(actual: float, expected: float, what: String, tol := EPS) -> void:
	var off := actual - expected
	if absf(off) > tol:
		print("  INFO DEVIATION %s: measured %.6f, Guide %.6f (off by %+.6f)" % [what, actual, expected, off])
	assert_near(actual, expected, tol, what)


# --- Running (closed forms) --------------------------------------------------------

func test_acceleration_reaches_top_speed_in_128_frames() -> void:
	if _skip():
		return
	await _flat()
	press(&"move_right")
	var frames := 0
	var exact := true
	for i in 200:
		await physics_frames(1)
		frames += 1
		var expected := minf(0.046875 * frames, 6.0)
		if absf(player.ground_speed - expected) > EPS:
			exact = false
		if player.ground_speed >= 6.0:
			break
	release(&"move_right")
	print("  INFO top speed reached after %d frames (Guide 6 / 0.046875 = 128)" % frames)
	assert_eq(frames, 128, "frames from rest to top speed")
	assert_true(exact, "gsp = k * 0.046875 on every frame of the run-up")
	_near(player.ground_speed, 6.0, "gsp clamps to exactly 6.0 (accelerate, then clamp)")


func test_top_speed_clamp_happens_after_acceleration() -> void:
	if _skip():
		return
	await _flat()
	player.ground_speed = 6.0 - 1.0 / 128.0
	press(&"move_right")
	await physics_frames(1)
	release(&"move_right")
	_near(player.ground_speed, 6.0, "one accel frame from just under top speed lands exactly on 6.0")
	# Above top speed with the direction held: never slowed to 6.
	player.ground_speed = 9.0
	press(&"move_right")
	await physics_frames(1)
	release(&"move_right")
	_near(player.ground_speed, 9.0, "holding forward above top speed does not reduce it")


func test_friction_stops_from_top_speed_in_128_frames_over_381_px() -> void:
	if _skip():
		return
	await _flat()
	player.ground_speed = 6.0
	var x0 := player.global_position.x
	var frames := 0
	for i in 200:
		await physics_frames(1)
		frames += 1
		if player.ground_speed == 0.0:
			break
	# Guide: friction (0.046875) is subtracted first, then the frame moves at
	# the new speed: distance = sum_{k=1..128} (6 - k * 0.046875) = 381 px.
	print("  INFO friction stop: %d frames, %.4f px (Guide 128 frames, 381 px)" % [frames, player.global_position.x - x0])
	assert_eq(frames, 128, "frames to stop by friction from 6")
	_near(player.global_position.x - x0, 381.0, "friction stop distance from 6")


func test_deceleration_from_6_to_turnaround_in_12_frames() -> void:
	if _skip():
		return
	await _flat()
	player.ground_speed = 6.0
	press(&"move_left")
	var ok := true
	for k in range(1, 12):
		await physics_frames(1)
		if absf(player.ground_speed - (6.0 - 0.5 * k)) > EPS:
			ok = false
	await physics_frames(1)
	release(&"move_left")
	assert_true(ok, "gsp = 6 - 0.5 k for k < 12 while skidding")
	_near(player.ground_speed, -0.5, "frame 12: speed reaches 0 and turns around to 0.5 the other way")


# --- Jump and gravity (order of operations) -------------------------------------------

func test_jump_frame_moves_nothing_then_rises_by_6_5() -> void:
	if _skip():
		return
	await _flat()
	press(&"jump")
	# press() is seen on the next tick: step until the jump frame.
	var feet0 := W.feet_y(player)
	for i in 4:
		if player.state == &"jump":
			break
		feet0 = W.feet_y(player)
		await physics_frames(1)
	assert_eq(player.state, &"jump", "jumped")
	var feet1 := W.feet_y(player)  # end of the jump frame
	await physics_frames(1)
	var feet2 := W.feet_y(player)  # end of the first air frame
	release(&"jump")
	print("  INFO jump: frame 0 feet moved %.6f, frame 1 feet moved %.6f (Guide: 0 then -6.5)" % [feet1 - feet0, feet2 - feet1])
	_near(feet1 - feet0, 0.0, "the jump frame itself does not move")
	_near(feet2 - feet1, -6.5, "first air frame: position += ysp (-6.5), THEN gravity")


func test_jump_apex_height_and_variable_jump() -> void:
	if _skip():
		return
	await _flat()
	var feet0 := W.feet_y(player)
	press(&"jump")
	var top := feet0
	for i in 60:
		await physics_frames(1)
		top = minf(top, W.feet_y(player))
		if player.grounded and i > 5:
			break
	release(&"jump")
	# Guide (position then gravity): height = sum_{k=0..29} (6.5 - 0.21875 k) = 99.84375.
	print("  INFO full jump apex: %.5f px (Guide 99.84375; continuous 6.5^2 / (2 * 0.21875) = 96.5714)" % (feet0 - top))
	_near(feet0 - top, 99.84375, "full jump apex height")
	# Variable jump: releasing while ysp < -4 sets ysp to -4.
	await _flat()
	press(&"jump")
	await physics_frames(4)
	release(&"jump")
	var y_before := W.feet_y(player)
	await physics_frames(1)
	_near(W.feet_y(player) - y_before, -4.0, "the release frame moves by the capped ysp (-4)")
	_near(player.velocity.y, -4.0 + 0.21875, "then gravity is added to the capped -4")


func test_gravity_is_applied_after_the_move() -> void:
	if _skip():
		return
	await _flat()
	player.launch(Vector2(0.0, -6.5))
	var y0 := player.global_position.y
	await physics_frames(1)
	var dy := player.global_position.y - y0
	print("  INFO airborne frame from ysp -6.5: moved %.6f px (Guide -6.5; trapezoid -6.390625)" % dy)
	_near(dy, -6.5, "position += ysp before ysp += gravity")
	_near(player.velocity.y, -6.5 + 0.21875, "gravity 0.21875 added after the move")


func test_air_drag_formula_and_conditions() -> void:
	if _skip():
		return
	# Guide: when ysp < 0 and ysp > -4 and |xsp| >= 0.125: xsp -= trunc(xsp / 0.125) / 256.
	for c in [[3.0, -2.0, 3.0 - 24.0 / 256.0], [-1.0, -1.0, -1.0 + 8.0 / 256.0], [0.1, -2.0, 0.1], [3.0, -4.0, 3.0], [3.0, 1.0, 3.0]]:
		await _flat()
		player.launch(Vector2(c[0], c[1]))
		await physics_frames(1)
		_near(player.velocity.x, c[2], "air drag with xsp %s, ysp %s" % [c[0], c[1]])


func test_air_drag_applies_before_gravity_and_after_air_accel() -> void:
	if _skip():
		return
	# Air accel first (0.09375), then drag on the new xsp.
	await _flat()
	player.launch(Vector2(2.0, -2.0))
	press(&"move_right")
	await physics_frames(1)
	release(&"move_right")
	var after_accel := 2.0 + 0.09375
	var expected := after_accel - float(int(after_accel / 0.125)) / 256.0
	_near(player.velocity.x, expected, "air accel, then drag on the accelerated xsp")


# --- Spin dash ----------------------------------------------------------------------------

## Guide model of spinrev for a frame: decay, then an optional press.
static func _rev_frame(rev: float, pressed: bool) -> float:
	rev -= floorf(rev / 0.125) / 256.0
	if pressed:
		rev = minf(rev + 2.0, 8.0)
	return rev


func test_spindash_release_speeds_and_decay() -> void:
	if _skip():
		return
	for presses in range(0, 8):
		await _flat()
		_send(&"move_down", true)
		await physics_frames(3)
		_send(&"jump", true)
		await physics_frames(2)
		_send(&"jump", false)
		await physics_frames(1)
		assert_eq(player.state, &"spindash", "%d presses: charging" % presses)
		# Frames so far since the start: one held, one released (decay only).
		var rev := _rev_frame(_rev_frame(0.0, false), false)
		var exact := true
		for k in presses:
			_send(&"jump", true)
			await physics_frames(2)
			rev = _rev_frame(_rev_frame(rev, true), false)
			if absf(player.spindash_charge - rev) > EPS:
				exact = false
			_send(&"jump", false)
			await physics_frames(1)
			rev = _rev_frame(rev, false)
			if absf(player.spindash_charge - rev) > EPS:
				exact = false
		var charge: float = player.spindash_charge
		_send(&"move_down", false)
		var released := NAN
		for i in 4:
			await physics_frames(1)
			if player.state == &"roll":
				released = absf(player.ground_speed)
				break
		var expected := 8.0 + floorf(charge) / 2.0
		print("  INFO spin dash, %d presses: charge %.4f -> release %.4f px/f (Guide 8 + floor(charge)/2 = %.4f; QA frame model rev %.4f, %s)" % [
				presses, charge, released, expected, rev, "matched each frame" if exact else "frame model off"])
		_near(released, expected, "%d presses: release speed from the charge" % presses)
	# Decay alone from rev 2 over 60 frames.
	await _flat()
	_send(&"move_down", true)
	await physics_frames(3)
	_send(&"jump", true)
	await physics_frames(2)
	_send(&"jump", false)
	await physics_frames(1)
	_send(&"jump", true)
	await physics_frames(2)
	_send(&"jump", false)
	var rev: float = player.spindash_charge  # just after a press (about 2)
	print("  INFO charge right after the first press: %.4f (decay-then-press gives 2.0000, press-then-decay 1.9375)" % rev)
	assert_true(rev >= 1.9, "charge is about 2 after one press (got %.4f)" % rev)
	var worst := 0.0
	for i in 60:
		await physics_frames(1)
		rev = _rev_frame(rev, false)
		worst = maxf(worst, absf(player.spindash_charge - rev))
	_send(&"move_down", false)
	print("  INFO spin dash decay over 60 frames: worst error vs the Guide %.6f (rev now %.4f)" % [worst, rev])
	assert_true(worst <= EPS, "decay follows rev -= floor(rev / 0.125) / 256 every frame")


# --- Slopes, slipping, rolling ----------------------------------------------------------

func _on_slope(angle: float, feet_x := 0.0) -> void:
	await _new_world()
	W.add_slope(world, angle)
	var feet := Vector2(feet_x, -tan(deg_to_rad(angle)) * feet_x)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)


func _climbing(angle: float, speed: float) -> void:
	# Flat run-up into a "/" slope of `angle` at x = 0; Sproto ends up on the
	# slope, grounded, with `speed` set exactly for the next frame.
	await _new_world()
	var h := 600.0 * tan(deg_to_rad(angle))
	W.add_polygon(world, PackedVector2Array([Vector2(-3000, 0), Vector2(0, 0), Vector2(600, -h),
			Vector2(3000, -h), Vector2(3000, 300), Vector2(-3000, 300)]))
	player = W.spawn_player(world, Vector2(-200, 0))
	await W.settle(self, player, Vector2(-200, 0))
	press(&"move_right")
	player.ground_speed = 6.0
	for i in 90:
		await physics_frames(1)
		if player.global_position.x > 40.0 and player.grounded:
			break
	release(&"move_right")
	assert_true(player.grounded and absf(player.ground_angle - angle) < 2.0 and player.control_lock == 0,
			"on the %.0f deg slope at speed (angle %.1f, grounded %s, lock %d)" % [angle, player.ground_angle, player.grounded, player.control_lock])
	player.ground_speed = speed


func test_slip_threshold_is_exactly_2_5_and_lock_is_30_frames() -> void:
	if _skip():
		return
	var slip_angle: float = Tuning.physics.slip_angle
	var angle := slip_angle + 5.0
	# 2.5 itself is "not slipping"; half a tolerance above it keeps the float
	# subtraction of the slope factor from landing a hair under 2.5.
	for c in [[2.5 + EPS / 2.0, false], [2.5 - EPS, true]]:
		await _climbing(angle, 0.0)
		# Guide order: slope factor, then friction (no input), then the slip
		# check reads the result: add both back so the check sees c[0].
		var slope_pull := 0.125 * sin(deg_to_rad(player.ground_angle))
		player.ground_speed = float(c[0]) + slope_pull + 0.046875
		await physics_frames(1)
		var locked := player.control_lock > 0
		assert_eq(locked, c[1], "gsp %.6f at the slip check on %.0f deg: slips %s" % [c[0], angle, c[1]])
		if locked:
			assert_eq(player.control_lock, 30, "control lock set to 30 frames")
			var frames := 0
			while player.control_lock > 0 and frames < 60:
				await physics_frames(1)
				frames += 1
			print("  INFO control lock lasted %d frames after the slip frame (Guide 30)" % frames)
			assert_eq(frames, 30, "lock lasts exactly 30 frames")
	# Just under the slip angle: no slip however slow.
	await _climbing(slip_angle - 3.0, 1.0)
	await physics_frames(1)
	assert_eq(player.control_lock, 0, "no slip at %.1f deg, under the slip angle %.0f (gsp %.3f)" % [player.ground_angle, slip_angle, player.ground_speed])
	# Past the fall angle (69) the slip detaches: put him on a 75 deg face.
	await _new_world()
	W.add_slope(world, 75.0)
	var feet := Vector2(60.0, -60.0 * tan(deg_to_rad(75.0)))
	player = W.spawn_player(world, feet)
	await physics_frames(2)
	player.respawn_at(feet - Vector2(0.0, 19.0))
	var stood := false
	var fell := false
	for i in 12:
		await physics_frames(1)
		if player.grounded:
			stood = true
		elif stood and player.control_lock > 0:
			fell = true
			break
	assert_true(stood and fell, "standing still on a 75 deg slope slips and falls off (stood %s, fell %s)" % [stood, fell])


func test_roll_start_1_03125_and_unroll_0_5() -> void:
	if _skip():
		return
	# Down held with no direction: friction first, then the roll check.
	for c in [[1.03125, true], [1.03125 - EPS, false]]:
		await _flat()
		player.ground_speed = float(c[0]) + 0.046875
		press(&"move_down")
		await physics_frames(1)
		release(&"move_down")
		assert_eq(player.state == &"roll", c[1], "gsp %.6f after friction: rolls %s" % [c[0], c[1]])
	# Unroll below 0.5 (checked after roll friction 0.0234375).
	for c in [[0.5, true], [0.5 - EPS, false]]:
		await _flat()
		player.ground_speed = 3.0
		press(&"move_down")
		await physics_frames(1)
		release(&"move_down")
		assert_eq(player.state, &"roll", "rolling")
		player.ground_speed = float(c[0]) + 0.0234375
		await physics_frames(1)
		assert_eq(player.state == &"roll", c[1], "rolling at %.6f after friction: still a ball %s" % [c[0], c[1]])


func test_landing_bands_flat_30_60() -> void:
	if _skip():
		return
	# Same drop (feet 100 px up, xsp 1) onto flat, 23, 30, 46 and 60 degree
	# "/" slopes. Guide: flat band (<= 23): gsp = xsp; 24-45: if |xsp| <= ysp,
	# gsp = ysp * 0.5 * -sign(sin a); > 45: gsp = ysp * -sign(sin a).
	for angle in [0.0, 23.0, 30.0, 46.0, 60.0]:
		await _new_world()
		if angle == 0.0:
			W.add_floor(world)
		else:
			W.add_slope(world, angle)
		player = W.spawn_player(world, Vector2(0, -100))
		await W.settle(self, player, Vector2(0, -100))
		player.launch(Vector2(1.0, 0.0))
		var ysp := 0.0
		for i in 120:
			# Guide air step: move, then ysp += gravity, THEN the floor sensors
			# land, so the band uses the ysp after this frame's gravity.
			ysp = player.velocity.y + 0.21875
			await physics_frames(1)
			if player.grounded:
				break
		var expected := 1.0
		if angle > 23.0 and 1.0 <= ysp:
			expected = -ysp * (0.5 if angle <= 45.0 else 1.0)
		print("  INFO landing on %s deg with ysp %.4f (after gravity): gsp %.4f (Guide %.4f)" % [angle, ysp, player.ground_speed, expected])
		_near(player.ground_speed, expected, "landing band at %s deg" % angle, 1.0 / 128.0)


# --- Damage, death, springs, caps -------------------------------------------------------

func test_hurt_arc_and_landing_distance() -> void:
	if _skip():
		return
	await _flat()
	GameState.tickets = 5
	var x0 := player.global_position.x
	player.hurt(player.global_position + Vector2(-10, 0))
	await physics_frames(1)
	_near(player.velocity.x, 2.0, "hurt xsp 2 away from the source")
	_near(player.velocity.y, -4.0 + 0.1875, "hurt ysp -4, then hurt gravity 0.1875")
	var frames := 1
	while not player.grounded and frames < 120:
		await physics_frames(1)
		frames += 1
	# Guide (position then gravity, no drag): lands on frame 44, 88 px away.
	var guide_frames := 0
	var y := 0.0
	var ysp := -4.0
	while true:
		y += ysp
		ysp += 0.1875
		guide_frames += 1
		if y >= 0.0:
			break
	print("  INFO hurt arc: landed after %d frames, %.3f px (Guide %d frames, %d px)" % [frames, player.global_position.x - x0, guide_frames, 2 * guide_frames])
	assert_eq(frames, guide_frames, "hurt arc frames to land")
	_near(player.global_position.x - x0, 2.0 * guide_frames, "hurt arc landing distance", 1.0 / 128.0)


func test_death_launch_minus_7() -> void:
	if _skip():
		return
	await _flat()
	player.kill()
	_near(player.velocity.y, -7.0, "death ysp -7")
	var y0 := player.global_position.y
	await physics_frames(1)
	var dy := player.global_position.y - y0
	print("  INFO death frame 1: moved %.6f (Guide -7)" % dy)
	_near(dy, -7.0, "death: position += ysp (-7) before gravity")


func test_springs_and_speed_cap() -> void:
	if _skip():
		return
	await _flat()
	player.launch(Vector2(0.0, -16.0))
	_near(player.velocity.y, -16.0, "red spring 16")
	await _flat()
	player.launch(Vector2(0.0, -10.0))
	_near(player.velocity.y, -10.0, "yellow spring 10")
	await _flat()
	player.launch(Vector2(20.0, -20.0))
	_near(player.velocity.x, 16.0, "speed cap 16 on xsp")
	_near(player.velocity.y, -16.0, "speed cap 16 on ysp")
	await _flat()
	player.ground_speed = 20.0
	await physics_frames(1)
	_near(absf(player.ground_speed), 16.0, "ground speed cap 16")
	await _flat()
	player.launch(Vector2(0.0, 10.0))
	for i in 40:
		await physics_frames(1)
		if player.grounded:
			break
	assert_true(player.velocity.y <= 16.0 + EPS, "fall speed never exceeds 16")


# --- Loop ----------------------------------------------------------------------------------

## Guide rules on a circle: per frame slope factor (none in the ceiling
## range), acceleration while below top speed with the direction held, move
## gsp along the ring. Returns the exit speed after one full turn.
static func _guide_lap(radius: float, entry: float, held: bool) -> float:
	var gsp := entry
	var s := 0.0
	var circumference := TAU * radius
	for i in 2000:
		var angle := fmod(rad_to_deg(s / radius), 360.0)  # Guide degrees, 0 at the bottom
		var mode_angle := angle
		if not (mode_angle >= 135.0 and mode_angle <= 225.0):
			gsp -= 0.125 * sin(deg_to_rad(angle))
		if held and gsp < 6.0:
			gsp = minf(gsp + 0.046875, 6.0)
		s += gsp
		if gsp <= 0.0:
			return NAN
		if s >= circumference:
			return gsp
	return NAN


func test_loop_exit_speed_at_8_with_right_held() -> void:
	if _skip():
		return
	await _new_world()
	W.add_floor(world)
	var loop := W.add_loop(world, Vector2(0, 0))
	var radius: float = float(loop.get(&"radius"))
	player = W.spawn_player(world, Vector2(-500, 0))
	await W.settle(self, player, Vector2(-500, 0))
	player.ground_speed = 8.0
	press(&"move_right")
	var exit_speed := NAN
	var trace: Array = []  # [angle before the frame, mode before, gsp after]
	for i in 400:
		var angle_before: float = player.ground_angle
		var mode_before: int = player.collision_mode
		await physics_frames(1)
		trace.append([angle_before, mode_before, player.ground_speed])
		if player.global_position.x > 300.0 and player.grounded:
			exit_speed = player.ground_speed
			break
	release(&"move_right")
	assert_true(not is_nan(exit_speed), "came out of the loop")
	# Replay the Guide's per-frame rules on the game's own angle sequence:
	# slope factor 0.125 sin(angle) (the ceiling range skipped, as the
	# matrix documents), then +0.046875 up to 6 with right held.
	var gsp := 8.0
	var worst := 0.0
	var worst_all_modes := 0.0
	var gsp_all := 8.0
	for row in trace:
		var a: float = row[0]
		var on_ceiling: bool = row[1] == 2
		if not on_ceiling:
			gsp -= 0.125 * sin(deg_to_rad(a))
		gsp_all -= 0.125 * sin(deg_to_rad(a))
		if gsp < 6.0:
			gsp = minf(gsp + 0.046875, 6.0)
		if gsp_all < 6.0:
			gsp_all = minf(gsp_all + 0.046875, 6.0)
		worst = maxf(worst, absf(gsp - float(row[2])))
		worst_all_modes = maxf(worst_all_modes, absf(gsp_all - float(row[2])))
	var ring := _guide_lap(radius, 8.0, true)
	print("  INFO loop r%.0f at 8 px/f with right held: exit %.4f. Guide rules replayed on the game's own angles: worst error %.6f px/f (%.4f if the slope factor also ran on the ceiling). An ideal ring of r %.0f would give %.4f." % [
			radius, exit_speed, worst, worst_all_modes, radius, ring])
	assert_true(worst <= EPS, "every loop frame follows the Guide rules on its measured angle (worst error %.6f)" % worst)


# --- Hitboxes and sensors ---------------------------------------------------------------

func test_hitbox_radii_and_sensor_layout() -> void:
	if _skip():
		return
	await _flat()
	var r := player.get_radii()
	assert_eq(r, Vector2(9.0, 19.0), "standing radii 9 x 19")
	player.sensors.recording = true
	await physics_frames(1)
	var casts: Array = player.sensors.casts.duplicate(true)
	player.sensors.recording = false
	var c := player.global_position
	var found := {}
	for cast in casts:
		found[str(cast.label)] = cast
	print("  INFO standing sensors: %s" % [found.keys()])
	for side in [["A", -9.0], ["B", 9.0]]:
		if found.has(side[0]):
			var cast: Dictionary = found[side[0]]
			_near((cast.from as Vector2).x - c.x, side[1], "floor sensor %s x offset" % side[0])
			print("  INFO floor sensor %s reaches %.1f px below the feet (Guide draws 16)" % [side[0], (cast.to as Vector2).y - (c.y + 19.0)])
	for side in [["E", -10.0], ["F", 10.0]]:
		if found.has(side[0]):
			var cast: Dictionary = found[side[0]]
			_near((cast.to as Vector2).x - c.x, side[1], "wall sensor %s reaches push radius 10" % side[0])
			_near((cast.from as Vector2).y - c.y, 8.0, "wall sensor %s sits 8 px lower on flat ground" % side[0])
	# Rolling radii.
	player.ground_speed = 3.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	assert_eq(player.get_radii(), Vector2(7.0, 14.0), "rolling radii 7 x 14")


# --- Animation -------------------------------------------------------------------------

func test_animation_frame_durations_follow_the_guide() -> void:
	if _skip():
		return
	await _flat()
	if player.get_node_or_null("Visual") == null or player.get_node("Visual").get(&"anim_frame") == null:
		print("  SKIP qa/test_physics_accuracy.gd: the placeholder visual has no anim_frame counter")
		return
	# Guide: a walk/run frame lasts max(0, 8 - |gsp|) ticks (the original sets
	# a countdown to that value, so some readings count it as value + 1).
	for gsp in [1.0, 3.0, 5.0, 7.0]:
		await _flat()
		var visual: Node = player.get_node("Visual")
		player.ground_speed = gsp
		press(&"move_right")
		player.ground_speed = gsp
		await physics_frames(2)
		var last: int = int(visual.get(&"anim_frame"))
		var gaps: Array[int] = []
		var since := 0
		for i in 48:
			player.ground_speed = gsp
			await physics_frames(1)
			since += 1
			var f: int = int(visual.get(&"anim_frame"))
			if f != last:
				gaps.append(since)
				since = 0
				last = f
		release(&"move_right")
		var guide := floorf(maxf(0.0, 8.0 - gsp))
		print("  INFO walk/run at gsp %.0f: frame shown for %s ticks (Guide max(0, 8 - |gsp|) = %.0f; countdown reading %.0f)" % [gsp, gaps.slice(1), guide, guide + 1.0])
		if gaps.size() > 2:
			assert_true(gaps[1] == int(guide) or gaps[1] == int(guide) + 1, "frame time at gsp %.0f within the two Guide readings" % gsp)
