extends TestCase
## QA: every built act matches its row of the difficulty curve (docs/LEVELS.md,
## core/difficulty.gd) and is not easier than the act before it
## (tests/qa/qa_difficulty.gd has the measures and rules). Errors fail;
## warnings are printed. Skips while the curve or the acts don't exist.
## Full report: godot --headless --path . -s res://tools/qa/level_lint.gd
## Owned by QA.

const Lint := preload("res://tests/qa/qa_level_lint.gd")
const Diff := preload("res://tests/qa/qa_difficulty.gd")


func test_acts_follow_the_difficulty_curve() -> void:
	if not Diff.available() or not ResourceLoader.exists("res://terrain/curve_terrain.gd"):
		print("  SKIP qa/test_level_difficulty.gd: no core/difficulty.gd or terrain yet")
		return
	var acts: Array = []
	for path in Lint.level_scenes():
		var act := Diff.act_of(path)
		if act.is_empty():
			continue
		var root: Node = await Lint.prepare(self, tree.root, path)
		if root == null:
			fail("%s: does not load" % path)
			continue
		var m := Diff.measure(root as Node2D)
		print("  INFO %s D%d: %s" % [path.get_file(), act.d, Diff.summary(m)])
		_report(path.get_file(), Diff.check(m, act.d, Diff.targets(act.d)))
		acts.append({path = path, d = act.d, m = m})
		root.queue_free()
		await physics_frames(1)
	if acts.is_empty():
		print("  SKIP qa/test_level_difficulty.gd: no zone acts yet")
		return
	_report("order", Diff.check_order(acts))


func _report(label: String, findings: Array[Dictionary]) -> void:
	for f in findings:
		var line := "%s: %s: %s" % [label, f.rule, f.detail]
		if f.severity == "error":
			fail(line)
		elif f.severity == "warn":
			print("  WARN " + line)
