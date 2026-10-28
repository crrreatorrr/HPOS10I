class_name InputHints
extends RefCounted
## Key names for on-screen hints. Keys are bound by physical position, so the
## printed name must come from the player's keyboard layout (QWERTY WASD is
## ZQSD on AZERTY): never hard-code key letters in the UI.

## Lead-owned helper with the same job; used as soon as it lands on main.
const LEAD_LABELS := "res://core/input_labels.gd"
## Esc is bound to pause but browsers keep it for leaving fullscreen, so
## hints never offer it.
const HIDDEN_KEYS: Array[Key] = [KEY_ESCAPE]
const ARROWS: Array[Key] = [KEY_UP, KEY_LEFT, KEY_DOWN, KEY_RIGHT]


## The label printed on the key at this physical position, e.g. "W" ("Z" on
## AZERTY), "SPACE", "ENTER".
static func key_label(physical: Key) -> String:
	# LEAD-REQUEST: core/input_labels.gd (InputLabels.for_physical) is not on
	# main yet; this falls back to the DisplayServer layout lookup until it is.
	var lead := _lead_labels()
	if lead != null:
		return str(lead.call(&"for_physical", physical)).to_upper()
	var logical := DisplayServer.keyboard_get_label_from_physical(physical)
	if logical == KEY_NONE:
		logical = physical
	return OS.get_keycode_string(logical).to_upper()


## Physical keys bound to an action, in InputMap order (hidden keys left out).
static func keys_for(action: StringName) -> Array[Key]:
	var keys: Array[Key] = []
	if not InputMap.has_action(action):
		return keys
	for event in InputMap.action_get_events(action):
		var key := event as InputEventKey
		if key == null:
			continue
		var code: Key = key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
		if code != KEY_NONE and not code in HIDDEN_KEYS and not code in keys:
			keys.append(code)
	return keys


## "Z X C SPACE K": every key for an action, single letters first.
static func action_keys(action: StringName, separator := " ") -> String:
	var labels := PackedStringArray()
	var long := PackedStringArray()
	for code in keys_for(action):
		var label := key_label(code)
		if label.length() == 1:
			labels.append(label)
		else:
			long.append(label)
	labels.append_array(long)
	return separator.join(labels)


## "ARROWS / WASD": the arrow keys plus the letter keys for up/left/down/right.
static func move_keys() -> String:
	var letters := ""
	var has_arrows := true
	for action in [&"move_up", &"move_left", &"move_down", &"move_right"]:
		var keys := keys_for(action)
		has_arrows = has_arrows and keys.any(func(k: Key) -> bool: return k in ARROWS)
		for code in keys:
			if not code in ARROWS:
				letters += key_label(code)
				break
	if has_arrows and letters != "":
		return "ARROWS / " + letters
	return "ARROWS" if has_arrows else letters


static func _lead_labels() -> GDScript:
	if not ResourceLoader.exists(LEAD_LABELS):
		return null
	var script := load(LEAD_LABELS) as GDScript
	if script == null:
		return null
	for method in script.get_script_method_list():
		if method.name == "for_physical":
			return script
	return null
