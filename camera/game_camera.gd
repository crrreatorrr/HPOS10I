class_name GameCamera
extends Camera2D
## The game camera, modelled on the classic games. Follows the first node in
## group `player` automatically.
##
## - Horizontal: a narrow deadzone around the screen centre; outside it the
##   camera catches up, capped per frame, so even top-speed Sproto stays on
##   screen. A look-ahead shifts the view in the direction of speed above
##   about top speed, eased in and out.
## - Vertical: on the ground it follows with a speed cap that is low at
##   walking speed and high at high ground speed; in the air it holds still
##   while Sproto is inside a window around the focus.
## - A short horizontal hold after a spin dash release; look up / down after
##   standing still with up (or crouching) for a while.
## - Clamped to the level bounds (a level smaller than the screen is centred),
##   smoothly locked to arenas, autoscroll that pushes Sproto via
##   `Player.clamp_rect`, and a decaying shake.
## - Pixel-perfect: the final position is snapped relative to Sproto's own
##   snapped position, so he never jitters by a pixel at constant speed.
##
## Speeds are in pixels per frame at 60 Hz (classic units), like the player.

## Effectively unbounded clamp rect.
const UNBOUNDED := Rect2(-10000000.0, -10000000.0, 20000000.0, 20000000.0)

@export_group("Horizontal")
## Width of the window around the screen centre in which the camera holds still.
@export var deadzone_width := 16.0
## Fastest horizontal catch-up (px/frame).
@export var max_speed_x := 16.0

@export_group("Look-ahead")
## Largest shift ahead of Sproto (px).
@export var look_ahead_max := 64.0
## Speed (px/frame, ground speed or x speed in the air) where the shift starts.
@export var look_ahead_start_speed := 5.0
## Speed where the shift reaches look_ahead_max.
@export var look_ahead_full_speed := 12.0
## Time the shift takes to settle on a new value (s).
@export var look_ahead_smooth_time := 0.35
## Fastest the shift may change (px/frame).
@export var look_ahead_max_rate := 4.0

@export_group("Vertical")
## Sproto is held this far above the screen centre (shows more below).
@export var vertical_offset := 16.0
## Ground follow cap at walking speed (px/frame).
@export var ground_follow_slow := 6.0
## Ground follow cap at high speed (px/frame).
@export var ground_follow_fast := 16.0
## Ground speed (px/frame) from which the fast cap applies.
@export var fast_follow_ground_speed := 8.0
## In the air the camera holds while Sproto is within this many px above or below the focus.
@export var air_window := 32.0
## Air follow cap (px/frame).
@export var max_speed_y_air := 16.0

@export_group("Spin dash")
## Horizontal hold after a release: this many frames minus half the charge.
@export var spindash_hold_frames := 16

@export_group("Look up and down")
## Frames of holding up (or crouching) while standing still before the view pans.
@export var look_delay_frames := 120
@export var look_up_distance := 104.0
@export var look_down_distance := 88.0
## Pan speed (px/frame), both ways.
@export var look_speed := 2.0

@export_group("Teleports")
## A target jump larger than this (px) in one frame snaps the camera (respawns).
@export var snap_distance := 256.0

## Where the camera wants its centre (before snapping, clamping included).
var focus := Vector2.ZERO
## Current horizontal look-ahead (px).
var look_ahead := 0.0
## Current look up (< 0) / down (> 0) shift (px).
var look_shift := 0.0
## Frames left in the spin dash hold.
var hold_frames := 0

var _target: Node2D
var _bounds := UNBOUNDED
var _locked := false
var _lock_rect := Rect2()
var _clamp_from := UNBOUNDED
var _clamp_to := UNBOUNDED
var _clamp_t := 1.0
var _clamp_duration := 0.0
var _autoscroll := Vector2.ZERO
var _autoscrolling := false
var _shake_strength := 0.0
var _shake_time := 0.0
var _shake_left := 0.0
var _rng := RandomNumberGenerator.new()
var _look_ahead_velocity := 0.0
var _look_dir := 0
var _look_timer := 0
var _last_focus := Vector2.INF
var _last_target := Vector2.INF


## The active game camera, or null.
static func current() -> GameCamera:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		return null
	return tree.get_first_node_in_group(&"game_camera") as GameCamera


func _ready() -> void:
	add_to_group(&"game_camera")
	process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	# Runs after the player has moved this tick.
	process_physics_priority = 100
	position_smoothing_enabled = false
	drag_horizontal_enabled = false
	drag_vertical_enabled = false
	make_current()


# --- Public API (docs/CONTRACTS.md) -----------------------------------------------

## Limits of the level: the camera never shows outside them. A level smaller
## than the screen is centred.
func set_level_bounds(rect: Rect2) -> void:
	_bounds = rect if rect.has_area() else UNBOUNDED
	if not _locked:
		_set_clamp(_bounds, 0.0)


## Moves the limits smoothly to `rect` (boss arenas). The transition starts
## from the area on screen, so the view slides in without a jump.
func lock_to(rect: Rect2, transition_seconds := 0.5) -> void:
	_locked = true
	_lock_rect = rect
	_set_clamp(rect, transition_seconds)


## Returns smoothly to the level bounds.
func unlock(transition_seconds := 0.5) -> void:
	_locked = false
	_set_clamp(_bounds, transition_seconds)


## Scrolls at a fixed speed and keeps the player inside the visible area
## (Player.clamp_rect: pushed by the edge, crushed against walls).
func start_autoscroll(speed_px_per_s: Vector2) -> void:
	_autoscroll = speed_px_per_s
	_autoscrolling = true


func stop_autoscroll() -> void:
	_autoscrolling = false
	_autoscroll = Vector2.ZERO
	var player := _target as Player
	if player != null:
		player.clamp_rect = Rect2()


## A random offset that decays to nothing over `seconds`. Limits are unaffected.
func shake(strength_px: float, seconds: float) -> void:
	if seconds <= 0.0 or strength_px <= 0.0:
		return
	_shake_strength = maxf(strength_px, _shake_strength * _shake_left / maxf(_shake_time, 0.001))
	_shake_time = seconds
	_shake_left = seconds


## The area currently on screen (world space, before shake).
func view_rect() -> Rect2:
	var size := _view_size()
	return Rect2(global_position - size / 2.0, size)


# --- Update -------------------------------------------------------------------------

func _physics_process(delta: float) -> void:
	var frames := delta * PhysicsConstants.FPS
	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group(&"player") as Node2D
		if _target == null:
			return
		var player := _target as Player
		if player != null and not player.state_changed.is_connected(_on_player_state_changed):
			player.state_changed.connect(_on_player_state_changed)
		_snap_to_target()
	_advance_clamp(delta)
	var target := _target.global_position
	if _autoscrolling:
		focus += _autoscroll * delta
	elif target.distance_to(_last_target) > snap_distance:
		_snap_to_target()
	elif not (_target is Player and (_target as Player).state == &"dead"):
		_follow(frames)
	_last_target = target
	focus = _clamp_center(focus, _current_clamp())
	_apply_position()
	_apply_shake(delta)
	if _autoscrolling and _target is Player:
		(_target as Player).clamp_rect = view_rect()


func _follow(frames: float) -> void:
	var target := _target.global_position
	var player := _target as Player

	# Look-ahead in the direction of speed (ground speed on the ground, so it
	# holds steady around loops), eased with a critically damped spring.
	var speed := 0.0
	if player != null:
		speed = player.ground_speed if player.grounded else player.velocity.x
	var span := maxf(look_ahead_full_speed - look_ahead_start_speed, 0.001)
	var wanted := signf(speed) * look_ahead_max * clampf((absf(speed) - look_ahead_start_speed) / span, 0.0, 1.0)
	look_ahead = _smooth_damp(look_ahead, wanted, look_ahead_smooth_time,
			look_ahead_max_rate * PhysicsConstants.FPS, frames / PhysicsConstants.FPS)

	# Horizontal deadzone and capped catch-up (held still after a spin dash).
	if hold_frames > 0:
		hold_frames -= 1
	else:
		var tx := target.x + look_ahead
		var half := deadzone_width / 2.0
		var dx := 0.0
		if tx > focus.x + half:
			dx = tx - (focus.x + half)
		elif tx < focus.x - half:
			dx = tx - (focus.x - half)
		focus.x += clampf(dx, -max_speed_x * frames, max_speed_x * frames)

	# Look up / down.
	_update_look(player, frames)

	# Vertical: capped follow on the ground, a window in the air.
	var ty := target.y + vertical_offset + look_shift
	if player == null or player.grounded:
		var fast := player != null and absf(player.ground_speed) >= fast_follow_ground_speed
		var cap := (ground_follow_fast if fast else ground_follow_slow) * frames
		focus.y += clampf(ty - focus.y, -cap, cap)
	else:
		var dy := 0.0
		if ty > focus.y + air_window:
			dy = ty - (focus.y + air_window)
		elif ty < focus.y - air_window:
			dy = ty - (focus.y - air_window)
		focus.y += clampf(dy, -max_speed_y_air * frames, max_speed_y_air * frames)


func _update_look(player: Player, frames: float) -> void:
	var dir := 0
	if player != null and player.grounded and player.state == &"idle" and player.ground_speed == 0.0:
		if player.crouching:
			dir = 1
		elif Input.is_action_pressed(&"move_up"):
			dir = -1
	if dir != 0 and dir == _look_dir:
		_look_timer += 1
	else:
		_look_dir = dir
		_look_timer = 0
	var wanted := 0.0
	if dir != 0 and _look_timer >= look_delay_frames:
		wanted = look_down_distance if dir > 0 else -look_up_distance
	look_shift = move_toward(look_shift, wanted, look_speed * frames)


func _on_player_state_changed(old: StringName, new: StringName) -> void:
	if old == &"spindash" and new == &"roll":
		# Half the charge is what the release added over the base speed.
		var player := _target as Player
		var extra := absf(player.ground_speed) - Tuning.physics.spindash_base_speed
		hold_frames = maxi(spindash_hold_frames - int(extra), 0)


## Jumps straight to the target (first frame, respawns and other teleports).
func _snap_to_target() -> void:
	focus = _target.global_position + Vector2(0.0, vertical_offset)
	look_ahead = 0.0
	_look_ahead_velocity = 0.0
	look_shift = 0.0
	hold_frames = 0
	_look_timer = 0
	_last_target = _target.global_position
	focus = _clamp_center(focus, _current_clamp())
	_last_focus = Vector2.INF
	reset_physics_interpolation()


## Snaps the final position to whole pixels. While following, it is snapped
## relative to the target's own rounded position, so Sproto keeps the same
## screen pixel at constant speed (no 1 px jitter); when the focus does not
## move, the camera does not move.
func _apply_position() -> void:
	if focus.is_equal_approx(_last_focus):
		return
	var snapped := focus.round()
	if not _autoscrolling and _target != null:
		var anchor := _target.global_position.round()
		snapped = anchor + (focus - _target.global_position).round()
	# Rounding must not show a pixel outside the limits.
	var clamp_rect := _current_clamp()
	var half := _view_size() / 2.0
	for axis in 2:
		if clamp_rect.size[axis] > _view_size()[axis]:
			snapped[axis] = clampf(snapped[axis], ceilf(clamp_rect.position[axis] + half[axis]),
					floorf(clamp_rect.end[axis] - half[axis]))
	global_position = snapped
	_last_focus = focus


func _apply_shake(delta: float) -> void:
	if _shake_left <= 0.0:
		offset = Vector2.ZERO
		return
	var amount := _shake_strength * _shake_left / _shake_time
	offset = Vector2(_rng.randf_range(-1.0, 1.0), _rng.randf_range(-1.0, 1.0)) * amount
	offset = offset.round()
	_shake_left -= delta
	if _shake_left <= 0.0:
		_shake_left = 0.0
		_shake_strength = 0.0
		offset = Vector2.ZERO


# --- Clamping ---------------------------------------------------------------------------

func _set_clamp(rect: Rect2, transition_seconds: float) -> void:
	_clamp_from = view_rect() if transition_seconds > 0.0 and is_inside_tree() else rect
	_clamp_to = rect
	_clamp_duration = transition_seconds
	_clamp_t = 0.0 if transition_seconds > 0.0 else 1.0


func _advance_clamp(delta: float) -> void:
	if _clamp_t < 1.0:
		_clamp_t = minf(_clamp_t + delta / _clamp_duration, 1.0)


## The clamp rect now: eased from where it was to where it is going.
func _current_clamp() -> Rect2:
	if _clamp_t >= 1.0:
		return _clamp_to
	var t := smoothstep(0.0, 1.0, _clamp_t)
	var start := _clamp_from.position.lerp(_clamp_to.position, t)
	var end := _clamp_from.end.lerp(_clamp_to.end, t)
	return Rect2(start, end - start)


func _clamp_center(center: Vector2, rect: Rect2) -> Vector2:
	var size := _view_size()
	for axis in 2:
		if rect.size[axis] <= size[axis]:
			center[axis] = rect.get_center()[axis]
		else:
			center[axis] = clampf(center[axis], rect.position[axis] + size[axis] / 2.0,
					rect.end[axis] - size[axis] / 2.0)
	return center


func _view_size() -> Vector2:
	return get_viewport_rect().size / zoom


## Critically damped approach (no overshoot), frame-rate independent.
func _smooth_damp(current: float, wanted: float, smooth_time: float, max_speed: float, dt: float) -> float:
	smooth_time = maxf(smooth_time, 0.0001)
	var omega := 2.0 / smooth_time
	var x := omega * dt
	var decay := 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
	var change := clampf(current - wanted, -max_speed * smooth_time, max_speed * smooth_time)
	var goal := current - change
	var temp := (_look_ahead_velocity + omega * change) * dt
	_look_ahead_velocity = (_look_ahead_velocity - omega * temp) * decay
	var result := goal + (change + temp) * decay
	if (wanted - current > 0.0) == (result > wanted):
		result = wanted
		_look_ahead_velocity = 0.0
	return result
