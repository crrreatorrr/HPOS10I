extends Area2D
## Static enemy test dummy (layer 6, mask 5). Follows the enemy contract:
## an attacking player bounces off it, anyone else gets hurt. It never dies,
## so hurt and coin scatter can be tested again and again.

const SIZE := Vector2(24.0, 28.0)
const BODY := Color(0.86, 0.2, 0.2)
const DARK := Color(0.4, 0.05, 0.08)

var _flash := 0


func _ready() -> void:
	collision_layer = 1 << 5  # enemies
	collision_mask = 1 << 4  # player hitbox
	monitorable = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = SIZE
	shape.shape = rect
	shape.position = Vector2(0.0, -SIZE.y / 2.0)
	add_child(shape)
	area_entered.connect(_on_area_entered)


func _on_area_entered(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player == null or player.state == &"dead":
		return
	if player.is_attacking():
		player.bounce_off(global_position.y - SIZE.y / 2.0)
		Audio.play_sfx(&"enemy_pop")
		_flash = 12
	else:
		player.hurt(global_position)


func _physics_process(_delta: float) -> void:
	if _flash > 0:
		_flash -= 1
	queue_redraw()


func _draw() -> void:
	var color := Color.WHITE if _flash % 4 >= 2 else BODY
	draw_rect(Rect2(-SIZE.x / 2.0, -SIZE.y, SIZE.x, SIZE.y), DARK)
	draw_rect(Rect2(-SIZE.x / 2.0 + 1.0, -SIZE.y + 1.0, SIZE.x - 2.0, SIZE.y - 2.0), color)
	draw_line(Vector2(-8, -21), Vector2(-3, -18), DARK, 2.0)
	draw_line(Vector2(8, -21), Vector2(3, -18), DARK, 2.0)
	draw_circle(Vector2(-5, -15), 2.0, DARK)
	draw_circle(Vector2(5, -15), 2.0, DARK)
	draw_line(Vector2(-6, -7), Vector2(6, -7), DARK, 2.0)
