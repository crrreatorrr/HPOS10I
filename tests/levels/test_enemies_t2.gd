extends TestCase
## The tier 2 and 3 pill robots (docs/LEVELS.md "Enemy tiers", QA checklist
## 04-zones section J): chaser, floater, pellet pill (and its pellet), spike
## pill. Each one's telegraph (visual state plus the telegraph sound, via the
## Enemy.telegraphed signal) lasts at least 0.35 s, and each is livelier in an
## act's finale than in its middle.

const W := preload("res://tests/levels/level_world.gd")
const CHASER := "res://levels/enemies/chaser.tscn"
const FLOATER := "res://levels/enemies/floater.tscn"
const PELLET_PILL := "res://levels/enemies/pellet_pill.tscn"
const SPIKE_PILL := "res://levels/enemies/spike_pill.tscn"

## 0.35 s, the shortest telegraph allowed at any difficulty.
const MIN_TELEGRAPH_FRAMES := 21

var world: Node2D
var player: Player
var hurts := 0


## Difficulty without a level root comes from the act being played.
func _set_act(zone: String, stage: int) -> void:
	SceneRouter.zone_id = zone
	SceneRouter.stage = stage


## A flat floor (top y = 0), the enemies [[scene, at, props]], and Sproto with his feet at `feet`.
func _setup(enemies: Array, feet := Vector2(-200, 0), floor := true) -> Array[Enemy]:
	world = W.new_world(self)
	if floor:
		W.add_floor(world)
	var out: Array[Enemy] = []
	for e in enemies:
		out.append(W.place(world, e[0], e[1], e[2] if e.size() > 2 else {}) as Enemy)
	player = W.spawn_player(world, feet)
	hurts = 0
	player.hurt_taken.connect(_on_hurt)
	player.state_changed.connect(_on_state)
	GameState.add_tickets(10)  # a hit with no tickets kills; count both
	await W.settle(self, player, feet)
	return out


## Sproto in the jump state, falling at `fall` px/f with his ball centre at `at` (jump held).
func _drop_attacking(at: Vector2, fall := 4.0) -> void:
	press(&"jump")
	await physics_frames(2)
	player.global_position = at
	player.velocity = Vector2(0.0, fall)


func _on_hurt() -> void:
	hurts += 1


func _on_state(_old: StringName, new: StringName) -> void:
	if new == &"dead":
		hurts += 1


func _gone(enemy: Variant) -> bool:
	return not is_instance_valid(enemy) or not (enemy as Enemy).alive


func _pellets() -> Array[Node]:
	return tree.get_nodes_in_group(&"pellets")


# --- Chaser (T2) --------------------------------------------------------------------

func test_chaser_is_t2_and_only_sees_sproto_ahead_and_in_range() -> void:
	_set_act("test_zone", 1)
	var chaser := (await _setup([[CHASER, Vector2(0, 0), {speed = 0.25, direction = -1}]], Vector2(120, 0)))[0]
	assert_eq(chaser.tier, 2, "tier 2")
	var telegraphs := [0]
	chaser.telegraphed.connect(func() -> void: telegraphs[0] += 1)
	await physics_frames(60)
	assert_true(not chaser.call(&"is_telegraphing") and not chaser.call(&"is_rushing"), "ignores Sproto behind it")
	player.respawn_at(chaser.global_position + Vector2(-212.0 - 60.0, -19.0))
	await physics_frames(60)
	assert_eq(telegraphs[0], 0, "ignores Sproto out of sight range")
	player.respawn_at(chaser.global_position + Vector2(-150.0, -19.0))
	var noticed := await W.wait_for(self, func() -> bool: return chaser.call(&"is_telegraphing"), 4)
	assert_true(noticed >= 0, "notices Sproto half a screen ahead")
	assert_eq(telegraphs[0], 1, "the telegraph sound plays")


func test_chaser_telegraphs_at_least_0_35_s_then_rushes_and_hurts() -> void:
	_set_act("z4_neon_rush_remix", 2)  # the hardest act: telegraphs are shortest here
	var chaser := (await _setup([[CHASER, Vector2(0, 0), {speed = 0.25, direction = -1}]], Vector2(-400, 0)))[0]
	player.respawn_at(chaser.global_position + Vector2(-150.0, -19.0))
	var telegraph := 0
	var x_at_telegraph := INF
	var rush_step := 0.0
	var last_x := chaser.global_position.x
	for i in 120:
		await physics_frames(1)
		if hurts > 0 or _gone(chaser):
			break
		if chaser.call(&"is_telegraphing"):
			telegraph += 1
			if x_at_telegraph == INF:
				x_at_telegraph = chaser.global_position.x
			assert_near(chaser.global_position.x, x_at_telegraph, 0.001, "stands still while telegraphing")
		elif chaser.call(&"is_rushing"):
			rush_step = maxf(rush_step, last_x - chaser.global_position.x)
		last_x = chaser.global_position.x
	assert_true(telegraph >= MIN_TELEGRAPH_FRAMES, "telegraph %d frames (>= 0.35 s)" % telegraph)
	assert_true(rush_step > chaser.move_speed(0.25) * 4.0, "rushes much faster than it patrols (%.2f px/f)" % rush_step)
	assert_eq(hurts, 1, "running into a standing Sproto hurts him")


func test_chaser_rush_stops_at_a_ledge() -> void:
	_set_act("test_zone", 1)
	await _setup([], Vector2(260, 0), false)
	W.add_rect(world, Rect2(-300, 0, 400, 200))  # the chaser's ledge ends at x 100
	W.add_rect(world, Rect2(200, 0, 300, 200))  # Sproto across the gap
	var chaser := W.place(world, CHASER, Vector2(0, 0), {direction = 1}) as Enemy
	await W.settle(self, player, Vector2(260, 0))
	var rushed := false
	var max_x := -INF
	for i in 300:
		await physics_frames(1)
		rushed = rushed or chaser.call(&"is_rushing")
		max_x = maxf(max_x, chaser.global_position.x)
		assert_near(chaser.global_position.y, 0.0, 0.01, "stays on its ledge")
		if i > 0 and rushed and not chaser.call(&"is_rushing"):
			break
	assert_true(rushed, "rushed at Sproto")
	assert_true(max_x + 12.0 <= 100.0 + 0.01, "the rush stops at the ledge (max x %.1f)" % max_x)
	assert_true(chaser.grounded, "still grounded")
	assert_eq(hurts, 0, "Sproto across the gap is safe")


func test_chaser_rush_stops_at_a_wall() -> void:
	_set_act("test_zone", 1)
	var chaser := (await _setup([[CHASER, Vector2(0, 0), {direction = 1}]], Vector2(260, 0)))[0]
	W.add_rect(world, Rect2(150, -200, 32, 200))
	await physics_frames(2)
	var rushed := false
	var max_x := -INF
	for i in 300:
		await physics_frames(1)
		rushed = rushed or chaser.call(&"is_rushing")
		max_x = maxf(max_x, chaser.global_position.x)
		if rushed and not chaser.call(&"is_rushing"):
			break
	assert_true(rushed, "rushed at Sproto")
	assert_true(max_x + 14.0 <= 150.0 + 0.01, "the rush stops at the wall (max x %.1f)" % max_x)
	assert_eq(hurts, 0, "Sproto behind the wall is safe")


func test_jumping_on_or_rolling_into_a_chaser_destroys_it() -> void:
	_set_act("test_zone", 1)
	var chasers := await _setup([[CHASER, Vector2(0, 0), {speed = 0.0}], [CHASER, Vector2(400, 0), {speed = 0.0, direction = -1}]],
			Vector2(-300, 0))
	await _drop_attacking(Vector2(0, -40))
	await W.wait_for(self, func() -> bool: return _gone(chasers[0]), 10)
	release(&"jump")
	assert_true(_gone(chasers[0]), "a jump destroys it")
	# A roll into the second one while it rushes at him.
	await W.wait_for(self, func() -> bool: return player.grounded, 120)
	player.respawn_at(Vector2(220, -19))
	await physics_frames(2)
	await W.wait_for(self, func() -> bool: return chasers[1].call(&"is_rushing"), 120)
	player.ground_speed = 5.0
	press(&"move_down")
	await W.wait_for(self, func() -> bool: return _gone(chasers[1]) or hurts > 0, 60)
	release(&"move_down")
	assert_true(_gone(chasers[1]), "a roll destroys it")
	assert_eq(hurts, 0, "no hit taken")


# --- Floater (T2) -------------------------------------------------------------------

func test_floater_stays_on_its_path_at_every_difficulty() -> void:
	for act: Array in [["test_zone", 1], ["z4_neon_rush_remix", 2]]:
		_set_act(act[0], act[1])
		var floater := (await _setup([[FLOATER, Vector2(0, -80)]], Vector2(-300, 0)))[0]
		assert_eq(floater.tier, 2, "tier 2")
		var drift: float = floater.get(&"drift")
		var bob: float = floater.get(&"bob_height")
		var box := Rect2(floater.global_position, Vector2.ZERO)
		for i in 600:
			await physics_frames(1)
			box = box.expand(floater.global_position)
		assert_true(box.position.x >= -drift - 0.01 and box.end.x <= drift + 0.01, "%s: drifts within ±%.0f px (%s)" % [act[0], drift, box])
		assert_true(box.position.y >= -80.0 - bob - 0.01 and box.end.y <= -80.0 + bob + 0.01, "%s: bobs within ±%.0f px (%s)" % [act[0], bob, box])
		assert_true(box.size.x > drift and box.size.y > bob, "%s: it does move along the path" % act[0])
		world.queue_free()
		await physics_frames(1)


func test_floater_is_destroyed_by_a_jump_at_its_height_and_hurts_on_contact() -> void:
	_set_act("test_zone", 1)
	var floaters := await _setup([[FLOATER, Vector2(0, -60), {drift = 0.0, bob_height = 0.0}],
			[FLOATER, Vector2(300, -20), {drift = 0.0, bob_height = 0.0}]], Vector2(0, 0))
	var score := GameState.score
	press(&"jump")
	await W.wait_for(self, func() -> bool: return _gone(floaters[0]), 40)
	release(&"jump")
	assert_true(_gone(floaters[0]), "jumping up into it destroys it")
	assert_eq(GameState.score, score + 100, "+100")
	assert_eq(hurts, 0, "no hit taken")
	# Walking into one hovering at his height hurts.
	await W.wait_for(self, func() -> bool: return player.grounded, 120)
	player.respawn_at(Vector2(250, -19))
	await physics_frames(2)
	press(&"move_right")
	await W.wait_for(self, func() -> bool: return hurts > 0, 90)
	release(&"move_right")
	assert_eq(hurts, 1, "touching it while not attacking hurts")


# --- Pellet pill (T2) ---------------------------------------------------------------

func test_pellet_pill_telegraphs_then_fires_a_slow_pellet_that_hurts() -> void:
	_set_act("z4_neon_rush_remix", 2)
	var pill := (await _setup([[PELLET_PILL, Vector2(0, 0), {facing = -1}]], Vector2(-200, 0)))[0]
	assert_eq(pill.tier, 2, "tier 2")
	var telegraph_at := [-1]
	var clock := [0]  # an array: lambdas capture locals by value
	pill.telegraphed.connect(func() -> void: telegraph_at[0] = clock[0])
	var pellet: Node2D = null
	var glowing := 0
	while clock[0] < 400 and pellet == null:
		await physics_frames(1)
		clock[0] += 1
		if pill.call(&"is_telegraphing"):
			glowing += 1
		if not _pellets().is_empty():
			pellet = _pellets()[0] as Node2D
	assert_true(pellet != null, "fired a pellet")
	if pellet == null:
		return
	var lead: int = clock[0] - telegraph_at[0]
	assert_true(telegraph_at[0] >= 0 and lead >= MIN_TELEGRAPH_FRAMES, "the telegraph sound comes >= 0.35 s before the shot (%d frames)" % lead)
	assert_true(glowing >= MIN_TELEGRAPH_FRAMES, "the cannon glows >= 0.35 s (%d frames)" % glowing)
	var x0 := pellet.global_position.x
	await physics_frames(10)
	var speed := (x0 - pellet.global_position.x) / 10.0
	assert_true(speed > 0.5 and speed <= 3.5, "a slow pellet towards Sproto (%.2f px/f)" % speed)
	assert_near(pellet.global_position.y, -6.0, 0.5, "rolls along the ground")
	await W.wait_for(self, func() -> bool: return hurts > 0, 120)
	assert_eq(hurts, 1, "the pellet hurts a standing Sproto")
	await physics_frames(2)
	assert_true(not is_instance_valid(pellet), "and pops")


func test_pellet_can_be_jumped() -> void:
	_set_act("test_zone", 1)
	var pill := (await _setup([[PELLET_PILL, Vector2(0, 0), {facing = -1}]], Vector2(-200, 0)))[0]
	await W.wait_for(self, func() -> bool: return not _pellets().is_empty(), 400)
	assert_eq(_pellets().size(), 1, "fired")
	var pellet := _pellets()[0] as Node2D
	await W.wait_for(self, func() -> bool:
		return not is_instance_valid(pellet) or pellet.global_position.x - player.global_position.x < 40.0, 200)
	press(&"jump")
	await physics_frames(50)
	release(&"jump")
	await W.wait_for(self, func() -> bool: return player.grounded, 120)
	assert_eq(hurts, 0, "jumped clear (the pellet passed under or popped on his ball)")
	assert_true(pill.alive, "the pill is still there")


func test_pellets_pop_at_walls_and_ledges() -> void:
	_set_act("test_zone", 1)
	await _setup([], Vector2(-900, 0), false)
	W.add_rect(world, Rect2(-1000, 0, 2000, 200))
	W.add_rect(world, Rect2(-150, -100, 32, 100))  # a wall left of the first pill
	W.add_rect(world, Rect2(300, 0, 200, 200))  # a ledge: the floor right of 500 is missing...
	var at_wall := W.place(world, PELLET_PILL, Vector2(0, 0), {facing = -1})
	await physics_frames(2)
	var pellet: Node2D = at_wall.call(&"fire")
	var last_x := pellet.global_position.x
	for i in 120:
		await physics_frames(1)
		if not is_instance_valid(pellet):
			break
		last_x = pellet.global_position.x
	assert_true(not is_instance_valid(pellet), "popped at the wall")
	assert_true(last_x - 4.0 >= -118.0 - 0.01, "never inside the wall (last x %.1f)" % last_x)
	# A ledge: a short island with a drop on its right.
	W.add_rect(world, Rect2(-600, -300, 200, 16))
	await physics_frames(1)
	var island := W.place(world, PELLET_PILL, Vector2(-500, -300), {facing = 1})
	await W.wait_for(self, func() -> bool: return island.get(&"grounded"), 60)
	pellet = island.call(&"fire")
	var lowest := -INF
	for i in 120:
		await physics_frames(1)
		if not is_instance_valid(pellet):
			break
		lowest = maxf(lowest, pellet.global_position.y)
		last_x = pellet.global_position.x
	assert_true(not is_instance_valid(pellet), "popped at the ledge")
	assert_true(lowest <= -300.0 - 6.0 + 0.5 and last_x <= -400.0 + 2.0, "never fell off (x %.1f, y %.1f)" % [last_x, lowest])


func test_pellet_pill_never_shoots_from_off_screen_and_pellets_despawn_off_screen() -> void:
	_set_act("test_zone", 1)
	var pill := (await _setup([[PELLET_PILL, Vector2(0, 0), {facing = -1}]], Vector2(-200, 0)))[0]
	var camera := Camera2D.new()
	camera.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	camera.position = Vector2(3000, 0)
	world.add_child(camera)
	camera.make_current()
	await physics_frames(400)
	assert_eq(_pellets().size(), 0, "no shot while the pill is off screen")
	assert_true(not pill.call(&"is_telegraphing"), "no telegraph either")
	var stray: Node2D = pill.call(&"fire")
	await physics_frames(2)
	assert_true(not is_instance_valid(stray), "a pellet off screen despawns")
	# On screen: a pellet that rolls out of view despawns just past the edge.
	camera.position = Vector2(0, -100)
	player.respawn_at(Vector2(-200, -400))  # out of the pill's range
	await physics_frames(2)
	var view := get_viewport_rect_width()
	var pellet: Node2D = pill.call(&"fire")
	var last_x := pellet.global_position.x
	for i in 400:
		await physics_frames(1)
		if not is_instance_valid(pellet):
			break
		last_x = pellet.global_position.x
	assert_true(not is_instance_valid(pellet), "despawned")
	assert_true(last_x >= -view / 2.0 - 32.0 - 4.0, "just past the screen edge (last x %.1f)" % last_x)


func get_viewport_rect_width() -> float:
	return tree.root.get_visible_rect().size.x


## Five minutes of shots at the hardest act's rate is about 185 pellets; the
## runner caps a test at 7200 frames, so this pill fires every 35 frames.
func test_pellet_pill_leaks_no_pellets_over_five_minutes_of_shots() -> void:
	_set_act("test_zone", 1)
	await _setup([], Vector2(-300, -40))
	W.add_rect(world, Rect2(-500, -40, 350, 40))  # Sproto on a step; the pellets pop at its face
	W.place(world, PELLET_PILL, Vector2(0, 0), {facing = -1, fire_interval = 35})
	await W.settle(self, player, Vector2(-300, -40))
	var fired := [0]
	world.child_entered_tree.connect(func(node: Node) -> void:
		if node.scene_file_path.ends_with("pellet.tscn"):
			fired[0] += 1)
	await physics_frames(600)
	var nodes_before := Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
	var most := 0
	for chunk in 60:
		await physics_frames(100)
		most = maxi(most, _pellets().size())
	var nodes_after := Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
	assert_true(fired[0] >= 185, "fired five minutes' worth of pellets (%d)" % fired[0])
	assert_true(most <= 3, "never more than 3 pellets alive (%d)" % most)
	assert_true(absf(nodes_after - nodes_before) <= 3.0, "node count flat (%d, then %d)" % [nodes_before, nodes_after])
	assert_eq(hurts, 0, "Sproto on the step was never hit")


func test_pellet_pill_can_be_hit_between_shots() -> void:
	_set_act("test_zone", 1)
	var pills := await _setup([[PELLET_PILL, Vector2(0, 0), {facing = -1}]], Vector2(-200, 0))
	await W.wait_for(self, func() -> bool: return not _pellets().is_empty(), 400)
	await physics_frames(10)
	assert_true(not pills[0].call(&"is_telegraphing"), "between shots")
	await _drop_attacking(Vector2(0, -50))
	await W.wait_for(self, func() -> bool: return _gone(pills[0]), 12)
	release(&"jump")
	assert_true(_gone(pills[0]), "a jump destroys it")


# --- Spike pill (T3) ----------------------------------------------------------------

## Phase lengths over `frames`: {warning = [runs], spiked = [runs], telegraphs = n}.
func _spike_cycles(pill: Enemy, frames: int) -> Dictionary:
	var out := {warning = [], spiked = [], safe_to_safe = [], telegraphs = 0}
	pill.telegraphed.connect(func() -> void: out.telegraphs += 1)
	var last := -1
	var run := 0
	var safe_started := -1
	for i in frames:
		await physics_frames(1)
		var phase: int = pill.get(&"phase")
		if phase == last:
			run += 1
			continue
		if last == 1:
			out.warning.append(run)
		elif last == 2:
			out.spiked.append(run)
		if phase == 0:
			if safe_started >= 0:
				out.safe_to_safe.append(i - safe_started)
			safe_started = i
		last = phase
		run = 1
	return out


func test_spike_pill_telegraphs_its_spikes_at_least_0_35_s() -> void:
	_set_act("z4_neon_rush_remix", 2)
	var pill := (await _setup([[SPIKE_PILL, Vector2(0, 0), {speed = 0.0, safe_frames = 60}]], Vector2(-300, 0)))[0]
	assert_eq(pill.tier, 3, "tier 3")
	var cycles := await _spike_cycles(pill, 600)
	assert_true(cycles.warning.size() >= 2, "spikes come out on a timer (%s)" % [cycles])
	for run: int in cycles.warning:
		assert_true(run >= MIN_TELEGRAPH_FRAMES, "warning %d frames (>= 0.35 s)" % run)
	assert_true(cycles.telegraphs >= cycles.warning.size(), "the telegraph sound plays each time")


func test_spike_pill_hurts_while_spiked_and_breaks_while_retracted() -> void:
	_set_act("test_zone", 1)
	var pills := await _setup([[SPIKE_PILL, Vector2(0, 0), {speed = 0.0, safe_frames = 60}],
			[SPIKE_PILL, Vector2(400, 0), {speed = 0.0, safe_frames = 5000}]], Vector2(-300, 0))
	await W.wait_for(self, func() -> bool: return pills[0].call(&"spikes_out"), 200)
	assert_true(pills[0].call(&"spikes_out"), "spikes out")
	await _drop_attacking(Vector2(0, -50))
	await W.wait_for(self, func() -> bool: return hurts > 0, 12)
	release(&"jump")
	assert_eq(hurts, 1, "a jump onto the spikes hurts")
	assert_true(not _gone(pills[0]), "and doesn't break it")
	await W.wait_for(self, func() -> bool: return player.grounded, 200)
	await W.wait_for(self, func() -> bool: return not player.is_invincible(), 300)
	assert_true(not pills[1].call(&"spikes_out") and not pills[1].call(&"is_telegraphing"), "the other is retracted")
	await _drop_attacking(Vector2(400, -50))
	await W.wait_for(self, func() -> bool: return _gone(pills[1]), 12)
	release(&"jump")
	assert_true(_gone(pills[1]), "retracted, a jump destroys it")
	assert_eq(hurts, 1, "no second hit")


func test_spike_pill_timer_scales_with_interval_mult() -> void:
	var cycle := {}
	for act: Array in [["test_zone", 1], ["z4_neon_rush_remix", 2]]:
		_set_act(act[0], act[1])
		var pill := (await _setup([[SPIKE_PILL, Vector2(0, 0), {speed = 0.0}]], Vector2(-300, 0)))[0]
		var cycles := await _spike_cycles(pill, 800)
		assert_true(cycles.safe_to_safe.size() >= 2, "%s: full cycles" % act[0])
		cycles.safe_to_safe.pop_front()  # started during the set-up
		var expected: int = pill.interval_frames(pill.get(&"safe_frames")) + int(pill.get(&"spiked_frames"))
		assert_true(absi(cycles.safe_to_safe[0] - expected) <= 1, "%s: cycle %d frames (expected %d)" % [act[0], cycles.safe_to_safe[0], expected])
		cycle[act[0]] = cycles.safe_to_safe[0]
		world.queue_free()
		await physics_frames(1)
	assert_true(cycle.z4_neon_rush_remix < cycle.test_zone, "a shorter cycle at a higher difficulty %s" % cycle)


# --- In-act ramp ----------------------------------------------------------------------

## Probed at progress 0.5 and 0.95 of a level: livelier in the finale, telegraphs never under 0.35 s.
func test_t2_t3_enemies_are_livelier_in_the_finale() -> void:
	_set_act("z1_retro_rush_hills", 2)
	var scenes := [CHASER, FLOATER, PELLET_PILL, SPIKE_PILL]
	var placed := {}
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		W.place(root, "res://levels/objects/goal_sign.tscn", Vector2(1864, 0))
		for path: String in scenes:
			placed[path] = [W.place(root, path, Vector2(64 + 0.5 * 1800, -60 if path == FLOATER else 0)),
					W.place(root, path, Vector2(64 + 0.95 * 1800, -60 if path == FLOATER else 0))])
	assert_near(level.progress_at(64 + 0.95 * 1800), 0.95, 1e-6, "progress probe")
	for path: String in scenes:
		var middle := placed[path][0] as Enemy
		var finale := placed[path][1] as Enemy
		var label := path.get_file()
		assert_true(finale.local_difficulty() > middle.local_difficulty(), "%s: harder in the finale" % label)
		assert_true(finale.move_speed(1.0) > middle.move_speed(1.0), "%s: faster in the finale" % label)
		assert_true(finale.interval_frames(150) < middle.interval_frames(150), "%s: shorter intervals in the finale" % label)
		assert_true(finale.telegraph_frames(0.5) >= MIN_TELEGRAPH_FRAMES, "%s: telegraph still >= 0.35 s" % label)
