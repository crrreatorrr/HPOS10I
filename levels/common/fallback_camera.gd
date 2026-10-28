extends Camera2D
## Stand-in follow camera, used by LevelRoot until res://camera/game_camera.tscn
## exists. It offers the same API as GameCamera (docs/CONTRACTS.md) so callers
## work with either:
##   set_level_bounds(rect), lock_to(rect, seconds), unlock(seconds),
##   start_autoscroll(px_per_s), stop_autoscroll(), shake(px, seconds)
## Follows the first node in group `player` with a little look-ahead, and
## stops following while he is dead. The Camera2D limits keep the view inside
## the level bounds (or the locked rect).

const LOOK_AHEAD := 0.14  # seconds of horizontal motion
const LOOK_AHEAD_MAX := 56.0
## Sproto sits this far below the screen centre.
const VERTICAL_BIAS := -16.0

var _target: Node2D
var _bounds := Rect2()
var _locked := false
var _autoscroll := Vector2.ZERO
var _scrolling := false
var _shake_strength := 0.0
var _shake_time := 0.0
var _shake_left := 0.0
var _limit_tween: Tween
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	add_to_group(&"game_camera")
	process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	position_smoothing_enabled = true
	position_smoothing_speed = 9.0
	limit_smoothed = false


func set_level_bounds(rect: Rect2) -> void:
	_bounds = rect
	if not _locked:
		_apply_limits(rect)


func lock_to(rect: Rect2, transition_seconds := 0.5) -> void:
	_locked = true
	_tween_limits(rect, transition_seconds)


func unlock(transition_seconds := 0.5) -> void:
	_locked = false
	_tween_limits(_bounds, transition_seconds)


func start_autoscroll(speed_px_per_s: Vector2) -> void:
	_autoscroll = speed_px_per_s
	_scrolling = true


func stop_autoscroll() -> void:
	_scrolling = false


func shake(strength_px: float, seconds: float) -> void:
	_shake_strength = maxf(_shake_strength, strength_px)
	_shake_time = maxf(seconds, 0.01)
	_shake_left = _shake_time


func _physics_process(delta: float) -> void:
	if _scrolling:
		global_position += _autoscroll * delta
	else:
		_follow()
	if _shake_left > 0.0:
		_shake_left -= delta
		var amount := _shake_strength * maxf(_shake_left / _shake_time, 0.0)
		offset = Vector2(_rng.randf_range(-amount, amount), _rng.randf_range(-amount, amount)).round()
	elif offset != Vector2.ZERO:
		offset = Vector2.ZERO
		_shake_strength = 0.0


func _follow() -> void:
	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group(&"player") as Node2D
		if _target == null:
			return
		global_position = _target.global_position
		reset_smoothing()
	var ahead := 0.0
	if _target is Player:
		var p := _target as Player
		if p.state == &"dead":
			return
		ahead = clampf(p.velocity.x * PhysicsConstants.FPS * LOOK_AHEAD, -LOOK_AHEAD_MAX, LOOK_AHEAD_MAX)
	global_position = _target.global_position + Vector2(ahead, VERTICAL_BIAS)


func _apply_limits(rect: Rect2) -> void:
	limit_left = floori(rect.position.x)
	limit_top = floori(rect.position.y)
	limit_right = ceili(rect.end.x)
	limit_bottom = ceili(rect.end.y)


func _tween_limits(rect: Rect2, seconds: float) -> void:
	if _limit_tween != null:
		_limit_tween.kill()
	if seconds <= 0.0 or not is_inside_tree():
		_apply_limits(rect)
		return
	_limit_tween = create_tween().set_parallel()
	_limit_tween.tween_property(self, ^"limit_left", floori(rect.position.x), seconds)
	_limit_tween.tween_property(self, ^"limit_top", floori(rect.position.y), seconds)
	_limit_tween.tween_property(self, ^"limit_right", ceili(rect.end.x), seconds)
	_limit_tween.tween_property(self, ^"limit_bottom", ceili(rect.end.y), seconds)
