extends Enemy
## Dropper pill robot (tier 4, docs/LEVELS.md): hangs upright from the ceiling
## by a short chain. When Sproto moves in under it (within `trigger_width`,
## and within `trigger_depth` below), it shakes and plays the telegraph sound
## for at least 0.35 s, then the chain snaps and it drops straight down. It is
## destroyed when it lands (no score), or by a jump or roll at any time.
## Fair spawns: it never drops because Sproto (re)spawned under it. He must
## move in from outside, and it ignores everyone for its first `arm_frames`.
## Fall speed and telegraph scale with the local difficulty. Zone costumes
## extend this script and draw their own look. The origin is the middle of the
## capsule while it hangs.

signal landed

enum Mode { HANGING, SHAKING, FALLING }

const HALF_LENGTH := 5.0
const RADIUS := 7.0
## Telegraph before the drop, seconds at difficulty 1.
const TELEGRAPH := 0.5
const DROP_MAX := 10.0

@export var trigger_width := 56.0
@export var trigger_depth := 320.0
## Frames after it appears during which it can't be triggered.
@export var arm_frames := 60
## Length of the chain up to the ceiling, px (drawn only).
@export var chain := 16.0

var mode := Mode.HANGING
var _age := 0
var _timer := 0
var _was_under := true


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	_age += 1
	match mode:
		Mode.HANGING:
			var under := _player_under()
			if under and not _was_under and _age > arm_frames:
				mode = Mode.SHAKING
				_timer = telegraph_frames(TELEGRAPH)
				play_telegraph()
			_was_under = under
		Mode.SHAKING:
			_timer -= 1
			if _timer <= 0:
				mode = Mode.FALLING
				fall_speed = 0.0
		Mode.FALLING:
			fall_speed = minf(fall_speed + GRAVITY * Difficulty.speed_mult(local_difficulty()), DROP_MAX)
			var bottom := HALF_LENGTH + RADIUS
			var floor_y := _floor_under(fall_speed + bottom + 1.0)
			if floor_y != INF and floor_y - bottom <= global_position.y + fall_speed:
				global_position.y = floor_y - bottom
				landed.emit()
				_break()
				return
			global_position.y += fall_speed


## True when a live player is in the trigger zone below.
func _player_under() -> bool:
	for node in get_tree().get_nodes_in_group(&"player"):
		var player := node as Player
		if player == null or player.state == &"dead":
			continue
		var d := player.global_position - global_position
		if absf(d.x) <= trigger_width / 2.0 and d.y > 0.0 and d.y <= trigger_depth:
			return true
	return false


func _floor_under(reach: float) -> float:
	var query := PhysicsRayQueryParameters2D.create(global_position, global_position + Vector2(0.0, reach), TERRAIN_MASK)
	query.hit_from_inside = false
	var hit := get_world_2d().direct_space_state.intersect_ray(query)
	return INF if hit.is_empty() else (hit.position as Vector2).y


## Breaks on landing: the pop without a score.
func _break() -> void:
	if not alive:
		return
	alive = false
	Audio.play_sfx(&"enemy_pop")
	_pop()
	set_deferred(&"monitoring", false)
	set_deferred(&"monitorable", false)
	destroyed.emit()
	hide()
	queue_free()


func is_telegraphing() -> bool:
	return mode == Mode.SHAKING


func is_falling() -> bool:
	return mode == Mode.FALLING


func _pop() -> void:
	var colors := _palette()
	LevelFx.pill_pop(get_parent(), global_position, Vector2.UP, HALF_LENGTH, RADIUS, colors[0], colors[2], PillArt.OUTLINE)


## Body colours (PillArt palette); zone costumes override it.
func _palette() -> Array:
	return PillArt.BASIC


func _shake() -> Vector2:
	return Vector2(float(_timer % 2) * 2.0 - 1.0, 0.0) if mode == Mode.SHAKING else Vector2.ZERO


func _draw() -> void:
	var shake := _shake()
	var top := -HALF_LENGTH - RADIUS
	if mode != Mode.FALLING:
		# The chain up to the ceiling.
		var k := 0.0
		while k < chain:
			draw_rect(Rect2(Vector2(-1.5, top - k - 4.0) + shake * 0.5, Vector2(3.0, 4.0)), PillArt.OUTLINE)
			draw_rect(Rect2(Vector2(-0.5, top - k - 3.0) + shake * 0.5, Vector2(1.0, 2.0)), PillArt.METAL)
			k += 4.0
	draw_set_transform(shake, -PI * 0.5, Vector2.ONE)
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, _palette())
	draw_set_transform(Vector2.ZERO)
	PillArt.draw_visor(self, shake + Vector2(0.0, 2.0), 8.0, 2, false, mode == Mode.SHAKING and (_timer / 3) % 2 == 0)
