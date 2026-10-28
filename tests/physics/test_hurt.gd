extends TestCase
## Hurt, invincibility, coin scatter and death.

const W := preload("res://tests/physics/physics_world.gd")
const COIN_SCENE := preload("res://player/scattered_coin.tscn")

var world: Node2D
var player: Player


func before_each() -> void:
	GameState.coins = 0


func after_each() -> void:
	GameState.coins = 0


func _flat() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)


func _coin_count() -> int:
	var count := 0
	for child in world.get_children():
		if child is ScatteredCoin:
			count += 1
	return count


func test_hurt_knocks_back_away_from_source() -> void:
	await _flat()
	GameState.add_coins(10)
	var hurt_signals := [0]
	player.hurt_taken.connect(func() -> void: hurt_signals[0] += 1)
	player.hurt(player.global_position + Vector2(-20, 0))
	assert_eq(player.state, &"hurt", "hurt state")
	assert_near(player.velocity.x, 2.0, 1e-6, "knocked right, away from a source on the left")
	assert_near(player.velocity.y, -4.0, 1e-6, "knocked up")
	assert_true(not player.grounded, "airborne")
	assert_true(not player.is_attacking(), "not attacking while hurt")
	assert_eq(hurt_signals[0], 1, "hurt_taken emitted")
	assert_eq(GameState.coins, 0, "coins lost")
	await physics_frames(1)
	assert_eq(_coin_count(), 10, "every lost coin scattered")


func test_hurt_from_the_right_goes_left() -> void:
	await _flat()
	GameState.add_coins(1)
	player.hurt(player.global_position + Vector2(30, 5))
	assert_near(player.velocity.x, -2.0, 1e-6, "knocked left")


func test_no_control_until_landing_then_stop() -> void:
	await _flat()
	GameState.add_coins(1)
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
	GameState.add_coins(5)
	player.hurt(player.global_position + Vector2(-20, 0))
	await physics_frames(119)
	assert_true(player.is_invincible(), "invincible after 119 frames")
	await physics_frames(1)
	assert_true(not player.is_invincible(), "invincibility over after 120 frames")


func test_hits_ignored_while_invincible() -> void:
	await _flat()
	GameState.add_coins(5)
	player.hurt(player.global_position + Vector2(-20, 0))
	for i in 120:
		await physics_frames(1)
		if player.grounded:
			break
	GameState.add_coins(3)
	player.hurt(player.global_position + Vector2(-20, 0))
	assert_eq(GameState.coins, 3, "no coins lost while invincible")
	assert_true(player.state != &"hurt", "not hurt again")


func test_hit_with_zero_coins_kills() -> void:
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


func test_scatter_at_most_32_coins() -> void:
	await _flat()
	GameState.add_coins(50)
	player.hurt(player.global_position + Vector2(-20, 0))
	await physics_frames(1)
	assert_eq(_coin_count(), 32, "32 coins at most")


func test_scatter_pattern_speeds() -> void:
	await _flat()
	var coins := ScatteredCoin.scatter(world, Vector2(0, -100), 32)
	assert_eq(coins.size(), 32, "32 coins")
	for i in 32:
		var p := Tuning.physics
		var expected := p.coin_scatter_speed_first if i < 16 else p.coin_scatter_speed_second
		assert_near(coins[i].velocity.length(), expected, 1e-6, "coin %d speed" % i)
	assert_true(coins[0].velocity.y < 0.0 and coins[0].velocity.x < 0.0, "first coin up-left (101.25 degrees)")
	assert_near(coins[1].velocity.x, -coins[0].velocity.x, 1e-6, "second coin mirrored")


func test_scattered_coin_recollect_delay() -> void:
	await _flat()
	var coin: ScatteredCoin = COIN_SCENE.instantiate()
	coin.position = player.global_position
	world.add_child(coin)
	await physics_frames(60)
	assert_eq(GameState.coins, 0, "not collectable straight away")
	await physics_frames(10)
	assert_eq(GameState.coins, 1, "collected after the delay")
	assert_true(not is_instance_valid(coin) or coin.is_queued_for_deletion(), "coin removed")


func test_scattered_coin_bounces_and_vanishes() -> void:
	await _flat()
	var coin: ScatteredCoin = COIN_SCENE.instantiate()
	coin.position = Vector2(300, -60)
	world.add_child(coin)
	var bounced := false
	for i in 120:
		var before := coin.velocity.y
		await physics_frames(1)
		if before > 0.5 and coin.velocity.y < 0.0:
			bounced = true
			var p := Tuning.physics
			assert_near(coin.velocity.y, p.coin_bounce * (before + p.coin_gravity), 0.01, "bounce keeps 75%")
			break
	assert_true(bounced, "bounced off the floor")
	assert_true(coin.global_position.y <= -ScatteredCoin.RADIUS + 0.5, "never below the floor")
	await physics_frames(Tuning.physics.coin_lifetime_frames)
	assert_true(not is_instance_valid(coin), "vanished after its lifetime")


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
