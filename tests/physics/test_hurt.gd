extends TestCase
## Hurt, invincibility, ticket scatter and death.

const W := preload("res://tests/physics/physics_world.gd")
const TICKET_SCENE := preload("res://player/scattered_ticket.tscn")

var world: Node2D
var player: Player


func before_each() -> void:
	GameState.tickets = 0


func after_each() -> void:
	GameState.tickets = 0


func _flat() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)


func _ticket_count() -> int:
	var count := 0
	for child in world.get_children():
		if child is ScatteredTicket:
			count += 1
	return count


func test_hurt_knocks_back_away_from_source() -> void:
	await _flat()
	GameState.add_tickets(10)
	var hurt_signals := [0]
	player.hurt_taken.connect(func() -> void: hurt_signals[0] += 1)
	player.hurt(player.global_position + Vector2(-20, 0))
	assert_eq(player.state, &"hurt", "hurt state")
	assert_near(player.velocity.x, 2.0, 1e-6, "knocked right, away from a source on the left")
	assert_near(player.velocity.y, -4.0, 1e-6, "knocked up")
	assert_true(not player.grounded, "airborne")
	assert_true(not player.is_attacking(), "not attacking while hurt")
	assert_eq(hurt_signals[0], 1, "hurt_taken emitted")
	assert_eq(GameState.tickets, 0, "tickets lost")
	await physics_frames(1)
	assert_eq(_ticket_count(), 10, "every lost ticket scattered")


func test_hurt_from_the_right_goes_left() -> void:
	await _flat()
	GameState.add_tickets(1)
	player.hurt(player.global_position + Vector2(30, 5))
	assert_near(player.velocity.x, -2.0, 1e-6, "knocked left")


func test_no_control_until_landing_then_stop() -> void:
	await _flat()
	GameState.add_tickets(1)
	player.hurt(player.global_position + Vector2(-20, 0))
	press(&"move_left")
	await physics_frames(5)
	assert_near(player.velocity.x, 2.0, 1e-6, "no air control while hurt")
	for i in 120:
		await physics_frames(1)
		if player.grounded:
			break
	assert_true(player.grounded, "landed")
	assert_eq(player.ground_speed, 0.0, "stopped on landing")
	assert_true(player.state != &"hurt", "hurt state ends on landing")


func test_invincible_for_120_frames() -> void:
	await _flat()
	GameState.add_tickets(5)
	player.hurt(player.global_position + Vector2(-20, 0))
	await physics_frames(119)
	assert_true(player.is_invincible(), "invincible after 119 frames")
	await physics_frames(1)
	assert_true(not player.is_invincible(), "invincibility over after 120 frames")


func test_hits_ignored_while_invincible() -> void:
	await _flat()
	GameState.add_tickets(5)
	player.hurt(player.global_position + Vector2(-20, 0))
	for i in 120:
		await physics_frames(1)
		if player.grounded:
			break
	GameState.add_tickets(3)
	player.hurt(player.global_position + Vector2(-20, 0))
	assert_eq(GameState.tickets, 3, "no tickets lost while invincible")
	assert_true(player.state != &"hurt", "not hurt again")


func test_hit_with_zero_tickets_kills() -> void:
	await _flat()
	var died := [0]
	player.died.connect(func() -> void: died[0] += 1)
	player.hurt(player.global_position + Vector2(-20, 0))
	assert_eq(player.state, &"dead", "dead")
	assert_near(player.velocity.y, -7.0, 1e-6, "death hop")
	var start_y := player.global_position.y
	await physics_frames(59)
	assert_eq(died[0], 0, "died not emitted yet")
	await physics_frames(1)
	assert_eq(died[0], 1, "died emitted after 60 frames")
	await physics_frames(60)
	assert_true(player.global_position.y > start_y + 100.0, "fell through the floor, off screen")


func test_scatter_at_most_32_tickets() -> void:
	await _flat()
	GameState.add_tickets(50)
	player.hurt(player.global_position + Vector2(-20, 0))
	await physics_frames(1)
	assert_eq(_ticket_count(), 32, "32 tickets at most")


func test_scatter_pattern_speeds() -> void:
	await _flat()
	var tickets := ScatteredTicket.scatter(world, Vector2(0, -100), 32)
	assert_eq(tickets.size(), 32, "32 tickets")
	for i in 32:
		var p := Tuning.physics
		var expected := p.ticket_scatter_speed_first if i < 16 else p.ticket_scatter_speed_second
		assert_near(tickets[i].velocity.length(), expected, 1e-6, "ticket %d speed" % i)
	assert_true(tickets[0].velocity.y < 0.0 and tickets[0].velocity.x < 0.0, "first ticket up-left (101.25 degrees)")
	assert_near(tickets[1].velocity.x, -tickets[0].velocity.x, 1e-6, "second ticket mirrored")


func test_scattered_ticket_recollect_delay() -> void:
	await _flat()
	var ticket: ScatteredTicket = TICKET_SCENE.instantiate()
	ticket.position = player.global_position
	world.add_child(ticket)
	await physics_frames(60)
	assert_eq(GameState.tickets, 0, "not collectable straight away")
	await physics_frames(10)
	assert_eq(GameState.tickets, 1, "collected after the delay")
	assert_true(not is_instance_valid(ticket) or ticket.is_queued_for_deletion(), "ticket removed")


func test_scattered_ticket_bounces_and_vanishes() -> void:
	await _flat()
	var ticket: ScatteredTicket = TICKET_SCENE.instantiate()
	ticket.position = Vector2(300, -60)
	world.add_child(ticket)
	var bounced := false
	for i in 120:
		var before := ticket.velocity.y
		await physics_frames(1)
		if before > 0.5 and ticket.velocity.y < 0.0:
			bounced = true
			var p := Tuning.physics
			assert_near(ticket.velocity.y, p.ticket_bounce * (before + p.ticket_gravity), 0.01, "bounce keeps 75%")
			break
	assert_true(bounced, "bounced off the floor")
	assert_true(ticket.global_position.y <= -ScatteredTicket.RADIUS + 0.5, "never below the floor")
	await physics_frames(Tuning.physics.ticket_lifetime_frames)
	assert_true(not is_instance_valid(ticket), "vanished after its lifetime")


func test_bounce_off() -> void:
	await _flat()
	player.respawn_at(Vector2(0, -200))
	player.velocity = Vector2(3.0, 5.0)
	player.bounce_off(player.global_position.y + 30.0)
	assert_near(player.velocity.y, -5.0, 1e-6, "falling onto the target: y speed reversed")
	player.velocity = Vector2(3.0, -3.0)
	player.bounce_off(player.global_position.y + 30.0)
	assert_near(player.velocity.y, -2.0, 1e-6, "moving up: y speed trimmed by 1")
	player.velocity = Vector2(3.0, 5.0)
	player.bounce_off(player.global_position.y - 30.0, true)
	assert_near(player.velocity.y, 4.0, 1e-6, "below the target: trimmed")
	assert_near(player.velocity.x, -3.0, 1e-6, "reverse_x")
