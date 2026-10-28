extends TestCase
## Touch controls: press and release the normal input actions, multi-touch,
## finger slides, cancel / focus loss / leaving a button release, hidden in
## menus and outside touch mode, the pause button, and thumb-sized hit areas.

const H := preload("res://tests/ui/ui_test_helpers.gd")
const SCENE := "res://ui/touch_controls/touch_controls.tscn"
## A small phone in landscape with browser bars: about 667x320 CSS px, so the
## 424x240 game is scaled by about 1.33.
const SMALL_PHONE_SCALE := 320.0 / 240.0
const MIN_CSS_PX := 48.0

var controls: TouchControls


func before_each() -> void:
	H.clear_scene(tree)
	await tree.process_frame
	H.set_touch_mode(true)
	H.enter_gameplay(self)
	# Display's own (global) instance would press actions too; test a fresh
	# one alone.
	for other in tree.get_nodes_in_group(&"touch_controls"):
		other.process_mode = Node.PROCESS_MODE_DISABLED
	controls = add_scene(SCENE)
	await physics_frames(1)


func after_each() -> void:
	H.reset_pause(tree)
	tree.current_scene = null
	for other in tree.get_nodes_in_group(&"touch_controls"):
		other.process_mode = Node.PROCESS_MODE_ALWAYS
	H.set_touch_mode(false)


func touch(index: int, pos: Vector2, pressed := true, canceled := false) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = pos
	event.pressed = pressed
	event.canceled = canceled
	tree.root.push_input(event, true)
	Input.flush_buffered_events()


func drag(index: int, pos: Vector2) -> void:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = pos
	tree.root.push_input(event, true)
	Input.flush_buffered_events()


func held() -> Array:
	var out := []
	for action in TouchControls.ALL_ACTIONS:
		if Input.is_action_pressed(action):
			out.append(String(action))
	out.sort()
	return out


func pad(offset: Vector2) -> Vector2:
	return TouchControls.PAD_CENTER + offset


func test_pad_presses_and_releases_the_move_actions() -> void:
	var cases := {
		Vector2(30, 0): ["move_right"],
		Vector2(-30, 0): ["move_left"],
		Vector2(0, 30): ["move_down"],
		Vector2(0, -30): ["move_up"],
		Vector2(24, 24): ["move_down", "move_right"],
		Vector2(2, 2): [],  # dead zone
	}
	for offset in cases:
		touch(0, pad(offset))
		assert_eq(held(), cases[offset], "pad %s" % offset)
		touch(0, pad(offset), false)
		assert_eq(held(), [], "released after lifting from %s" % offset)


func test_hold_right_and_tap_jump_together() -> void:
	touch(0, pad(Vector2(30, 0)))
	touch(1, TouchControls.JUMP_CENTER)
	assert_eq(held(), ["jump", "move_right"], "both held at once")
	touch(1, TouchControls.JUMP_CENTER, false)
	assert_eq(held(), ["move_right"], "jump released, right still held")
	touch(1, TouchControls.JUMP_CENTER + Vector2(20, 10))
	assert_eq(held(), ["jump", "move_right"], "tap jump again while running")
	touch(0, pad(Vector2(30, 0)), false)
	touch(1, TouchControls.JUMP_CENTER, false)
	assert_eq(held(), [], "all released")


func test_sliding_switches_direction_without_lifting() -> void:
	touch(0, pad(Vector2(30, 0)))
	drag(0, pad(Vector2(-30, 2)))
	assert_eq(held(), ["move_left"], "slid right -> left")
	drag(0, pad(Vector2(60, 0)))
	assert_eq(held(), ["move_right"], "slid past the pad edge, still steering")
	drag(0, pad(Vector2(4, 40)))
	assert_eq(held(), ["move_down"], "slid down")
	drag(0, Vector2(212, 60))
	assert_eq(held(), [], "slid far away: released")
	drag(0, pad(Vector2(30, 0)))
	assert_eq(held(), ["move_right"], "slid back onto the pad: pressed again")
	touch(0, pad(Vector2(30, 0)), false)
	assert_eq(held(), [], "lifted")


func test_sliding_off_jump_releases_it_and_sliding_on_presses_it() -> void:
	touch(1, TouchControls.JUMP_CENTER)
	assert_eq(held(), ["jump"], "jump pressed")
	drag(1, Vector2(212, 60))
	assert_eq(held(), [], "slid off jump: released")
	drag(1, TouchControls.JUMP_CENTER)
	assert_eq(held(), ["jump"], "slid back onto jump")
	touch(1, TouchControls.JUMP_CENTER, false)


func test_cancel_and_focus_loss_release_everything() -> void:
	touch(0, pad(Vector2(30, 0)))
	touch(1, TouchControls.JUMP_CENTER)
	touch(0, pad(Vector2(30, 0)), false, true)  # cancelled (call, notification)
	assert_eq(held(), ["jump"], "cancelled finger released")
	controls.notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	Input.flush_buffered_events()
	assert_eq(held(), [], "focus loss releases everything")
	touch(0, pad(Vector2(-30, 0)))
	controls.notification(Node.NOTIFICATION_WM_WINDOW_FOCUS_OUT)
	Input.flush_buffered_events()
	assert_eq(held(), [], "window focus loss too")


func test_hidden_and_inert_outside_gameplay() -> void:
	touch(0, pad(Vector2(30, 0)))
	assert_eq(held(), ["move_right"], "pressed in gameplay")
	H.enter_menu(self)
	await physics_frames(2)
	Input.flush_buffered_events()
	assert_true(not controls.visible, "hidden in menus")
	assert_eq(held(), [], "leaving gameplay released the pad")
	touch(1, TouchControls.JUMP_CENTER)
	assert_eq(held(), [], "no presses in menus")
	touch(1, TouchControls.JUMP_CENTER, false)
	H.enter_gameplay(self)
	await physics_frames(2)
	assert_true(controls.visible, "shown again in gameplay")


func test_hidden_outside_touch_mode() -> void:
	assert_true(controls.visible, "shown in touch mode during gameplay")
	touch(0, pad(Vector2(30, 0)))
	assert_eq(held(), ["move_right"], "pad held")
	H.send_key(KEY_X, true)  # a key press switches Display out of touch mode
	H.send_key(KEY_X, false)
	assert_true(not Display.is_touch, "keyboard mode")
	assert_true(not controls.visible, "hidden on the first key press")
	assert_eq(held(), [], "and released what touch held")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = pad(Vector2(30, 0))
	tree.root.push_input(click, true)
	Input.flush_buffered_events()
	assert_eq(held(), [], "the mouse does nothing outside touch mode")
	click = click.duplicate()
	click.pressed = false
	tree.root.push_input(click, true)
	touch(1, TouchControls.JUMP_CENTER)
	assert_true(Display.is_touch, "a touch switches back")
	assert_true(controls.visible, "shown again")
	assert_eq(held(), ["jump"], "and that first touch already counts")
	touch(1, TouchControls.JUMP_CENTER, false)


func test_pause_button_pauses_and_resumes() -> void:
	var menu := H.pause_menu(tree)
	touch(0, pad(Vector2(30, 0)))
	touch(2, TouchControls.PAUSE_CENTER)
	touch(2, TouchControls.PAUSE_CENTER, false)
	assert_true(tree.paused, "the pause button paused the game")
	assert_true(menu.is_open(), "pause menu open")
	await physics_frames(2)
	Input.flush_buffered_events()
	assert_eq(held(), [], "the held pad was released on pause")
	touch(0, pad(Vector2(-30, 0)))
	touch(1, TouchControls.JUMP_CENTER)
	assert_eq(held(), [], "pad and jump are inert while paused")
	touch(0, pad(Vector2(-30, 0)), false)
	touch(1, TouchControls.JUMP_CENTER, false)
	touch(2, TouchControls.PAUSE_CENTER)
	touch(2, TouchControls.PAUSE_CENTER, false)
	await physics_frames(4)
	assert_true(not tree.paused, "the pause button resumed the game")


func test_sliding_into_pause_does_not_pause() -> void:
	touch(1, TouchControls.JUMP_CENTER)
	drag(1, TouchControls.PAUSE_CENTER)
	assert_true(not tree.paused, "only a tap on pause pauses")
	assert_eq(held(), [], "slid off jump")
	touch(1, TouchControls.PAUSE_CENTER, false)


func test_mouse_acts_as_one_finger_without_a_touchscreen() -> void:
	if DisplayServer.is_touchscreen_available():
		return
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = pad(Vector2(30, 0))
	tree.root.push_input(click, true)
	Input.flush_buffered_events()
	assert_eq(held(), ["move_right"], "left click on the pad")
	click = click.duplicate()
	click.pressed = false
	tree.root.push_input(click, true)
	Input.flush_buffered_events()
	assert_eq(held(), [], "released on mouse up")


func test_hit_areas_are_thumb_sized() -> void:
	var min_game_px := MIN_CSS_PX / SMALL_PHONE_SCALE
	assert_true(TouchControls.PAD_HIT_RADIUS * 2.0 >= min_game_px * 2.0, "pad is at least two thumbs wide")
	assert_true(TouchControls.JUMP_HIT_RADIUS * 2.0 >= min_game_px, "jump button")
	assert_true(TouchControls.PAUSE_HIT_RADIUS * 2.0 >= min_game_px, "pause button")
	# Each pad direction alone is wider than a thumb, from the dead zone out.
	var reach := TouchControls.PAD_HIT_RADIUS - TouchControls.PAD_DEAD_ZONE
	assert_true(reach >= min_game_px, "each direction is %.0f game px deep" % reach)
	# The extended zones catch thumbs at the very screen edges too.
	touch(0, Vector2(2, 236))
	assert_true(held().has("move_left") or held().has("move_down"), "bottom-left corner is the pad")
	touch(0, Vector2(2, 236), false)
	touch(1, Vector2(422, 236))
	assert_eq(held(), ["jump"], "bottom-right corner is jump")
	touch(1, Vector2(422, 236), false)


func test_pad_angle_bands() -> void:
	assert_eq(_pad(Vector2(30, 10)), ["move_right"], "shallow: horizontal only")
	assert_eq(_pad(Vector2(-30, -12)), ["move_left"], "shallow left")
	assert_eq(_pad(Vector2(5, 30)), ["move_down"], "steep: vertical only")
	assert_eq(_pad(Vector2(-20, 20)), ["move_left", "move_down"], "diagonal")
	assert_eq(_pad(Vector2(3, -3)), [], "dead zone")


func _pad(offset: Vector2) -> Array:
	return Array(TouchControls.pad_actions(offset)).map(func(a: StringName) -> String: return String(a))
