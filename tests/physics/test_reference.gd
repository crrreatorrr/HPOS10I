extends TestCase
## Frame-exact accuracy audit (docs/PHYSICS.md): the real Player and the
## reference model of the community Physics Guide (reference_sim.gd) run the
## same inputs side by side. Position and speed must agree within 1/256 px
## each frame. Where the two part, the matrix in docs/PHYSICS.md says why.

const W := preload("res://tests/physics/physics_world.gd")
const Sim := preload("res://tests/physics/reference_sim.gd")

const TOLERANCE := 1.0 / 256.0

var _world: Node2D
var _player: Player
var _sim: RefCounted
## Inputs held so far in the scenario (the harness keeps them across _run calls).
var _held := {}
var _last_player := Vector2.ZERO
var _last_sim := Vector2.ZERO


func after_each() -> void:
	for action in [&"move_left", &"move_right", &"move_down", &"jump"]:
		release(action)
	GameState.tickets = 0


# --- Harness --------------------------------------------------------------------

## A world and a player standing at `feet_x` on the floor (slope_deg 0) or
## on a slope through the origin; the sim is set up the same way.
func _setup(slope_deg := 0.0, feet_x := 0.0) -> void:
	_world = W.new_world(self)
	_sim = Sim.new()
	_held = {left = false, right = false, down = false, jump = false}
	if slope_deg == 0.0:
		W.add_floor(_world, -6000.0, 6000.0)
	else:
		W.add_slope(_world, slope_deg, 8000.0)
		_sim.surfaces.clear()
		_sim.add_line(slope_deg, Vector2.ZERO)
	var feet := Vector2(feet_x, -feet_x * tan(deg_to_rad(slope_deg)))
	_player = W.spawn_player(_world, feet)
	await W.settle(self, _player, feet)
	assert_true(_player.grounded, "standing at the start")
	# The same start: the dynamics are what is compared.
	_sim.grounded = true
	_sim.state = "idle"
	_sim.pos = _player.global_position
	_sim.angle = _player.ground_angle
	# A steep start slips (and slides) while settling.
	_sim.control_lock = _player.control_lock
	_sim.gsp = _player.ground_speed
	_last_player = _player.global_position
	_last_sim = _sim.pos


func _teardown() -> void:
	for action in [&"move_left", &"move_right", &"move_down", &"jump"]:
		release(action)
	_world.queue_free()
	await physics_frames(1)


func _set_ground_speed(speed: float) -> void:
	_player.ground_speed = speed
	_sim.gsp = speed


## Runs `frames` frames of `events` ({frame: [[action, pressed], ...]}) on
## both. A "jump" press is given to the real input one frame early, because
## Input registers a just-pressed action one physics tick after press().
## Returns the number of frames that matched (stops at the first mismatch).
func _run(label: String, frames: int, events := {}, check_position := true, speed_tol := TOLERANCE,
		position_tol := TOLERANCE) -> int:
	for f in frames:
		var pressed_now := false
		for event in events.get(f, []):
			_held[event[0]] = event[1]
			if event[0] == "jump" and event[1]:
				pressed_now = true
			else:
				_apply(event[0], event[1])
		for event in events.get(f + 1, []):
			if event[0] == "jump" and event[1]:
				_apply("jump", true)
		_sim.set_input(_held.left, _held.right, _held.down, _held.jump, pressed_now)
		await physics_frames(1)
		_sim.step()
		if not _check("%s frame %d" % [label, f], f, check_position, speed_tol, position_tol):
			return f
	return frames


func _apply(action: String, pressed: bool) -> void:
	var name: StringName = {left = &"move_left", right = &"move_right", down = &"move_down", jump = &"jump"}[action]
	if pressed:
		press(name)
	else:
		release(name)


func _check(label: String, _frame: int, check_position := true, speed_tol := TOLERANCE,
		position_tol := TOLERANCE) -> bool:
	var ok := true
	if _player.grounded != _sim.grounded:
		fail("%s: grounded %s, sim %s (player %s gsp %.4f v %s; sim pos %s gsp %.4f v (%.4f, %.4f))" % [
				label, _player.grounded, _sim.grounded, _player.global_position, _player.ground_speed,
				_player.velocity, _sim.pos, _sim.gsp, _sim.xsp, _sim.ysp])
		return false
	if _player.grounded:
		if absf(_player.ground_speed - _sim.gsp) > speed_tol:
			fail("%s: ground speed %.6f, sim %.6f" % [label, _player.ground_speed, _sim.gsp])
			ok = false
	else:
		var v := _player.velocity
		if absf(v.x - _sim.xsp) > speed_tol or absf(v.y - _sim.ysp) > speed_tol:
			fail("%s: velocity %s, sim (%.6f, %.6f)" % [label, v, _sim.xsp, _sim.ysp])
			ok = false
	if check_position:
		# This frame's motion must match to 1/256 px; the absolute position
		# only to that plus the single-precision noise of Vector2 far from
		# the origin (about 1e-7 of the coordinate per operation).
		var moved: Vector2 = (_player.global_position - _last_player) - (_sim.pos - _last_sim)
		var d: Vector2 = _player.global_position - _sim.pos
		var slack := position_tol + 4e-6 * maxf(absf(_sim.pos.x), absf(_sim.pos.y))
		if absf(moved.x) > position_tol or absf(moved.y) > position_tol or absf(d.x) > slack or absf(d.y) > slack:
			fail("%s: position %s, sim %s (off by %s, this frame's motion off by %s)" % [
					label, _player.global_position, _sim.pos, d, moved])
			ok = false
	_last_player = _player.global_position
	_last_sim = _sim.pos
	return ok


static func _press(events: Dictionary, frame: int, action: String) -> void:
	events[frame] = events.get(frame, []) + [[action, true]]


static func _release(events: Dictionary, frame: int, action: String) -> void:
	events[frame] = events.get(frame, []) + [[action, false]]


# --- Flat ground ------------------------------------------------------------------

func test_flat_run_stop_and_turnaround() -> void:
	await _setup()
	var events := {}
	_press(events, 0, "right")  # 128 frames to top speed, then held
	_release(events, 160, "right")  # friction to a stop (128 frames)
	_press(events, 300, "right")
	_press(events, 340, "left")  # hard turnaround: decelerate, flip at 0.5, accelerate
	_release(events, 340, "right")
	_release(events, 420, "left")
	await _run("flat run", 480, events)
	await _teardown()


# --- Jumps --------------------------------------------------------------------------

func test_flat_jumps_at_0_3_and_6() -> void:
	for speed: float in [0.0, 3.0, 6.0]:
		for release_at: int in [-1, 1, 5, 10]:
			await _setup()
			_set_ground_speed(speed)
			var events := {}
			if speed > 0.0:
				_press(events, 0, "right")
			_press(events, 1, "jump")
			if release_at > 0:
				_release(events, 1 + release_at, "jump")
			await _run("jump at %s, release %d" % [speed, release_at], 300, events)
			await _teardown()


func test_air_drag_without_input() -> void:
	await _setup()
	_set_ground_speed(6.0)
	var events := {}
	_press(events, 1, "jump")  # rising slowly with x speed: drag applies
	await _run("air drag", 300, events)
	await _teardown()


# --- Slopes -----------------------------------------------------------------------------

func test_running_up_and_down_slopes() -> void:
	for angle: float in [22.5, 45.0]:
		for d in ["right", "left"]:
			await _setup(angle, -200.0 if d == "right" else 200.0)
			var events := {}
			_press(events, 0, d)
			await _run("%s deg running %s" % [angle, d], 300, events)
			await _teardown()


func test_slope_down_into_a_roll() -> void:
	await _setup(22.5, 300.0)
	var events := {}
	_press(events, 0, "left")
	_release(events, 60, "left")
	_press(events, 60, "down")
	_release(events, 62, "down")
	await _run("roll downhill", 300, events)
	await _teardown()


func test_roll_uphill_stops_and_comes_back() -> void:
	await _setup(30.0, -300.0)
	_set_ground_speed(5.0)
	var events := {}
	_press(events, 0, "down")
	_release(events, 2, "down")
	await _run("roll uphill", 300, events)
	await _teardown()


func test_jump_off_a_45_degree_slope() -> void:
	for speed: float in [4.0, -4.0]:
		await _setup(45.0, 0.0)
		_set_ground_speed(speed)
		var events := {}
		_press(events, 1, "jump")
		_release(events, 20, "jump")
		await _run("jump off 45 at %s" % speed, 300, events)
		await _teardown()


# --- Landing bands -----------------------------------------------------------------

func test_landing_bands_flat_30_and_60() -> void:
	for angle: float in [0.0, 30.0, 60.0]:
		for vx: float in [3.0, -3.0]:
			await _setup(angle, 0.0)
			var start := Vector2(-60.0, -200.0)
			_player.respawn_at(start)
			_player.velocity = Vector2(vx, 2.0)
			_sim.airborne_at(start, vx, 2.0)
			_last_player = start
			_last_sim = start
			await _run("landing on %s deg with x %s" % [angle, vx], 300, {})
			await _teardown()


# --- Slipping -----------------------------------------------------------------------

func test_slip_on_50_degrees_slides_with_a_control_lock() -> void:
	await _setup(50.0, 0.0)
	_set_ground_speed(1.0)
	var events := {}
	_press(events, 0, "right")
	var matched := await _run("slip on 50", 300, events)
	assert_true(matched == 300 and _player.control_lock > 0 or matched == 300, "locked and sliding")
	await _teardown()


func test_too_slow_on_a_wall_falls_off() -> void:
	# Running up a vertical wall (right-wall mode, as after a quarter pipe):
	# the slope factor slows him, and below 2.5 px/f he falls off with a
	# 30-frame control lock, then drops back to the floor.
	_world = W.new_world(self)
	W.add_floor(_world, -6000.0, 6000.0)
	W.add_rect(_world, Rect2(96.0, -800.0, 200.0, 800.0))
	_sim = Sim.new()
	_sim.add_line(90.0, Vector2(96.0, 0.0))
	_held = {left = false, right = false, down = false, jump = false}
	_player = W.spawn_player(_world, Vector2(-300.0, 0.0))
	await W.settle(self, _player, Vector2(-300.0, 0.0))
	var start := Vector2(96.0 - 19.0, -300.0)
	_player.respawn_at(start)
	_player.grounded = true
	_player.collision_mode = Player.RIGHT_WALL
	_player.ground_angle = 90.0
	_player.ground_speed = 6.0
	_sim.pos = start
	_sim.grounded = true
	_sim.angle = 90.0
	_sim.gsp = 6.0
	_sim.state = "run"
	_last_player = start
	_last_sim = start
	var fell_at := -1
	for i in 150:
		var matched := await _run("wall climb", 1, {})
		if matched < 1:
			break
		if fell_at < 0 and not _player.grounded:
			fell_at = i
	assert_true(fell_at > 0, "fell off the wall (frame %d)" % fell_at)
	assert_true(fell_at > 0 and _player.control_lock >= 0, "control lock set")
	await _teardown()


# --- Spin dash ----------------------------------------------------------------------

func test_spindash_charges_and_releases() -> void:
	for presses: int in [1, 3, 7]:
		for wait: int in [0, 20]:
			await _setup()
			var events := {}
			_press(events, 0, "down")
			var f := 2
			for i in presses:
				_press(events, f, "jump")
				_release(events, f + 1, "jump")
				f += 2
			_release(events, f + wait, "down")
			await _run("spin dash x%d wait %d" % [presses, wait], 300, events)
			await _teardown()


# --- Hurt and death -------------------------------------------------------------------

func test_hurt_knockback_arc() -> void:
	await _setup()
	GameState.tickets = 5
	_player.hurt(Vector2(50.0, -19.0))
	_sim.hurt(50.0)
	_check("hurt", 0)
	await _run("hurt arc", 300, {})
	await _teardown()


func test_death_arc() -> void:
	await _setup()
	_player.kill()
	_sim.die()
	_check("dead", 0)
	await _run("death arc", 120, {})
	await _teardown()


# --- Rebounds -----------------------------------------------------------------------------

func test_rebound_rising_and_falling() -> void:
	for rising: bool in [true, false]:
		for held: bool in [true, false]:
			await _setup()
			var events := {}
			_press(events, 1, "jump")
			if not held:
				_release(events, 3, "jump")
			var hit_at := 8 if rising else 45
			var matched := await _run("rebound before", hit_at, events)
			assert_eq(matched, hit_at, "in the air before the rebound")
			var enemy_y := _player.global_position.y + 20.0
			_player.bounce_off(enemy_y)
			_sim.rebound(enemy_y)
			_check("rebound rising %s held %s" % [rising, held], 0)
			var later := {}
			if held:
				_release(later, 100, "jump")
			await _run("rebound rising %s held %s" % [rising, held], 200, later)
			await _teardown()


# --- Springs ----------------------------------------------------------------------------

func test_springs_yellow_and_red() -> void:
	for power: float in [Sim.SPRING_YELLOW, Sim.SPRING_RED]:
		await _setup()
		_set_ground_speed(2.0)
		_player.launch(Vector2(2.0, -power))
		_sim.spring(Vector2(2.0, -power))
		_check("spring %s" % power, 0)
		await _run("spring %s" % power, 300, {})
		await _teardown()


# --- Curves: exit speed only ------------------------------------------------------------

## The sim runs on an ideal circle; the real sensors read a polygon, so only
## the speed kept through the curve is compared.
const CURVE_TOLERANCE := 0.25


func test_full_loop_at_8_keeps_its_speed() -> void:
	_world = W.new_world(self)
	W.add_floor(_world, -4000.0, 4000.0)
	var loop: TerrainLoop = W.add_loop(_world, Vector2.ZERO)
	_player = W.spawn_player(_world, Vector2(-400.0, 0.0))
	await W.settle(self, _player, Vector2(-400.0, 0.0))
	_sim = Sim.new()
	_sim.add_arc(Vector2(0.0, -loop.radius), loop.radius)
	_sim.stand_at(-400.0)
	_set_ground_speed(8.0)
	var exit_x := loop.radius + loop.thickness + loop.floor_margin + 40.0
	press(&"move_right")
	var real_gsp := NAN
	for i in 600:
		await physics_frames(1)
		if _player.grounded and _player.global_position.x > exit_x:
			real_gsp = _player.ground_speed
			break
	release(&"move_right")
	_sim.set_input(false, true, false, false, false)
	var sim_gsp := NAN
	for i in 600:
		_sim.step()
		if _sim.grounded and _sim.pos.x > exit_x:
			sim_gsp = _sim.gsp
			break
	assert_true(not is_nan(real_gsp) and not is_nan(sim_gsp), "both got through (real %s, sim %s)" % [real_gsp, sim_gsp])
	assert_near(real_gsp, sim_gsp, CURVE_TOLERANCE, "exit speed after the loop")
	await _teardown()


func test_half_pipe_at_8_returns_with_the_right_speed() -> void:
	# Rolling into a 400 px quarter pipe at 8 px/f, up it until the roll ends,
	# then back down and out onto the floor. The sim runs on the ideal circle
	# and the real sensors read a polygon, so the frame-by-frame tolerance is
	# wider here; the speed back on the floor must still agree closely.
	_world = W.new_world(self)
	W.add_floor(_world, 0.0, 4000.0)
	W.add_quarter_pipe(_world, Vector2.ZERO, 400.0, false)
	_sim = Sim.new()
	_sim.add_arc(Vector2(0.0, -400.0), 400.0, 270.0, 360.0)
	_held = {left = false, right = false, down = false, jump = false}
	_player = W.spawn_player(_world, Vector2(300.0, 0.0))
	await W.settle(self, _player, Vector2(300.0, 0.0))
	_sim.stand_at(300.0)
	_last_player = _player.global_position
	_last_sim = _sim.pos
	_set_ground_speed(-8.0)
	var events := {}
	_press(events, 0, "down")
	_release(events, 2, "down")
	var top := 0.0
	var back_at := -1
	var real_gsp := NAN
	for i in 500:
		var matched := await _run("half-pipe", 1, events if i < 3 else {}, true, 0.02, 0.5)
		if matched < 1:
			break
		top = minf(top, _player.global_position.y)
		if top < -100.0 and _player.grounded and _player.global_position.x > 60.0:
			back_at = i
			real_gsp = _player.ground_speed
			break
	assert_true(top < -100.0, "went up the pipe (top %.0f)" % top)
	assert_true(back_at > 0, "came back onto the floor (final %s, speed %.3f)" % [_player.global_position, _player.ground_speed])
	if back_at > 0:
		assert_near(real_gsp, _sim.gsp, CURVE_TOLERANCE, "speed back on the floor")
	await _teardown()
