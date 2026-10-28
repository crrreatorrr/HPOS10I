class_name BreakableWall
extends StaticBody2D
## A cracked rock wall: solid terrain (bit 1, so Sproto's wall sensors stop
## at it) until he hits it while attacking:
##   - on the ground: rolling (any speed), or spin dashing at |ground speed| >= 4.5;
##   - in the air: any attack (jump, roll).
## Running, standing or charging a spin dash against it does nothing.
## The check runs before the player moves each frame (process priority) and
## looks one frame ahead, so it breaks before his sensors could stop him: a
## roll at 16 px/frame goes straight through without losing speed.
## Breaking: collision off, debris, +100 score, `break_wall` (once).
## The origin is the middle of the wall's base, on the floor.

signal broken

const SCORE := 100
const BREAK_SPEED := 4.5
## Extra reach of the look-ahead, beyond the player's speed this frame.
const REACH := 4.0
## How far around the wall the detector area reaches (fastest approach + margin).
const DETECT_MARGIN := 24.0

const OUTLINE := Color(0.16, 0.11, 0.1)
const STONE := Color(0.62, 0.52, 0.44)
const STONE_LIGHT := Color(0.78, 0.69, 0.58)
const STONE_DARK := Color(0.42, 0.33, 0.28)
const CRACK := Color(0.24, 0.17, 0.14)

@export var size := Vector2(24.0, 48.0):
	set(value):
		size = value.max(Vector2(18.0, 8.0))
		_layout()

var _broken := false
var _detector: PlayerArea
var _shape: CollisionShape2D


func _ready() -> void:
	collision_layer = Layers.TERRAIN_SOLID
	collision_mask = 0
	process_physics_priority = -10  # before the player moves
	_shape = CollisionShape2D.new()
	_shape.shape = RectangleShape2D.new()
	add_child(_shape)
	_detector = PlayerArea.new()
	_detector.collision_layer = 0
	var area_shape := CollisionShape2D.new()
	area_shape.shape = RectangleShape2D.new()
	_detector.add_child(area_shape)
	add_child(_detector)
	_layout()


func is_broken() -> bool:
	return _broken


## World rect of the wall.
func wall_rect() -> Rect2:
	return Rect2(global_position + Vector2(-size.x / 2.0, -size.y), size)


## True when `player` is in a state that breaks walls.
static func can_break(player: Player) -> bool:
	if player == null or player.state == &"dead" or not player.is_attacking():
		return false
	if not player.grounded:
		return true
	return player.state == &"roll" or absf(player.ground_speed) >= BREAK_SPEED


func _physics_process(_delta: float) -> void:
	if _broken:
		return
	for player in _detector.players_inside():
		if can_break(player) and _reaches(player):
			break_wall()
			return


## True when `player`'s box, moved by this frame's speed, touches the wall.
func _reaches(player: Player) -> bool:
	var r := player.get_radii()
	var v := player.velocity
	var reach := Vector2(absf(v.x), absf(v.y)) + Vector2(REACH, REACH)
	var box := Rect2(player.global_position - r, r * 2.0)
	return box.grow_individual(reach.x, reach.y, reach.x, reach.y).intersects(wall_rect())


## Breaks the wall (once).
func break_wall() -> void:
	if _broken:
		return
	_broken = true
	collision_layer = 0
	_shape.set_deferred(&"disabled", true)
	_detector.set_deferred(&"monitoring", false)
	GameState.add_score(SCORE)
	Audio.play_sfx(&"break_wall")
	LevelFx.debris(get_parent(), wall_rect(), STONE, OUTLINE, 10)
	hide()
	broken.emit()


func _layout() -> void:
	if _shape == null:
		return
	(_shape.shape as RectangleShape2D).size = size
	_shape.position = Vector2(0.0, -size.y / 2.0)
	var area_shape := _detector.get_child(0) as CollisionShape2D
	(area_shape.shape as RectangleShape2D).size = size + Vector2(DETECT_MARGIN, DETECT_MARGIN) * 2.0
	area_shape.position = _shape.position
	queue_redraw()


func _draw() -> void:
	var rect := Rect2(-size.x / 2.0, -size.y, size.x, size.y)
	draw_rect(rect, OUTLINE)
	# Stone blocks in a staggered bond, lit from the top left.
	var rows := maxi(1, roundi(size.y / 12.0))
	var row_h := (size.y - 2.0) / rows
	for row in rows:
		var y := rect.position.y + 1.0 + row * row_h
		var offset := 0.0 if row % 2 == 0 else size.x / 4.0
		var x := rect.position.x + 1.0 - offset
		while x < rect.end.x - 1.0:
			var w := size.x / 2.0
			var block := Rect2(maxf(x, rect.position.x + 1.0), y, 0.0, row_h - 1.0)
			block.end.x = minf(x + w - 1.0, rect.end.x - 1.0)
			if block.size.x > 1.0:
				draw_rect(block, STONE)
				draw_rect(Rect2(block.position, Vector2(block.size.x, 1.0)), STONE_LIGHT)
				draw_rect(Rect2(block.position.x, block.end.y - 1.0, block.size.x, 1.0), STONE_DARK)
			x += w
	# Cracks across the face, so it reads as breakable.
	var c := rect.get_center()
	draw_polyline(PackedVector2Array([c + Vector2(-6, -14), c + Vector2(-1, -6), c + Vector2(-4, 2),
			c + Vector2(2, 9), c + Vector2(0, 16)]), CRACK, 1.0)
	draw_polyline(PackedVector2Array([c + Vector2(-1, -6), c + Vector2(6, -9)]), CRACK, 1.0)
	draw_polyline(PackedVector2Array([c + Vector2(-4, 2), c + Vector2(-9, 5)]), CRACK, 1.0)
