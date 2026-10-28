extends Node2D
## Boot scene. Honors Dev command-line args, then goes to the title screen
## once the UI exists. Until then (or with --dev) it shows a menu of every
## playground, stage and sandbox that is already built.

## Playable demo scenes that ship in the web build.
const PLAYGROUND_DIR := "res://playground"
## Dev-only sandboxes (tests/ never ships).
const SANDBOX_DIR := "res://tests"

var _entries: Array[Dictionary] = []
var _index := 0
var _label: Label


func _ready() -> void:
	var target := Dev.take_boot_target()
	if target.has("scene"):
		if ResourceLoader.exists(target.scene):
			SceneRouter.open_scene(target.scene)
			return
		push_error("[Main] --scene not found: %s" % target.scene)
	elif target.has("zone"):
		SceneRouter.start_zone(target.zone, target.stage)
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
	for path in _find_scenes(PLAYGROUND_DIR, ""):
		_entries.append({
			label = path.get_file().get_basename().capitalize(),
			start = SceneRouter.open_scene.bind(path),
		})
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
	for path in _find_scenes(SANDBOX_DIR, "sandbox"):
		_entries.append({
			label = "Sandbox: %s" % path.trim_prefix(SANDBOX_DIR + "/"),
			start = SceneRouter.open_scene.bind(path),
		})


## Scenes under dir_path whose file name contains name_filter ("" = all).
func _find_scenes(dir_path: String, name_filter: String) -> PackedStringArray:
	var found := PackedStringArray()
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return found
	for sub in dir.get_directories():
		found.append_array(_find_scenes(dir_path.path_join(sub), name_filter))
	for file in dir.get_files():
		var name := file.trim_suffix(".remap")
		# Godot's contains("") is false, so an empty filter must short-circuit.
		if name.ends_with(".tscn") and (name_filter == "" or name.contains(name_filter)):
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
	var lines := PackedStringArray(["HPOS10I  -  early build", ""])
	if _entries.is_empty():
		lines.append("Nothing playable yet.")
	for i in _entries.size():
		var cursor := ">" if i == _index else " "
		var key := str(i + 1) if i < 9 else " "
		lines.append("%s %s  %s" % [cursor, key, _entries[i].label])
	lines.append("")
	lines.append("Up/Down + Jump, or number keys")
	_label.text = "\n".join(lines)
