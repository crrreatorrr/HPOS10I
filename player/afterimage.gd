extends Node2D
## A short afterimage trail behind Sproto at very high speed. Draws fading
## copies of the current look in world space: the sprite frame when sprite
## frames exist, else simple silhouettes. Purely visual.

## Above this speed (px/frame) the trail shows.
const MIN_SPEED := 10.0
const COPIES := 4
## A copy every this many frames.
const SPACING_FRAMES := 2
const COLOR := Color(0.35, 0.6, 1.0)
const ALPHA := 0.4

var _player: Player
var _visual: Node2D
## Each copy: [position, rotation, facing, ball, age]
var _copies: Array = []
var _frame := 0


func _ready() -> void:
	_player = get_parent() as Player
	_visual = _player.get_node("Visual") as Node2D
	top_level = true
	z_index = -1
	global_transform = Transform2D.IDENTITY


func _physics_process(_delta: float) -> void:
	_frame += 1
	for copy in _copies:
		copy[4] += 1
	_copies = _copies.filter(func(copy: Array) -> bool: return copy[4] < COPIES * SPACING_FRAMES)
	var speed := absf(_player.ground_speed) if _player.grounded else _player.velocity.length()
	if Effects.enabled and speed > MIN_SPEED and _player.state != &"dead" \
			and _frame % SPACING_FRAMES == 0 and _visual.visible:
		_copies.push_front([_player.global_position, _visual.rotation, _player.facing,
				_player.is_attacking(), 0])
	queue_redraw()


func _draw() -> void:
	var sprite := _visual.get_node_or_null("Sprite") as AnimatedSprite2D
	for copy in _copies:
		var fade := ALPHA * (1.0 - float(copy[4]) / (COPIES * SPACING_FRAMES))
		draw_set_transform(copy[0], copy[1], Vector2(copy[2], 1.0))
		if sprite != null and sprite.sprite_frames != null:
			var texture := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
			if texture != null:
				draw_texture(texture, sprite.position - texture.get_size() / 2.0, Color(1, 1, 1, fade))
			continue
		var radii := _player.get_radii()
		if copy[3]:
			draw_circle(Vector2.ZERO, radii.y - 1.0, Color(COLOR, fade))
		else:
			draw_circle(Vector2(1.0, radii.y - 23.0), 8.5, Color(COLOR, fade))
			draw_circle(Vector2(0.0, radii.y - 9.0), 5.5, Color(COLOR, fade))
	draw_set_transform(Vector2.ZERO)
