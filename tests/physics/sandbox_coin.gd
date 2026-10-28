extends Area2D
## Simple placed coin for the physics sandbox (the level agent owns the real
## one). Collected by touching it; comes back after a few seconds so the hurt
## test can be repeated.

const RADIUS := 6.0
const RESPAWN_FRAMES := 180

var _hidden_frames := 0
var _age := 0


func _ready() -> void:
	collision_layer = 1 << 6  # objects
	collision_mask = 1 << 4  # player hitbox
	monitorable = false
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = RADIUS
	shape.shape = circle
	add_child(shape)


func _physics_process(_delta: float) -> void:
	_age += 1
	if _hidden_frames > 0:
		_hidden_frames -= 1
		visible = _hidden_frames == 0
		return
	for area in get_overlapping_areas():
		var player := Player.from_area(area)
		if player != null and player.can_collect_coins():
			GameState.add_coins(1)
			Audio.play_sfx(&"coin")
			_hidden_frames = RESPAWN_FRAMES
			visible = false
			return
	queue_redraw()


func _draw() -> void:
	var squash := maxf(absf(cos(_age * 0.08)), 0.2)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(squash, 1.0))
	draw_circle(Vector2.ZERO, RADIUS, ScatteredCoin.COLOR_RIM)
	draw_circle(Vector2.ZERO, RADIUS - 1.5, ScatteredCoin.COLOR_FILL)
	draw_circle(Vector2(-1.5, -1.5), 1.5, ScatteredCoin.COLOR_SHINE)
