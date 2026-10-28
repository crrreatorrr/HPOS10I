extends TestCase
## Pill-robot enemies (Enemy base, walker, hopper): destroy vs hurt, the
## single bounce, patrols, hops and difficulty scaling.

const W := preload("res://tests/levels/level_world.gd")
const WALKER := "res://levels/enemies/walker.tscn"
const HOPPER := "res://levels/enemies/hopper.tscn"

var world: Node2D
var player: Player


func _setup(enemies: Array, feet := Vector2(-200, 0)) -> Array[Enemy]:
	world = W.new_world(self)
	W.add_floor(world)
	var out: Array[Enemy] = []
	for e in enemies:
		out.append(W.place(world, e[0], e[1], e[2] if e.size() > 2 else {}) as Enemy)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)
	return out


## Puts Sproto in the jump state, falling at `fall` px/f with his ball centre
## at `at`. Jump stays held, so the rebound isn't cut by the variable jump
## height (an upward speed cap of 4 px/f once jump is released).
func _drop_attacking(at: Vector2, fall := 4.0) -> void:
	press(&"jump")
	await physics_frames(2)
	assert_eq(player.state, &"jump", "jumping")
	player.global_position = at
	player.velocity = Vector2(0.0, fall)


func test_enemies_follow_the_contract() -> void:
	var enemies := await _setup([[WALKER, Vector2(0, 0)], [HOPPER, Vector2(100, 0)]])
	for enemy in enemies:
		assert_true(enemy is Enemy and enemy is Area2D, "%s extends Enemy (Area2D)" % enemy.name)
		assert_eq(enemy.collision_layer, 1 << 5, "%s on layer 6" % enemy.name)
		assert_true(enemy.collision_mask & (1 << 4) != 0, "%s masks the player (bit 5)" % enemy.name)
		assert_eq(enemy.tier, 1, "%s is tier 1" % enemy.name)
		assert_true(enemy.monitoring and enemy.monitorable, "%s monitors" % enemy.name)


func test_jumping_on_a_walker_destroys_it_and_bounces() -> void:
	var walker := (await _setup([[WALKER, Vector2(0, 0), {speed = 0.0}]]))[0]
	var score := GameState.score
	await _drop_attacking(Vector2(0, -40), 4.0)
	var vy := []
	for i in 10:
		await physics_frames(1)
		if not is_instance_valid(walker) or not walker.alive:
			vy.append(player.velocity.y)
			break
	assert_true(not is_instance_valid(walker) or not walker.alive, "destroyed")
	assert_eq(GameState.score, score + 100, "+100")
	assert_true(not vy.is_empty() and vy[0] < 0.0, "bounced up")
	assert_true(player.state != &"hurt", "not hurt")


func test_running_into_an_enemy_hurts_then_invincible_then_kills_with_no_tickets() -> void:
	var walker := (await _setup([[WALKER, Vector2(0, 0), {speed = 0.0}]], Vector2(-60, 0)))[0]
	GameState.add_tickets(4)
	var hurts := [0]
	player.hurt_taken.connect(func() -> void: hurts[0] += 1)
	player.ground_speed = 4.0
	var hit := await W.wait_for(self, func() -> bool: return hurts[0] > 0, 40)
	assert_true(hit >= 0, "hurt")
	assert_eq(GameState.tickets, 0, "tickets scattered")
	assert_true(walker.alive, "the walker survives")
	# Still invincible after landing: running back through it does nothing.
	await W.wait_for(self, func() -> bool: return player.grounded, 120)
	assert_true(player.is_invincible(), "invincible after the hit")
	player.ground_speed = 5.0
	press(&"move_right")
	for i in 40:
		await physics_frames(1)
		if player.global_position.x > 40.0 or not player.is_invincible():
			break
	release(&"move_right")
	assert_eq(hurts[0], 1, "no hurt while invincible")
	assert_true(player.global_position.x > 0.0, "passed through it")
	# No tickets (any scattered ones he picked up are dropped), not invincible
	# any more: running into it kills.
	await W.wait_for(self, func() -> bool: return not player.is_invincible(), 200)
	GameState.lose_tickets()
	player.respawn_at(Vector2(-40, -19))
	await physics_frames(2)
	player.ground_speed = 3.0
	await physics_frames(20)
	assert_eq(player.state, &"dead", "dies with no tickets")


func test_rising_into_an_enemy_from_below_destroys_it_once() -> void:
	# A walker on a top-only plank above Sproto; he jumps up through the plank into it.
	await _setup([], Vector2(0, 0))
	W.add_rect(world, Rect2(-40, -70, 80, 6), W.TOP_ONLY)
	var walker := W.place(world, WALKER, Vector2(0, -70), {speed = 0.0}) as Enemy
	await physics_frames(3)
	var score := GameState.score
	press(&"jump")
	await physics_frames(40)
	release(&"jump")
	assert_true(not is_instance_valid(walker) or not walker.alive, "destroyed from below")
	assert_eq(GameState.score, score + 100, "+100 once")
	assert_true(player.state != &"hurt", "no hit taken")


func test_two_enemies_in_one_frame_score_twice_and_bounce_once() -> void:
	var enemies := await _setup([[WALKER, Vector2(-8, 0), {speed = 0.0}], [WALKER, Vector2(8, 0), {speed = 0.0}]])
	var score := GameState.score
	await _drop_attacking(Vector2(0, -36), 5.0)
	var before := 0.0
	var after := 0.0
	var gone := func(e: Variant) -> bool: return not is_instance_valid(e) or not (e as Enemy).alive
	for i in 10:
		before = player.velocity.y
		await physics_frames(1)
		if gone.call(enemies[0]) or gone.call(enemies[1]):
			after = player.velocity.y
			break
	assert_true(gone.call(enemies[0]) and gone.call(enemies[1]), "both destroyed in the same frame")
	assert_eq(GameState.score, score + 200, "+200")
	# One bounce: the fall speed flipped once, then one frame of gravity.
	assert_near(after, -before + Tuning.physics.gravity, 0.05, "a single bounce")


func test_walker_turns_at_walls_and_never_leaves_its_ledge() -> void:
	world = W.new_world(self)
	W.add_rect(world, Rect2(0, 0, 96, 200))  # a ledge with drops on both sides
	W.add_rect(world, Rect2(200, -100, 32, 300))  # a wall
	W.add_rect(world, Rect2(120, 0, 300, 200))  # floor up to the wall
	var on_ledge := W.place(world, WALKER, Vector2(48, 0), {speed = 1.5}) as Enemy
	var by_wall := W.place(world, WALKER, Vector2(160, 0), {speed = 1.5, direction = 1}) as Enemy
	var ledge_x := Vector2(INF, -INF)
	var wall_x := -INF
	var turned := false
	var last_x := by_wall.global_position.x
	for i in 600:
		await physics_frames(1)
		ledge_x = Vector2(minf(ledge_x.x, on_ledge.global_position.x), maxf(ledge_x.y, on_ledge.global_position.x))
		wall_x = maxf(wall_x, by_wall.global_position.x)
		if by_wall.global_position.x < last_x:
			turned = true
		last_x = by_wall.global_position.x
	assert_true(ledge_x.x - 14.0 >= -2.0 and ledge_x.y + 14.0 <= 98.0, "stays on its 96 px ledge (%s)" % ledge_x)
	assert_near(on_ledge.global_position.y, 0.0, 0.01, "still on top")
	assert_true(wall_x + 14.0 <= 200.0 + 0.01, "never enters the wall (max x %.1f)" % wall_x)
	assert_true(turned, "turned at the wall")


func test_hopper_hops_in_place_after_a_telegraph() -> void:
	var hopper := (await _setup([[HOPPER, Vector2(0, 0), {first_hop_delay = 10}]]))[0]
	var top := 0.0
	var run := 0
	var hops := 0
	var shortest_warning := 1000
	var was_grounded := true
	for i in 400:
		await physics_frames(1)
		top = minf(top, hopper.global_position.y)
		if absf(hopper.global_position.x) > 0.001:
			fail("moved sideways")
			break
		var on_floor: bool = hopper.grounded
		if hopper.call(&"is_telegraphing"):
			run += 1
		elif was_grounded and not on_floor:
			hops += 1
			if hops > 1:  # the first hop may come early (first_hop_delay)
				shortest_warning = mini(shortest_warning, run)
			run = 0
		was_grounded = on_floor
	assert_true(hops >= 3, "hops on a timer (%d hops)" % hops)
	assert_true(top < -40.0, "hops about 46 px high (top %.1f)" % top)
	assert_true(shortest_warning >= roundi(0.35 * 60.0), "crouches at least 0.35 s before each hop (%d frames)" % shortest_warning)


func test_difficulty_scales_speed_and_intervals() -> void:
	# Without a level root an enemy uses the act's D (Difficulty.current()).
	SceneRouter.zone_id = "test_zone"
	SceneRouter.stage = 1
	var calm := (await _setup([[WALKER, Vector2(0, 0)]]))[0]
	assert_near(calm.move_speed(1.0), 1.0, 1e-6, "D0: base speed")
	assert_eq(calm.interval_frames(80), 80, "D0: base interval")
	SceneRouter.zone_id = "z4_neon_rush_remix"
	SceneRouter.stage = 2
	var lively := W.place(world, WALKER, Vector2(200, 0)) as Enemy
	assert_near(lively.move_speed(1.0), Difficulty.speed_mult(Difficulty.current()), 1e-6, "D8: speed scaled")
	assert_true(lively.move_speed(1.0) > 1.3, "noticeably livelier in zone 4")
	assert_true(lively.interval_frames(80) < 80, "D8: shorter intervals")
	assert_true(lively.telegraph_frames(0.4) >= roundi(Difficulty.MIN_TELEGRAPH * 60.0), "telegraph floor")


## The same enemy is quicker in an act's finale than in its opening
## (Difficulty.local(LevelRoot.progress_at(x))).
func test_finale_enemies_are_livelier_than_opening_ones() -> void:
	SceneRouter.zone_id = "z1_retro_rush_hills"
	SceneRouter.stage = 2
	var placed := {}
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		W.place(root, "res://levels/objects/goal_sign.tscn", Vector2(1864, 0))
		placed.opening = W.place(root, WALKER, Vector2(150, 0))
		placed.middle = W.place(root, WALKER, Vector2(964, 0))
		placed.finale = W.place(root, WALKER, Vector2(1800, 0))
		placed.hopper_opening = W.place(root, HOPPER, Vector2(200, 0))
		placed.hopper_finale = W.place(root, HOPPER, Vector2(1750, 0)))
	assert_near(level.progress_at(64.0), 0.0, 1e-6, "progress 0 at the start")
	assert_near(level.progress_at(1864.0), 1.0, 1e-6, "progress 1 at the goal")
	var opening := placed.opening as Enemy
	var middle := placed.middle as Enemy
	var finale := placed.finale as Enemy
	assert_near(middle.local_difficulty(), 2.0, 1e-6, "middle: the act's D")
	assert_true(opening.local_difficulty() < middle.local_difficulty(), "the opening is easier")
	assert_true(finale.local_difficulty() > middle.local_difficulty(), "the finale is harder")
	assert_true(finale.move_speed(1.0) > opening.move_speed(1.0),
			"higher speed_mult in the finale (%.3f vs %.3f)" % [finale.move_speed(1.0), opening.move_speed(1.0)])
	var hopper_opening := placed.hopper_opening as Enemy
	var hopper_finale := placed.hopper_finale as Enemy
	assert_true(hopper_finale.interval_frames(80) < hopper_opening.interval_frames(80), "shorter hop interval in the finale")
