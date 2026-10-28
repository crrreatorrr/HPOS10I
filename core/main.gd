extends Node2D
## Boot scene. Honors Dev command-line args, then goes to the title screen
## once the UI exists. Until then (or with --dev) it shows a menu of every
## playground, stage and sandbox that is already built.

## Playable demo scenes that ship in the web build.
const PLAYGROUND_DIR := "res://playground"
## Dev-only sandboxes (tests/ never ships).
const SANDBOX_DIR := "res://tests"

var _entries: Array[Dictionary] = []
var _buttons: Array[Button] = []


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


## Buttons already handle the arrow keys, Enter/Space, mouse and touch.
## This adds the game's own keys: WASD, every jump key and number shortcuts.
func _unhandled_input(event: InputEvent) -> void:
	if _buttons.is_empty():
		return
	var focused := maxi(0, _buttons.find(get_viewport().gui_get_focus_owner()))
	if event.is_action_pressed("move_down", true):
		_buttons[(focused + 1) % _buttons.size()].grab_focus()
	elif event.is_action_pressed("move_up", true):
		_buttons[(focused - 1 + _buttons.size()) % _buttons.size()].grab_focus()
	elif event.is_action_pressed("jump"):
		_start(focused)
	elif event is InputEventKey and event.pressed and not event.echo \
			and event.physical_keycode >= KEY_1 \
			and event.physical_keycode < KEY_1 + mini(9, _buttons.size()):
		# Physical digits: AZERTY keyboards need Shift for the printed digits.
		_start(event.physical_keycode - KEY_1)
	else:
		return
	get_viewport().set_input_as_handled()


func _start(index: int) -> void:
	_entries[index].start.call()


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
	var box := VBoxContainer.new()
	box.position = Vector2(16, 12)
	box.add_theme_constant_override("separation", 3)
	layer.add_child(box)
	box.add_child(_make_label("HPOS10I  -  early build", 12))
	if _entries.is_empty():
		box.add_child(_make_label("Nothing playable yet.", 10))
	for i in _entries.size():
		var button := Button.new()
		button.text = "%d  %s" % [i + 1, _entries[i].label] if i < 9 else _entries[i].label
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.add_theme_font_size_override("font_size", 10)
		# Big enough to hit with a thumb once scaled up on a phone.
		button.custom_minimum_size = Vector2(220, 20)
		button.pressed.connect(_start.bind(i))
		box.add_child(button)
		_buttons.append(button)
	var hint := "Tap an entry to play" if Display.is_touch else "Choose: arrows or %s/%s   Start: %s or Enter" % [
			InputLabels.for_physical(KEY_W), InputLabels.for_physical(KEY_S), InputLabels.for_action(&"jump", 1)]
	box.add_child(_make_label(hint, 9))
	if not _buttons.is_empty():
		_buttons[0].grab_focus.call_deferred()


func _make_label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	return label
