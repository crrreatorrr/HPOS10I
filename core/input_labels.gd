class_name InputLabels
## Key names as printed on the player's own keyboard. Bindings are by physical
## position (WASD on QWERTY is ZQSD on AZERTY), so UI text must never
## hard-code key names: ask here instead.


## Display servers that can translate a physical key to the layout's key.
## Others (the web, headless) report an error for every query, so there we
## learn labels from the player's real key presses instead.
const NATIVE_LAYOUT_SERVERS := ["Windows", "macOS", "X11", "Wayland"]

## physical keycode -> key_label, learned from real key events.
static var _learned := {}


## Called by Display for every key event, so labels match the player's
## layout even where the display server can't tell us.
static func learn(event: InputEventKey) -> void:
	if event.physical_keycode != KEY_NONE and event.key_label != KEY_NONE:
		_learned[event.physical_keycode] = event.key_label


## The label on the player's keyboard for a key at a physical position.
static func for_physical(physical: Key) -> String:
	if _learned.has(physical):
		return OS.get_keycode_string(_learned[physical])
	if DisplayServer.get_name() in NATIVE_LAYOUT_SERVERS:
		var keycode := DisplayServer.keyboard_get_keycode_from_physical(physical)
		if keycode != KEY_NONE:
			return OS.get_keycode_string(keycode)
	return OS.get_keycode_string(physical)


## Labels of the keyboard keys bound to an action, e.g. "Z/X/C".
static func for_action(action: StringName, max_keys := 3) -> String:
	var labels := PackedStringArray()
	for event in InputMap.action_get_events(action):
		if not event is InputEventKey:
			continue
		var key: Key = event.physical_keycode if event.physical_keycode != KEY_NONE else event.keycode
		labels.append(for_physical(key))
		if labels.size() >= max_keys:
			break
	return "/".join(labels)
