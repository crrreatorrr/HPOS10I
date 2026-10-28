extends SceneTree
## Headless test runner. Runs every res://tests/**/test_*.gd (extends TestCase).
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd
##   ... -s res://tests/run_tests.gd -- --filter=physics
## Exit code is 1 if any test fails. Owned by the lead.


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	# Let autoloads finish _ready before tests touch them.
	await process_frame
	var filter := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--filter="):
			filter = arg.get_slice("=", 1)

	var files := PackedStringArray()
	_collect("res://tests", files)
	files.sort()

	var passed := 0
	var failed := 0
	for path in files:
		if filter != "" and not path.contains(filter):
			continue
		var script: GDScript = load(path)
		if script == null or not script.can_instantiate():
			printerr("  FAIL %s: could not load" % path)
			failed += 1
			continue
		for method in script.get_script_method_list():
			if not method.name.begins_with("test_"):
				continue
			var test: TestCase = script.new()
			test.tree = self
			await test.before_each()
			await Callable(test, method.name).call()
			await test.after_each()
			test._cleanup()
			await process_frame
			var label := "%s :: %s" % [path.trim_prefix("res://tests/"), method.name]
			if test._failures.is_empty():
				passed += 1
				print("  PASS ", label)
			else:
				failed += 1
				for message in test._failures:
					printerr("  FAIL %s — %s" % [label, message])

	print("\n%d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)


func _collect(dir_path: String, out: PackedStringArray) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	for sub in dir.get_directories():
		_collect(dir_path.path_join(sub), out)
	for file in dir.get_files():
		if file.begins_with("test_") and file.ends_with(".gd") and file != "test_case.gd":
			out.append(dir_path.path_join(file))
