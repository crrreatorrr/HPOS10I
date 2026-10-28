extends SceneTree
## Headless test runner. Runs every res://tests/**/test_*.gd (extends TestCase).
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd
##   ... -s res://tests/run_tests.gd -- --filter=physics
## Exit code is 1 if any test fails. Owned by the lead.


## A test still running after this many physics frames fails (2 game minutes).
const TIMEOUT_FRAMES := 7200


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	# Let autoloads finish _ready before tests touch them.
	await process_frame
	var filter := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--filter="):
			filter = arg.get_slice("=", 1)

	# A test that hits a runtime script error must fail, not pass silently.
	var error_logger := TestErrorLogger.new()
	OS.add_logger(error_logger)

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
			error_logger.take()
			await test.before_each()
			if not await _run_with_timeout(Callable(test, method.name)):
				test.fail("timed out after %d physics frames" % TIMEOUT_FRAMES)
			await test.after_each()
			test._cleanup()
			_reset_global_state()
			await process_frame
			var errors := error_logger.take()
			if errors.size() > test.expected_errors:
				test.fail("%d unexpected engine/script error(s): %s" % [
						errors.size() - test.expected_errors, "; ".join(errors)])
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


## Runs a (possibly async) test method; false if it didn't finish in time.
func _run_with_timeout(method: Callable) -> bool:
	var done := [false]
	var runner := func() -> void:
		await method.call()
		done[0] = true
	runner.call()
	var frames := 0
	while not done[0] and frames < TIMEOUT_FRAMES:
		await physics_frame
		frames += 1
	return done[0]


## Undo anything a test may have left behind in the autoloads or engine.
func _reset_global_state() -> void:
	paused = false
	Engine.time_scale = 1.0
	root.get_node("GameState").reset_game()
	var router := root.get_node("SceneRouter")
	router.zone_id = ""
	router.stage = 1


func _collect(dir_path: String, out: PackedStringArray) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	for sub in dir.get_directories():
		_collect(dir_path.path_join(sub), out)
	for file in dir.get_files():
		if file.begins_with("test_") and file.ends_with(".gd") and file != "test_case.gd":
			out.append(dir_path.path_join(file))
