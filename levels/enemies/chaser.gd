extends "res://levels/enemies/walker.gd"
## Chaser pill robot (tier 2, docs/LEVELS.md): patrols like a walker; when it
## sees Sproto ahead (within SIGHT px, about half a screen, and roughly level
## with it) it flashes its visor for a telegraph, then rushes at him until it
## meets a wall or a ledge or the rush runs out, rests and patrols again.
## Beat it by jumping over it or rolling through it. Patrol and rush speeds,
## the rest time and the telegraph scale with the local difficulty.

enum Mode { PATROL, TELEGRAPH, RUSH, REST }

## How far ahead it notices Sproto (px), and how far above or below.
const SIGHT := 212.0
const SIGHT_HEIGHT := 48.0
## Telegraph before a rush, seconds at difficulty 1.
const TELEGRAPH := 0.5
const RUSH_FRAMES := 90
const REST_FRAMES := 60

## Rush speed at difficulty 1, px/frame.
@export var rush_speed := 3.0

var mode := Mode.PATROL
var _timer := 0


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	if not grounded:
		gravity_step()
		return
	match mode:
		Mode.PATROL:
			patrol_step(move_speed(speed))
			if _sees_player():
				_set_mode(Mode.TELEGRAPH, telegraph_frames(TELEGRAPH))
				play_telegraph()
		Mode.TELEGRAPH:
			_timer -= 1
			if _timer <= 0:
				_set_mode(Mode.RUSH, RUSH_FRAMES)
		Mode.RUSH:
			_timer -= 1
			var step := move_speed(rush_speed) * direction
			if _timer <= 0 or _blocked(step, false):
				_set_mode(Mode.REST, interval_frames(REST_FRAMES))
			else:
				move_along_floor(step)
		Mode.REST:
			_timer -= 1
			if _timer <= 0:
				_home_x = global_position.x
				_set_mode(Mode.PATROL, 0)


func is_telegraphing() -> bool:
	return mode == Mode.TELEGRAPH


func is_rushing() -> bool:
	return mode == Mode.RUSH


func _set_mode(new_mode: Mode, frames: int) -> void:
	mode = new_mode
	_timer = frames


## Sproto ahead (in the way it faces), close and roughly level, and alive.
func _sees_player() -> bool:
	var player := nearest_player(SIGHT + 32.0)
	if player == null:
		return false
	var d := player.global_position - global_position
	return absf(d.x) <= SIGHT and signf(d.x) == direction and absf(d.y + 13.0) <= SIGHT_HEIGHT + 19.0


func _visor_flash() -> bool:
	return mode == Mode.TELEGRAPH and (_timer / 4) % 2 == 0


## A small exhaust flame while rushing.
func _draw_behind_body() -> void:
	if mode != Mode.RUSH:
		return
	var flicker := 3.0 + float(_timer % 3)
	draw_colored_polygon(PackedVector2Array([Vector2(-HALF_LENGTH - RADIUS, -3), Vector2(-HALF_LENGTH - RADIUS - flicker - 3.0, 0),
			Vector2(-HALF_LENGTH - RADIUS, 3)]), PillArt.SPIKE)
