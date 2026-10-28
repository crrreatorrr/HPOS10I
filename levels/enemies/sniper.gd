extends Enemy
## Sniper pill robot (tier 4, docs/LEVELS.md): a fixed turret. When Sproto is
## in range, in its line of sight and far enough away (at least MIN_RANGE),
## it locks the spot where he stands, lights its sight for a long telegraph
## (TELEGRAPH, never under 0.35 s) with the telegraph sound, then fires a
## burst of BURST shots in straight lines at that spot. Aimed attacks lock
## their target when the telegraph starts (docs/LEVELS.md fairness), so
## running at the flash always avoids them. Terrain between it and the spot
## at telegraph start cancels the attack; shots pop on terrain. It never
## fires from off screen. A jump or roll destroys it at any time. Zone
## costumes extend this script and draw their own look. The origin is the
## middle of its base, on the floor or ceiling it is mounted on.

enum Mode { IDLE, TELEGRAPH, FIRING, REST }

const SHOT := "res://levels/enemies/shot.tscn"
const HALF_LENGTH := 5.0
const RADIUS := 7.0
const BODY_Y := -14.0
## Telegraph before a burst, seconds at difficulty 1 (>= 0.6 s base).
const TELEGRAPH := 0.8
const BURST := 3
## Frames between the shots of a burst.
const BURST_GAP := 10
## Rest after a burst, frames at difficulty 1.
const REST_FRAMES := 120
## Never fires at a target closer than this (so the flash can be outrun).
const MIN_RANGE := 192.0

@export var range := 448.0
## Shot speed at difficulty 1, px/frame.
@export var shot_speed := 4.0

var mode := Mode.IDLE
## Where the current (or last) burst aims, global.
var target := Vector2.ZERO
var _timer := 0
var _shots_left := 0
var _aim := Vector2.RIGHT


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	match mode:
		Mode.IDLE:
			var player := _spot_player()
			if player != null:
				target = player.global_position
				_aim = (target - muzzle()).normalized()
				_set_mode(Mode.TELEGRAPH, telegraph_frames(TELEGRAPH))
				play_telegraph()
			else:
				var watched := nearest_player(range)
				if watched != null:
					_aim = (watched.global_position - muzzle()).normalized()
		Mode.TELEGRAPH:
			_timer -= 1
			if _timer <= 0:
				_shots_left = BURST
				_set_mode(Mode.FIRING, 0)
		Mode.FIRING:
			if _timer <= 0 and _shots_left > 0:
				fire()
				_shots_left -= 1
				_timer = BURST_GAP
			elif _shots_left <= 0:
				_set_mode(Mode.REST, interval_frames(REST_FRAMES))
			_timer -= 1
		Mode.REST:
			_timer -= 1
			if _timer <= 0:
				_set_mode(Mode.IDLE, 0)


func _set_mode(new_mode: Mode, frames: int) -> void:
	mode = new_mode
	_timer = frames


## The shot origin, global.
func muzzle() -> Vector2:
	return global_position + Vector2(0.0, BODY_Y)


## A live player in range, at least MIN_RANGE away, in line of sight, while
## this sniper is on screen.
func _spot_player() -> Player:
	if not on_screen():
		return null
	var player := nearest_player(range)
	if player == null:
		return null
	var d := player.global_position - muzzle()
	if d.length() < MIN_RANGE or d.length() > range:
		return null
	if not has_line_of_sight(player.global_position):
		return null
	return player


func has_line_of_sight(point: Vector2) -> bool:
	var query := PhysicsRayQueryParameters2D.create(muzzle(), point, WALL_MASK)
	return get_world_2d().direct_space_state.intersect_ray(query).is_empty()


func fire() -> Node2D:
	if not ResourceLoader.exists(SHOT):
		return null
	var shot: Node2D = (load(SHOT) as PackedScene).instantiate()
	shot.set(&"velocity", _aim * move_speed(shot_speed))
	shot.position = muzzle() + _aim * (RADIUS + 6.0)
	get_parent().add_child(shot)
	shot.reset_physics_interpolation()
	return shot


func is_telegraphing() -> bool:
	return mode == Mode.TELEGRAPH


func is_firing() -> bool:
	return mode == Mode.FIRING


func _pop() -> void:
	var colors := _palette()
	LevelFx.pill_pop(get_parent(), muzzle(), Vector2.UP, HALF_LENGTH, RADIUS, colors[0], colors[2], PillArt.OUTLINE)


## Body colours (PillArt palette); zone costumes override it.
func _palette() -> Array:
	return PillArt.BASIC


func _flash() -> bool:
	return mode == Mode.TELEGRAPH and (_timer / 3) % 2 == 0


## The aiming line while telegraphing, in local coordinates.
func _draw_sight() -> void:
	if mode != Mode.TELEGRAPH:
		return
	var from := Vector2(0.0, BODY_Y)
	var to := target - global_position
	var color := PillArt.FLASH if _flash() else PillArt.SPIKE
	var n := int(from.distance_to(to) / 12.0)
	for k in n:
		var a := from.lerp(to, float(k) / maxf(n, 1))
		var b := from.lerp(to, (float(k) + 0.5) / maxf(n, 1))
		draw_line(a, b, Color(color, 0.7), 1.0)
	for k in 8:
		var ang := TAU * k / 8.0 + _timer * 0.1
		draw_line(to + Vector2.from_angle(ang) * 8.0, to + Vector2.from_angle(ang + 0.4) * 8.0, color, 2.0)


func _draw() -> void:
	_draw_sight()
	# Base plate, a barrel along the aim, an upright capsule with its visor.
	draw_rect(Rect2(-8.0, -3.0, 16.0, 3.0), PillArt.OUTLINE)
	draw_rect(Rect2(-7.0, -2.0, 14.0, 1.0), PillArt.METAL_DARK)
	var barrel := Vector2(0.0, BODY_Y)
	draw_line(barrel, barrel + _aim * 14.0, PillArt.OUTLINE, 5.0)
	draw_line(barrel, barrel + _aim * 14.0, PillArt.FLASH if _flash() else PillArt.METAL, 3.0)
	draw_set_transform(Vector2(0.0, BODY_Y), -PI * 0.5, Vector2.ONE)
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1, _palette())
	draw_set_transform(Vector2.ZERO)
	PillArt.draw_visor(self, Vector2(0.0, BODY_Y - HALF_LENGTH - 1.0), 8.0, 1, false, _flash())
