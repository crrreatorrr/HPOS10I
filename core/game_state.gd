extends Node
## Run-wide state: tickets, score, lives, checkpoint and the current zone/act.
## UI listens to the signals; gameplay calls the methods.

signal tickets_changed(value: int)
signal score_changed(value: int)
signal lives_changed(value: int)
signal checkpoint_reached(position: Vector2)
signal level_completed

const START_LIVES := 3
const TICKETS_PER_LIFE := 100

var tickets := 0
var score := 0
var lives := START_LIVES
var zone_id := ""
var act := 1
var level_time := 0.0
var timer_running := false
var checkpoint_position = null  # Vector2, or null when unset
var checkpoint_time := 0.0

var _next_ticket_life := TICKETS_PER_LIFE


func _process(delta: float) -> void:
	if timer_running:
		level_time += delta


func add_tickets(amount: int) -> void:
	tickets += amount
	while tickets >= _next_ticket_life:
		_next_ticket_life += TICKETS_PER_LIFE
		add_life()
	tickets_changed.emit(tickets)


## Empties the ticket counter and returns how many were lost (for scattering).
func lose_tickets() -> int:
	var lost := tickets
	tickets = 0
	tickets_changed.emit(tickets)
	return lost


func add_score(amount: int) -> void:
	score += amount
	score_changed.emit(score)


func add_life() -> void:
	lives += 1
	lives_changed.emit(lives)
	Audio.play_sfx(&"one_up")


func lose_life() -> void:
	lives -= 1
	lives_changed.emit(lives)


func set_checkpoint(position: Vector2) -> void:
	checkpoint_position = position
	checkpoint_time = level_time
	checkpoint_reached.emit(position)


## Called when an act starts fresh (not on respawn).
func start_level(new_zone_id: String, new_act: int) -> void:
	zone_id = new_zone_id
	act = new_act
	checkpoint_position = null
	checkpoint_time = 0.0
	_reset_level_counters()


## Called on respawn after death: keeps the checkpoint.
func restart_from_checkpoint() -> void:
	_reset_level_counters()
	level_time = checkpoint_time


func complete_level() -> void:
	timer_running = false
	level_completed.emit()


func reset_game() -> void:
	score = 0
	lives = START_LIVES
	zone_id = ""
	act = 1
	checkpoint_position = null
	_reset_level_counters()
	score_changed.emit(score)
	lives_changed.emit(lives)


func _reset_level_counters() -> void:
	tickets = 0
	_next_ticket_life = TICKETS_PER_LIFE
	level_time = 0.0
	timer_running = true
	tickets_changed.emit(tickets)
