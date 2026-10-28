extends TestCase
## QA self-test for the momentum lint rules (tests/qa/qa_level_lint.gd,
## docs/LEVELS.md rule 4): a steep up-slope needs a run-up, and no checkpoint
## right before one. Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const Lint := preload("res://tests/qa/qa_level_lint.gd")


func _rules(findings: Array[Dictionary]) -> PackedStringArray:
	var out := PackedStringArray()
	for f in findings:
		out.append(f.rule)
	return out


func _hill(w: Node2D, foot_x: float, angle: float, floor_y := 0.0) -> void:
	var h := 300.0 * tan(deg_to_rad(angle))
	L.poly(w, PackedVector2Array([
		Vector2(foot_x, floor_y), Vector2(foot_x + 300.0, floor_y - h), Vector2(foot_x + 600.0, floor_y - h),
		Vector2(foot_x + 600.0, floor_y + 300.0), Vector2(foot_x, floor_y + 300.0)]))


func test_a_hill_after_a_long_flat_is_fine() -> void:
	if not ResourceLoader.exists("res://terrain/curve_terrain.gd"):
		print("  SKIP qa/test_momentum_rules.gd: no terrain yet")
		return
	var w := L.world(self)
	L.rect(w, Rect2(-1200, 0, 1200, 300))
	_hill(w, 0.0, 26.6)
	await physics_frames(2)
	var rules := _rules(Lint.lint(w))
	assert_true(not "momentum.runup" in rules, "a long flat run-up is fine: %s" % rules)


func test_a_hill_right_after_a_drop_and_a_checkpoint_warns() -> void:
	if not ResourceLoader.exists("res://terrain/curve_terrain.gd"):
		print("  SKIP qa/test_momentum_rules.gd: no terrain yet")
		return
	var w := L.world(self)
	# A ledge 64 px higher that ends 32 px before the hill's foot: Sproto drops
	# onto a 32 px flat strip, then faces the hill.
	L.rect(w, Rect2(-1200, -64, 1168, 364))
	L.rect(w, Rect2(-32, 0, 32, 300))
	_hill(w, 0.0, 26.6)
	var cp := Marker2D.new()
	cp.name = "Checkpoint1"
	cp.position = Vector2(-16, -19)
	w.add_child(cp)
	await physics_frames(2)
	var rules := _rules(Lint.lint(w))
	assert_true("momentum.runup" in rules, "a 26.6 deg hill with a 32 px run-up warns: %s" % rules)
	assert_true("momentum.checkpoint" in rules, "a checkpoint 16 px before the foot warns: %s" % rules)
