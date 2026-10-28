class_name InputHints
extends RefCounted
## Key lists for on-screen hints, built on InputLabels (core/), which names
## each physical key as printed on the player's keyboard (QWERTY WASD is ZQSD
## on AZERTY): never hard-code key letters in the UI. This adds the hint
## formatting: Esc left out, letters first, "ARROWS / WASD" for movement.

## Esc is bound to pause but browsers keep it for leaving fullscreen, so
## hints never offer it.
const HIDDEN_KEYS: Array[Key] = [KEY_ESCAPE]
const ARROWS: Array[Key] = [KEY_UP, KEY_LEFT, KEY_DOWN, KEY_RIGHT]


## The label printed on the key at this physical position, e.g. "W" ("Z" on
## AZERTY), "SPACE", "ENTER".
static func key_label(physical: Key) -> String:
	return InputLabels.for_physical(physical).to_upper()


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

