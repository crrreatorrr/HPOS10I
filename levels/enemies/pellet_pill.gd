extends Enemy
## Pellet pill robot (tier 2, docs/LEVELS.md): stands still, turns towards
## Sproto when he is in range, and fires a slow pellet along the ground after
## a telegraph (its cannon glows). Jump the pellet, or hit the pill between
## shots. It only shoots while on screen. Shot interval, pellet speed and
## telegraph scale with the local difficulty. The node origin is its feet.

const PELLET := "res://levels/enemies/pellet.tscn"
const HALF_LENGTH := 5.0
const RADIUS := 7.0
const BODY_Y := -14.0
## Telegraph before each shot, seconds at difficulty 1.
const TELEGRAPH := 0.6
## How far it notices Sproto (px across, and up or down).
const RANGE_Y := 64.0

## Frames between shots at difficulty 1.
@export var fire_interval := 150
## Pellet speed at difficulty 1, px/frame.
@export var pellet_speed := 2.0
@export var shot_range := 320.0
@export_enum("Left:-1", "Right:1") var facing := -1

var _timer := 0
var _recoil := 0
## Where Sproto stood when the telegraph started (aimed costumes throw there).
var aim := Vector2.ZERO


func _ready() -> void:
	facing = -1 if facing < 0 else 1


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	if _recoil > 0:
		_recoil -= 1
	if not grounded:
		gravity_step()
		return
	var target := _target()
	if target == null:
		_timer = 0
		return
	if not is_telegraphing():
		facing = 1 if target.global_position.x > global_position.x else -1
	_timer += 1
	if _timer == interval_frames(fire_interval) - telegraph_frames(TELEGRAPH):
		aim = target.global_position  # aimed attacks lock their target at telegraph start
		play_telegraph()
	if _timer >= interval_frames(fire_interval):
		_timer = 0
		fire()


## Sproto when he is in range and the pill is on screen (no shots from off-screen).
func _target() -> Player:
	if not on_screen():
		return null
	var player := nearest_player(shot_range + RANGE_Y)
	if player == null:
		return null
	var d := player.global_position - global_position
	if absf(d.x) > shot_range or absf(d.y - BODY_Y) > RANGE_Y:
		return null
	return player


func is_telegraphing() -> bool:
	return _target() != null and _timer >= interval_frames(fire_interval) - telegraph_frames(TELEGRAPH)


func fire() -> Node2D:
	if not ResourceLoader.exists(PELLET):
		return null
	var pellet: Node2D = (load(PELLET) as PackedScene).instantiate()
	pellet.set(&"direction", facing)
	pellet.set(&"speed", move_speed(pellet_speed))
	pellet.position = global_position + Vector2(facing * (HALF_LENGTH + RADIUS + 4.0), 0.0)
	get_parent().add_child(pellet)
	pellet.reset_physics_interpolation()
	_recoil = 6
	return pellet


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position + Vector2(0.0, BODY_Y), Vector2.UP,
			HALF_LENGTH, RADIUS, PillArt.WHITE, PillArt.MINT, PillArt.OUTLINE)


func _draw() -> void:
	var recoil := -float(_recoil) * 0.5
	# Squat base plate and a cannon tube pointing at Sproto, glowing before a shot.
	draw_rect(Rect2(-7, -3, 14, 3), PillArt.OUTLINE)
	draw_rect(Rect2(-6, -2, 12, 1), PillArt.METAL_DARK)
	var glow := is_telegraphing() and (_timer / 3) % 2 == 0
	draw_set_transform(Vector2(0.0, -6.0), 0.0, Vector2(facing, 1.0))
	draw_rect(Rect2(2.0 + recoil, -3.0, 11.0, 6.0), PillArt.OUTLINE)
	draw_rect(Rect2(3.0 + recoil, -2.0, 9.0, 4.0), PillArt.FLASH if glow else PillArt.METAL)
	draw_set_transform(Vector2.ZERO)
	# Upright capsule, mint on top.
	draw_set_transform(Vector2(0.0, BODY_Y), -PI * 0.5, Vector2.ONE)
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1)
	draw_set_transform(Vector2.ZERO)
	PillArt.draw_visor(self, Vector2(facing * 1.5, BODY_Y - HALF_LENGTH - 1.0), 8.0, 1, false, glow)
	PillArt.draw_antenna(self, Vector2(0.0, BODY_Y - HALF_LENGTH - RADIUS - 1.0), 4.0)
