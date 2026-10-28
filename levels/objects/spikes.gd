class_name Spikes
extends StaticBody2D
## A row of spikes: a solid block (terrain bit 1, so it can be stood on and
## walked into like a wall) with a hurt area only along its pointed side.
## Touching the points calls player.hurt(global_position); touching the sides
## or the base never does (the player's wall sensors keep his hitbox off the
## side). The origin is the middle of the base, on the floor; the points face
## up (local -y). Rotate the node to point them another way.
## The hurt area sits on layer 8 (hazards) with mask 5 (player).

const HEIGHT := 16.0
## The hurt area reaches this far past the points, and stops this far short
## of the sides.
const REACH := 6.0
const INSET := 2.0

const OUTLINE := Color(0.24, 0.1, 0.04)
const BASE := Color(0.55, 0.3, 0.12)
const SPIKE := Color(1.0, 0.56, 0.12)
const SPIKE_LIGHT := Color(1.0, 0.84, 0.5)
const SPIKE_DARK := Color(0.78, 0.32, 0.06)

## Width of the row (16 px per pair of points).
@export var width := 32.0:
	set(value):
		width = maxf(value, 16.0)
		_layout()

var _hurt: PlayerArea
var _shape: CollisionShape2D


func _ready() -> void:
	collision_layer = 1
	collision_mask = 0
	_shape = CollisionShape2D.new()
	_shape.shape = RectangleShape2D.new()
	add_child(_shape)
	_hurt = PlayerArea.new()
	_hurt.collision_layer = PlayerArea.LAYER_HAZARDS
	_hurt.monitorable = true
	var area_shape := CollisionShape2D.new()
	area_shape.shape = RectangleShape2D.new()
	_hurt.add_child(area_shape)
	add_child(_hurt)
	_layout()


func _physics_process(_delta: float) -> void:
	for player in _hurt.players_inside():
		if player.state != &"dead":
			player.hurt(global_position)


func _layout() -> void:
	if _shape == null:
		return
	(_shape.shape as RectangleShape2D).size = Vector2(width, HEIGHT)
	_shape.position = Vector2(0.0, -HEIGHT / 2.0)
	var area_shape := _hurt.get_child(0) as CollisionShape2D
	(area_shape.shape as RectangleShape2D).size = Vector2(width - INSET * 2.0, REACH + 4.0)
	area_shape.position = Vector2(0.0, -HEIGHT - REACH / 2.0 + 2.0)
	queue_redraw()


func _draw() -> void:
	var half := width / 2.0
	draw_rect(Rect2(-half, -4, width, 4), OUTLINE)
	draw_rect(Rect2(-half + 1, -3, width - 2, 2), BASE)
	var count := maxi(1, floori(width / 8.0))
	var step := width / count
	for i in count:
		var x0 := -half + i * step
		var tip := Vector2(x0 + step / 2.0, -HEIGHT)
		var spike := PackedVector2Array([Vector2(x0, -3), tip, Vector2(x0 + step, -3)])
		draw_colored_polygon(spike, SPIKE)
		draw_colored_polygon(PackedVector2Array([Vector2(x0 + step / 2.0, -3), tip, Vector2(x0 + step, -3)]), SPIKE_DARK)
		draw_line(Vector2(x0 + 1.5, -4), tip + Vector2(-0.5, 2), SPIKE_LIGHT, 1.0)
		draw_polyline(spike, OUTLINE, 1.0)
