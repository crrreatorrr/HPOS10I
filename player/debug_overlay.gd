extends Node2D
## F1 debug overlay (input action `debug_overlay`). Draws every sensor ray of
## the last physics tick in world space with its hit point, plus the hitbox,
## and a text panel with the player's physics state. Starts visible when the
## game runs with `-- --overlay` so it shows in recordings.

const MODE_NAMES := ["floor", "right wall", "ceiling", "left wall"]
const COLOR_FLOOR := Color(0.2, 1.0, 0.35)  # A/B (and the centre fallback)
const COLOR_CEILING := Color(0.25, 0.65, 1.0)  # C/D (and the centre fallback)
const COLOR_WALL := Color(1.0, 0.3, 0.85)  # E/F
const COLOR_HITBOX := Color(1, 1, 1, 0.6)

var _player: Player
var _layer: CanvasLayer
var _label: Label


func _ready() -> void:
	_player = get_parent() as Player
	top_level = true
	z_index = RenderingServer.CANVAS_ITEM_Z_MAX
	global_transform = Transform2D.IDENTITY
	_layer = CanvasLayer.new()
	_layer.layer = 100
	add_child(_layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(2, 2)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0.55)
	style.set_content_margin_all(3)
	panel.add_theme_stylebox_override(&"panel", style)
	_layer.add_child(panel)
	_label = Label.new()
	_label.add_theme_font_size_override(&"font_size", 8)
	_label.add_theme_constant_override(&"line_spacing", -2)
	panel.add_child(_label)
	set_overlay_visible(Dev.args.has("overlay"))


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"debug_overlay"):
		set_overlay_visible(not visible)
		get_viewport().set_input_as_handled()


func set_overlay_visible(on: bool) -> void:
	visible = on
	_layer.visible = on


func _process(_delta: float) -> void:
	if not visible or _player == null:
		return
	global_transform = Transform2D.IDENTITY
	var gsp := _player.ground_speed
	var vel := _player.velocity
	_label.text = "\n".join([
		"gsp %7.3f   x %7.3f  y %7.3f" % [gsp, vel.x, vel.y],
		"angle %6.1f   mode %s" % [_player.ground_angle, MODE_NAMES[_player.collision_mode]],
		"state %s%s   grounded %s" % [_player.state, " (crouch)" if _player.crouching else "",
				"yes" if _player.grounded else "no"],
		"path %s   lock %d   charge %.2f" % ["A" if _player.collision_path == Player.PATH_A else "B",
				_player.control_lock, _player.spindash_charge],
		"fps %d" % Engine.get_frames_per_second(),
	])
	queue_redraw()


func _draw() -> void:
	if _player == null:
		return
	for cast: Dictionary in _player.sensors.casts:
		var color := _color_for(cast.label)
		var faded := Color(color, 0.35)
		draw_line(cast.from, cast.to, faded if not cast.hit else color, 1.0)
		if cast.hit:
			draw_rect(Rect2(cast.point - Vector2(1.5, 1.5), Vector2(3, 3)), color)
	var r := _player.get_radii()
	var center := _player.global_position
	draw_rect(Rect2(center - r, r * 2.0), COLOR_HITBOX, false, 1.0)
	draw_circle(center, 1.5, Color.WHITE)


func _color_for(label: String) -> Color:
	match label:
		"A", "B", "AB":
			return COLOR_FLOOR
		"C", "D", "CD":
			return COLOR_CEILING
	return COLOR_WALL
