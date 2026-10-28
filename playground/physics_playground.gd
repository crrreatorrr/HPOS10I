extends Node2D
## Physics playground. Flat ground with a tunnel and a top-only platform,
## gentle and steep slopes, two loops, a curve run and a quarter pipe, plus a
## test dummy and tickets for hurt / ticket scatter. Respawns Sproto after death.
## Run with `-- --trace` (or `--trace=N`) to print the player's state every 15 (N) frames,
## `--accessory=wizard_hat` (or sunglasses) to preview a zone accessory, and
## `--start=X` to drop Sproto in at x = X (to try one section), `--interp`
## to turn on physics interpolation (smoother motion on 120 Hz+ displays), and
## `--terrain-root=res://some/dir` to try terrain materials from another folder.

## After `died` (about 1 s after kill), wait about 1 s more: about 2 s in all.
const RESPAWN_FRAMES := 60
const HUD_SCENE := "res://ui/hud/hud.tscn"
const TOUCH_HINT := "Pad: move  JUMP: jump  Down+JUMP: spin"
## The touch hint stays clear of the pad and JUMP button (px from each side).
const TOUCH_HINT_LEFT := 110.0
## The keyboard hint starts right of the HUD's lives box and is right-aligned.
const KEY_HINT_LEFT := 74.0
const HINT_MARGIN := 4.0
const HINT_FONT_SIZE := 8
const ROLL_HINT := "Roll: Down"
const LOOK_HINT := "Look: Up/Down"
## Dropped in this order while the keyboard hint is too wide for its space.
const OPTIONAL_HINTS: Array[String] = [LOOK_HINT, ROLL_HINT]
## Terrain materials: assets/terrain/<ART_ZONE>/ (flat colours until they exist).
const ART_ZONE := "z1_retro_rush_hills"
## The camera never shows outside this area.
const LEVEL_BOUNDS := Rect2(-64, -800, 4756, 864)

@onready var player: Player = $Player
@onready var start: Marker2D = $PlayerStart

var _tickets: Label
var _hint: Label
var _respawn_in := -1
var _frame := 0


func _ready() -> void:
	if Dev.args.has("interp"):
		get_tree().physics_interpolation = true
	if Dev.args.has("terrain-root"):
		TerrainArt.material_root = str(Dev.args["terrain-root"])
		TerrainArt.clear_cache()
	for node in find_children("*", "StaticBody2D", true, false):
		if node is CurveTerrain:
			(node as CurveTerrain).set_art_zone(ART_ZONE)
	if Dev.args.has("start"):
		start.global_position = Vector2(float(Dev.args.start), -Tuning.physics.height_radius)
	player.respawn_at(start.global_position)
	($Camera as GameCamera).set_level_bounds(LEVEL_BOUNDS)
	if Dev.args.has("accessory"):
		player.get_node("Visual/Accessory").set_accessory(str(Dev.args.accessory))
	player.died.connect(func() -> void: _respawn_in = RESPAWN_FRAMES)
	var layer := CanvasLayer.new()
	add_child(layer)
	# The real HUD, as LevelRoot adds it; a plain counter if it doesn't exist.
	if ResourceLoader.exists(HUD_SCENE):
		add_child(load(HUD_SCENE).instantiate())
	else:
		_tickets = _hud_label()
		_tickets.position = Vector2(4, 2)
		layer.add_child(_tickets)
	_hint = _hud_label()
	layer.add_child(_hint)
	_refresh_hint()
	Display.touch_mode_changed.connect(_on_touch_mode_changed)


## Control hints: the touch controls in touch mode, otherwise the keys printed
## on the player's own keyboard (keys are bound by physical position, so WASD
## shows as ZQSD on AZERTY).
func _hint_text() -> String:
	if Display.is_touch:
		return TOUCH_HINT
	var move := "".join([InputLabels.for_physical(KEY_W), InputLabels.for_physical(KEY_A),
			InputLabels.for_physical(KEY_S), InputLabels.for_physical(KEY_D)])
	var jump := InputLabels.for_action(&"jump", 1)
	var parts := PackedStringArray(["Move: arrows/" + move, "Jump: " + jump, ROLL_HINT,
			"Spin: Down+" + jump, LOOK_HINT, InputLabels.for_action(&"debug_overlay", 1) + ": debug"])
	for optional in OPTIONAL_HINTS:
		if _hint_width("  ".join(parts)) <= _key_hint_space():
			break
		parts.remove_at(parts.find(optional))
	return "  ".join(parts)


func _hint_width(text: String) -> float:
	var font := _hint.get_theme_font(&"font")
	return font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, HINT_FONT_SIZE).x


func _key_hint_space() -> float:
	return get_viewport_rect().size.x - KEY_HINT_LEFT - HINT_MARGIN


## On the web, labels are learned from key presses (Display calls
## InputLabels.learn), so refresh the hint after each key.
func _input(event: InputEvent) -> void:
	if event is InputEventKey and _hint != null:
		_refresh_hint.call_deferred()


func _on_touch_mode_changed(_touch: bool) -> void:
	_refresh_hint()


func _refresh_hint() -> void:
	var text := _hint_text()
	if text == _hint.text:
		return
	_hint.text = text
	if Display.is_touch:
		# Centred between the touch pad (left) and the JUMP button (right).
		_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_hint.position = Vector2(TOUCH_HINT_LEFT, 226)
		_hint.size = Vector2(get_viewport_rect().size.x - 2.0 * TOUCH_HINT_LEFT, 12)
	else:
		# Right of the HUD's lives box (bottom-left).
		_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		_hint.position = Vector2(KEY_HINT_LEFT, 226)
		_hint.size = Vector2(_key_hint_space(), 12)


func _hud_label() -> Label:
	var label := Label.new()
	label.add_theme_font_size_override(&"font_size", HINT_FONT_SIZE)
	label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	label.add_theme_constant_override(&"outline_size", 3)
	return label


func _physics_process(_delta: float) -> void:
	_frame += 1
	if _tickets != null:
		_tickets.text = "Tickets %d" % GameState.tickets
	if _respawn_in > 0:
		_respawn_in -= 1
		if _respawn_in == 0:
			player.respawn_at(start.global_position)
	if Dev.args.has("trace") and _frame % _trace_interval() == 0:
		var camera := $Camera as GameCamera
		print("[trace] f%d x=%.0f y=%.0f gsp=%.2f v=(%.2f, %.2f) a=%.0f mode=%d %s %s path=%d tickets=%d cam=(%.0f, %.0f) ahead=%.0f look=%.0f" % [
			_frame, player.global_position.x, player.global_position.y, player.ground_speed,
			player.velocity.x, player.velocity.y, player.ground_angle, player.collision_mode,
			player.state, "G" if player.grounded else "air", player.collision_path, GameState.tickets,
			camera.global_position.x, camera.global_position.y, camera.look_ahead, camera.look_shift])


func _trace_interval() -> int:
	var value = Dev.args.get("trace", true)
	return maxi(int(value), 1) if value is String else 15
