extends Node2D
## Sproto's look. Uses the art agent's SpriteFrames when they exist, otherwise
## draws a placeholder in code after docs/DESIGN.md: a round head split blue /
## yellow with 2-3 soft upward spikes growing only from the blue back half
## (the yellow face half stays smooth), big round eyes, a red clown nose and grin, a
## small blue body with yellow accents, a red collar with a golden-ticket
## badge, and short arms and legs; or, in the ball states, a blue ball with a
## yellow half and a red nose dot. Rotates with the ground angle, mirrors with
## facing and blinks while invincible. Child of the Player node; local origin =
## hitbox centre, feet at +height radius.

const FRAMES_PATH := "res://assets/sprites/common/sproto/sproto_frames.tres"
## Golden Sproto art. Missing until the 16-bit pass; the placeholder swaps
## BLUE/YELLOW for GOLD/GOLD_DARK in the meantime.
const GOLDEN_FRAMES_PATH := "res://assets/sprites/common/sproto/golden_sproto_frames.tres"
## Feet centre inside a 64x64 frame cell, relative to the cell centre.
const CELL_FEET_OFFSET := 28.0
const BLINK_PERIOD_FRAMES := 4
## Rotation easing rate (1/s).
const ROTATION_SMOOTHING := 30.0
## Placeholder head size, and how far its centre sits above the feet.
const HEAD_RADIUS := 8.5
const HEAD_HEIGHT := 23.0

## Head spikes as [base, tip] from the head centre (facing right): all on the
## blue back half (x < 0), pointing up, at most a slight outward lean.
const SPIKES := [
	[Vector2(-2.6, -7.0), Vector2(-2.4, -13.5)],
	[Vector2(-5.2, -5.4), Vector2(-6.0, -12.0)],
	[Vector2(-7.0, -3.0), Vector2(-8.0, -9.4)],
]
const SPIKE_HALF_WIDTH := 2.2

const OUTLINE := Color(0.1, 0.11, 0.2)
const BLUE := Color(0.22, 0.52, 1.0)
const BLUE_SHADE := Color(0.12, 0.34, 0.78)
const YELLOW := Color(1.0, 0.84, 0.2)
const RED := Color(0.93, 0.18, 0.2)
const GOLD := Color(1.0, 0.78, 0.16)
const GOLD_DARK := Color(0.7, 0.45, 0.05)
const WHITE := Color(1, 1, 1)
const BLACK := Color(0.04, 0.04, 0.07)

var _player: Player
var _sprite: AnimatedSprite2D
var _base_frames: SpriteFrames
var _shown_skin := ""
var _body_color := BLUE
var _face_color := YELLOW
var _shade_color := BLUE_SHADE
var _nose_color := RED
## Frames of the walk cycle and of the rolling ball.
const WALK_FRAMES := 6
const ROLL_FRAMES := 8

## Current frame of the walk/run or roll cycle, advanced on physics ticks at
## the Guide's rate (see frame_ticks()).
var anim_frame := 0
var _ticks_left := 0
var _spin := 0.0
var _cycle := 0.0


func _ready() -> void:
	_player = get_parent() as Player
	if ResourceLoader.exists(FRAMES_PATH):
		var frames := load(FRAMES_PATH) as SpriteFrames
		if frames != null:
			_base_frames = frames
			_sprite = AnimatedSprite2D.new()
			_sprite.name = "Sprite"
			_sprite.sprite_frames = frames
			_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			add_child(_sprite)
			move_child(_sprite, 0)


## Ticks each animation frame is shown for, from the community Physics
## Guide: walking and running max(0, 8 - |gsp|) + 1, rolling
## max(0, 4 - |gsp|) + 1 (|gsp| truncated to whole pixels), so the feet turn
## faster the faster he goes, as in the classics. The spin dash spins at the
## full rate.
static func frame_ticks(state: StringName, ground_speed: float) -> int:
	var speed := int(absf(ground_speed))
	match state:
		&"run", &"skid":
			return maxi(0, 8 - speed) + 1
		&"roll", &"jump":
			return maxi(0, 4 - speed) + 1
		&"spindash":
			return 1
	return 0


func _physics_process(_delta: float) -> void:
	if _player == null:
		return
	var speed := _player.ground_speed if _player.grounded else _player.velocity.x
	var ticks := frame_ticks(_player.state, speed)
	if ticks == 0:
		return
	if _ticks_left <= 1:
		anim_frame += 1
		_ticks_left = ticks
	else:
		_ticks_left -= 1


func _process(delta: float) -> void:
	if _player == null:
		return
	_apply_skin()
	# The placeholder's leg swing and ball spin follow the frame counter.
	_cycle = TAU * float(anim_frame % WALK_FRAMES) / WALK_FRAMES
	_spin = TAU * float(anim_frame % ROLL_FRAMES) / ROLL_FRAMES

	scale.x = float(_player.facing)
	# The sensor angle can step a few degrees when A/B swap on curves; ease the
	# drawn rotation so the body turns smoothly (physics keeps the raw angle).
	var target := -deg_to_rad(_player.ground_angle)
	if is_ball() or _player.state == &"dead":
		rotation = 0.0
	else:
		rotation = lerp_angle(rotation, target, 1.0 - exp(-ROTATION_SMOOTHING * delta))
	# Blink by physics ticks of invincibility left, the same at any refresh rate.
	visible = not _player.is_invincible() \
			or posmod(_player.invincible_frames_left(), BLINK_PERIOD_FRAMES * 2) < BLINK_PERIOD_FRAMES

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
			return &"run" if absf(_player.ground_speed) >= Tuning.physics.top_speed else &"walk"
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
	if _sprite.animation != anim:
		_sprite.play(anim)
	# Walk, run and roll frames step at the Guide's rate (frame_ticks());
	# the other animations keep the rate in the SpriteFrames.
	if frame_ticks(_player.state, _player.ground_speed) > 0 and _player.pose == &"":
		_sprite.speed_scale = 0.0
		_sprite.frame = anim_frame % maxi(frames.get_frame_count(anim), 1)
	else:
		_sprite.speed_scale = speed_scale
	_sprite.position = Vector2(0.0, feet_y() - CELL_FEET_OFFSET)


# --- Placeholder drawing ---------------------------------------------------------

func _skin() -> String:
	return str(RelicLoadout.resolve().get("skin", ""))


## Golden uses golden_sproto_frames.tres when it exists. Otherwise the base
## frames pick up a gold tint, and the placeholder swaps blue/yellow for gold.
func _apply_skin() -> void:
	var skin := _skin()
	match skin:
		"golden":
			_body_color = GOLD
			_face_color = GOLD_DARK
			_shade_color = GOLD_DARK
			_nose_color = RED
		"nobu":
			_body_color = Color(0.95, 0.88, 0.74)
			_face_color = Color(0.98, 0.93, 0.84)
			_shade_color = Color(0.55, 0.36, 0.2)
			_nose_color = BLACK
		_:
			_body_color = BLUE
			_face_color = YELLOW
			_shade_color = BLUE_SHADE
			_nose_color = RED
	if _sprite == null or skin == _shown_skin:
		return
	_shown_skin = skin
	if skin == "golden" and ResourceLoader.exists(GOLDEN_FRAMES_PATH):
		var frames := load(GOLDEN_FRAMES_PATH) as SpriteFrames
		if frames != null:
			_sprite.sprite_frames = frames
			_sprite.modulate = Color.WHITE
			return
	if _base_frames != null:
		_sprite.sprite_frames = _base_frames
	match skin:
		"golden":
			_sprite.modulate = Color(1.05, 0.84, 0.38)
		"nobu":
			_sprite.modulate = Color(1.0, 0.86, 0.68)
		_:
			_sprite.modulate = Color.WHITE


func _draw() -> void:
	if _sprite != null or _player == null:
		return
	_apply_skin()
	if is_ball():
		_draw_ball()
	else:
		_draw_sproto()


func _draw_ball() -> void:
	var r := _player.get_radii().y - 1.0
	var center := Vector2(0.0, feet_y() - r - 1.0)
	draw_circle(center, r + 1.0, OUTLINE)
	draw_circle(center, r, _body_color)
	# Yellow half and red nose dot, spinning with the ball.
	var half := PackedVector2Array()
	for i in 13:
		half.append(center + Vector2.from_angle(_spin + PI * i / 12.0) * r)
	draw_colored_polygon(half, _face_color)
	draw_circle(center + Vector2.from_angle(_spin + PI * 0.5) * r * 0.55, 2.2, _nose_color)
	if _player.state == &"spindash":
		# Dust puffs behind the ball.
		for i in 3:
			var puff := Vector2(-r - 3.0 - i * 4.0, feet_y() - 3.0 - (i % 2) * 2.0)
			draw_circle(puff, 2.5 - i * 0.5, Color(0.85, 0.85, 0.9, 0.8))


## Head centre of the placeholder (local space, facing right), for the
## accessory overlay.
func head_point() -> Vector2:
	var feet := feet_y()
	if is_ball():
		# On top of the ball, so a hat sits on it.
		return Vector2(1.0, feet - _player.get_radii().y * 2.0 + HEAD_RADIUS - 1.0)
	return _head_center(feet)


func _lean() -> float:
	if _player.state == &"skid":
		return -2.5
	if _player.state == &"run":
		return clampf(absf(_player.ground_speed) * 0.35, 0.0, 2.5)
	return 0.0


func _head_center(feet: float) -> Vector2:
	var drop := 6.0 if _player.crouching else 0.0
	return Vector2(1.0 + _lean(), feet - HEAD_HEIGHT + drop)


func _draw_sproto() -> void:
	var feet := feet_y()
	var state := _player.state
	var head := _head_center(feet)
	var body := Vector2(_lean() * 0.4, feet - 9.0 + (3.0 if _player.crouching else 0.0))
	var hurt := state == &"hurt" or state == &"dead"

	# Legs and yellow shoes.
	var swing := sin(_cycle) * (4.0 if state == &"run" else 0.0)
	var legs := [[-2.5, -2.5 - swing], [2.5, 2.5 + swing]]
	if hurt:
		legs = [[-2.5, -6.0], [2.5, 6.0]]
	elif state == &"skid":
		legs = [[-2.5, -5.0], [2.5, 0.0]]
	elif _player.crouching:
		legs = [[-2.5, -4.0], [2.5, 4.0]]
	for leg in legs:
		var top := body + Vector2(leg[0], 3.0)
		var foot := Vector2(leg[1], feet - 1.5)
		draw_line(top, foot, OUTLINE, 4.0)
		draw_line(top, foot, _body_color, 2.2)
		_draw_ellipse(foot + Vector2(1.0, 0.0), Vector2(2.6, 1.6), OUTLINE)
		_draw_ellipse(foot + Vector2(1.0, 0.0), Vector2(2.0, 1.1), _face_color)

	# Body with a yellow belly.
	_draw_ellipse(body, Vector2(5.8, 5.6), OUTLINE)
	_draw_ellipse(body, Vector2(4.9, 4.7), _body_color)
	_draw_ellipse(body + Vector2(1.5, 0.8), Vector2(2.3, 2.8), _face_color)

	# Short arms.
	var arm_swing := -swing * 0.6
	var arms := [[Vector2(-3.5, -1.5), Vector2(-6.5, 2.5 - arm_swing)],
			[Vector2(3.5, -1.5), Vector2(6.5, 2.5 + arm_swing)]]
	if state == &"spring" or _player.pose == &"victory":
		arms[1] = [Vector2(3.5, -1.5), Vector2(6.0, -8.0)]
	if hurt:
		arms = [[Vector2(-3.5, -1.5), Vector2(-7.5, -5.0)], [Vector2(3.5, -1.5), Vector2(7.5, -5.0)]]
	for arm in arms:
		draw_line(body + arm[0], body + arm[1], OUTLINE, 3.6)
		draw_line(body + arm[0], body + arm[1], _body_color, 1.8)
		draw_circle(body + arm[1], 1.4, _face_color)

	# Red collar with a tiny golden-ticket badge.
	var collar := Vector2(body.x, head.y + HEAD_RADIUS)
	draw_line(collar + Vector2(-4.5, 0.0), collar + Vector2(4.5, 0.0), OUTLINE, 3.6)
	draw_line(collar + Vector2(-4.0, 0.0), collar + Vector2(4.0, 0.0), RED, 2.2)
	draw_rect(Rect2(collar + Vector2(1.0, -0.5), Vector2(3.0, 2.2)), GOLD_DARK)
	draw_rect(Rect2(collar + Vector2(1.5, 0.0), Vector2(2.0, 1.2)), GOLD)

	# Soft upward spikes, only on the blue back half (the yellow face half has
	# none). The Nobu suit replaces them with ears (player/cape.gd).
	if _skin() != "nobu":
		for spike in SPIKES:
			_draw_spike(head + spike[0], head + spike[1], OUTLINE, 1.0)
		for spike in SPIKES:
			_draw_spike(head + spike[0], head + spike[1], _body_color, 0.0)

	# Round head, split down the middle: blue back half, yellow face half.
	draw_circle(head, HEAD_RADIUS + 1.0, OUTLINE)
	_draw_half_disc(head, HEAD_RADIUS, PI, _body_color)
	_draw_half_disc(head, HEAD_RADIUS, 0.0, _face_color)

	# Big round eyes: white, black pupil looking ahead, white shine.
	for eye in [[Vector2(1.0, -2.0), 3.0], [Vector2(5.5, -2.0), 2.6]]:
		var c: Vector2 = head + eye[0]
		var r: float = eye[1]
		draw_circle(c, r + 0.7, OUTLINE)
		draw_circle(c, r, WHITE)
		if hurt:
			draw_line(c + Vector2(-1.2, -1.2), c + Vector2(1.2, 1.2), BLACK, 1.0)
			draw_line(c + Vector2(1.2, -1.2), c + Vector2(-1.2, 1.2), BLACK, 1.0)
		else:
			draw_circle(c + Vector2(0.8, 0.3), r * 0.48, BLACK)
			draw_circle(c + Vector2(0.2, -0.6), r * 0.2, WHITE)

	# Wide red grin (a simple curve) and a round red clown nose.
	var grin := head + Vector2(3.0, 1.0)
	if hurt:
		draw_arc(grin + Vector2(0.0, 4.5), 3.0, PI * 1.2, PI * 1.8, 8, RED, 1.4)
	else:
		draw_arc(grin, 4.5, PI * 0.15, PI * 0.85, 10, RED, 1.6)
	draw_circle(head + Vector2(8.0, 0.8), 2.6, OUTLINE)
	draw_circle(head + Vector2(8.0, 0.8), 2.0, _nose_color)
	draw_circle(head + Vector2(7.5, 0.2), 0.6, Color(1.0, 0.7, 0.7))


## One soft spike from `base` to `tip`: a tapered blade with a rounded tip, its
## back edge shaded darker. `grow` widens it (for the outline pass).
func _draw_spike(base: Vector2, tip: Vector2, color: Color, grow: float) -> void:
	var along := (tip - base).normalized()
	var side := along.orthogonal()
	var half := SPIKE_HALF_WIDTH + grow
	var blade := PackedVector2Array([base + side * half, tip + side * (0.9 + grow * 0.5),
			tip - side * (0.9 + grow * 0.5), base - side * half])
	draw_colored_polygon(blade, color)
	draw_circle(tip, 1.1 + grow, color)
	if grow == 0.0:
		# Shade the back (head-outward) edge.
		var back := side if side.x < 0.0 else -side
		draw_colored_polygon(PackedVector2Array([base + back * half, tip + back * 0.9,
				tip, base]), _shade_color)


## Filled half disc: the half on the side of `facing_angle` (radians).
func _draw_half_disc(center: Vector2, r: float, facing_angle: float, color: Color) -> void:
	var points := PackedVector2Array()
	for i in 17:
		points.append(center + Vector2.from_angle(facing_angle - PI * 0.5 + PI * i / 16.0) * r)
	draw_colored_polygon(points, color)


func _draw_ellipse(center: Vector2, radii: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in 20:
		var t := TAU * i / 20.0
		points.append(center + Vector2(cos(t) * radii.x, sin(t) * radii.y))
	draw_colored_polygon(points, color)
