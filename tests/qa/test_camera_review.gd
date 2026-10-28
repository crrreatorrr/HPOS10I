extends TestCase
## QA camera review probes (qa/checklists/03-camera.md, report
## qa/reports/03-camera.md). Skip until camera/game_camera.tscn exists. No
## class names, so the file parses on branches without the camera.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const CAMERA_SCENE := "res://camera/game_camera.tscn"

var w: Node2D
var p: Node2D
var cam: Camera2D


func _no_camera() -> bool:
	if ResourceLoader.exists(CAMERA_SCENE):
		return false
	print("  SKIP qa/test_camera_review.gd: no camera/game_camera.tscn yet")
	return true


func after_each() -> void:
	tree.paused = false
	for a in [&"move_right", &"move_left", &"move_down", &"move_up", &"jump"]:
		Dev.send_action(a, false)
	GameState.tickets = 0


func _setup(feet := Vector2.ZERO, bounds := Rect2(), floor_from := -20000.0, floor_to := 20000.0) -> void:
	w = L.world(self)
	L.floor_at(w, floor_from, floor_to)
	p = await L.spawn(self, w, feet)
	cam = load(CAMERA_SCENE).instantiate()
	w.add_child(cam)
	if bounds.has_area():
		cam.set_level_bounds(bounds)
	await physics_frames(2)


func _cx() -> float:
	return cam.global_position.x


func _screen_x() -> float:
	return p.global_position.x - (cam.global_position.x - 212.0)


func test_b1_deadzone() -> void:
	if _no_camera():
		return
	await _setup()
	var x0 := _cx()
	p.ground_speed = 0.5
	var moved_at := -1
	for i in 60:
		await physics_frames(1)
		if moved_at < 0 and absf(_cx() - x0) > 0.01:
			moved_at = i
	print("  INFO deadzone: camera first moved when Sproto was %.1f px from the start (frame %d)" % [p.global_position.x - x0, moved_at])
	assert_true(moved_at != 0, "no camera move on the first frames of a slow walk")


func test_b2_look_ahead_by_speed() -> void:
	if _no_camera():
		return
	for speed in [6.0, 8.0, 12.0]:
		await _setup()
		press(&"move_right")
		p.ground_speed = speed
		await physics_frames(240)
		release(&"move_right")
		var ahead: float = _cx() - p.global_position.x
		var expected: float = 64.0 * clampf((speed - 5.0) / 7.0, 0.0, 1.0)
		print("  INFO speed %s: camera %.1f px ahead (look_ahead %.1f, expected %.1f, deadzone 8)" % [speed, ahead, cam.look_ahead, expected])
		assert_near(cam.look_ahead, expected, 0.5, "look-ahead at %s" % speed)
		assert_true(absf(ahead - expected) <= 8.5, "camera centre within the deadzone of the look-ahead target at %s" % speed)


func test_b3_turnaround_and_b5_on_screen() -> void:
	if _no_camera():
		return
	await _setup()
	p.ground_speed = 16.0
	press(&"move_right")
	var worst_step := 0.0
	var worst_edge := INF
	var last := _cx()
	for i in 120:
		await physics_frames(1)
		worst_step = maxf(worst_step, absf(_cx() - last))
		last = _cx()
		var sx := _screen_x()
		worst_edge = minf(worst_edge, minf(sx - 9.0, 424.0 - 9.0 - sx))
	release(&"move_right")
	press(&"move_left")
	for i in 240:
		await physics_frames(1)
		worst_step = maxf(worst_step, absf(_cx() - last))
		last = _cx()
		var sx := _screen_x()
		worst_edge = minf(worst_edge, minf(sx - 9.0, 424.0 - 9.0 - sx))
	release(&"move_left")
	print("  INFO 16 px/f run + turnaround: largest camera step %.2f px/frame, closest hitbox to a screen edge %.1f px" % [worst_step, worst_edge])
	assert_true(worst_step <= 17.01, "camera never moves more than 16 px/frame plus 1 px of rounding (%.2f)" % worst_step)
	assert_true(worst_edge > 0.0, "Sproto stays fully on screen (%.1f)" % worst_edge)


func test_b4_wall_flip_no_oscillation() -> void:
	if _no_camera():
		return
	await _setup()
	L.rect(w, Rect2(60, -200, 40, 200))
	press(&"move_right")
	await physics_frames(60)
	var xs := []
	for i in 60:
		if i % 2 == 0:
			release(&"move_left")
			press(&"move_right")
		else:
			release(&"move_right")
			press(&"move_left")
		await physics_frames(1)
		xs.append(_cx())
	release(&"move_right")
	release(&"move_left")
	var spread: float = xs.max() - xs.min()
	print("  INFO flipping input against a wall: camera x spread %.2f px" % spread)
	assert_true(spread <= 1.0, "camera does not oscillate (%.2f)" % spread)


func test_c_vertical() -> void:
	if _no_camera():
		return
	# Jump on flat ground: the camera moves less than the jump height.
	await _setup()
	var y0: float = cam.global_position.y
	var top := y0
	press(&"jump")
	for i in 70:
		await physics_frames(1)
		top = minf(top, cam.global_position.y)
	release(&"jump")
	print("  INFO full jump: camera rose %.1f px (jump ~96)" % (y0 - top))
	assert_true(y0 - top < 96.0, "lag on jumps")
	# Spring at -16: stays on screen.
	await _setup()
	p.launch(Vector2(0, -16))
	var worst := INF
	for i in 80:
		await physics_frames(1)
		var sy: float = p.global_position.y - (cam.global_position.y - 120.0)
		worst = minf(worst, minf(sy - 19.0, 240.0 - 19.0 - sy))
	print("  INFO spring -16: closest hitbox to top/bottom edge %.1f px" % worst)
	assert_true(worst > 0.0, "on screen during a -16 launch")
	# Long fall at 16 px/f.
	await _setup(Vector2.ZERO, Rect2(), -20000, 20000)
	L.floor_at(w, -200, 200, 3000)
	p.respawn_at(Vector2(0, -1500))
	worst = INF
	for i in 200:
		await physics_frames(1)
		var sy: float = p.global_position.y - (cam.global_position.y - 120.0)
		worst = minf(worst, minf(sy - 19.0, 240.0 - 19.0 - sy))
	print("  INFO long fall: closest edge %.1f px" % worst)


func test_c1_ground_caps() -> void:
	if _no_camera():
		return
	for speed in [4.0, 9.0]:
		w = L.world(self)
		L.slope(w, -45.0, 3000.0)
		p = await L.spawn(self, w, Vector2(-1000, -1000))
		cam = load(CAMERA_SCENE).instantiate()
		w.add_child(cam)
		await physics_frames(3)
		p.ground_speed = speed
		var max_dy := 0.0
		var last: float = cam.global_position.y
		for i in 90:
			await physics_frames(1)
			max_dy = maxf(max_dy, absf(cam.global_position.y - last))
			last = cam.global_position.y
		print("  INFO down a 45 deg slope at %s px/f: camera dy max %.2f px/frame" % [speed, max_dy])
		assert_true(max_dy <= (16.01 if speed >= 8.0 else 6.01), "ground follow cap at %s" % speed)


func test_d1_bounds_and_d2_small_level() -> void:
	if _no_camera():
		return
	var bounds := Rect2(-300, -400, 1200, 500)
	await _setup(Vector2.ZERO, bounds, -300, 900)
	L.rect(w, Rect2(-310, -400, 10, 500))
	var bad := 0
	for spot in [Vector2(-280, 0), Vector2(880, 0), Vector2(300, -380)]:
		p.respawn_at(spot - Vector2(0, 19))
		for i in 60:
			await physics_frames(1)
			var v: Rect2 = cam.view_rect()
			if v.position.x < bounds.position.x - 0.01 or v.end.x > bounds.end.x + 0.01 \
					or v.position.y < bounds.position.y - 0.01 or v.end.y > bounds.end.y + 0.01:
				bad += 1
	assert_eq(bad, 0, "frames showing outside Bounds")
	var small := Rect2(0, -200, 300, 200)
	await _setup(Vector2(100, 0), small, -100, 400)
	await physics_frames(10)
	assert_near(cam.global_position.x, 150.0, 0.51, "small level centred x")
	assert_near(cam.global_position.y, -100.0, 0.51, "small level centred y")


func test_d3_d4_d5_lock_unlock() -> void:
	if _no_camera():
		return
	await _setup()
	var arena := Rect2(400, -260, 424, 240)
	cam.lock_to(arena, 0.5)
	var settled := -1
	var max_step := 0.0
	var last: Vector2 = cam.global_position
	for i in 60:
		await physics_frames(1)
		max_step = maxf(max_step, (cam.global_position - last).length())
		last = cam.global_position
		if settled < 0 and cam.view_rect().is_equal_approx(arena):
			settled = i + 1
	print("  INFO lock_to 0.5 s: settled after %d frames, largest step %.1f px" % [settled, max_step])
	assert_true(settled >= 29 and settled <= 32, "lock settles in about 30 frames (%d)" % settled)
	p.ground_speed = 6.0
	press(&"move_right")
	var moved := 0.0
	var hold: Vector2 = cam.global_position
	for i in 60:
		await physics_frames(1)
		moved = maxf(moved, (cam.global_position - hold).length())
	release(&"move_right")
	assert_true(moved < 0.01, "locked camera stays fixed (%.2f)" % moved)
	cam.unlock(0.5)
	max_step = 0.0
	last = cam.global_position
	for i in 45:
		await physics_frames(1)
		max_step = maxf(max_step, (cam.global_position - last).length())
		last = cam.global_position
	print("  INFO unlock 0.5 s: largest step %.1f px" % max_step)
	assert_true(max_step <= 24.0, "no snap on unlock (%.1f)" % max_step)
	# Lock again mid-transition, then unlock mid-lock.
	cam.lock_to(arena, 0.5)
	await physics_frames(10)
	cam.lock_to(Rect2(arena.position + Vector2(200, 0), arena.size), 0.5)
	await physics_frames(10)
	cam.unlock(0.5)
	max_step = 0.0
	last = cam.global_position
	for i in 60:
		await physics_frames(1)
		max_step = maxf(max_step, (cam.global_position - last).length())
		last = cam.global_position
	assert_true(max_step <= 24.0, "nested lock/unlock: no snap (%.1f)" % max_step)


func test_d6_i_autoscroll() -> void:
	if _no_camera():
		return
	await _setup()
	L.rect(w, Rect2(900, -300, 60, 300))  # wall ahead to crush against
	cam.start_autoscroll(Vector2(120, 0))  # 2 px/frame
	var steps := []
	var worst_rect := 0.0
	var worst_outside := 0.0
	var last := _cx()
	var killed_at := -1
	for i in 600:
		await physics_frames(1)
		steps.append(_cx() - last)
		last = _cx()
		var v: Rect2 = cam.view_rect()
		var cr: Rect2 = p.clamp_rect
		worst_rect = maxf(worst_rect, (cr.position - v.position).length() + (cr.size - v.size).length())
		if p.state != &"dead":
			worst_outside = maxf(worst_outside, v.position.x - (p.global_position.x - 9.0))
		if killed_at < 0 and p.state == &"dead":
			killed_at = i
	var avg: float = (steps.slice(5).reduce(func(a, b): return a + b, 0.0)) / float(steps.size() - 5)
	print("  INFO autoscroll 2 px/f: avg step %.3f, clamp_rect vs view %.2f px, Sproto's hitbox up to %.1f px left of the view, killed at frame %d" % [avg, worst_rect, worst_outside, killed_at])
	assert_near(avg, 2.0, 0.01, "autoscroll speed")
	assert_true(worst_rect <= 1.0, "clamp_rect = visible rect")
	assert_true(killed_at > 0, "crushed against the wall by the left edge")
	assert_true(worst_outside <= 2.01, "alive Sproto at most one frame of scroll outside the view (%.1f)" % worst_outside)
	cam.stop_autoscroll()
	assert_eq(p.clamp_rect, Rect2(), "stop clears clamp_rect at once")


func test_d7_shake() -> void:
	if _no_camera():
		return
	await _setup()
	await physics_frames(5)
	var base: Vector2 = cam.global_position
	cam.shake(6.0, 0.5)
	var worst := 0.0
	for i in 40:
		await physics_frames(1)
		worst = maxf(worst, cam.offset.length())
	print("  INFO shake 6 px 0.5 s: largest offset %.2f, offset after %s, position drift %s" % [worst, cam.offset, cam.global_position - base])
	assert_true(worst <= 6.0 * sqrt(2.0) + 0.5, "within strength")
	assert_eq(cam.offset, Vector2.ZERO, "decays to zero")
	assert_eq(cam.global_position, base, "returns to its exact target")


func test_d8_pause() -> void:
	if _no_camera():
		return
	await _setup()
	p.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(30)
	cam.shake(5.0, 1.0)
	tree.paused = true
	var pos: Vector2 = cam.global_position
	var off: Vector2 = cam.offset
	await physics_frames(30)
	assert_eq(cam.global_position, pos, "no drift while paused")
	assert_eq(cam.offset, off, "shake paused")
	tree.paused = false
	release(&"move_right")


func test_e_death_and_respawn() -> void:
	if _no_camera():
		return
	for dist in [100.0, 1000.0]:
		await _setup()
		p.ground_speed = 4.0
		await physics_frames(30)
		p.kill()
		var pos: Vector2 = cam.global_position
		var drift := 0.0
		for i in 120:
			await physics_frames(1)
			drift = maxf(drift, (cam.global_position - pos).length())
		var target: Vector2 = p.global_position
		var spot: Vector2 = Vector2(pos.x + dist, -19)
		print("  INFO dead body is %.0f px from the respawn spot" % target.distance_to(spot))
		p.respawn_at(spot)
		await physics_frames(1)
		var off: Vector2 = cam.global_position - p.global_position
		print("  INFO respawn %s px away: camera drift while dead %.1f, offset from Sproto on the first frame %s" % [dist, drift, off])
		assert_true(drift < 0.01, "camera holds still while dead")
		assert_true(absf(off.x) <= 8.5 and absf(off.y - 16.0) <= 1.0, "on Sproto right after respawning %s px away (%s)" % [dist, off])


func test_g_spindash_hold() -> void:
	if _no_camera():
		return
	for presses in [0, 6]:
		await _setup()
		Dev.send_action(&"move_down", true)
		await physics_frames(3)
		for k in presses + 1:
			Dev.send_action(&"jump", true)
			await physics_frames(1)
			Dev.send_action(&"jump", false)
			await physics_frames(1)
		Dev.send_action(&"move_down", false)
		await physics_frames(1)
		var x0 := _cx()
		var held := 0
		var worst_edge := INF
		var max_step := 0.0
		var last := x0
		var still := true
		for i in 120:
			await physics_frames(1)
			if still and absf(_cx() - x0) < 0.01:
				held += 1
			else:
				still = false
			max_step = maxf(max_step, absf(_cx() - last))
			last = _cx()
			var sx := _screen_x()
			worst_edge = minf(worst_edge, minf(sx - 7.0, 424.0 - 7.0 - sx))
		print("  INFO spin dash (%d extra presses, %.1f px/f): camera held %d frames, closest edge %.1f, largest step %.1f" % [presses, absf(p.ground_speed), held, worst_edge, max_step])
		assert_true(worst_edge > 0.0, "on screen during the hold")
		assert_true(max_step <= 17.01, "catch-up capped (16 + 1 px rounding)")


func test_h_look_up_down() -> void:
	if _no_camera():
		return
	for dir in [-1, 1]:
		await _setup()
		await physics_frames(10)
		var y0: float = cam.global_position.y
		var act := &"move_up" if dir < 0 else &"move_down"
		press(act)
		var started := -1
		var max_rate := 0.0
		var last: float = y0
		for i in 240:
			await physics_frames(1)
			max_rate = maxf(max_rate, absf(cam.global_position.y - last))
			last = cam.global_position.y
			if started < 0 and absf(cam.global_position.y - y0) > 0.01:
				started = i + 1
		var dist: float = cam.global_position.y - y0
		print("  INFO look %s: started after %d frames, moved %.1f px, max %.1f px/frame" % ["up" if dir < 0 else "down", started, dist, max_rate])
		assert_true(started >= 119 and started <= 123, "starts after about 120 frames (%d)" % started)
		assert_near(absf(dist), 104.0 if dir < 0 else 88.0, 1.0, "distance")
		assert_true(max_rate <= 2.01, "pan speed")
		release(act)
		await physics_frames(70)
		assert_near(cam.global_position.y, y0, 1.0, "returns after release")


func test_h3_spindash_during_look_wait_and_h2_cancel() -> void:
	if _no_camera():
		return
	await _setup()
	Dev.send_action(&"move_down", true)
	await physics_frames(60)
	Dev.send_action(&"jump", true)
	await physics_frames(1)
	Dev.send_action(&"jump", false)
	await physics_frames(2)
	assert_eq(p.state, &"spindash", "spin dash from the look-down wait")
	Dev.send_action(&"move_down", false)
	await physics_frames(10)
	# Look up then start running: cancels at once (returns at 2 px/frame).
	await _setup()
	press(&"move_up")
	await physics_frames(170)
	var shifted: float = cam.look_shift
	release(&"move_up")
	press(&"move_right")
	await physics_frames(8)
	release(&"move_right")
	print("  INFO look shift %.1f, 8 frames after running %.1f" % [shifted, cam.look_shift])
	assert_true(cam.look_shift > shifted, "returning after moving")
