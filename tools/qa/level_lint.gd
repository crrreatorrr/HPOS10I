extends SceneTree
## QA level-design lint (CLI). Loads level scenes with their root script
## stripped (LevelRoot spawns nothing), lets the terrain build, and prints rule
## findings from tests/qa/qa_level_lint.gd. Owned by QA.
##   godot --headless --path <project> -s res://tools/qa/level_lint.gd                 # every LevelRoot scene
##   godot --headless --path <project> -s res://tools/qa/level_lint.gd -- --scene=res://levels/test_zone/test_zone.tscn
##   ... -- --scene=res://playground/physics_playground.tscn   (any scene works)
## Exit 0 = no errors (warnings allowed), 1 = errors, 2 = scene not found.

const Lint := preload("res://tests/qa/qa_level_lint.gd")


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var scenes := PackedStringArray()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--scene="):
			scenes.append(arg.get_slice("=", 1))
	if scenes.is_empty():
		scenes = Lint.level_scenes()
	if scenes.is_empty():
		print("level_lint: no LevelRoot scenes yet")
		quit(0)
		return
	var errors := 0
	for path in scenes:
		if not ResourceLoader.exists(path):
			printerr("level_lint: no scene %s" % path)
			quit(2)
			return
		var root: Node = await Lint.prepare(self, self.root, path)
		var findings: Array[Dictionary] = Lint.lint(root)
		var counts := {error = 0, warn = 0, info = 0}
		print("level_lint: %s" % path)
		for f in findings:
			counts[f.severity] += 1
			print("  %-5s %-16s (%.0f, %.0f)  %s" % [f.severity.to_upper(), f.rule, f.at.x, f.at.y, f.detail])
		print("  -> %d error(s), %d warning(s)" % [counts.error, counts.warn])
		errors += counts.error
		root.queue_free()
		await process_frame
	quit(1 if errors > 0 else 0)
