extends Node2D
## Sproto's look. Uses the art agent's SpriteFrames when they exist, otherwise
## draws a placeholder in code: a white dog (body, floppy ear, eye, tail) or a
## white ball with a spinning stripe. Rotates with the ground angle, mirrors
## with facing and blinks while invincible. Child of the Player node; local
## origin = hitbox centre.

const FRAMES_PATH := "res://assets/sprites/common/sproto/sproto_frames.tres"
## Feet centre inside a 64x64 frame cell, relative to the cell centre.
const CELL_FEET_OFFSET := 28.0
const BLINK_PERIOD_FRAMES := 4
## Below this ground speed the run cycle shows as a walk.
const WALK_RUN_THRESHOLD := 6.0
## Rotation easing rate (1/s).
const ROTATION_SMOOTHING := 30.0

const WHITE := Color(1, 1, 1)
const OUTLINE := Color(0.16, 0.17, 0.24)
const EAR := Color(0.78, 0.8, 0.86)
const STRIPE := Color(0.62, 0.66, 0.78)
const BLACK := Color(0.05, 0.05, 0.08)
const NOSE := Color(0.2, 0.12, 0.14)

var _player: Player
var _sprite: AnimatedSprite2D
var _spin := 0.0
var _cycle := 0.0
var _frame := 0


func _ready() -> void:
	_player = get_parent() as Player
	if ResourceLoader.exists(FRAMES_PATH):
		var frames := load(FRAMES_PATH) as SpriteFrames
		if frames != null:
			_sprite = AnimatedSprite2D.new()
			_sprite.name = "Sprite"
			_sprite.sprite_frames = frames
			_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			add_child(_sprite)
			move_child(_sprite, 0)


func _process(delta: float) -> void:
	if _player == null:
		return
	_frame += 1
	var speed := absf(_player.ground_speed) if _player.grounded else _player.velocity.length()
	_spin += (4.0 + speed * 1.6) * delta * TAU * 0.25
	_cycle += (0.5 + absf(_player.ground_speed)) * delta * 2.2

	scale.x = float(_player.facing)
	# The sensor angle can step a few degrees when A/B swap on curves; ease the
	# drawn rotation so the body turns smoothly (physics keeps the raw angle).
	var target := -deg_to_rad(_player.ground_angle)
	if is_ball() or _player.state == &"dead":
		rotation = 0.0
	else:
		rotation = lerp_angle(rotation, target, 1.0 - exp(-ROTATION_SMOOTHING * delta))
	visible = not _player.is_invincible() or (_frame / BLINK_PERIOD_FRAMES) % 2 == 0

	if _sprite != null:
		_update_sprite()
	else:
		queue_redraw()


func is_ball() -> bool:
	return _player.is_attacking()


## Name of the animation the current state wants, before fallbacks.
func wanted_animation() -> StringName:
	if _player.pose != &"":
		return _player.pose
	match _player.state:
		&"run":
			return &"run" if absf(_player.ground_speed) >= WALK_RUN_THRESHOLD else &"walk"
		&"idle":
			return &"crouch" if _player.crouching else &"idle"
	return _player.state


## Feet y in local space for the current hitbox.
func feet_y() -> float:
	return _player.get_radii().y


# --- Sprite frames ------------------------------------------------------------

func _update_sprite() -> void:
	var frames := _sprite.sprite_frames
	var anim := wanted_animation()
	var speed_scale := 1.0
	# Derive missing animations as the contract describes.
	if not frames.has_animation(anim):
		match anim:
			&"walk":
				anim = &"run"
				speed_scale = 0.5
			&"roll", &"spindash":
				anim = &"jump"
				speed_scale = 2.0 if _player.state == &"spindash" else 1.0
			&"dead":
				anim = &"hurt"
			&"skid", &"crouch", &"spring":
				anim = &"run" if _player.state == &"spring" else &"idle"
			_:
				anim = &"idle"
	if not frames.has_animation(anim):
		return
	if anim == &"run" and _player.state == &"run":
		speed_scale *= clampf(absf(_player.ground_speed) / 6.0, 0.4, 2.0)
	if _sprite.animation != anim:
		_sprite.play(anim)
	_sprite.speed_scale = speed_scale
	_sprite.position = Vector2(0.0, feet_y() - CELL_FEET_OFFSET)


# --- Placeholder drawing ---------------------------------------------------------

func _draw() -> void:
	if _sprite != null or _player == null:
		return
	if is_ball():
		_draw_ball()
	else:
		_draw_dog()


func _draw_ball() -> void:
	var r := _player.get_radii().y - 1.0
	var center := Vector2(0.0, feet_y() - r - 1.0)
	draw_circle(center, r + 1.0, OUTLINE)
	draw_circle(center, r, WHITE)
	var axis := Vector2.from_angle(_spin) * r * 0.85
	draw_line(center - axis, center + axis, STRIPE, 3.0)
	var cross := axis.orthogonal() * 0.5
	draw_line(center - cross, center + cross, EAR, 2.0)
	if _player.state == &"spindash":
		# Dust puffs behind the ball.
		for i in 3:
			var puff := Vector2(-r - 3.0 - i * 4.0, feet_y() - 3.0 - (i % 2) * 2.0)
			draw_circle(puff, 2.5 - i * 0.5, Color(0.85, 0.85, 0.9, 0.8))


func _draw_dog() -> void:
	var feet := feet_y()
	var state := _player.state
	var crouch := _player.crouching
	var lift := 6.0 if crouch else 0.0
	var lean := 0.0
	if state == &"skid":
		lean = -3.0
	elif state == &"run":
		lean = clampf(absf(_player.ground_speed) * 0.4, 0.0, 3.0)
	var body_c := Vector2(-1.0 + lean * 0.3, feet - 12.0 + lift)
	var head_c := Vector2(6.0 + lean, feet - 24.0 + lift * 1.3)

	# Legs (behind the body).
	var swing := sin(_cycle) * (5.0 if state == &"run" else 0.0)
	var leg_top := feet - 9.0 + lift
	var legs := [
		[Vector2(-5.0, leg_top), Vector2(-5.0 - swing, feet)],
		[Vector2(4.0, leg_top), Vector2(4.0 + swing, feet)],
	]
	if state == &"hurt" or state == &"dead":
		legs = [[Vector2(-5.0, leg_top), Vector2(-10.0, feet - 4.0)],
				[Vector2(4.0, leg_top), Vector2(10.0, feet - 4.0)]]
	elif state == &"spring":
		legs = [[Vector2(-4.0, leg_top), Vector2(-3.0, feet + 2.0)],
				[Vector2(3.0, leg_top), Vector2(4.0, feet + 2.0)]]
	elif state == &"skid":
		legs = [[Vector2(-5.0, leg_top), Vector2(-9.0, feet)], [Vector2(4.0, leg_top), Vector2(1.0, feet)]]
	if crouch:
		legs = [[Vector2(-5.0, leg_top), Vector2(-7.0, feet)], [Vector2(4.0, leg_top), Vector2(7.0, feet)]]
	for leg in legs:
		draw_line(leg[0], leg[1], OUTLINE, 4.5)
		draw_line(leg[0], leg[1], WHITE, 2.5)

	# Tail.
	var wag := sin(_cycle * 1.5) * 2.0
	draw_polyline(PackedVector2Array([body_c + Vector2(-8.0, -2.0),
			body_c + Vector2(-12.0, -6.0 + wag), body_c + Vector2(-13.0, -11.0 + wag)]), OUTLINE, 4.0)
	draw_polyline(PackedVector2Array([body_c + Vector2(-8.0, -2.0),
			body_c + Vector2(-12.0, -6.0 + wag), body_c + Vector2(-13.0, -11.0 + wag)]), WHITE, 2.0)

	# Body and head.
	_draw_ellipse(body_c, Vector2(10.0, 7.0), OUTLINE)
	_draw_ellipse(body_c, Vector2(9.0, 6.0), WHITE)
	draw_circle(head_c, 7.0, OUTLINE)
	draw_circle(head_c, 6.0, WHITE)
	# Snout and nose.
	_draw_ellipse(head_c + Vector2(6.0, 2.0), Vector2(4.5, 3.0), OUTLINE)
	_draw_ellipse(head_c + Vector2(6.0, 2.0), Vector2(3.5, 2.2), WHITE)
	draw_circle(head_c + Vector2(9.5, 1.0), 1.4, NOSE)
	# Eye.
	if state == &"hurt" or state == &"dead":
		draw_line(head_c + Vector2(1.0, -3.0), head_c + Vector2(4.0, 0.0), BLACK, 1.0)
		draw_line(head_c + Vector2(4.0, -3.0), head_c + Vector2(1.0, 0.0), BLACK, 1.0)
	else:
		draw_circle(head_c + Vector2(2.5, -1.5), 1.3, BLACK)
	# Floppy ear hanging over the back of the head.
	var flop := sin(_cycle) * 1.5 if state == &"run" else 0.0
	var ear := PackedVector2Array([head_c + Vector2(-1.0, -6.0), head_c + Vector2(-4.0, -5.0),
			head_c + Vector2(-6.5 - flop, 3.0), head_c + Vector2(-3.0 - flop, 5.0), head_c + Vector2(0.5, -3.0)])
	draw_colored_polygon(ear, EAR)
	draw_polyline(ear + PackedVector2Array([ear[0]]), OUTLINE, 1.0)

	if _player.pose == &"victory":
		# Raised front paw.
		draw_line(body_c + Vector2(6.0, -2.0), head_c + Vector2(8.0, -10.0), OUTLINE, 4.5)
		draw_line(body_c + Vector2(6.0, -2.0), head_c + Vector2(8.0, -10.0), WHITE, 2.5)


func _draw_ellipse(center: Vector2, radii: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in 20:
		var t := TAU * i / 20.0
		points.append(center + Vector2(cos(t) * radii.x, sin(t) * radii.y))
	draw_colored_polygon(points, color)
