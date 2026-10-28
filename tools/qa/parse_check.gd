extends SceneTree
## QA: loads every GDScript in the project so parse errors surface.
## `godot --import` does not report GDScript parse errors, and a scene smoke
## run only loads scripts that some scene references.
##   godot --headless --path <project> -s res://tools/qa/parse_check.gd
## Prints `SCRIPT ERROR` lines for broken scripts and exits 1 if any failed.
## Owned by QA.

const SKIP_DIRS := [".godot", ".worktrees", "build", "node_modules"]


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var files := PackedStringArray()
	_collect("res://", files)
	files.sort()
	var failed := 0
	for path in files:
		var script := ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_REUSE) as Script
		# A script with errors still loads, but cannot be instantiated
		# (abstract classes cannot either, so exclude those).
		if script == null or (not script.can_instantiate() and not script.is_abstract()):
			failed += 1
			printerr("PARSE_CHECK FAIL %s" % path)
	print("PARSE_CHECK %d scripts, %d failed" % [files.size(), failed])
	quit(1 if failed > 0 else 0)


func _collect(dir_path: String, out: PackedStringArray) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	if FileAccess.file_exists(dir_path.path_join(".gdignore")):
		return
	for sub in dir.get_directories():
		if sub.begins_with(".") or sub in SKIP_DIRS:
			continue
		_collect(dir_path.path_join(sub), out)
	for file in dir.get_files():
		if file.ends_with(".gd"):
			out.append(dir_path.path_join(file))
