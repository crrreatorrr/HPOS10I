class_name TouchControls
extends CanvasLayer
## On-screen controls for phones and tablets. The Display autoload adds this
## once, globally; it shows itself only while Display.is_touch (touch devices,
## or `-- --touch`) and SceneRouter.in_gameplay(). Display.touch_mode_changed
## hides it on the first key or gamepad press and shows it again on the next
## touch (touch laptops). On a desktop with `--touch` the mouse acts as one
## finger, for testing.
##
## Left: a D-pad (left/right run, down rolls/crouches/spin dashes, up looks).
## Right: one big JUMP button. Top-right: a small pause button.
##
## Every finger is tracked on its own, so holding right and tapping jump work
## together. A finger that lands on the pad keeps steering while it slides
## (left <-> right switches without lifting) until it moves well away.
## The node presses the normal input actions with InputEventActions, exactly
## like a keyboard would, and releases them when the finger lifts, is
## cancelled or leaves the button, when the game pauses, leaves gameplay or
## leaves touch mode, and when the app loses focus.

enum Zone { NONE, PAD, JUMP, PAUSE }

## Layout in game pixels (the 424x240 viewport). On a phone the game is scaled
## up about 1.4-2x, so 48 game px is 65+ CSS px.
const PAD_CENTER := Vector2(58, 180)
## A finger landing this close to the pad centre takes the pad...
const PAD_HIT_RADIUS := 56.0
## ...and so does one anywhere left of this line below PAD_ZONE_TOP (the screen
## edge and the letterbox bar beside the game on wide phones).
const PAD_ZONE_RIGHT := 96.0
const PAD_ZONE_TOP := 104.0
## A finger already on the pad keeps steering until it is this far away.
const PAD_HOLD_RADIUS := 84.0
const PAD_DEAD_ZONE := 7.0
## Angle from horizontal (degrees): below DIAGONAL_MIN is pure left/right,
## above DIAGONAL_MAX pure up/down, in between both (diagonal).
const PAD_DIAGONAL_MIN := 35.0
const PAD_DIAGONAL_MAX := 58.0
const PAD_DRAW_RADIUS := 34.0

const JUMP_CENTER := Vector2(370, 182)
const JUMP_HIT_RADIUS := 50.0
## Everything right of this line below JUMP_ZONE_TOP is jump too.
const JUMP_ZONE_LEFT := 330.0
const JUMP_ZONE_TOP := 104.0
const JUMP_DRAW_RADIUS := 25.0

const PAUSE_CENTER := Vector2(404, 18)
const PAUSE_HIT_RADIUS := 24.0
const PAUSE_DRAW_SIZE := Vector2(22, 18)

## A finger that slides out of a button is released once it is this much
## outside the hit area (a little slack so thumbs can wobble).
const LEAVE_MARGIN := 8.0

const ACTION_FOR_ZONE := {Zone.JUMP: &"jump", Zone.PAUSE: &"pause"}
const ALL_ACTIONS: Array[StringName] = [
	&"move_left", &"move_right", &"move_up", &"move_down", &"jump", &"pause"]

const COLOR_BASE := Color(0.05, 0.06, 0.18, 0.4)
const COLOR_RIM := Color(1, 1, 1, 0.5)
const COLOR_OUTLINE := Color(0.06, 0.05, 0.14, 0.75)
const COLOR_ARM := Color(0.24, 0.3, 0.6, 0.6)
const COLOR_PRESSED := Color(1.0, 0.8, 0.22, 0.85)
const COLOR_ICON := Color(1, 1, 1, 0.92)
const COLOR_JUMP := Color(0.14, 0.2, 0.5, 0.55)

const FONT := preload("res://ui/font/sproto_bold.fnt")

## touch index -> {zone = Zone, pos = Vector2}
var _fingers := {}
## action -> true for every action this node is holding down right now.
var _held := {}
var _was_paused := false
var _mouse_as_finger := false

@onready var _canvas: Control = $Canvas


## True when the player is using touch (a touch device, the last input was
## a touch, or `-- --touch`).
static func is_enabled() -> bool:
	return Display.is_touch


## Shown and listening: touch mode, during gameplay.
static func is_active() -> bool:
	return Display.is_touch and SceneRouter.in_gameplay()


func _ready() -> void:
	add_to_group(&"touch_controls")
	# Desktop with --touch: let the mouse play the part of one finger.
	_mouse_as_finger = not DisplayServer.is_touchscreen_available()
	_canvas.draw.connect(_draw_controls)
	Display.touch_mode_changed.connect(_on_touch_mode_changed)
	visible = is_active()


func _process(_delta: float) -> void:
	_update_visibility()
	var paused := get_tree().paused
	if paused != _was_paused:
		_was_paused = paused
		if paused:
			release_all()
		_canvas.queue_redraw()


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_WINDOW_FOCUS_OUT, \
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_EXIT_TREE:
			release_all()


func _input(event: InputEvent) -> void:
	if not SceneRouter.in_gameplay():
		return
	if not Display.is_touch:
		# A real touch while in keyboard mode counts at once: Display switches
		# to touch mode on this same event.
		if not (event is InputEventScreenTouch or event is InputEventScreenDrag):
			return
	elif _mouse_as_finger:
		event = _mouse_to_touch(event)
	if event is InputEventScreenTouch:
		if event.pressed:
			_fingers[event.index] = {zone = _zone_at(event.position, true), pos = event.position}
		else:
			_fingers.erase(event.index)  # lifted or cancelled
		_sync()
	elif event is InputEventScreenDrag:
		var finger: Dictionary = _fingers.get(event.index, {zone = Zone.NONE})
		finger.pos = event.position
		finger.zone = _zone_after_slide(finger.zone, event.position)
		_fingers[event.index] = finger
		_sync()


func _update_visibility() -> void:
	var active := is_active()
	if active != visible:
		visible = active
		if not active:
			release_all()


func _on_touch_mode_changed(_is_touch: bool) -> void:
	_update_visibility()


## Releases everything this node holds and forgets every finger.
func release_all() -> void:
	_fingers.clear()
	_sync()


## Actions currently held by touch (for tests and debugging).
func held_actions() -> Array:
	return _held.keys()


func finger_zone(index: int) -> Zone:
	return _fingers.get(index, {zone = Zone.NONE}).zone


## Which control a finger landing (or sliding in) at `pos` belongs to.
func _zone_at(pos: Vector2, allow_pause: bool) -> Zone:
	if allow_pause and _in_pause(pos, 0.0):
		return Zone.PAUSE
	if _in_jump(pos, 0.0):
		return Zone.JUMP
	if _in_pad(pos):
		return Zone.PAD
	return Zone.NONE


func _zone_after_slide(zone: Zone, pos: Vector2) -> Zone:
	match zone:
		Zone.PAD:
			if pos.distance_to(PAD_CENTER) <= PAD_HOLD_RADIUS or _in_pad(pos):
				return Zone.PAD
		Zone.JUMP:
			if _in_jump(pos, LEAVE_MARGIN):
				return Zone.JUMP
		Zone.PAUSE:
			return Zone.PAUSE if _in_pause(pos, LEAVE_MARGIN) else Zone.NONE
	# Sliding into the pad or the jump button presses it (never pause).
	return _zone_at(pos, false)


func _in_pad(pos: Vector2) -> bool:
	return pos.distance_to(PAD_CENTER) <= PAD_HIT_RADIUS \
			or (pos.x <= PAD_ZONE_RIGHT and pos.y >= PAD_ZONE_TOP)


func _in_jump(pos: Vector2, margin: float) -> bool:
	return pos.distance_to(JUMP_CENTER) <= JUMP_HIT_RADIUS + margin \
			or (pos.x >= JUMP_ZONE_LEFT - margin and pos.y >= JUMP_ZONE_TOP - margin)


func _in_pause(pos: Vector2, margin: float) -> bool:
	return pos.distance_to(PAUSE_CENTER) <= PAUSE_HIT_RADIUS + margin


## Directions for a finger on the pad, from its offset to the pad centre.
static func pad_actions(offset: Vector2) -> Array[StringName]:
	var out: Array[StringName] = []
	if offset.length() < PAD_DEAD_ZONE:
		return out
	var angle := rad_to_deg(atan2(absf(offset.y), absf(offset.x)))
	if angle < PAD_DIAGONAL_MAX:
		out.append(&"move_right" if offset.x > 0.0 else &"move_left")
	if angle > PAD_DIAGONAL_MIN:
		out.append(&"move_down" if offset.y > 0.0 else &"move_up")
	return out


## Presses and releases actions so that exactly the wanted ones are held.
func _sync() -> void:
	var wanted := {}
	var paused := is_inside_tree() and get_tree().paused
	for finger in _fingers.values():
		match finger.zone:
			Zone.PAD:
				if not paused:
					for action in pad_actions(finger.pos - PAD_CENTER):
						wanted[action] = true
			Zone.JUMP:
				if not paused:
					wanted[&"jump"] = true
			Zone.PAUSE:
				wanted[&"pause"] = true
	var changed := false
	for action in ALL_ACTIONS:
		if _held.has(action) and not wanted.has(action):
			_held.erase(action)
			_send(action, false)
			changed = true
	for action in ALL_ACTIONS:
		if wanted.has(action) and not _held.has(action):
			_held[action] = true
			_send(action, true)
			changed = true
	if changed and is_node_ready():
		_canvas.queue_redraw()


## Goes through the normal input pipeline: Input state, _input, GUI and
## _unhandled_input all see it, like a key press.
static func _send(action: StringName, pressed: bool) -> void:
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)


func _mouse_to_touch(event: InputEvent) -> InputEvent:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var touch := InputEventScreenTouch.new()
		touch.index = 0
		touch.pressed = event.pressed
		touch.position = event.position
		return touch
	if event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		var drag := InputEventScreenDrag.new()
		drag.index = 0
		drag.position = event.position
		drag.relative = event.relative
		return drag
	return event


# ---------------------------------------------------------------------------
# Drawing (simple pixel shapes at native resolution, so they scale up crisp)


func _draw_controls() -> void:
	var paused := get_tree().paused
	if not paused:
		_draw_pad()
		_draw_jump()
	_draw_pause(paused)


func _draw_pad() -> void:
	var c := PAD_CENTER
	_disc(c, PAD_DRAW_RADIUS, COLOR_BASE)
	_ring(c, PAD_DRAW_RADIUS, COLOR_RIM)
	var arm := 9.0
	var reach := PAD_DRAW_RADIUS - 5.0
	# Dark outline under the cross, then the cross, then the pressed arms.
	_canvas.draw_rect(Rect2(c.x - reach - 1, c.y - arm - 1, reach * 2 + 2, arm * 2 + 2), COLOR_OUTLINE)
	_canvas.draw_rect(Rect2(c.x - arm - 1, c.y - reach - 1, arm * 2 + 2, reach * 2 + 2), COLOR_OUTLINE)
	_canvas.draw_rect(Rect2(c.x - reach, c.y - arm, reach * 2, arm * 2), COLOR_ARM)
	_canvas.draw_rect(Rect2(c.x - arm, c.y - reach, arm * 2, reach * 2), COLOR_ARM)
	var arms := {
		&"move_left": Rect2(c.x - reach, c.y - arm, reach - arm, arm * 2),
		&"move_right": Rect2(c.x + arm, c.y - arm, reach - arm, arm * 2),
		&"move_up": Rect2(c.x - arm, c.y - reach, arm * 2, reach - arm),
		&"move_down": Rect2(c.x - arm, c.y + arm, arm * 2, reach - arm),
	}
	for action in arms:
		if _held.has(action):
			_canvas.draw_rect(arms[action], COLOR_PRESSED)
	var tip := reach - 4.0
	_arrow(c + Vector2(-tip, 0), Vector2.LEFT)
	_arrow(c + Vector2(tip, 0), Vector2.RIGHT)
	_arrow(c + Vector2(0, -tip), Vector2.UP)
	_arrow(c + Vector2(0, tip), Vector2.DOWN)


func _draw_jump() -> void:
	var pressed := _held.has(&"jump")
	var c := JUMP_CENTER + (Vector2(0, 1) if pressed else Vector2.ZERO)
	_disc(c, JUMP_DRAW_RADIUS + 1, COLOR_OUTLINE)
	_disc(c, JUMP_DRAW_RADIUS, COLOR_PRESSED if pressed else COLOR_JUMP)
	_ring(c, JUMP_DRAW_RADIUS, COLOR_RIM)
	_ring(c, JUMP_DRAW_RADIUS - 3, Color(1, 1, 1, 0.18))
	var width := 60.0
	_canvas.draw_string(FONT, Vector2(c.x - width * 0.5, c.y + 4), "JUMP",
			HORIZONTAL_ALIGNMENT_CENTER, width, 8, COLOR_ICON)


func _draw_pause(paused: bool) -> void:
	var pressed := _held.has(&"pause")
	var rect := Rect2(PAUSE_CENTER - PAUSE_DRAW_SIZE * 0.5, PAUSE_DRAW_SIZE)
	_canvas.draw_rect(rect.grow(1), COLOR_OUTLINE)
	_canvas.draw_rect(rect, COLOR_PRESSED if pressed else COLOR_JUMP)
	_canvas.draw_rect(rect, COLOR_RIM, false, 1.0)
	var c := PAUSE_CENTER
	if paused:
		# A "play" triangle: tap again to resume.
		_canvas.draw_colored_polygon(PackedVector2Array([
			c + Vector2(-3, -5), c + Vector2(4, 0), c + Vector2(-3, 5)]), COLOR_ICON)
	else:
		_canvas.draw_rect(Rect2(c.x - 5, c.y - 5, 3, 10), COLOR_ICON)
		_canvas.draw_rect(Rect2(c.x + 2, c.y - 5, 3, 10), COLOR_ICON)


func _arrow(tip: Vector2, dir: Vector2) -> void:
	var side := Vector2(-dir.y, dir.x)
	var back := tip - dir * 5.0
	var points := PackedVector2Array([tip, back + side * 5.0, back - side * 5.0])
	_canvas.draw_colored_polygon(points, COLOR_ICON)


func _disc(center: Vector2, radius: float, color: Color) -> void:
	_canvas.draw_circle(center, radius, color, true, -1.0, false)


func _ring(center: Vector2, radius: float, color: Color) -> void:
	_canvas.draw_arc(center, radius, 0.0, TAU, 48, color, 1.0, false)
