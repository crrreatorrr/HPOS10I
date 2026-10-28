extends PlayerArea
## A falling book (Wizard Academy hazard): a heavy book floating under a high
## shelf. When Sproto passes beneath it (within `trigger_width` and
## `trigger_depth` below) it shakes, rustles its pages and plays the
## telegraph sound for Difficulty.telegraph(telegraph_seconds, local), never
## under 0.35 s, then drops. Falling, it hurts him on contact unless he is
## jumping or rolling (then it bursts harmlessly). It bursts on landing.
## Fair spawns: it only drops when Sproto moves in under it, never because
## he (re)spawned there: a player already underneath when it appears must
## leave and come back, and it ignores everyone for its first `arm_frames`.
## Not an enemy: no score. Layer 8 (hazards), mask 5 (player).
## The origin is the middle of the book.

signal telegraphed
signal landed

enum State { HANGING, SHAKING, FALLING }

const SIZE := Vector2(20.0, 14.0)
const GRAVITY := 0.21875
const MAX_FALL := 8.0
const TERRAIN_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY
const COVER := Color(0.42, 0.24, 0.66)
const COVER_LIGHT := Color(0.6, 0.38, 0.86)
const PAGES := Color(0.98, 0.93, 0.8)
const GOLD := Color(0.98, 0.8, 0.3)
const OUTLINE := Color(0.14, 0.1, 0.2)

@export var trigger_width := 48.0
@export var trigger_depth := 320.0
@export var telegraph_seconds := 0.5
## Frames after it appears during which it can't be triggered.
@export var arm_frames := 60

var state := State.HANGING
var fall_speed := 0.0
var _age := 0
var _timer := 0
var _was_under := true
var _done := false
var _d := NAN


func _ready() -> void:
	collision_layer = LAYER_HAZARDS
	monitorable = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = SIZE
	shape.shape = rect
	add_child(shape)
	_was_under = _player_under()


func _physics_process(_delta: float) -> void:
	if _done:
		return
	_age += 1
	queue_redraw()
	match state:
		State.HANGING:
			var under := _player_under()
			if under and not _was_under and _age > arm_frames:
				state = State.SHAKING
				_timer = 0
				telegraphed.emit()
				LevelFx.play_telegraph()
			_was_under = under
		State.SHAKING:
			_timer += 1
			if _timer >= warning():
				state = State.FALLING
		State.FALLING:
			for player in players_inside():
				if player.state == &"dead":
					continue
				if not player.is_attacking():
					player.hurt(global_position)
				burst()
				return
			fall_speed = minf(fall_speed + GRAVITY, MAX_FALL)
			var floor_y := _floor_below(fall_speed + SIZE.y / 2.0 + 1.0)
			if floor_y != INF and floor_y - SIZE.y / 2.0 <= global_position.y + fall_speed:
				global_position.y = floor_y - SIZE.y / 2.0
				landed.emit()
				burst()
				return
			global_position.y += fall_speed


## True when a live player is within the trigger zone below.
func _player_under() -> bool:
	for node in get_tree().get_nodes_in_group(&"player"):
		var player := node as Player
		if player == null or player.state == &"dead":
			continue
		var d := player.global_position - global_position
		if absf(d.x) <= trigger_width / 2.0 and d.y > 0.0 and d.y <= trigger_depth:
			return true
	return false


func is_telegraphing() -> bool:
	return state == State.SHAKING


func is_falling() -> bool:
	return state == State.FALLING


func local_difficulty() -> float:
	if is_nan(_d):
		_d = LevelDifficulty.at(self)
	return _d


func warning() -> int:
	return LevelDifficulty.telegraph_frames(telegraph_seconds, local_difficulty())


## Bursts into loose pages and disappears.
func burst() -> void:
	if _done:
		return
	_done = true
	LevelFx.debris(get_parent(), Rect2(global_position - SIZE / 2.0, SIZE), PAGES, COVER, 6)
	set_deferred(&"monitoring", false)
	set_deferred(&"monitorable", false)
	hide()
	queue_free()


func _floor_below(reach: float) -> float:
	var from := global_position
	var query := PhysicsRayQueryParameters2D.create(from, from + Vector2(0.0, reach), TERRAIN_MASK)
	query.hit_from_inside = false
	var hit := get_world_2d().direct_space_state.intersect_ray(query)
	return INF if hit.is_empty() else (hit.position as Vector2).y


func _draw() -> void:
	var shake := Vector2(float(_timer % 2) * 2.0 - 1.0, 0.0) if state == State.SHAKING else Vector2.ZERO
	var half := SIZE / 2.0
	var r := Rect2(-half + shake, SIZE)
	draw_rect(r.grow(1.0), OUTLINE)
	draw_rect(r, COVER)
	draw_rect(Rect2(r.position, Vector2(SIZE.x, 2.0)), COVER_LIGHT)
	# Page edges on the open side, and a gold clasp.
	draw_rect(Rect2(r.position + Vector2(SIZE.x - 4.0, 2.0), Vector2(3.0, SIZE.y - 4.0)), PAGES)
	draw_rect(Rect2(r.position + Vector2(3.0, SIZE.y / 2.0 - 1.0), Vector2(4.0, 2.0)), GOLD)
	if state == State.SHAKING and (_timer / 3) % 2 == 0:
		# Pages flutter out of the top.
		draw_line(r.position + Vector2(6.0, -1.0), r.position + Vector2(9.0, -5.0), PAGES, 1.0)
		draw_line(r.position + Vector2(12.0, -1.0), r.position + Vector2(15.0, -4.0), PAGES, 1.0)
