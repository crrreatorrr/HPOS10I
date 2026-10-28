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
	_hint = _hud_label()
	_hint.text = _hint_text()
	_hint.position = Vector2(4, 226)
	layer.add_child(_hint)
	# Top-right: the F1 debug panel uses the top-left corner.
	_tickets = _hud_label()
	_tickets.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_tickets.position = Vector2(get_viewport_rect().size.x - 84.0, 2)
	_tickets.size = Vector2(80, 12)
	layer.add_child(_tickets)


## Control hints with the keys printed on the player's own keyboard (keys are
## bound by physical position, so WASD shows as ZQSD on AZERTY).
func _hint_text() -> String:
	var move := "".join([InputLabels.for_physical(KEY_W), InputLabels.for_physical(KEY_A),
			InputLabels.for_physical(KEY_S), InputLabels.for_physical(KEY_D)])
	var jump := InputLabels.for_action(&"jump", 1)
	return "Move: arrows/%s  Jump: %s  Roll: Down  Spin: Down+%s  Look: Up/Down  %s: debug" % [
			move, jump, jump, InputLabels.for_action(&"debug_overlay", 1)]


## On the web, labels are learned from key presses (Display calls
## InputLabels.learn), so refresh the hint after each key.
func _input(event: InputEvent) -> void:
	if event is InputEventKey and _hint != null:
		_refresh_hint.call_deferred()


func _refresh_hint() -> void:
	var text := _hint_text()
	if text != _hint.text:
		_hint.text = text


func _hud_label() -> Label:
	var label := Label.new()
	label.add_theme_font_size_override(&"font_size", 8)
	label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	label.add_theme_constant_override(&"outline_size", 3)
	return label


func _physics_process(_delta: float) -> void:
	_frame += 1
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
