extends Node2D
## Boot scene. Honors Dev command-line args, then goes to the title screen
## once the UI exists. Until then (or with --dev) it shows a dev menu of
## every stage and sandbox that is already built.

const SANDBOX_DIR := "res://tests"

var _entries: Array[Dictionary] = []
var _index := 0
var _label: Label


func _ready() -> void:
	if Dev.args.has("scene") and ResourceLoader.exists(Dev.args.scene):
		SceneRouter.open_scene(Dev.args.scene)
		return
	if Dev.args.has("zone"):
		SceneRouter.start_zone(Dev.args.zone, int(Dev.args.get("stage", "1")))
		return
	if not Dev.args.has("dev") and ResourceLoader.exists(SceneRouter.TITLE_SCENE):
		SceneRouter.go_title()
		return
	_collect_entries()
	_build_menu()


func _unhandled_input(event: InputEvent) -> void:
	if _entries.is_empty():
		return
	if event.is_action_pressed("ui_down") or event.is_action_pressed("move_down"):
		_index = (_index + 1) % _entries.size()
	elif event.is_action_pressed("ui_up") or event.is_action_pressed("move_up"):
		_index = (_index - 1 + _entries.size()) % _entries.size()
	elif event.is_action_pressed("ui_accept") or event.is_action_pressed("jump"):
		_entries[_index].start.call()
		return
	elif event is InputEventKey and event.pressed and not event.echo:
		var digit: int = event.keycode - KEY_1
		if digit >= 0 and digit < mini(9, _entries.size()):
			_entries[digit].start.call()
			return
	else:
		return
	_refresh()


func _collect_entries() -> void:
	for zone in ZoneRegistry.all_zones(true):
		var stage_count: int = zone.acts.size() + 1
		for stage in range(1, stage_count + 1):
			var path := ZoneRegistry.stage_path(zone.id, stage)
			if path == "" or not ResourceLoader.exists(path):
				continue
			var stage_name := "Boss" if stage > zone.acts.size() else "Act %d" % stage
			if zone.acts.size() == 1 and stage == 1:
				stage_name = ""
			_entries.append({
				label = ("%s %s" % [zone.name, stage_name]).strip_edges(),
				start = SceneRouter.start_zone.bind(zone.id, stage),
			})
	for path in _find_sandboxes(SANDBOX_DIR):
		_entries.append({
			label = "Sandbox: %s" % path.trim_prefix(SANDBOX_DIR + "/"),
			start = SceneRouter.open_scene.bind(path),
		})


func _find_sandboxes(dir_path: String) -> PackedStringArray:
	var found := PackedStringArray()
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return found
	for sub in dir.get_directories():
		found.append_array(_find_sandboxes(dir_path.path_join(sub)))
	for file in dir.get_files():
		var name := file.trim_suffix(".remap")
		if name.ends_with(".tscn") and name.contains("sandbox"):
			found.append(dir_path.path_join(name))
	return found


func _build_menu() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_label = Label.new()
	_label.position = Vector2(16, 12)
	_label.add_theme_font_size_override("font_size", 10)
	layer.add_child(_label)
	_refresh()


func _refresh() -> void:
	var lines := PackedStringArray(["HPOS10I  -  dev menu", ""])
	if _entries.is_empty():
		lines.append("Nothing playable yet.")
	for i in _entries.size():
		var cursor := ">" if i == _index else " "
		var key := str(i + 1) if i < 9 else " "
		lines.append("%s %s  %s" % [cursor, key, _entries[i].label])
	lines.append("")
	lines.append("Up/Down + Jump, or number keys")
	_label.text = "\n".join(lines)
