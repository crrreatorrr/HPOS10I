extends TestCase
## QA: nothing in or around a loop can trap Sproto (BUG-02-01 and its
## cousins, qa/reports/02-test-level.md). Each scenario puts him somewhere
## awkward, then a player holds ONE direction for 8 s: left, or right (two
## separate tries from the same start). He must leave the loop's footprint
## with each of them, and never end up inside terrain.
## Scenarios: drops into the ring and onto the feet, slow ground entries
## (run and roll) from both sides, spin dashes and hurt knockback inside,
## respawns in the ring, and jumps into the ring from both run-ups.
## Arms itself with the BUG-02-01 and BUG-02-03 fixes (terrain/loop_guard.gd,
## physics da12a3b); skips before.
## Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const Lint := preload("res://tests/qa/qa_level_lint.gd")
## Long enough to rock once and walk out after the turn back (the guard opens
## the way only once he has turned back in the ring).
const HOLD_FRAMES := 480

var _failures_seen := PackedStringArray()


func after_each() -> void:
	GameState.tickets = 0
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		Dev.send_action(action, false)


func _skip() -> bool:
	if not L.available() or not ResourceLoader.exists(L.LOOP_SCENE):
		print("  SKIP qa/test_loop_escape.gd: no player or loop yet")
		return true
	if not ResourceLoader.exists("res://terrain/loop_guard.gd"):
		print("  SKIP qa/test_loop_escape.gd: the BUG-02-01 fix (terrain/loop_guard.gd) is not merged yet")
		return true
	# BUG-02-03 (r48: standing inside and holding right) is fixed in physics
	# da12a3b; until then the strict two-way rule would fail at r48.
	var guard_src := FileAccess.get_file_as_string("res://terrain/loop_guard.gd")
	if not guard_src.contains("_half_width("):
		print("  SKIP qa/test_loop_escape.gd: physics da12a3b (BUG-02-03) not merged yet")
		return true
	return false


## A floor with one loop at x = 0. Returns [world, half footprint].
func _world(radius: float) -> Array:
	var w := L.world(self)
	L.floor_at(w, -4000.0, 4000.0)
	L.loop(w, Vector2.ZERO, radius)
	await physics_frames(2)
	var loops: Array = Lint._find_loops(w)
	var half: float = loops[0].half if not loops.is_empty() else radius + 200.0
	return [w, half]


## Runs `setup` (which places and moves the player), then holds `hold` for
## HOLD_FRAMES. Returns "" when he left the footprint, else a description.
func _try(radius: float, label: String, setup: Callable, hold: StringName) -> String:
	var made: Array = await _world(radius)
	var w: Node2D = made[0]
	var half: float = made[1]
	var p: Node2D = await L.spawn(self, w, Vector2(-half - 300.0, 0.0))
	await setup.call(p)
	press(hold)
	var out := false
	var inside_terrain := false
	for i in HOLD_FRAMES:
		await physics_frames(1)
		if L.centre_in_terrain(p):
			inside_terrain = true
		if absf(p.global_position.x) > half:
			out = true
			break
	release(hold)
	if inside_terrain:
		return "%s r%d: inside terrain while holding %s" % [label, radius, hold]
	if not out:
		return "%s r%d: still in the loop after %d frames of %s at (%.0f, %.0f) path %d state %s" % [
				label, radius, HOLD_FRAMES, hold, p.global_position.x, p.global_position.y,
				p.collision_path, p.state]
	return ""


## Holding EITHER direction must walk him out, at every radius: the accepted
## rule after the BUG-02-01 and BUG-02-03 fixes, so a player can always leave
## the way he chooses. Returns the failures.
func _scenario(radius: float, label: String, setup: Callable) -> PackedStringArray:
	var out := PackedStringArray()
	for hold in [&"move_left", &"move_right"]:
		var result: String = await _try(radius, label, setup, hold)
		if result != "":
			out.append(result)
	return out


func _report(fails: PackedStringArray, count: int) -> void:
	print("  INFO %d scenarios x 2 directions, %d stuck" % [count, fails.size()])
	for f in fails:
		fail(f)


# --- Setups --------------------------------------------------------------------

func _drop(at: Vector2) -> Callable:
	return func(p: Node2D) -> void:
		p.respawn_at(at)
		await physics_frames(90)


func _ground_entry(from_left: bool, speed: float, roll: bool, half: float) -> Callable:
	return func(p: Node2D) -> void:
		var dir := 1.0 if from_left else -1.0
		p.respawn_at(Vector2(-dir * (half + 40.0), -19.0))
		await physics_frames(2)
		p.ground_speed = dir * speed
		if roll:
			press(&"move_down")
			await physics_frames(1)
			release(&"move_down")
		await physics_frames(150)


func _spindash_inside(dir: float) -> Callable:
	return func(p: Node2D) -> void:
		p.respawn_at(Vector2(0.0, -19.0))
		await physics_frames(10)
		press(&"move_left" if dir < 0.0 else &"move_right")
		await physics_frames(1)
		release(&"move_left" if dir < 0.0 else &"move_right")
		press(&"move_down")
		await physics_frames(2)
		for i in 4:
			press(&"jump")
			await physics_frames(2)
			release(&"jump")
			await physics_frames(2)
		release(&"move_down")
		await physics_frames(120)


func _hurt_inside(source_x: float) -> Callable:
	return func(p: Node2D) -> void:
		p.respawn_at(Vector2(0.0, -19.0))
		await physics_frames(10)
		GameState.tickets = 5  # a knockback, not a death
		p.hurt(Vector2(source_x, -19.0))
		await physics_frames(120)


func _jump_in(from_left: bool, takeoff: float) -> Callable:
	return func(p: Node2D) -> void:
		var dir := 1.0 if from_left else -1.0
		p.respawn_at(Vector2(-dir * (takeoff + 240.0), -19.0))
		await physics_frames(2)
		p.ground_speed = dir * 6.0
		var hold := &"move_right" if from_left else &"move_left"
		press(hold)
		await physics_frames(40)
		press(&"jump")
		await physics_frames(8)
		release(&"jump")
		# Keep running the way he jumped, like a player (and the runner bot)
		# would, until he has settled wherever he landed.
		await physics_frames(150)
		release(hold)


# --- Tests ------------------------------------------------------------------------
# Split small: each test must stay under the runner's 7,200-frame limit.

func _drops(radius: float, inside: bool) -> void:
	var made: Array = await _world(radius)
	var half: float = made[1]
	var spots := [
		Vector2(0.0, -2.0 * radius + 40.0),           # just under the top, inside
		Vector2(0.0, -19.0),                          # bottom centre
		Vector2(-radius * 0.5, -19.0 - radius * 0.1),  # lower left inside
		Vector2(radius * 0.5, -19.0 - radius * 0.1),   # lower right inside
	] if inside else [
		Vector2(-(radius + 30.0), -120.0),            # onto the left foot
		Vector2(radius + 30.0, -120.0),               # onto the right foot
		Vector2(-half + 20.0, -60.0),                 # left edge of the footprint
		Vector2(half - 20.0, -60.0),                  # right edge
	]
	var fails := PackedStringArray()
	for spot in spots:
		fails.append_array(await _scenario(radius, "drop/respawn at %s" % spot, _drop(spot)))
	_report(fails, spots.size())


func _entries(radius: float, from_left: bool) -> void:
	var made: Array = await _world(radius)
	var half: float = made[1]
	var fails := PackedStringArray()
	var count := 0
	for speed in [1.5, 3.0, 4.5]:
		for roll in [false, true]:
			count += 1
			fails.append_array(await _scenario(radius,
					"slow %s entry %s px/f from the %s" % ["roll" if roll else "run", speed, "left" if from_left else "right"],
					_ground_entry(from_left, speed, roll, half)))
	_report(fails, count)


func _inside_actions(radius: float) -> void:
	var fails := PackedStringArray()
	var count := 0
	for dir in [-1.0, 1.0]:
		count += 2
		fails.append_array(await _scenario(radius, "spin dash inside, dir %d" % dir, _spindash_inside(dir)))
		fails.append_array(await _scenario(radius, "hurt inside from %s" % ("left" if dir < 0.0 else "right"), _hurt_inside(dir * 30.0)))
	_report(fails, count)


func _jumps_in(radius: float, from_left: bool) -> void:
	var fails := PackedStringArray()
	var count := 0
	for takeoff in [radius * 0.5, radius * 1.2, radius * 2.0, radius * 3.0]:
		count += 1
		fails.append_array(await _scenario(radius,
				"jump in from the %s, take-off %.0f px out" % ["left" if from_left else "right", takeoff],
				_jump_in(from_left, takeoff)))
	_report(fails, count)

func test_r48_drops_inside() -> void:
	if not _skip():
		await _drops(48.0, true)


func test_r48_drops_on_feet_and_edges() -> void:
	if not _skip():
		await _drops(48.0, false)


func test_r48_slow_entries_from_the_left() -> void:
	if not _skip():
		await _entries(48.0, true)


func test_r48_slow_entries_from_the_right() -> void:
	if not _skip():
		await _entries(48.0, false)


func test_r48_spin_dash_and_hurt_inside() -> void:
	if not _skip():
		await _inside_actions(48.0)


func test_r48_jumps_in_from_the_left() -> void:
	if not _skip():
		await _jumps_in(48.0, true)


func test_r48_jumps_in_from_the_right() -> void:
	if not _skip():
		await _jumps_in(48.0, false)


func test_r112_drops_inside() -> void:
	if not _skip():
		await _drops(112.0, true)


func test_r112_drops_on_feet_and_edges() -> void:
	if not _skip():
		await _drops(112.0, false)


func test_r112_slow_entries_from_the_left() -> void:
	if not _skip():
		await _entries(112.0, true)


func test_r112_slow_entries_from_the_right() -> void:
	if not _skip():
		await _entries(112.0, false)


func test_r112_spin_dash_and_hurt_inside() -> void:
	if not _skip():
		await _inside_actions(112.0)


func test_r112_jumps_in_from_the_left() -> void:
	if not _skip():
		await _jumps_in(112.0, true)


func test_r112_jumps_in_from_the_right() -> void:
	if not _skip():
		await _jumps_in(112.0, false)


func test_r80_drops_inside() -> void:
	if not _skip():
		await _drops(80.0, true)


func test_r80_drops_on_feet_and_edges() -> void:
	if not _skip():
		await _drops(80.0, false)


func test_r80_slow_entries_from_the_left() -> void:
	if not _skip():
		await _entries(80.0, true)


func test_r80_slow_entries_from_the_right() -> void:
	if not _skip():
		await _entries(80.0, false)


func test_r80_spin_dash_and_hurt_inside() -> void:
	if not _skip():
		await _inside_actions(80.0)


func test_r80_jumps_in_from_the_left() -> void:
	if not _skip():
		await _jumps_in(80.0, true)


func test_r80_jumps_in_from_the_right() -> void:
	if not _skip():
		await _jumps_in(80.0, false)


func test_r200_drops_inside() -> void:
	if not _skip():
		await _drops(200.0, true)


func test_r200_drops_on_feet_and_edges() -> void:
	if not _skip():
		await _drops(200.0, false)


func test_r200_slow_entries_from_the_left() -> void:
	if not _skip():
		await _entries(200.0, true)


func test_r200_slow_entries_from_the_right() -> void:
	if not _skip():
		await _entries(200.0, false)


func test_r200_spin_dash_and_hurt_inside() -> void:
	if not _skip():
		await _inside_actions(200.0)


func test_r200_jumps_in_from_the_left() -> void:
	if not _skip():
		await _jumps_in(200.0, true)


func test_r200_jumps_in_from_the_right() -> void:
	if not _skip():
		await _jumps_in(200.0, false)
