@tool
class_name PathSwitcher
extends Area2D
## Sets the player's collision path (A or B) when the player's centre crosses
## this switcher's vertical centre line. Each crossing direction has its own
## target path. Optionally only switches grounded players (loop tops).

enum Path { KEEP = -1, A = 0, B = 1 }

## Size of the trigger rectangle (centred on the node).
@export var size := Vector2(16.0, 128.0):
	set(value):
		size = value.max(Vector2.ONE)
		_update_shape()
## Path set when crossing from left to right.
@export var path_moving_right := Path.A
## Path set when crossing from right to left.
@export var path_moving_left := Path.B
## Ignore airborne players.
@export var grounded_only := false

## Player instance id -> side (-1 left of the line, 1 right) when last seen.
var _sides := {}
var _shape: CollisionShape2D


func _ready() -> void:
	collision_layer = 0
	collision_mask = 1 << 4  # player hitbox
	monitorable = false
	_update_shape()
	if Engine.is_editor_hint():
		return
	area_entered.connect(_on_area_entered)
	area_exited.connect(_on_area_exited)


func _physics_process(_delta: float) -> void:
	if Engine.is_editor_hint():
		return
	for id in _sides.keys():
		var player := instance_from_id(id) as Player
		if player == null:
			_sides.erase(id)
			continue
		_check(player)


func _on_area_entered(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player != null:
		_sides[player.get_instance_id()] = _side_of(player)


func _on_area_exited(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player != null:
		_check(player)
		_sides.erase(player.get_instance_id())


func _side_of(player: Player) -> int:
	return 1 if to_local(player.global_position).x >= 0.0 else -1


func _check(player: Player) -> void:
	var id := player.get_instance_id()
	var side := _side_of(player)
	var last: int = _sides.get(id, side)
	_sides[id] = side
	if side == last or (grounded_only and not player.grounded):
		return
	var target := path_moving_right if side > 0 else path_moving_left
	if target != Path.KEEP:
		player.set_collision_path(target)


func _update_shape() -> void:
	if not is_inside_tree():
		return
	if _shape == null:
		_shape = CollisionShape2D.new()
		add_child(_shape, false, Node.INTERNAL_MODE_BACK)
	var rect := RectangleShape2D.new()
	rect.size = size
	_shape.shape = rect
	queue_redraw()


func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	draw_rect(Rect2(-size / 2.0, size), Color(0.3, 0.9, 1.0, 0.2))
	draw_line(Vector2(0, -size.y / 2.0), Vector2(0, size.y / 2.0), Color(0.3, 0.9, 1.0, 0.8), 1.0)
	var font := ThemeDB.fallback_font
	var names := {Path.KEEP: "-", Path.A: "A", Path.B: "B"}
	draw_string(font, Vector2(2, -size.y / 2.0 + 10), "→" + names[path_moving_right], HORIZONTAL_ALIGNMENT_LEFT, -1, 10)
	draw_string(font, Vector2(-16, -size.y / 2.0 + 10), names[path_moving_left] + "←", HORIZONTAL_ALIGNMENT_LEFT, -1, 10)
