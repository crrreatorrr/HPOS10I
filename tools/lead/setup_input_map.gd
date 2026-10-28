extends SceneTree
## Writes the game's input map into project.godot. Re-run after editing:
##   godot --headless --path . -s res://tools/lead/setup_input_map.gd
## Owned by the lead.


func _initialize() -> void:
	var actions := {
		"move_left": [_key(KEY_LEFT), _key(KEY_A), _button(JOY_BUTTON_DPAD_LEFT), _axis(JOY_AXIS_LEFT_X, -1.0)],
		"move_right": [_key(KEY_RIGHT), _key(KEY_D), _button(JOY_BUTTON_DPAD_RIGHT), _axis(JOY_AXIS_LEFT_X, 1.0)],
		"move_up": [_key(KEY_UP), _key(KEY_W), _button(JOY_BUTTON_DPAD_UP), _axis(JOY_AXIS_LEFT_Y, -1.0)],
		"move_down": [_key(KEY_DOWN), _key(KEY_S), _button(JOY_BUTTON_DPAD_DOWN), _axis(JOY_AXIS_LEFT_Y, 1.0)],
		"jump": [
			_key(KEY_Z), _key(KEY_X), _key(KEY_C), _key(KEY_SPACE), _key(KEY_K),
			_button(JOY_BUTTON_A), _button(JOY_BUTTON_B), _button(JOY_BUTTON_X), _button(JOY_BUTTON_Y),
		],
		"pause": [_key(KEY_ENTER), _key(KEY_ESCAPE), _key(KEY_P), _button(JOY_BUTTON_START)],
		"debug_overlay": [_key(KEY_F1)],
	}
	# A 45-degree stick push is 0.71 on both axes. Horizontal triggers at 0.45
	# and vertical only at 0.75, so diagonals read as left/right (running
	# diagonally never crouches or rolls) while a firm down or up still counts.
	var deadzones := {"move_left": 0.45, "move_right": 0.45, "move_up": 0.75, "move_down": 0.75}
	for action in actions:
		ProjectSettings.set_setting("input/" + action, {"deadzone": deadzones.get(action, 0.5), "events": actions[action]})
	var err := ProjectSettings.save()
	print("input map saved: ", error_string(err))
	quit(0 if err == OK else 1)


func _key(code: Key) -> InputEventKey:
	var event := InputEventKey.new()
	event.device = -1
	event.physical_keycode = code
	return event


func _button(button: JoyButton) -> InputEventJoypadButton:
	var event := InputEventJoypadButton.new()
	event.device = -1
	event.button_index = button
	return event


func _axis(axis: JoyAxis, value: float) -> InputEventJoypadMotion:
	var event := InputEventJoypadMotion.new()
	event.device = -1
	event.axis = axis
	event.axis_value = value
	return event
