extends RefCounted
## Shared helpers for the UI tests (not a test file itself).

const FAKE_LEVEL_PATH := "res://tests/ui/fake_level.tscn"


## Makes SceneRouter.in_gameplay() true: a stand-in "level" as current scene.
static func enter_gameplay(test: TestCase) -> Node:
	var level := Node2D.new()
	level.name = "FakeLevel"
	level.scene_file_path = FAKE_LEVEL_PATH
	test.add_node(level)
	test.tree.current_scene = level
	return level


## A menu scene as current scene (in_gameplay() is false).
static func enter_menu(test: TestCase) -> Node:
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
	event.physical_keycode = physical
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
