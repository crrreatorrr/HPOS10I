extends Node2D
## The flying-broom chase (Wizard Academy, docs/DESIGN.md): an autoscroll
## section. When Sproto crosses this node's x, the camera starts scrolling
## right at `speed` px/s (GameCamera.start_autoscroll, docs/CONTRACTS.md
## "Camera"), which keeps him inside the view through Player.clamp_rect: the
## left edge pushes him along, he can't run ahead of the right edge, and
## pinned against a wall by the left edge he is crushed (kill). He runs and
## jumps inside the moving window while an enchanted broom sweeps along the
## left edge (visual only).
## It stops (GameCamera.stop_autoscroll, which empties clamp_rect) when the
## view's right edge reaches the end, `length` px right of the start, or
## when the camera can't scroll further, or when he dies. A respawn reloads
## the act, so put a checkpoint before the start: the section then begins
## again from its trigger. Pausing pauses the scroll (the camera and this
## node both stop with the tree).
## The origin is the start line (any y); the end line is `length` px right.

signal started
signal finished

const BROOM_HANDLE := Color(0.55, 0.34, 0.18)
const BROOM_BRISTLE := Color(0.95, 0.8, 0.42)
const BROOM_BAND := Color(0.6, 0.38, 0.86)
const SPARK := Color(1.0, 0.92, 0.6)
const OUTLINE := Color(0.14, 0.1, 0.2)

## Scroll length from the start line to where the view's right edge stops.
@export var length := 1696.0
## Scroll speed, px/s (90 px/s = 1.5 px/frame, a brisk run).
@export var speed := 90.0
## Draw the sweeping broom along the left edge while scrolling.
@export var broom := true

var active := false
var done := false
var _camera: Camera2D
var _player: Player
var _last_end := -INF
var _still := 0
var _broom: Node2D


func _physics_process(_delta: float) -> void:
	if done:
		return
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group(&"player") as Player
		if _player == null:
			return
	if not active:
		if _player.state != &"dead" and _player.global_position.x >= global_position.x:
			_start()
		return
	if _camera == null or not is_instance_valid(_camera):
		_stop()
		return
	if _player.state == &"dead":
		_stop()
		return
	var view: Rect2 = _camera.call(&"view_rect")
	_still = _still + 1 if view.end.x <= _last_end + 0.01 else 0
	_last_end = view.end.x
	if view.end.x >= end_x() or _still >= 30:
		_stop()
		return
	if _broom != null:
		_broom.global_position = Vector2(view.position.x + 10.0, view.get_center().y + 24.0)


## The world x where the scroll stops (the view's right edge).
func end_x() -> float:
	return global_position.x + length


func _start() -> void:
	_camera = get_tree().get_first_node_in_group(&"game_camera") as Camera2D
	if _camera == null or not _camera.has_method(&"start_autoscroll"):
		done = true  # no scrolling camera (a fallback camera): a normal stretch
		return
	active = true
	_camera.call(&"start_autoscroll", Vector2(speed, 0.0))
	if broom:
		_broom = Broom.new()
		_broom.name = "Broom"
		_broom.top_level = true
		_broom.z_index = 15
		add_child(_broom)
		var view: Rect2 = _camera.call(&"view_rect")
		_broom.global_position = Vector2(view.position.x + 10.0, view.get_center().y + 24.0)
		_broom.reset_physics_interpolation()
	started.emit()


func _stop() -> void:
	active = false
	done = true
	if _camera != null and is_instance_valid(_camera) and _camera.has_method(&"stop_autoscroll"):
		_camera.call(&"stop_autoscroll")
	if _player != null and is_instance_valid(_player):
		_player.clamp_rect = Rect2()
	if _broom != null:
		_broom.queue_free()
		_broom = null
	finished.emit()


func _exit_tree() -> void:
	if active:
		_stop()


## An enchanted broom sweeping upright along the screen's left edge.
class Broom:
	extends Node2D
	var _t := 0

	func _physics_process(_delta: float) -> void:
		_t += 1
		queue_redraw()

	func _draw() -> void:
		var sway := sin(_t * 0.25) * 0.35
		draw_set_transform(Vector2.ZERO, sway, Vector2.ONE)
		draw_line(Vector2(0.0, -70.0), Vector2(0.0, 0.0), OUTLINE, 4.0)
		draw_line(Vector2(0.0, -70.0), Vector2(0.0, 0.0), BROOM_HANDLE, 2.0)
		var bristles := PackedVector2Array([Vector2(-4.0, -2.0), Vector2(4.0, -2.0), Vector2(10.0, 22.0), Vector2(-10.0, 22.0)])
		draw_colored_polygon(bristles, BROOM_BRISTLE)
		draw_polyline(bristles + PackedVector2Array([bristles[0]]), OUTLINE, 1.0)
		draw_rect(Rect2(-5.0, -3.0, 10.0, 4.0), BROOM_BAND)
		for i in 3:
			var x := -6.0 + i * 6.0
			draw_line(Vector2(x * 0.5, 2.0), Vector2(x, 20.0), BROOM_HANDLE, 1.0)
		draw_set_transform(Vector2.ZERO)
		for i in 3:
			var p := Vector2(8.0 + float((_t * 3 + i * 11) % 14), 18.0 - float((_t * 2 + i * 7) % 30))
			draw_rect(Rect2(p, Vector2(2.0, 2.0)), SPARK)
