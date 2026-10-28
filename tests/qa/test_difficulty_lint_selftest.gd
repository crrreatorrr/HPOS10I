extends TestCase
## QA self-test for the difficulty lint (tests/qa/qa_difficulty.gd) on built
## fixtures, so the measures are proven before real acts exist. Rows are
## copies of docs/LEVELS.md D1/D2 (a866341) so this runs without
## core/difficulty.gd.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const Diff := preload("res://tests/qa/qa_difficulty.gd")

const ROW_1 := {screens = 45, par_seconds = 150, enemies_per_screen = 0.4, tiers = {1: 100}, direction = 1, checkpoints = 3, tickets_per_screen = 5.0}
const ROW_2 := {screens = 55, par_seconds = 195, enemies_per_screen = 0.6, tiers = {1: 75, 2: 25}, direction = 2, checkpoints = 4, tickets_per_screen = 4.5}
const W := 424.0
const SCREENS := 45

var _tier_script: GDScript


## Enemies along an act that follows the ramp for a T1 act: 3 in the opening,
## 9 in the middle, 6 in the finale (one of them T2). [progress, tier] pairs.
static func ramped_enemies() -> Array:
	var out: Array = []
	for i in 3:
		out.append([0.03 + i * 0.07, 1])
	for i in 9:
		out.append([0.28 + i * 0.05, 1])
	for i in 6:
		out.append([0.78 + i * 0.035, 2 if i == 3 else 1])
	return out


## Same count spread evenly, all T1: no ramp.
static func flat_enemies() -> Array:
	var out: Array = []
	for i in 18:
		out.append([0.02 + i * 0.055, 1])
	return out


func _fixture(enemies: Array, checkpoints: Array, tickets: int, extra := Callable()) -> Node2D:
	if _tier_script == null:
		_tier_script = GDScript.new()
		_tier_script.source_code = "extends Node2D\nvar tier := 1\nvar local_difficulty = null\n"
		_tier_script.reload()
	var w := L.world(self)
	var length := SCREENS * W
	L.floor_at(w, 0.0, length, 0.0)
	L.rect(w, Rect2(-64.0, -900.0, 64.0, 1200.0))  # left wall
	L.rect(w, Rect2(length, -900.0, 64.0, 1200.0))  # right wall
	var bounds := ReferenceRect.new()
	bounds.name = "Bounds"
	bounds.position = Vector2(0.0, -900.0)
	bounds.size = Vector2(length, 1000.0)
	w.add_child(bounds)
	_marker(w, "PlayerStart", 100.0)
	_marker(w, "Goal", length - 100.0)
	for i in enemies.size():
		var e := Node2D.new()
		e.set_script(_tier_script)
		e.name = "Enemy%d" % i
		e.set(&"tier", enemies[i][1])
		if enemies[i].size() > 2:
			e.set(&"local_difficulty", enemies[i][2])
		e.position = Vector2(_x(enemies[i][0]), -16.0)
		w.add_child(e)
	for i in checkpoints.size():
		_marker(w, "Checkpoint%d" % (i + 1), _x(checkpoints[i]))
	for i in tickets:
		var t := Node2D.new()
		t.name = "Ticket%d" % i
		t.position = Vector2(200.0 + i * (length - 400.0) / maxf(tickets, 1.0), -40.0)
		w.add_child(t)
	if extra.is_valid():
		extra.call(w, length)
	return w


## x at a progress along the fixture (start 100, goal length - 100).
func _x(progress: float) -> float:
	return 100.0 + progress * (SCREENS * W - 200.0)


func _marker(w: Node2D, marker_name: String, x: float) -> void:
	var m := Marker2D.new()
	m.name = marker_name
	m.position = Vector2(x, -19.0)
	w.add_child(m)


func _measure(w: Node2D) -> Dictionary:
	await physics_frames(2)
	return Diff.measure(w, func(n: Node) -> bool: return String(n.name).begins_with("Enemy"))


func _rules(findings: Array[Dictionary], severity: String) -> PackedStringArray:
	var out := PackedStringArray()
	for f in findings:
		if f.severity == severity:
			out.append(f.rule)
	return out


func test_a_ramped_d1_act_on_its_row_passes() -> void:
	var m: Dictionary = await _measure(_fixture(ramped_enemies(), [0.35, 0.55, 0.75], 225))
	print("  INFO fixture D1: " + Diff.summary(m))
	assert_near(m.screens, 45.0, 0.3, "screens")
	assert_near(m.density, 0.4, 0.02, "enemy density")
	assert_near(m.ticket_density, 5.0, 0.1, "ticket density")
	assert_eq(m.checkpoints, 3, "checkpoints")
	assert_eq(m.direction, 1, "flat, straight: R1")
	assert_eq(m.dead_ends, 0, "no dead ends")
	assert_eq(int(m.sections.finale.tier_max), 2, "finale reaches T2")
	assert_true(float(m.sections.finale.density) >= 1.3 * float(m.sections.middle.density), "finale denser")
	var errors := _rules(Diff.check(m, 1.0, ROW_1), "error")
	assert_true(errors.is_empty(), "no errors on its own row: %s" % errors)


func test_a_flat_act_fails_the_ramp() -> void:
	var m: Dictionary = await _measure(_fixture(flat_enemies(), [0.25, 0.5, 0.6], 225))
	var errors := _rules(Diff.check(m, 1.0, ROW_1), "error")
	assert_true("difficulty.finale_density" in errors, "flat density fails: %s" % errors)
	assert_true("difficulty.finale_tier" in errors, "no tier above T1 in the finale")
	assert_true("difficulty.finale_checkpoint" in errors, "no checkpoint at the finale start")


func test_the_same_act_is_off_a_d2_row() -> void:
	var m: Dictionary = await _measure(_fixture(ramped_enemies(), [0.35, 0.55, 0.75], 225))
	var findings := Diff.check(m, 2.0, ROW_2)
	var errors := _rules(findings, "error")
	assert_true("difficulty.enemy_density" in errors, "0.4 vs 0.6 enemies per screen is an error: %s" % errors)
	assert_true("difficulty.finale_tier" in errors, "a D2 finale needs T3")
	assert_true("difficulty.direction" in _rules(findings, "warn"), "R1 vs R2 is a warning")
	assert_true("difficulty.checkpoints" in _rules(findings, "warn"), "3 vs 4 checkpoints is a warning")


func test_tier_ceiling_and_missing_tier() -> void:
	var enemies := ramped_enemies()
	enemies[5] = [0.4, 3]
	var m: Dictionary = await _measure(_fixture(enemies, [0.35, 0.55, 0.75], 225))
	assert_true("difficulty.tier_ceiling" in _rules(Diff.check(m, 1.0, ROW_1), "error"), "a T3 in the middle of a D1 act")
	m.tier_missing = 1
	assert_true("difficulty.tier_missing" in _rules(Diff.check(m, 1.0, ROW_1), "error"), "an enemy without a tier")


func test_pre_boss_act_needs_a_checkpoint_at_the_gate() -> void:
	var gate := func(w: Node2D, length: float) -> void:
		_marker(w, "BossGate", length - 60.0)
	var m: Dictionary = await _measure(_fixture(ramped_enemies(), [0.35, 0.55, 0.75], 225, gate))
	assert_true("difficulty.gate_checkpoint" in _rules(Diff.check(m, 1.0, ROW_1, true), "error"), "no checkpoint outside the gate")
	assert_true(not "difficulty.gate_checkpoint" in _rules(Diff.check(m, 1.0, ROW_1, false), "error"), "only acts before a boss")
	var with_gate_cp: Dictionary = await _measure(_fixture(ramped_enemies(), [0.35, 0.55, 0.75, 0.985], 225, gate))
	assert_true(not "difficulty.gate_checkpoint" in _rules(Diff.check(with_gate_cp, 1.0, ROW_1, true), "error"),
			"a checkpoint just before the gate passes")


func test_finale_enemies_must_report_a_higher_local_difficulty() -> void:
	var enemies := ramped_enemies()
	for e in enemies:
		var p: float = e[0]
		e.append(1.0 if p < 0.75 else 0.9)  # wrong: the finale reports less
	var m: Dictionary = await _measure(_fixture(enemies, [0.35, 0.55, 0.75], 225))
	assert_true("difficulty.finale_local" in _rules(Diff.check(m, 1.0, ROW_1), "error"), "finale not harder locally")
	for e in enemies:
		var p: float = e[0]
		e[2] = 1.0 if p < 0.75 else 1.5
	var good: Dictionary = await _measure(_fixture(enemies, [0.35, 0.55, 0.75], 225))
	assert_true(not "difficulty.finale_local" in _rules(Diff.check(good, 1.0, ROW_1), "error"), "finale harder locally")


func test_group_nodes_are_containers_not_items() -> void:
	# A "Tickets" group holding the tickets, and a "Checkpoints" group: the
	# lint counts what is inside, not the group (level agent report).
	var grouped := func(w: Node2D, length: float) -> void:
		var tickets := Node2D.new()
		tickets.name = "Tickets"
		w.add_child(tickets)
		for i in 30:
			var t := Node2D.new()
			t.name = "Pickup%d" % i
			t.set_meta(&"qa", true)
			t.position = Vector2(300.0 + i * 20.0, -40.0)
			tickets.add_child(t)
			var ticket := Node2D.new()
			ticket.name = "Ticket%d" % i
			t.add_child(ticket)
		var cps := Node2D.new()
		cps.name = "Checkpoints"
		w.add_child(cps)
		for x in [_x(0.2), _x(0.9)]:
			var c := Marker2D.new()
			c.name = "Checkpoint%d" % int(x)
			c.position = Vector2(x, -19.0)
			cps.add_child(c)
	var m: Dictionary = await _measure(_fixture(ramped_enemies(), [0.35, 0.55, 0.75], 225, grouped))
	assert_eq(int(m.tickets), 225 + 30, "every ticket inside the group counts")
	assert_eq(int(m.checkpoints), 3 + 2, "checkpoints inside a group count, the group doesn't")


func test_vertical_climb_and_dead_end_raise_the_direction() -> void:
	var climb := func(w: Node2D, length: float) -> void:
		# A tower block 600 px tall in the middle (top floor 600 px up), and a
		# 300 px wall at 3/4 that ends the low floor (a dead end, no spring).
		L.rect(w, Rect2(length * 0.4, -600.0, 1200.0, 600.0))
		L.rect(w, Rect2(length * 0.75, -300.0, 32.0, 300.0))
	var m: Dictionary = await _measure(_fixture(ramped_enemies(), [0.35, 0.55, 0.75], 225, climb))
	print("  INFO fixture climb: " + Diff.summary(m))
	assert_true(m.vertical_screens >= 2.0, "600 px spread is 2.5 screens (got %.2f)" % m.vertical_screens)
	assert_true(m.dead_ends >= 1, "the 300 px wall is a dead end")
	assert_true(m.direction >= 3, "R3 or more")


func test_a_later_act_that_is_easier_fails_the_order() -> void:
	var easy := {d = 2.0, path = "act2.tscn", m = {density = 0.3, tier_max = 1, direction = 1, ticket_density = 6.0, checkpoints = 4, screens = 30.0}}
	var first := {d = 1.0, path = "act1.tscn", m = {density = 0.4, tier_max = 1, direction = 1, ticket_density = 5.0, checkpoints = 2, screens = 30.0}}
	var findings := Diff.check_order([easy, first])
	assert_true("difficulty.order" in _rules(findings, "error"), "lower enemy density than the act before")
	assert_true("difficulty.order" in _rules(findings, "warn"), "more generous with tickets")
	var fine := {d = 2.0, path = "act2.tscn", m = {density = 0.6, tier_max = 2, direction = 2, ticket_density = 4.5, checkpoints = 3, screens = 35.0}}
	assert_true(Diff.check_order([first, fine]).is_empty(), "a harder act passes")
