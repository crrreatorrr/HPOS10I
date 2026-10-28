extends Enemy
## Diver pill robot (tier 3, docs/LEVELS.md): hovers at its post, bobbing.
## When Sproto comes within range below it (and it is on screen), it marks
## the spot where he is, flashes its visor and a target ring there and plays
## the telegraph sound for at least 0.35 s, then swoops in a straight line at
## that spot. It never homes: moving after the telegraph avoids it. It pulls
## back up to its post, rests and can dive again. A jump or roll destroys it
## at any time, the swoop included. Swoop and return speeds, the rest and the
## telegraph scale with the local difficulty. Zone costumes extend this
## script and draw their own look. The origin is the middle of its post.

enum Mode { HOVER, TELEGRAPH, SWOOP, RETURN, REST }

const HALF_LENGTH := 6.0
const RADIUS := 7.0
## Telegraph before a swoop, seconds at difficulty 1.
const TELEGRAPH := 0.6

## How far it notices Sproto: px either side, and px below.
@export var range_x := 128.0
@export var range_y := 224.0
## Swoop and return speeds at difficulty 1, px/frame.
@export var swoop_speed := 4.0
@export var return_speed := 1.5
## Frames it rests at its post after a dive, at difficulty 1.
@export var rest_frames := 90
@export var bob_height := 6.0

var mode := Mode.HOVER
## Where the current (or last) swoop aims, global.
var target := Vector2.ZERO
var _home := Vector2.ZERO
var _timer := 0
var _bob := 0.0
var _facing := -1
var _flap := 0.0


func _ready() -> void:
	_home = global_position


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	_flap += 0.6 if mode == Mode.SWOOP else 0.25
	match mode:
		Mode.HOVER:
			_bob += TAU / 90.0
			global_position = _home + Vector2(0.0, sin(_bob) * bob_height)
			var player := _spot_player()
			if player != null:
				target = player.global_position
				_facing = 1 if target.x > global_position.x else -1
				_set_mode(Mode.TELEGRAPH, telegraph_frames(TELEGRAPH))
				play_telegraph()
		Mode.TELEGRAPH:
			_timer -= 1
			if _timer <= 0:
				_set_mode(Mode.SWOOP, 0)
		Mode.SWOOP:
			if _step_towards(target, move_speed(swoop_speed)):
				_set_mode(Mode.RETURN, 0)
		Mode.RETURN:
			if _step_towards(_home, move_speed(return_speed)):
				_bob = 0.0
				_set_mode(Mode.REST, interval_frames(rest_frames))
		Mode.REST:
			_timer -= 1
			if _timer <= 0:
				_set_mode(Mode.HOVER, 0)


func _set_mode(new_mode: Mode, frames: int) -> void:
	mode = new_mode
	_timer = frames


## Moves `px` towards `point`; true once there.
func _step_towards(point: Vector2, px: float) -> bool:
	var d := point - global_position
	if d.length() <= px:
		global_position = point
		return true
	global_position += d.normalized() * px
	if absf(d.x) > 0.5:
		_facing = 1 if d.x > 0.0 else -1
	return false


## A live player in range below, while this diver is on screen.
func _spot_player() -> Player:
	if not on_screen():
		return null
	var player := nearest_player(range_x + range_y)
	if player == null:
		return null
	var d := player.global_position - global_position
	if absf(d.x) <= range_x and d.y > 8.0 and d.y <= range_y:
		return player
	return null


func is_telegraphing() -> bool:
	return mode == Mode.TELEGRAPH


func is_swooping() -> bool:
	return mode == Mode.SWOOP


func _pop() -> void:
	var colors := _palette()
	LevelFx.pill_pop(get_parent(), global_position, Vector2.RIGHT, HALF_LENGTH, RADIUS,
			colors[2] if _facing > 0 else colors[0], colors[0] if _facing > 0 else colors[2], PillArt.OUTLINE)


## Body colours (PillArt palette); zone costumes override it.
func _palette() -> Array:
	return PillArt.BASIC


func _visor_flash() -> bool:
	return mode == Mode.TELEGRAPH and (_timer / 4) % 2 == 0


## The target ring while telegraphing, in local coordinates.
func _draw_target() -> void:
	if mode != Mode.TELEGRAPH:
		return
	var at := target - global_position
	var color := PillArt.FLASH if (_timer / 4) % 2 == 0 else PillArt.SPIKE
	for k in 8:
		var a := TAU * k / 8.0 + _timer * 0.1
		draw_line(at + Vector2.from_angle(a) * 9.0, at + Vector2.from_angle(a + 0.4) * 9.0, color, 2.0)


func _draw() -> void:
	_draw_target()
	# Two little wings that beat faster in a swoop.
	var beat := sin(_flap)
	for side: float in [-1.0, 1.0]:
		var wing := PackedVector2Array([Vector2(side * 3.0, -RADIUS + 1.0), Vector2(side * 13.0, -RADIUS - 5.0 - beat * 2.0),
				Vector2(side * 9.0, -RADIUS + 2.0)])
		draw_colored_polygon(wing, PillArt.METAL)
		draw_polyline(wing + PackedVector2Array([wing[0]]), PillArt.OUTLINE, 1.0)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(_facing, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, _palette())
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 1.0, 1.0), 6.0, 1, false, _visor_flash())
	draw_set_transform(Vector2.ZERO)
