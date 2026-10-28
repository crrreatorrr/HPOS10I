extends TestCase
## QA self-test for enemy placement lint rules (tests/qa/qa_level_lint.gd):
## diver posts at least 120 px above the floor (BUG-Z2-01). Skips until the
## diver scene exists. Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const Lint := preload("res://tests/qa/qa_level_lint.gd")
const DIVER := "res://levels/enemies/diver.tscn"


func _rules(findings: Array[Dictionary]) -> PackedStringArray:
	var out := PackedStringArray()
	for f in findings:
		if f.severity == "error":
			out.append(f.rule)
	return out


func test_diver_posts_need_120_px() -> void:
	if not ResourceLoader.exists(DIVER) or not ResourceLoader.exists("res://terrain/curve_terrain.gd"):
		print("  SKIP qa/test_enemy_placement_rules.gd: no diver scene yet")
		return
	for case in [[100.0, true], [140.0, false]]:
		var w := L.world(self)
		L.rect(w, Rect2(-600, 0, 1200, 300))
		var d: Node2D = load(DIVER).instantiate()
		d.position = Vector2(0, -float(case[0]))
		d.process_mode = Node.PROCESS_MODE_DISABLED
		w.add_child(d)
		await physics_frames(2)
		var flagged := "enemy.diver_post" in _rules(Lint.lint(w))
		assert_eq(flagged, case[1], "a diver %s px above the floor is flagged: %s" % [case[0], case[1]])
