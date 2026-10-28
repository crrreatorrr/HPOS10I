extends RefCounted
## Shared helpers for the UI tests (not a test file itself).

const FAKE_LEVEL_PATH := "res://tests/ui/fake_level.tscn"


## Frees whatever earlier tests left under the root (scenes that a scene
## change made current, a level's respawn landing on the title, ...). The
## runner doesn't reset them, and a leftover menu or level would draw over
## this test's UI and catch its taps and clicks. Autoloads stay.
static func clear_scene(tree: SceneTree) -> void:
	tree.current_scene = null
	for child in tree.root.get_children():
		if not ProjectSettings.has_setting("autoload/" + child.name) and not child.is_queued_for_deletion():
			child.queue_free()


## Frees only the current scene (a stand-in or a scene change's result).
static func drop_current_scene(tree: SceneTree) -> void:
	var scene := tree.current_scene
	tree.current_scene = null
	if scene != null and is_instance_valid(scene) and not scene.is_queued_for_deletion():
		scene.queue_free()


## Makes SceneRouter.in_gameplay() true: a stand-in "level" as current scene.
static func enter_gameplay(test: TestCase) -> Node:
	drop_current_scene(test.tree)
	var level := Node2D.new()
	level.name = "FakeLevel"
	level.scene_file_path = FAKE_LEVEL_PATH
	test.add_node(level)
	test.tree.current_scene = level
	return level


## A menu scene as current scene (in_gameplay() is false).
static func enter_menu(test: TestCase) -> Node:
	drop_current_scene(test.tree)
	var menu := Node2D.new()
	menu.name = "FakeMenu"
	menu.scene_file_path = SceneRouter.MAIN_SCENE
	test.add_node(menu)
	test.tree.current_scene = menu
	return menu


static func pause_menu(tree: SceneTree) -> PauseMenu:
	return tree.get_first_node_in_group(&"pause_menu") as PauseMenu


## Sends an action event through the real input pipeline (Input state,
## _input, GUI, _unhandled_input), right now.
static func send_action(action: StringName, pressed: bool) -> void:
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)
	Input.flush_buffered_events()


static func send_key(physical: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	# A real key event carries both (a US layout: label = position).
	event.physical_keycode = physical
	event.keycode = physical
	event.key_label = physical
	event.pressed = pressed
	Input.parse_input_event(event)
	Input.flush_buffered_events()


## Taps the pause action (press + release).
static func tap_pause() -> void:
	send_action(&"pause", true)
	send_action(&"pause", false)


static func reset_pause(tree: SceneTree) -> void:
	tree.paused = false
	var menu := pause_menu(tree)
	if menu != null and menu.is_open():
		menu.call(&"_close")


## Switches Display's touch mode (emits touch_mode_changed like real input).
static func set_touch_mode(touch: bool) -> void:
	Display.call(&"_set_touch_mode", touch)
