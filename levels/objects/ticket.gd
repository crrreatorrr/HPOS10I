class_name LevelTicket
extends PlayerArea
## A placed golden ticket (docs/DESIGN.md). Touching it while
## player.can_collect_tickets() adds one ticket (GameState.add_tickets(1)),
## plays `ticket` and leaves a sparkle. Looks like the scattered tickets
## (ScatteredTicket.draw_ticket); all placed tickets spin in step.
## Layer 7 (objects), mask 5 (player); a 7 px circle, so a run at 16 px/f
## always overlaps it for at least one frame.

## Spin speed of the card flip (radians per frame).
const SPIN := 0.08

var _collected := false


func _ready() -> void:
	collision_layer = LAYER_OBJECTS
	monitorable = false


func _physics_process(_delta: float) -> void:
	if _collected:
		return
	for player in players_inside():
		if player.can_collect_tickets():
			collect()
			return
	queue_redraw()


## Gives the ticket to the player (once).
func collect() -> void:
	if _collected:
		return
	_collected = true
	GameState.add_tickets(1)
	Audio.play_sfx(&"ticket")
	LevelFx.ticket_sparkle(get_parent(), global_position)
	set_deferred(&"monitoring", false)
	hide()
	queue_free()


func is_collected() -> bool:
	return _collected


func _draw() -> void:
	ScatteredTicket.draw_ticket(self, maxf(absf(cos(Engine.get_physics_frames() * SPIN)), 0.2))
