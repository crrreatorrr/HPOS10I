extends TestCase
## The playground's screen layout (QA UI-01/UI-02): it uses the real HUD, the
## control hint follows the input mode, and the hint, the HUD, the F1 panel and
## the touch controls never cover each other.

const PLAYGROUND := "res://playground/physics_playground.tscn"
const HUD_SCENE := "res://ui/hud/hud.tscn"
const TOUCH_SCRIPT := "res://ui/touch_controls/touch_controls.gd"


func after_each() -> void:
	_set_touch(false)


func _skip() -> bool:
	if ResourceLoader.exists(HUD_SCENE) and ResourceLoader.exists(TOUCH_SCRIPT) \
			and tree.root.has_node("Display"):
		return false
	print("  SKIP physics/test_playground_ui.gd: no HUD / touch controls / Display yet")
	return true


func _set_touch(on: bool) -> void:
	var display := tree.root.get_node_or_null("Display")
	if display != null:
		display.call(&"_set_touch_mode", on)


func _open() -> Node:
	var scene := add_scene(PLAYGROUND)
	await physics_frames(2)
	return scene


func _hud(scene: Node) -> CanvasLayer:
	for child in scene.get_children():
		if child is GameHud:
			return child
	return null


## Union of the visible controls under `node` (the HUD's counters block).
func _visible_rect(node: Node) -> Rect2:
	var rect := Rect2()
	for child in node.find_children("*", "Control", true, false):
		var control := child as Control
		if control.is_visible_in_tree() and control.size != Vector2.ZERO:
			rect = control.get_global_rect() if rect.size == Vector2.ZERO else rect.merge(control.get_global_rect())
	return rect


func _screen(scene: Node) -> Rect2:
	return (scene as Node2D).get_viewport_rect()


func test_the_real_hud_replaces_the_own_counter() -> void:
	if _skip():
		return
	var scene := await _open()
	assert_true(_hud(scene) != null, "the playground shows the game HUD")
	assert_true(scene.get(&"_tickets") == null, "no second tickets counter")


func test_keyboard_hint_sits_right_of_the_lives_box() -> void:
	if _skip():
		return
	var scene := await _open()
	var hint: Label = scene.get(&"_hint")
	var lives: Control = _hud(scene).get_node("%Lives")
	assert_true(hint.text.contains("Jump: "), "keyboard keys shown: %s" % hint.text)
	assert_true(not hint.get_global_rect().intersects(lives.get_global_rect()),
			"hint %s clear of the lives box %s" % [hint.get_global_rect(), lives.get_global_rect()])
	assert_true(_screen(scene).encloses(hint.get_global_rect()), "hint on screen: %s" % hint.get_global_rect())


func test_touch_hint_follows_the_input_mode_and_clears_the_controls() -> void:
	if _skip():
		return
	var touch: GDScript = load(TOUCH_SCRIPT)
	var scene := await _open()
	var hint: Label = scene.get(&"_hint")
	var keys := hint.text
	_set_touch(true)
	await physics_frames(1)
	assert_eq(hint.text, scene.get(&"TOUCH_HINT"), "touch hint in touch mode")
	var screen := _screen(scene)
	var pad_zone := Rect2(0, touch.get(&"PAD_ZONE_TOP"), touch.get(&"PAD_ZONE_RIGHT"), screen.size.y)
	var jump_left: float = touch.get(&"JUMP_ZONE_LEFT")
	var jump_zone := Rect2(jump_left, touch.get(&"JUMP_ZONE_TOP"), screen.size.x - jump_left, screen.size.y)
	var rect := hint.get_global_rect()
	assert_true(not rect.intersects(pad_zone) and not rect.intersects(jump_zone),
			"touch hint %s clear of the pad and JUMP zones" % rect)
	assert_true(not rect.intersects(_hud(scene).get_node("%Lives").get_global_rect()), "clear of the lives box")
	assert_true(screen.encloses(rect), "touch hint on screen: %s" % rect)
	_set_touch(false)
	await physics_frames(1)
	assert_eq(hint.text, keys, "keyboard hint again after a key press")


func test_f1_panel_stays_clear_of_the_hud() -> void:
	if _skip():
		return
	var scene := await _open()
	var overlay: Node = scene.get(&"player").get_node("DebugOverlay")
	overlay.call(&"set_overlay_visible", true)
	await physics_frames(2)
	var panel := overlay.find_children("*", "PanelContainer", true, false)[0] as PanelContainer
	var counters := _visible_rect(_hud(scene).get_node("Root/Counters"))
	var rect := panel.get_global_rect()
	overlay.call(&"set_overlay_visible", false)
	assert_true(counters.size != Vector2.ZERO, "HUD counters found")
	assert_true(not rect.intersects(counters), "F1 panel %s clear of the HUD counters %s" % [rect, counters])
	assert_true(_screen(scene).encloses(rect), "F1 panel on screen: %s" % rect)
