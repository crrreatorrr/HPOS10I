extends Node
## Run-wide state: tickets, score, lives, checkpoint, emeralds and the current
## zone/act. UI listens to the signals; gameplay calls the methods.

signal tickets_changed(value: int)
signal score_changed(value: int)
signal lives_changed(value: int)
signal checkpoint_reached(position: Vector2)
signal level_completed
## A new emerald was won (complete_level() on an emerald act; see Emeralds).
signal emerald_won(zone_id: String, act: int)

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
## Emeralds.key(zone_id, act) -> true for every emerald won this game.
var emeralds := {}
## True when the act that just completed won a new emerald (the tally shows it).
var emerald_just_won := false

var _next_ticket_life := TICKETS_PER_LIFE


## Ticks with gameplay (fixed 60 Hz), so it can't drift from the game under
## web frame catch-up, and it stops while the tree is paused.
func _physics_process(delta: float) -> void:
	if timer_running:
		level_time += delta


## Grants an extra life every TICKETS_PER_LIFE without spending Tickets.
## The act count is banked at the goal and this counter still resets next act.
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
	emerald_just_won = false
	checkpoint_position = null
	checkpoint_time = 0.0
	_reset_level_counters()


## Called on respawn after death: keeps the checkpoint.
func restart_from_checkpoint() -> void:
	_reset_level_counters()
	level_time = checkpoint_time


## Goal reached: stops the timer and wins the act's emerald if it has one
## not won yet (before `level_completed`, so listeners see emerald_just_won).
func complete_level() -> void:
	timer_running = false
	emerald_just_won = false
	if Emeralds.is_emerald_act(zone_id, act) and not has_emerald(zone_id, act):
		emeralds[Emeralds.key(zone_id, act)] = true
		emerald_just_won = true
		emerald_won.emit(zone_id, act)
	level_completed.emit()


func has_emerald(for_zone_id: String, for_act: int) -> bool:
	return emeralds.has(Emeralds.key(for_zone_id, for_act))


func emerald_count() -> int:
	return emeralds.size()


## The timer only runs inside levels; SceneRouter stops it in menus.
func reset_game() -> void:
	score = 0
	lives = START_LIVES
	zone_id = ""
	act = 1
	checkpoint_position = null
	emeralds.clear()
	emerald_just_won = false
	_reset_level_counters()
	score_changed.emit(score)
	lives_changed.emit(lives)


func _reset_level_counters() -> void:
	tickets = 0
	_next_ticket_life = TICKETS_PER_LIFE
	level_time = 0.0
	timer_running = true
	tickets_changed.emit(tickets)
