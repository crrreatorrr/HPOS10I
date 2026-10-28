extends TestCase
## QA self-test for the difficulty lint (tests/qa/qa_difficulty.gd) on built
## fixtures, so the measures are proven before real acts exist. Rows are
## copies of docs/LEVELS.md D1/D2 so this runs without core/difficulty.gd.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const Diff := preload("res://tests/qa/qa_difficulty.gd")

const ROW_1 := {screens = 30, par_seconds = 105, enemies_per_screen = 0.4, tiers = {1: 100}, direction = 1, checkpoints = 2, tickets_per_screen = 5.0}
const ROW_2 := {screens = 35, par_seconds = 135, enemies_per_screen = 0.6, tiers = {1: 75, 2: 25}, direction = 2, checkpoints = 3, tickets_per_screen = 4.5}
const W := 424.0

var _tier_script: GDScript


func _fixture(screens: int, enemies: Array, checkpoints: int, tickets: int, extra := Callable()) -> Node2D:
	if _tier_script == null:
		_tier_script = GDScript.new()
		_tier_script.source_code = "extends Node2D\nvar tier := 1\n"
		_tier_script.reload()
	var w := L.world(self)
	var length := screens * W
	L.floor_at(w, 0.0, length, 0.0)
	L.rect(w, Rect2(-64.0, -900.0, 64.0, 1200.0))  # left wall
	L.rect(w, Rect2(length, -900.0, 64.0, 1200.0))  # right wall
	var bounds := ReferenceRect.new()
	bounds.name = "Bounds"
	bounds.position = Vector2(0.0, -900.0)
	bounds.size = Vector2(length, 1000.0)
	w.add_child(bounds)
	var start := Marker2D.new()
	start.name = "PlayerStart"
	start.position = Vector2(100.0, -19.0)
	w.add_child(start)
	var goal := Marker2D.new()
	goal.name = "Goal"
	goal.position = Vector2(length - 100.0, -19.0)
	w.add_child(goal)
	for i in enemies.size():
		var e := Node2D.new()
		e.set_script(_tier_script)
		e.name = "Enemy%d" % i
		e.set(&"tier", enemies[i])
		e.position = Vector2(300.0 + i * (length - 600.0) / maxf(enemies.size(), 1.0), -16.0)
		w.add_child(e)
	for i in checkpoints:
		var c := Marker2D.new()
		c.name = "Checkpoint%d" % (i + 1)
		c.position = Vector2((i + 1) * length / (checkpoints + 1), -19.0)
		w.add_child(c)
	for i in tickets:
		var t := Node2D.new()
		t.name = "Ticket%d" % i
		t.position = Vector2(200.0 + i * (length - 400.0) / maxf(tickets, 1.0), -40.0)
		w.add_child(t)
	if extra.is_valid():
		extra.call(w, length)
	return w


func _measure(w: Node2D) -> Dictionary:
	await physics_frames(2)
	return Diff.measure(w, func(n: Node) -> bool: return String(n.name).begins_with("Enemy"))


func _rules(findings: Array[Dictionary], severity: String) -> PackedStringArray:
	var out := PackedStringArray()
	for f in findings:
		if f.severity == severity:
			out.append(f.rule)
	return out


func test_a_d1_act_on_its_row_passes() -> void:
	var tiers: Array = []
	tiers.resize(12)
	tiers.fill(1)
	var m: Dictionary = await _measure(_fixture(30, tiers, 2, 150))
	print("  INFO fixture D1: " + Diff.summary(m))
	assert_near(m.screens, 30.0, 0.3, "screens")
	assert_near(m.density, 0.4, 0.02, "enemy density")
	assert_near(m.ticket_density, 5.0, 0.1, "ticket density")
	assert_eq(m.checkpoints, 2, "checkpoints")
	assert_eq(m.direction, 1, "flat, straight: R1")
	assert_eq(m.dead_ends, 0, "no dead ends")
	var errors := _rules(Diff.check(m, 1, ROW_1), "error")
	assert_true(errors.is_empty(), "no errors on its own row: %s" % errors)


func test_the_same_act_is_off_a_d2_row() -> void:
	var tiers: Array = []
	tiers.resize(12)
	tiers.fill(1)
	var m: Dictionary = await _measure(_fixture(30, tiers, 2, 150))
	var findings := Diff.check(m, 2, ROW_2)
	var errors := _rules(findings, "error")
	assert_true("difficulty.enemy_density" in errors, "0.4 vs 0.6 enemies per screen is an error: %s" % errors)
	assert_true("difficulty.direction" in _rules(findings, "warn"), "R1 vs R2 is a warning")
	assert_true("difficulty.checkpoints" in _rules(findings, "warn"), "2 vs 3 checkpoints is a warning")


func test_tier_ceiling_and_missing_tier() -> void:
	var m: Dictionary = await _measure(_fixture(30, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3], 2, 150))
	assert_true("difficulty.tier_ceiling" in _rules(Diff.check(m, 1, ROW_1), "error"), "a T3 in a D1 act")
	m.tier_missing = 1
	assert_true("difficulty.tier_missing" in _rules(Diff.check(m, 1, ROW_1), "error"), "an enemy without a tier")


func test_vertical_climb_and_dead_end_raise_the_direction() -> void:
	var tiers: Array = []
	tiers.resize(12)
	tiers.fill(1)
	var climb := func(w: Node2D, length: float) -> void:
		# A tower block 600 px tall in the middle (top floor 600 px up), and a
		# 300 px wall at 3/4 that ends the low floor (a dead end, no spring).
		L.rect(w, Rect2(length * 0.4, -600.0, 1200.0, 600.0))
		L.rect(w, Rect2(length * 0.75, -300.0, 32.0, 300.0))
	var m: Dictionary = await _measure(_fixture(30, tiers, 2, 150, climb))
	print("  INFO fixture climb: " + Diff.summary(m))
	assert_true(m.vertical_screens >= 2.0, "600 px spread is 2.5 screens (got %.2f)" % m.vertical_screens)
	assert_true(m.dead_ends >= 1, "the 300 px wall is a dead end")
	assert_true(m.direction >= 3, "R3 or more")


func test_a_later_act_that_is_easier_fails_the_order() -> void:
	var easy := {d = 2, path = "act2.tscn", m = {density = 0.3, tier_max = 1, direction = 1, ticket_density = 6.0, checkpoints = 4, screens = 30.0}}
	var first := {d = 1, path = "act1.tscn", m = {density = 0.4, tier_max = 1, direction = 1, ticket_density = 5.0, checkpoints = 2, screens = 30.0}}
	var findings := Diff.check_order([easy, first])
	assert_true("difficulty.order" in _rules(findings, "error"), "lower enemy density than the act before")
	assert_true("difficulty.order" in _rules(findings, "warn"), "more generous with tickets")
	var fine := {d = 2, path = "act2.tscn", m = {density = 0.6, tier_max = 2, direction = 2, ticket_density = 4.5, checkpoints = 3, screens = 35.0}}
	assert_true(Diff.check_order([first, fine]).is_empty(), "a harder act passes")
