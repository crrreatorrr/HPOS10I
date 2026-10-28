class_name LevelSpring
extends PlayerArea
## Springs (spring_up.tscn, spring_diagonal.tscn, spring_side.tscn).
## The node origin is the middle of the spring's base, on the surface it
## stands on. Touching the spring from any side triggers it:
##   UP        player.launch(Vector2(x speed kept, -power))
##   DIAGONAL  player.launch(Vector2(facing * power, -power)): 45 degrees
##   SIDE      player.push_ground(facing * power, SIDE_LOCK_FRAMES)
## power: yellow 10 px/frame, red 16. Launches set the speed (they never add
## to it), so standing on a spring can't stack speed. A dead player is
## ignored (Player.launch() does nothing); a hurt one is launched and leaves
## the hurt state (the spring state replaces it). Plays `spring` and a short
## compress-and-extend animation. Layer 7 (objects), mask 5 (player).

enum Kind { UP, DIAGONAL, SIDE }
enum Strength { YELLOW, RED }

const POWER := {Strength.YELLOW: 10.0, Strength.RED: 16.0}
const SIDE_LOCK_FRAMES := 16
## Frames before the same spring can fire again for a player still touching it.
const COOLDOWN_FRAMES := 8
const ANIM_FRAMES := 14
const WIDTH := 28.0
const HEIGHT := 16.0

const OUTLINE := Color(0.12, 0.1, 0.16)
const METAL := Color(0.62, 0.64, 0.72)
const METAL_DARK := Color(0.36, 0.37, 0.45)
const YELLOW := Color(1.0, 0.84, 0.16)
const YELLOW_DARK := Color(0.8, 0.58, 0.06)
const RED := Color(0.93, 0.2, 0.2)
const RED_DARK := Color(0.62, 0.08, 0.12)

@export var kind := Kind.UP:
	set(value):
		kind = value
		_update_shape()
@export var strength := Strength.YELLOW:
	set(value):
		strength = value
		queue_redraw()
## DIAGONAL and SIDE: 1 launches right, -1 left.
@export_enum("Left:-1", "Right:1") var facing := 1:
	set(value):
		facing = -1 if value < 0 else 1
		_update_shape()

var _anim := ANIM_FRAMES
var _last_fire := {}  # player instance id -> physics frame


func _ready() -> void:
	collision_layer = LAYER_OBJECTS
	monitorable = false
	_update_shape()


func power() -> float:
	return POWER[strength]


## The launch velocity (px/frame) this spring gives `player`.
func launch_velocity(player: Player) -> Vector2:
	match kind:
		Kind.DIAGONAL:
			return Vector2(facing * power(), -power())
		Kind.SIDE:
			return Vector2(facing * power(), 0.0)
	return Vector2(player.velocity.x, -power())


func _physics_process(_delta: float) -> void:
	if _anim < ANIM_FRAMES:
		_anim += 1
		queue_redraw()
	var frame := Engine.get_physics_frames()
	for player in players_inside():
		if player.state == &"dead":
			continue
		var id := player.get_instance_id()
		if frame - int(_last_fire.get(id, -1000)) < COOLDOWN_FRAMES:
			continue
		_last_fire[id] = frame
		fire(player)


## Fires the spring at `player`.
func fire(player: Player) -> void:
	if player.state == &"dead":
		return
	if kind == Kind.SIDE:
		player.push_ground(facing * power(), SIDE_LOCK_FRAMES)
	else:
		player.launch(launch_velocity(player))
	Audio.play_sfx(&"spring")
	_anim = 0
	queue_redraw()


func _update_shape() -> void:
	var shape := get_node_or_null(^"Shape") as CollisionShape2D
	if shape == null:
		return
	var rect := shape.shape as RectangleShape2D
	if rect == null:
		return
	match kind:
		Kind.UP:
			rect.size = Vector2(WIDTH, HEIGHT + 4.0)
			shape.position = Vector2(0.0, -(HEIGHT + 4.0) / 2.0)
		Kind.DIAGONAL:
			rect.size = Vector2(WIDTH, WIDTH)
			shape.position = Vector2(0.0, -WIDTH / 2.0)
		Kind.SIDE:
			rect.size = Vector2(HEIGHT + 4.0, WIDTH)
			shape.position = Vector2(0.0, -WIDTH / 2.0)
	queue_redraw()


## 0 = rest, < 0 squashed, > 0 stretched (the pop after firing).
func _extension() -> float:
	if _anim >= ANIM_FRAMES:
		return 0.0
	if _anim < 3:
		return -0.4
	return sin(PI * (_anim - 3) / (ANIM_FRAMES - 3)) * 0.8


func _draw() -> void:
	var body := YELLOW if strength == Strength.YELLOW else RED
	var dark := YELLOW_DARK if strength == Strength.YELLOW else RED_DARK
	match kind:
		Kind.UP:
			_draw_spring(Transform2D.IDENTITY, body, dark)
		Kind.DIAGONAL:
			# A wedge base with the spring tilted 45 degrees towards `facing`.
			var base := PackedVector2Array([Vector2(-13, 0), Vector2(13, 0), Vector2(-13 * facing, -14)])
			draw_colored_polygon(base, METAL_DARK)
			draw_polyline(base + PackedVector2Array([base[0]]), OUTLINE, 1.0)
			_draw_spring(Transform2D(-facing * PI * 0.25, Vector2(-3.0 * facing, -6.0)), body, dark)
		Kind.SIDE:
			_draw_spring(Transform2D(facing * PI * 0.5, Vector2(-6.0 * facing, -WIDTH / 2.0)), body, dark)


## An upright spring: base plate, coil and top plate, drawn with `xf`.
func _draw_spring(xf: Transform2D, body: Color, dark: Color) -> void:
	draw_set_transform_matrix(xf)
	var coil := 8.0 * (1.0 + _extension())
	draw_rect(Rect2(-12, -4, 24, 4), OUTLINE)
	draw_rect(Rect2(-11, -3, 22, 2), METAL_DARK)
	for k in 3:
		var y0 := -4.0 - coil * k / 3.0
		var y1 := -4.0 - coil * (k + 1) / 3.0
		draw_line(Vector2(-8, y0), Vector2(8, (y0 + y1) / 2.0), METAL, 2.0)
		draw_line(Vector2(8, (y0 + y1) / 2.0), Vector2(-8, y1), METAL_DARK, 2.0)
	var top := -4.0 - coil
	draw_rect(Rect2(-14, top - 6, 28, 6), OUTLINE)
	draw_rect(Rect2(-13, top - 5, 26, 4), body)
	draw_rect(Rect2(-13, top - 2, 26, 1), dark)
	draw_rect(Rect2(-11, top - 5, 8, 1), Color(1, 1, 1, 0.7))
	draw_set_transform_matrix(Transform2D.IDENTITY)
