extends TestCase
## Level objects: tickets, springs, booster, breakable wall, checkpoint,
## spikes and the goal sign.

const W := preload("res://tests/levels/level_world.gd")

const TICKET := "res://levels/objects/ticket.tscn"
const SPRING_UP := "res://levels/objects/spring_up.tscn"
const SPRING_DIAGONAL := "res://levels/objects/spring_diagonal.tscn"
const SPRING_SIDE := "res://levels/objects/spring_side.tscn"
const BOOSTER := "res://levels/objects/speed_booster.tscn"
const WALL := "res://levels/objects/breakable_wall.tscn"
const CHECKPOINT := "res://levels/objects/checkpoint.tscn"
const GOAL := "res://levels/objects/goal_sign.tscn"
const SPIKES := "res://levels/objects/spikes.tscn"

var world: Node2D
var player: Player


func _flat_with(path: String, at: Vector2, props := {}, feet := Vector2(0, 0)) -> Node2D:
	world = W.new_world(self)
	W.add_floor(world)
	var node := W.place(world, path, at, props)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)
	return node


func _clear() -> void:
	world.queue_free()
	await physics_frames(2)


## Records [velocity, attacking] at the moment the player's state becomes `state`.
func _velocity_on(state: StringName) -> Array:
	var seen := []
	player.state_changed.connect(func(_old: StringName, new: StringName) -> void:
		if new == state and seen.is_empty():
			seen.append(player.velocity)
			seen.append(player.is_attacking()))
	return seen


# --- Tickets ------------------------------------------------------------------------

func test_ticket_collects_once() -> void:
	var ticket := await _flat_with(TICKET, Vector2(100, -16)) as LevelTicket
	var changes := [0]
	GameState.tickets_changed.connect(func(_v: int) -> void: changes[0] += 1)
	player.ground_speed = 4.0
	await physics_frames(40)
	assert_eq(GameState.tickets, 1, "+1 ticket")
	assert_true(changes[0] >= 1, "tickets_changed fired")
	assert_true(not is_instance_valid(ticket) or ticket.is_collected(), "ticket gone")


func test_two_overlapping_tickets_count_two() -> void:
	await _flat_with(TICKET, Vector2(100, -16))
	W.place(world, TICKET, Vector2(100, -16))
	player.ground_speed = 4.0
	await physics_frames(40)
	assert_eq(GameState.tickets, 2, "both counted, once each")


func test_tickets_wait_while_hurt_and_ignore_the_dead() -> void:
	await _flat_with(TICKET, Vector2(400, -16))
	GameState.add_tickets(3)
	player.hurt(player.global_position + Vector2(-10, 0))
	var ticket := W.place(world, TICKET, player.global_position) as LevelTicket
	# The ticket stays on him through the knockback: collected only once the
	# hurt state ends.
	var collected_while_hurt := false
	for i in 200:
		await physics_frames(1)
		if not is_instance_valid(ticket) or ticket.is_collected():
			break
		if player.state == &"hurt" and GameState.tickets > 0:
			collected_while_hurt = true
		ticket.global_position = player.global_position
	assert_true(not collected_while_hurt, "not collected while hurt")
	assert_true(not is_instance_valid(ticket) or ticket.is_collected(), "collected once he can")
	assert_eq(GameState.tickets, 1, "one ticket")
	player.kill()
	var dead_ticket := W.place(world, TICKET, player.global_position) as LevelTicket
	await physics_frames(10)
	assert_true(is_instance_valid(dead_ticket) and not dead_ticket.is_collected(), "the dead collect nothing")


func test_row_of_tickets_at_16_px_per_frame() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	for i in 12:
		W.place(world, TICKET, Vector2(200 + i * 16, -16))
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)
	player.ground_speed = 16.0
	await physics_frames(30)
	assert_eq(GameState.tickets, 12, "no ticket skipped at top speed")


func test_hundred_tickets_give_one_life() -> void:
	await _flat_with(TICKET, Vector2(100, -16))
	GameState.add_tickets(99)
	var lives := GameState.lives
	player.ground_speed = 4.0
	await physics_frames(40)
	assert_eq(GameState.tickets, 100, "100 tickets")
	assert_eq(GameState.lives, lives + 1, "exactly one extra life")


# --- Springs --------------------------------------------------------------------------

func test_up_springs_launch_10_and_16_keeping_x_speed() -> void:
	for strength in [LevelSpring.Strength.YELLOW, LevelSpring.Strength.RED]:
		await _flat_with(SPRING_UP, Vector2(120, 0), {strength = strength})
		var seen := _velocity_on(&"spring")
		player.ground_speed = 3.0
		press(&"move_right")
		await physics_frames(40)
		release(&"move_right")
		var expected := 10.0 if strength == LevelSpring.Strength.YELLOW else 16.0
		assert_true(not seen.is_empty(), "launched")
		if not seen.is_empty():
			assert_near(seen[0].y, -expected, 1e-4, "up speed")
			assert_true(seen[0].x > 2.5, "x speed kept (%.2f)" % seen[0].x)
			assert_true(not seen[1], "a spring launch is not an attack")
		await _clear()


func test_diagonal_spring_launches_at_45_degrees_both_ways() -> void:
	for facing in [1, -1]:
		await _flat_with(SPRING_DIAGONAL, Vector2(120 * facing, 0), {facing = facing})
		var seen := _velocity_on(&"spring")
		player.ground_speed = 3.0 * facing
		press(&"move_right" if facing > 0 else &"move_left")
		await physics_frames(60)
		release(&"move_right" if facing > 0 else &"move_left")
		assert_true(not seen.is_empty(), "launched")
		if not seen.is_empty():
			assert_near(seen[0].x, 10.0 * facing, 1e-4, "x in its facing")
			assert_near(seen[0].y, -10.0, 1e-4, "y up")
		await _clear()


func test_side_spring_pushes_along_the_ground() -> void:
	await _flat_with(SPRING_SIDE, Vector2(100, 0), {facing = -1})
	player.ground_speed = 3.0
	var pushed := await W.wait_for(self, func() -> bool: return player.ground_speed <= -9.9, 60)
	assert_true(pushed >= 0, "pushed back at 10 px/f")
	assert_true(player.control_lock > 0, "control locked")


func test_spring_triggers_from_every_approach() -> void:
	# Falling on it.
	await _flat_with(SPRING_UP, Vector2(0, 0), {}, Vector2(200, 0))
	var seen := _velocity_on(&"spring")
	player.respawn_at(Vector2(0, -120))
	await physics_frames(60)
	assert_true(not seen.is_empty(), "falling onto it")
	await _clear()
	# Rolling into it.
	await _flat_with(SPRING_UP, Vector2(200, 0))
	seen = _velocity_on(&"spring")
	player.ground_speed = 6.0
	press(&"move_down")
	await physics_frames(2)
	assert_eq(player.state, &"roll", "rolling")
	await physics_frames(40)
	release(&"move_down")
	assert_true(not seen.is_empty(), "rolling into it")
	await _clear()
	# Spin dash into it.
	await _flat_with(SPRING_UP, Vector2(120, 0))
	seen = _velocity_on(&"spring")
	press(&"move_down")
	await physics_frames(2)
	press(&"jump")
	await physics_frames(2)
	release(&"jump")
	await physics_frames(2)
	release(&"move_down")
	await physics_frames(30)
	assert_true(not seen.is_empty(), "spin dash into it")
	await _clear()
	# Landing on its edge.
	await _flat_with(SPRING_UP, Vector2(0, 0), {}, Vector2(200, 0))
	seen = _velocity_on(&"spring")
	player.respawn_at(Vector2(LevelSpring.WIDTH / 2.0 + 6.0, -120))
	await physics_frames(60)
	assert_true(not seen.is_empty(), "landing on its edge")


func test_spring_ignores_the_dead_and_ends_hurt() -> void:
	await _flat_with(SPRING_UP, Vector2(0, 0), {}, Vector2(200, 0))
	GameState.add_tickets(1)
	player.respawn_at(Vector2(0, -30))
	player.hurt(Vector2(5, -30))
	var states := []
	player.state_changed.connect(func(_old: StringName, new: StringName) -> void: states.append(new))
	await physics_frames(80)
	assert_true(&"spring" in states, "a hurt player is launched (the hurt state ends)")
	player.kill()
	player.global_position = Vector2(0, -20)
	await physics_frames(5)
	assert_eq(player.state, &"dead", "still dead: springs ignore the dead")


func test_standing_on_a_spring_never_stacks_speed() -> void:
	await _flat_with(SPRING_UP, Vector2(0, 0), {}, Vector2(200, 0))
	# A ceiling right above keeps him on the spring: every relaunch is the same.
	W.add_rect(world, Rect2(-40, -80, 80, 16))
	player.respawn_at(Vector2(0, -20))
	var top := 0.0
	var deepest := 0.0
	for i in 240:
		await physics_frames(1)
		top = minf(top, player.velocity.y)
		deepest = maxf(deepest, -64.0 - (player.global_position.y - player.get_radii().y))
	assert_true(deepest <= 0.1, "never pushed into the ceiling (%.2f px deep)" % deepest)
	assert_true(top >= -10.0 - 1e-4, "never faster than the spring")


# --- Booster -----------------------------------------------------------------------------

func test_booster_pushes_12_in_its_facing_and_keeps_more() -> void:
	await _flat_with(BOOSTER, Vector2(120, 0), {facing = 1})
	player.ground_speed = 3.0
	press(&"move_right")
	var boosted := await W.wait_for(self, func() -> bool: return player.ground_speed >= 11.9, 60)
	assert_true(boosted >= 0, "boosted")
	assert_near(player.ground_speed, 12.0, 0.1, "12 px/f")
	assert_true(player.control_lock > 0, "control locked")
	await _clear()
	await _flat_with(BOOSTER, Vector2(160, 0), {facing = 1})
	player.ground_speed = 14.0
	press(&"move_right")
	var hit := await W.wait_for(self, func() -> bool: return player.control_lock > 0, 30)
	release(&"move_right")
	assert_true(hit >= 0, "boosted")
	assert_true(player.ground_speed >= 13.9, "a faster player keeps his speed (%.2f)" % player.ground_speed)


func test_booster_from_the_wrong_side_and_in_the_air() -> void:
	await _flat_with(BOOSTER, Vector2(-100, 0), {facing = 1})
	player.ground_speed = -4.0
	var turned := await W.wait_for(self, func() -> bool: return player.ground_speed >= 11.9, 60)
	assert_true(turned >= 0, "running into it backwards turns him round at 12")
	await _clear()
	await _flat_with(BOOSTER, Vector2(160, 0), {facing = 1})
	player.launch(Vector2(4.0, -6.0))
	var boosted := false
	for i in 70:
		await physics_frames(1)
		if not player.grounded and player.velocity.x > 6.5:
			boosted = true
	assert_true(not boosted, "no boost while airborne")
	assert_true(player.global_position.x > 176.0, "flew over it (x %.0f)" % player.global_position.x)


# --- Breakable wall -------------------------------------------------------------------------

func test_wall_stops_runners_and_breaks_for_rollers() -> void:
	var wall := await _flat_with(WALL, Vector2(200, 0)) as BreakableWall
	var score := GameState.score
	player.ground_speed = 5.9
	press(&"move_right")
	await physics_frames(60)
	release(&"move_right")
	assert_true(not wall.is_broken(), "running into it: still standing")
	assert_true(player.global_position.x < 188.0 - 9.0, "stopped at the wall")
	# Roll into it slowly: rolling breaks it at any speed.
	player.respawn_at(Vector2(100, -19))
	await physics_frames(2)
	player.ground_speed = 3.0
	press(&"move_down")
	await physics_frames(60)
	release(&"move_down")
	assert_true(wall.is_broken(), "a roll breaks it")
	assert_eq(GameState.score, score + 100, "+100 once")
	wall.break_wall()
	assert_eq(GameState.score, score + 100, "can't break twice")


func test_wall_breaks_at_16_without_stopping() -> void:
	var wall := await _flat_with(WALL, Vector2(400, 0))
	player.ground_speed = 16.0
	press(&"move_down")
	await physics_frames(2)
	release(&"move_down")
	var slowest := 16.0
	for i in 30:
		await physics_frames(1)
		slowest = minf(slowest, player.ground_speed)
	assert_true((wall as BreakableWall).is_broken(), "broken")
	assert_true(slowest > 15.0, "never stopped (slowest %.2f)" % slowest)
	assert_true(player.global_position.x > 420.0, "went through")


func test_wall_spin_dash_and_air_attacks() -> void:
	# Its face 10 px from Sproto's centre: touching distance.
	var wall := await _flat_with(WALL, Vector2(22, 0)) as BreakableWall
	# Charging a spin dash right next to it does nothing; the release breaks it.
	press(&"move_down")
	await physics_frames(2)
	press(&"jump")
	await physics_frames(2)
	release(&"jump")
	await physics_frames(20)
	assert_eq(player.state, &"spindash", "charging")
	assert_true(not wall.is_broken(), "charging doesn't break it")
	release(&"move_down")
	await physics_frames(10)
	assert_true(wall.is_broken(), "the release breaks it")
	await _clear()
	# A jump into the side of a wall too tall to clear breaks it.
	wall = await _flat_with(WALL, Vector2(80, 0), {size = Vector2(24, 128)})
	player.ground_speed = 3.0
	await physics_frames(5)
	press(&"jump")
	await physics_frames(30)
	release(&"jump")
	assert_true(wall.is_broken(), "a jump into it breaks it")


# --- Checkpoint and spikes ---------------------------------------------------------------------

func test_checkpoint_sets_once_and_never_moves_back() -> void:
	var checkpoint := await _flat_with(CHECKPOINT, Vector2(200, -19)) as Checkpoint
	var later := W.place(world, CHECKPOINT, Vector2(600, -19)) as Checkpoint
	var count := [0]
	GameState.checkpoint_reached.connect(func(_p: Vector2) -> void: count[0] += 1)
	player.ground_speed = 16.0
	await physics_frames(20)
	assert_true(checkpoint.is_active(), "passed at 16 px/f")
	assert_eq(GameState.checkpoint_position, Vector2(200, -19), "first post set")
	await physics_frames(40)
	assert_eq(GameState.checkpoint_position, Vector2(600, -19), "second post set")
	assert_eq(count[0], 2, "once each")
	# Back to the first post: the respawn point stays at the later one.
	player.respawn_at(Vector2(200, -19))
	await physics_frames(10)
	assert_eq(GameState.checkpoint_position, Vector2(600, -19), "never moved back")
	assert_eq(count[0], 2, "no new checkpoint")
	assert_true(later.is_active(), "later post lit")


func test_spikes_hurt_from_the_points_only() -> void:
	await _flat_with(SPIKES, Vector2(200, 0), {width = 32.0})
	GameState.add_tickets(5)
	player.ground_speed = 4.0
	press(&"move_right")
	await physics_frames(60)
	release(&"move_right")
	assert_true(player.state != &"hurt" and not player.is_invincible(), "the side is safe")
	player.respawn_at(Vector2(200, -80))
	await physics_frames(30)
	assert_true(player.is_invincible(), "landing on the points hurts")


# --- Goal sign ----------------------------------------------------------------------------------

func test_goal_completes_once_then_tally_then_next_stage() -> void:
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		var objects := Node2D.new()
		objects.name = "Objects"
		root.add_child(objects)
		W.place(objects, GOAL, Vector2(400, 0))
		W.place(objects, GOAL, Vector2(700, 0)))
	var completed := [0]
	var next := [0]
	GameState.level_completed.connect(func() -> void: completed[0] += 1)
	level.next_stage_requested.connect(func() -> void: next[0] += 1)
	level.player.ground_speed = 10.0
	press(&"move_right")
	await physics_frames(60)
	assert_eq(completed[0], 1, "completed once")
	level.complete_level()
	assert_true(not GameState.timer_running, "timer stopped")
	assert_true(level.is_finishing(), "finishing")
	var x := level.player.global_position.x
	await physics_frames(30)
	assert_near(level.player.global_position.x, x, 0.01, "frozen")
	assert_eq(level.player.pose, &"victory", "victory pose")
	var frames := await W.wait_for(self, func() -> bool: return next[0] > 0, 900)
	assert_true(frames >= 0, "next stage after the tally")
	assert_true(GameState.score > 0, "tally added bonuses")
	await physics_frames(60)
	assert_eq(next[0], 1, "next stage requested once")
	assert_eq(completed[0], 1, "still once")


func test_goal_from_the_air_and_dying_after_it() -> void:
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		W.place(root, GOAL, Vector2(300, 0)))
	var deaths := [0]
	level.respawn_requested.connect(func() -> void: deaths[0] += 1)
	level.player.launch(Vector2(8.0, -9.0))
	var done := await W.wait_for(self, func() -> bool: return level.is_finishing(), 120)
	assert_true(done >= 0, "flying high over the sign still counts")
	level.player.kill()
	await physics_frames(200)
	assert_eq(deaths[0], 0, "a death after the goal changes nothing")


func test_pause_during_the_tally_resumes() -> void:
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		W.place(root, GOAL, Vector2(200, 0)))
	var next := [0]
	level.next_stage_requested.connect(func() -> void: next[0] += 1)
	level.player.ground_speed = 6.0
	await physics_frames(120)
	tree.paused = true
	await physics_frames(600)
	assert_eq(next[0], 0, "nothing moves on while paused")
	tree.paused = false
	var frames := await W.wait_for(self, func() -> bool: return next[0] > 0, 900)
	assert_true(frames >= 0, "the tally finished after unpausing")
