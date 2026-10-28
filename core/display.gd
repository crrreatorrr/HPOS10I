extends Node
## Screen-level behaviour shared by every scene:
## - pixel-perfect integer scaling on desktop when the window is big enough,
##   fractional scaling on touch devices and small windows;
## - a "rotate your device" hint on touch devices held in portrait;
## - global overlays that must exist in every gameplay scene: the touch
##   controls and the pause menu (owned by the UI agent, added here when their
##   scenes exist so levels, bosses and playgrounds all get them for free).

const TOUCH_CONTROLS_SCENE := "res://ui/touch_controls/touch_controls.tscn"
const PAUSE_MENU_SCENE := "res://ui/pause/pause_menu.tscn"
## Below this multiple of the base size, integer scaling would leave large
## borders, so fractional scaling is used instead.
const MIN_INTEGER_SCALE := 2
## Integer scaling is only used when it fills at least this share of what
## fractional scaling would (e.g. a 1080p browser window under 960 px tall
## would otherwise drop to 3x and use half the window).
const MIN_INTEGER_COVERAGE := 0.85
const OVERLAY_LAYER := 100

## Emitted when the player switches between touch and keyboard/gamepad.
signal touch_mode_changed(is_touch: bool)

## True on touch devices (and with --touch). Flips to false on the first key
## or gamepad press and back to true on the next touch, so touch laptops get
## the right controls for how they're being used.
var is_touch := false

var _rotate_hint: CanvasLayer


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	is_touch = DisplayServer.is_touchscreen_available() or Dev.args.has("touch")
	get_tree().root.size_changed.connect(_on_window_resized)
	_build_rotate_hint()
	# Always added; the touch controls show themselves only while is_touch.
	_add_overlay(TOUCH_CONTROLS_SCENE)
	_add_overlay(PAUSE_MENU_SCENE)
	_on_window_resized()


func _input(event: InputEvent) -> void:
	if event is InputEventKey:
		InputLabels.learn(event)
	if event is InputEventScreenTouch and event.pressed:
		_set_touch_mode(true)
	elif (event is InputEventKey or event is InputEventJoypadButton) and event.pressed:
		_set_touch_mode(false)


func _set_touch_mode(touch: bool) -> void:
	if touch == is_touch:
		return
	is_touch = touch
	_on_window_resized()
	touch_mode_changed.emit(is_touch)


func _on_window_resized() -> void:
	var root := get_tree().root
	root.content_scale_stretch = choose_stretch(Vector2(root.size), Vector2(root.content_scale_size), is_touch)
	_rotate_hint.visible = is_touch and root.size.y > root.size.x


## Integer scaling keeps every game pixel the same size, which pixel art needs.
## Touch devices and small windows use fractional scaling so the game fills
## the screen instead of shrinking to 1x with big borders.
static func choose_stretch(window: Vector2, base: Vector2, touch: bool) -> Window.ContentScaleStretch:
	var fractional := minf(window.x / base.x, window.y / base.y)
	var integer := floorf(fractional)
	var use_integer := not touch and integer >= MIN_INTEGER_SCALE \
			and integer / fractional >= MIN_INTEGER_COVERAGE
	return Window.CONTENT_SCALE_STRETCH_INTEGER if use_integer \
			else Window.CONTENT_SCALE_STRETCH_FRACTIONAL


## Adds a UI scene once, above every level. Overlays decide for themselves
## when to show (e.g. the pause menu only during gameplay).
func _add_overlay(path: String) -> void:
	if ResourceLoader.exists(path):
		add_child(load(path).instantiate())


func _build_rotate_hint() -> void:
	_rotate_hint = CanvasLayer.new()
	_rotate_hint.layer = OVERLAY_LAYER + 10
	_rotate_hint.visible = false
	add_child(_rotate_hint)
	var shade := ColorRect.new()
	shade.color = Color(0.07, 0.08, 0.12, 0.92)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rotate_hint.add_child(shade)
	var label := Label.new()
	label.text = "Turn your device sideways to play"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 12)
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rotate_hint.add_child(label)
