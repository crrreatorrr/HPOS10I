extends TestCase
## QA: every LevelRoot scene follows the level-design rules from the physics
## review (tests/qa/qa_level_lint.gd has the rules and numbers). Errors fail;
## warnings are printed for the reviewer. Skips while no LevelRoot scene
## exists. Full report for one scene:
##   godot --headless --path . -s res://tools/qa/level_lint.gd -- --scene=res://levels/...
## Owned by QA.

const Lint := preload("res://tests/qa/qa_level_lint.gd")


func test_levels_follow_the_design_rules() -> void:
	if not ResourceLoader.exists("res://terrain/curve_terrain.gd"):
		print("  SKIP qa/test_level_rules.gd: no terrain helpers yet")
		return
	var scenes := Lint.level_scenes()
	if scenes.is_empty():
		print("  SKIP qa/test_level_rules.gd: no LevelRoot scenes yet")
		return
	for path in scenes:
		var root: Node = await Lint.prepare(self, tree.root, path)
		if root == null:
			fail("%s: does not load" % path)
			continue
		var findings: Array[Dictionary] = Lint.lint(root)
		for f in findings:
			if f.severity == "error":
				fail("%s: %s at (%.0f, %.0f): %s" % [path.get_file(), f.rule, f.at.x, f.at.y, f.detail])
			elif f.severity == "warn":
				print("  WARN %s: %s at (%.0f, %.0f): %s" % [path.get_file(), f.rule, f.at.x, f.at.y, f.detail])
		root.queue_free()
		await physics_frames(1)
