extends TestCase
## BUG-02-01: no way into a loop may trap Sproto in it. Jumping into the ring
## from the run-up used to leave him on the path that is right only for
## running on after a lap; turning back then rocked him on a lower quarter
## forever. LoopGuard fixes it.
##
## The sweeps run many loops at once, one lane each (lanes far apart), so a
## whole sweep shares one input timeline: every Sproto jumps at a different
## distance from his loop (from far out on the run-up to inside the ring), at
## several speeds and radii, keeps running for 2 s, and then holds back, holds
## forward, holds forward jumping every 45 frames, or spin dashes. Each must
## leave the loop's footprint (ring and feet) within LEAVE_FRAMES.

const W := preload("res://tests/physics/physics_world.gd")
const PLAYGROUND := "res://playground/physics_playground.tscn"

const RADII: Array[float] = [48.0, 112.0, 200.0]
const SPEEDS: Array[float] = [3.0, 6.0, 9.0]
## Where each jump is aimed to land, in ring radii before the loop centre:
## from past the centre to well before the ring. Take-offs stay at least a
## quarter radius before the centre.
const LANDINGS: Array[float] = [-0.6, -0.2, 0.2, 0.6, 1.0, 2.0]
## About how long a jump lasts, for aiming it.
const JUMP_FRAMES := 60.0
const LANE_GAP := 2000.0
const JUMP_HOLD_FRAMES := 15
const RUN_ON_FRAMES := 120
## "Within N seconds": the time each Sproto gets to leave the footprint.
const LEAVE_FRAMES := 600

var _lanes: Array[Dictionary] = []


func after_each() -> void:
	for action in [&"move_left", &"move_right", &"move_down", &"jump"]:
		release(action)
	_lanes.clear()


## One loop and one Sproto per lane, every radius × speed × take-off, all
## facing `direction`.
func _build(direction: int) -> void:
	var world := W.new_world(self)
	var lane := 0
	for radius in RADII:
		for speed in SPEEDS:
			for landing in LANDINGS:
				var y := lane * LANE_GAP
				W.add_floor(world, -3000.0, 3000.0, y)
				var loop: TerrainLoop = W.add_loop(world, Vector2(0.0, y))
				loop.radius = radius
				var take_off := maxf(speed * JUMP_FRAMES + landing * radius, radius * 0.25)
				var x := -direction * take_off
				_lanes.append({loop = loop, speed = speed, x = x, y = y,
						player = W.spawn_player(world, Vector2(x, y)),
						name = "radius %d speed %d take-off %.0f" % [radius, speed, -take_off]})
				lane += 1
	await physics_frames(2)
	for entry in _lanes:
		var player: Player = entry.player
		player.respawn_at(Vector2(entry.x, entry.y - Tuning.physics.height_radius))
		# Coming from the right, the exit switcher has set path B by now.
		player.set_collision_path(Player.PATH_A if direction > 0 else Player.PATH_B)
	await physics_frames(2)


## Half-width of the ring plus its feet.
func _footprint(loop: TerrainLoop) -> float:
	return loop.radius + loop.thickness + minf(loop.foot_radius, loop.radius)


func _still(entry: Dictionary) -> bool:
	var p: Player = entry.player
	return p.grounded and p.ground_speed == 0.0


func _outside(entry: Dictionary) -> bool:
	return absf((entry.player as Player).global_position.x) > _footprint(entry.loop) + 1.0


## Every Sproto runs `direction` at its speed and jumps at once.
func _jump_in(direction: int) -> void:
	await _build(direction)
	var forward := &"move_right" if direction > 0 else &"move_left"
	for entry in _lanes:
		(entry.player as Player).ground_speed = entry.speed * direction
	press(forward)
	press(&"jump")
	await physics_frames(JUMP_HOLD_FRAMES)
	release(&"jump")
	await physics_frames(RUN_ON_FRAMES)
	release(forward)


## Holds `action` until every Sproto has left his loop (or the time is up).
func _hold_until_out(action: StringName, label: String, jump_every := 0) -> void:
	press(action)
	await _wait_until_out(jump_every)
	release(action)
	release(&"jump")
	_assert_all_out(label)


## Waits until every Sproto is out (or the time is up). Those already out are
## stopped (they only cost time from then on). With `jump_every`, everyone
## also jumps that often (like QA's runner bot).
func _wait_until_out(jump_every := 0) -> void:
	for i in LEAVE_FRAMES:
		if jump_every > 0:
			if i % jump_every == 0:
				press(&"jump")
			elif i % jump_every == JUMP_HOLD_FRAMES:
				release(&"jump")
		await physics_frames(1)
		var all_out := true
		for entry in _lanes:
			var player: Player = entry.player
			if player.process_mode == Node.PROCESS_MODE_DISABLED:
				continue
			if _outside(entry):
				player.process_mode = Node.PROCESS_MODE_DISABLED
			else:
				all_out = false
		if all_out:
			return


func _assert_all_out(label: String) -> void:
	var stuck := PackedStringArray()
	for entry in _lanes:
		if not _outside(entry):
			var p: Player = entry.player
			stuck.append("%s at (%.0f, %.0f) path %d" % [entry.name, p.global_position.x, p.global_position.y - entry.y, p.collision_path])
	assert_true(stuck.is_empty(), "%s: %d of %d still in the loop: %s" % [label, stuck.size(), _lanes.size(), "; ".join(stuck)])


func test_jumped_in_and_walking_back_out() -> void:
	for direction in [1, -1]:
		await _jump_in(direction)
		await _hold_until_out(&"move_left" if direction > 0 else &"move_right", "dir %d, holding back" % direction)
		_lanes.clear()


func test_jumped_in_and_holding_forward() -> void:
	for direction in [1, -1]:
		await _jump_in(direction)
		await _hold_until_out(&"move_right" if direction > 0 else &"move_left", "dir %d, holding forward" % direction)
		_lanes.clear()


## QA's runner bot: holding forward and jumping every 45 frames (it used to
## stay in the test-zone loop for about 50 s).
func test_jumped_in_and_jumping_every_45_frames() -> void:
	for direction in [1, -1]:
		await _jump_in(direction)
		await _hold_until_out(&"move_right" if direction > 0 else &"move_left",
				"dir %d, holding forward and jumping" % direction, 45)
		_lanes.clear()


func test_jumped_in_and_spin_dashing() -> void:
	for direction in [1, -1]:
		await _jump_in(direction)
		# Hands off until everyone stands still, as a player would before a spin dash.
		for i in LEAVE_FRAMES:
			await physics_frames(1)
			if _lanes.all(_still):
				break
		press(&"move_down")
		await physics_frames(2)
		for i in 6:  # full charge
			press(&"jump")
			await physics_frames(1)
			release(&"jump")
			await physics_frames(1)
		release(&"move_down")
		await _wait_until_out()
		_assert_all_out("dir %d, spin dash" % direction)
		_lanes.clear()


## QA's repro (qa/repros/physics/BUG-02-01_loop_jump_trap.gd): a jump at run
## speed about 290 px before the playground loop lands inside the ring; he
## goes round and, turning back at the bottom, must be able to walk out left.
func test_playground_loop_jump_then_walk_back_out() -> void:
	const LOOP_X := 2400.0
	var scene := add_scene(PLAYGROUND)
	tree.current_scene = scene
	await physics_frames(10)
	var p: Player = scene.get(&"player")
	p.respawn_at(Vector2(LOOP_X - 293.0 - 200.0, -19.0))
	await physics_frames(2)
	p.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(33)
	press(&"jump")
	await physics_frames(8)
	release(&"jump")
	await physics_frames(150)
	release(&"move_right")
	assert_true(absf(p.global_position.x - LOOP_X) < 112.0, "the jump ends inside the ring (x %.0f)" % p.global_position.x)
	press(&"move_left")
	var min_x := p.global_position.x
	for i in 300:
		await physics_frames(1)
		min_x = minf(min_x, p.global_position.x)
	release(&"move_left")
	tree.current_scene = null
	assert_true(min_x < LOOP_X - 240.0, "5 s of holding left leaves the loop (min x %.0f, footprint from %.0f)" % [min_x, LOOP_X - 240.0])


## Off the loop top and down the outside, then back towards the loop before
## reaching the side switcher, on either path: the foot (a hill from outside)
## or the far lower quarter is in his way, and either used to rock him
## forever. Holding back must take him through the loop and out.
func test_turning_back_after_running_off_the_top() -> void:
	for combo in [[1, Player.PATH_A], [1, Player.PATH_B], [-1, Player.PATH_A], [-1, Player.PATH_B]]:
		var direction: int = combo[0]
		var world := W.new_world(self)
		W.add_floor(world, -3000.0, 3000.0)
		var loop: TerrainLoop = W.add_loop(world, Vector2.ZERO)
		var p := W.spawn_player(world, Vector2(-600.0, 0.0))
		await W.settle(self, p, Vector2(-600.0, 0.0))
		p.respawn_at(Vector2(0.0, -2.0 * loop.radius - loop.thickness - 40.0))
		p.set_collision_path(combo[1])
		for i in 60:
			await physics_frames(1)
			if p.grounded:
				break
		var forward := &"move_right" if direction > 0 else &"move_left"
		var back := &"move_left" if direction > 0 else &"move_right"
		var foot_end := _footprint(loop)
		press(forward)
		for i in 300:
			await physics_frames(1)
			if p.grounded and p.global_position.x * direction > foot_end + 8.0:
				break
		release(forward)
		press(back)
		var left := false
		for i in LEAVE_FRAMES:
			await physics_frames(1)
			if p.global_position.x * direction < -foot_end - 1.0:
				left = true
				break
		release(back)
		assert_true(left, "dir %d, path %d at the top: back through the loop and out (at %s, path %d)" % [
				direction, combo[1], p.global_position, p.collision_path])
		world.queue_free()
		await physics_frames(1)
