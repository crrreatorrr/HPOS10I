extends Area2D
## Simple placed ticket for the physics sandbox (the level agent owns the real
## one). Collected by touching it; comes back after a few seconds so the hurt
## test can be repeated.

const RADIUS := 6.0
const RESPAWN_FRAMES := 180

var _hidden_frames := 0
var _age := 0


func _ready() -> void:
	collision_layer = Layers.OBJECTS
	collision_mask = Layers.PLAYER
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
		if player != null and player.can_collect_tickets():
			Effects.ticket_sparkle(global_position, get_parent())
			GameState.add_tickets(1)
			Audio.play_sfx(&"ticket")
			_hidden_frames = RESPAWN_FRAMES
			visible = false
			return
	queue_redraw()


func _draw() -> void:
	ScatteredTicket.draw_ticket(self, maxf(absf(cos(_age * 0.08)), 0.2))
