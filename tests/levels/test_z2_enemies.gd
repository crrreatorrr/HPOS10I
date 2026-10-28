extends TestCase
## Wizard Academy pill robots (docs/LEVELS.md "Enemy tiers", docs/DESIGN.md
## costumes; QA checklist 04-zones section J): the spellbook pill (Floater,
## T2), the diving spellbook pill (Diver, T3) and the knight pill (Armored,
## T3), the knight pill (Armored, T3) and the lantern pill (Dropper, T4), on
## the generic diver.gd, armored.gd and dropper.gd behaviours.

const W := preload("res://tests/levels/level_world.gd")
const SPELLBOOK := "res://levels/enemies/z2/spellbook_pill.tscn"
const DIVER := "res://levels/enemies/z2/spellbook_diver.tscn"
const KNIGHT := "res://levels/enemies/z2/knight_pill.tscn"
const LANTERN := "res://levels/enemies/z2/lantern_pill.tscn"
const GENERIC := ["res://levels/enemies/diver.tscn", "res://levels/enemies/armored.tscn", "res://levels/enemies/dropper.tscn"]

const MIN_TELEGRAPH_FRAMES := 21
const FEET := 19.0

var world: Node2D
var player: Player
var hurts := 0


func _set_act(zone: String, stage: int) -> void:
	SceneRouter.zone_id = zone
	SceneRouter.stage = stage


func _setup(enemies: Array, feet := Vector2(-300, 0)) -> Array[Enemy]:
	world = W.new_world(self)
	W.add_floor(world)
	var out: Array[Enemy] = []
	for e in enemies:
		out.append(W.place(world, e[0], e[1], e[2] if e.size() > 2 else {}) as Enemy)
	player = W.spawn_player(world, feet)
	hurts = 0
	player.hurt_taken.connect(_on_hurt)
	player.state_changed.connect(_on_state)
	GameState.add_tickets(10)
	await W.settle(self, player, feet)
	return out


func _on_hurt() -> void:
	hurts += 1


func _on_state(_old: StringName, new: StringName) -> void:
	if new == &"dead":
		hurts += 1


func _gone(enemy: Variant) -> bool:
	return not is_instance_valid(enemy) or not (enemy as Enemy).alive


func _stand(feet: Vector2) -> void:
	player.respawn_at(feet - Vector2(0.0, FEET))
	await physics_frames(2)


## Sproto in the jump state, falling at `fall` px/f with his ball centre at `at` (jump held).
func _drop_attacking(at: Vector2, fall := 4.0) -> void:
	press(&"jump")
	await physics_frames(2)
	player.global_position = at
	player.velocity = Vector2(0.0, fall)


func test_zone_2_pills_are_on_the_roster() -> void:
	_set_act("test_zone", 1)
	var enemies := await _setup([[SPELLBOOK, Vector2(0, -80)], [DIVER, Vector2(200, -150)], [KNIGHT, Vector2(400, 0)],
			[GENERIC[0], Vector2(600, -150)], [GENERIC[1], Vector2(800, 0)], [LANTERN, Vector2(1000, -150)],
			[GENERIC[2], Vector2(1200, -150)]])
	var tiers := enemies.map(func(e: Enemy) -> int: return e.tier)
	assert_eq(tiers, [2, 3, 3, 3, 3, 4, 4], "spellbook T2; diver, knight and the generic diver/armored T3; droppers T4")
	for e in enemies:
		assert_eq(e.collision_layer, Layers.ENEMIES, "%s on the enemies layer" % e.name)
	await physics_frames(30)  # every costume draws without errors


# --- Spellbook pill (Floater, T2) ---------------------------------------------------

func test_spellbook_pill_floats_on_its_path_and_a_jump_destroys_it() -> void:
	_set_act("z4_neon_rush_remix", 2)
	var book := (await _setup([[SPELLBOOK, Vector2(0, -80)]]))[0]
	var box := Rect2(book.global_position, Vector2.ZERO)
	for i in 400:
		await physics_frames(1)
		box = box.expand(book.global_position)
	var drift: float = book.get(&"drift")
	var bob: float = book.get(&"bob_height")
	assert_true(box.position.x >= -drift - 0.01 and box.end.x <= drift + 0.01
			and box.position.y >= -80.0 - bob - 0.01 and box.end.y <= -80.0 + bob + 0.01, "stays on its path %s" % box)
	var books := [book]
	book.set(&"drift", 0.0)
	book.set(&"bob_height", 0.0)
	await physics_frames(2)
	await _stand(Vector2(book.global_position.x, 0))
	press(&"jump")
	await W.wait_for(self, func() -> bool: return _gone(books[0]), 40)
	release(&"jump")
	assert_true(_gone(books[0]), "a jump up into it destroys it")
	assert_eq(hurts, 0, "no hit taken")


# --- Diving spellbook pill (Diver, T3) ----------------------------------------------

func test_diver_telegraphs_then_swoops_at_where_sproto_was() -> void:
	_set_act("z4_neon_rush_remix", 2)  # shortest telegraph
	var diver := (await _setup([[DIVER, Vector2(0, -150)]], Vector2(-400, 0)))[0]
	var sounds := [0]
	diver.telegraphed.connect(func() -> void: sounds[0] += 1)
	await physics_frames(10)
	assert_true(not diver.call(&"is_telegraphing"), "ignores Sproto out of range")
	await _stand(Vector2(60, 0))
	var spot := player.global_position
	await W.wait_for(self, func() -> bool: return diver.call(&"is_telegraphing"), 5)
	assert_true(diver.call(&"is_telegraphing"), "notices Sproto below")
	assert_eq(sounds[0], 1, "the telegraph sound plays")
	assert_true((diver.get(&"target") as Vector2).distance_to(spot) < 1.0, "marks where Sproto is")
	var post := diver.global_position
	var telegraph := 0
	while diver.call(&"is_telegraphing") and telegraph < 200:
		await physics_frames(1)
		telegraph += 1
		if diver.call(&"is_telegraphing"):
			assert_true(diver.global_position.distance_to(post) < 0.01, "holds still while telegraphing")
	assert_true(telegraph >= MIN_TELEGRAPH_FRAMES - 1, "telegraph %d frames (>= 0.35 s)" % (telegraph + 1))
	# The swoop: a straight line at the marked spot; Sproto stands still and is hit.
	var start := diver.global_position
	var heading := (spot - start).normalized()
	for i in 120:
		await physics_frames(1)
		if hurts > 0 or not diver.call(&"is_swooping"):
			break
		var off_line := (diver.global_position - start).cross(heading)
		assert_true(absf(off_line) < 0.5, "a straight swoop, not homing (%.2f px off)" % off_line)
	assert_eq(hurts, 1, "standing still where it aimed: hit")


func test_moving_after_the_telegraph_avoids_the_swoop() -> void:
	for act: Array in [["test_zone", 1], ["z4_neon_rush_remix", 2]]:
		_set_act(act[0], act[1])
		var diver := (await _setup([[DIVER, Vector2(0, -150)]], Vector2(-400, 0)))[0]
		await _stand(Vector2(60, 0))
		await W.wait_for(self, func() -> bool: return diver.call(&"is_telegraphing"), 5)
		var aim: Vector2 = diver.get(&"target")
		# He sees the flash and runs.
		press(&"move_right")
		var reached := false
		for i in 240:
			await physics_frames(1)
			reached = reached or diver.global_position.distance_to(aim) < 1.0
			if reached and diver.get(&"mode") == 4:  # resting at its post
				break
		release(&"move_right")
		assert_true(reached, "%s: it swooped all the way to the old spot" % act[0])
		assert_eq(hurts, 0, "%s: moving after the telegraph avoids it" % act[0])
		world.queue_free()
		await physics_frames(1)


## BUG-Z2-01: from posts 60-160 px above the floor at D1, D6 and D10, running
## the moment it flashes always avoids the dive, and it never dives at a
## target less than 120 px below its post.
func test_diver_never_dives_short_and_running_at_the_flash_always_avoids_it() -> void:
	var acts := {1: ["z1_retro_rush_hills", 1], 6: ["z3_capital_mansion", 2], 10: ["z4_neon_rush_remix", 3]}
	for d: int in acts:
		_set_act(acts[d][0], acts[d][1])
		assert_near(Difficulty.current(), float(d), 0.01, "D%d" % d)
		for post: float in [60.0, 80.0, 100.0, 120.0, 160.0]:
			for dx: float in [0.0, 60.0]:
				var diver := (await _setup([[DIVER, Vector2(0, -post)]], Vector2(-400, 0)))[0]
				var telegraphs := [0]
				diver.telegraphed.connect(func() -> void: telegraphs[0] += 1)
				await _stand(Vector2(dx, 0))
				var spotted := await W.wait_for(self, func() -> bool: return diver.call(&"is_telegraphing"), 30)
				var drop := post - FEET
				var label := "D%d, post %.0f px up, Sproto %.0f px across" % [d, post, dx]
				if drop < 120.0:
					await physics_frames(60)
					assert_eq(telegraphs[0], 0, "%s: a %.0f px dive is too short: no telegraph" % [label, drop])
					assert_true(diver.get(&"mode") == 0, "%s: it keeps hovering" % label)
				else:
					assert_true(spotted >= 0, "%s: it dives" % label)
					press(&"move_right")  # he runs the moment it flashes
					await W.wait_for(self, func() -> bool: return diver.get(&"mode") == 3 or hurts > 0, 180)
					release(&"move_right")
					assert_eq(hurts, 0, "%s: running at the flash avoids it" % label)
				world.queue_free()
				await physics_frames(1)


func test_a_jump_destroys_the_diver_mid_swoop() -> void:
	_set_act("test_zone", 1)
	var divers := await _setup([[DIVER, Vector2(0, -150)]], Vector2(-400, 0))
	await _stand(Vector2(40, 0))
	await W.wait_for(self, func() -> bool: return divers[0].call(&"is_swooping"), 120)
	assert_true(divers[0].call(&"is_swooping"), "swooping")
	await W.wait_for(self, func() -> bool: return divers[0].global_position.y > -90.0, 60)
	press(&"jump")
	await W.wait_for(self, func() -> bool: return _gone(divers[0]) or hurts > 0, 40)
	release(&"jump")
	assert_true(_gone(divers[0]), "destroyed during the swoop")
	assert_eq(hurts, 0, "no hit taken")


func test_diver_never_dives_from_off_screen() -> void:
	_set_act("test_zone", 1)
	var diver := (await _setup([[DIVER, Vector2(0, -150)]], Vector2(-400, 0)))[0]
	var camera := Camera2D.new()
	camera.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	camera.position = Vector2(3000, 0)
	world.add_child(camera)
	camera.make_current()
	await physics_frames(2)
	await _stand(Vector2(60, 0))
	await physics_frames(120)
	assert_true(diver.get(&"mode") == 0, "no telegraph or swoop while off screen")


# --- Knight pill (Armored, T3) ------------------------------------------------------

## A standing knight facing `facing` at x 0, and Sproto `gap` px away on the
## `side` (+1 in front of it, -1 behind it).
func _knight(facing: int, side: int, gap := 70.0) -> Array:
	var knights := await _setup([[KNIGHT, Vector2(0, 0), {speed = 0.0, direction = facing}]], Vector2(facing * side * gap, 0))
	player.facing = -facing * side  # looking at the knight
	return knights


func _roll_in(towards: int, speed: float) -> void:
	player.ground_speed = towards * speed
	press(&"move_down")
	await physics_frames(2)
	release(&"move_down")


func test_knight_shield_hurts_a_jump_into_its_front() -> void:
	for facing in [-1, 1]:
		var knights := await _knight(facing, 1, 32.0)
		player.ground_speed = -facing * 4.0
		press(&"jump")
		await W.wait_for(self, func() -> bool: return hurts > 0 or _gone(knights[0]), 30)
		release(&"jump")
		assert_eq(hurts, 1, "facing %d: the shield hurts a jump into the front" % facing)
		assert_true(not _gone(knights[0]), "facing %d: the knight survives" % facing)
		world.queue_free()
		await physics_frames(1)


func test_knight_breaks_from_above_or_behind() -> void:
	for facing in [-1, 1]:
		# From above, even right over its shield side.
		var knights := await _knight(facing, 1)
		await _drop_attacking(Vector2(facing * 6.0, -50))
		await W.wait_for(self, func() -> bool: return _gone(knights[0]) or hurts > 0, 12)
		release(&"jump")
		assert_true(_gone(knights[0]) and hurts == 0, "facing %d: a jump onto it from above destroys it" % facing)
		world.queue_free()
		await physics_frames(1)
		# From behind, with a slow roll.
		knights = await _knight(facing, -1)
		await _roll_in(facing, 2.5)
		await W.wait_for(self, func() -> bool: return _gone(knights[0]) or hurts > 0, 60)
		assert_true(_gone(knights[0]) and hurts == 0, "facing %d: a slow roll into its back destroys it" % facing)
		world.queue_free()
		await physics_frames(1)


func test_knight_front_breaks_only_to_a_fast_roll() -> void:
	for facing in [-1, 1]:
		var knights := await _knight(facing, 1)
		await _roll_in(-facing, 3.0)
		await W.wait_for(self, func() -> bool: return _gone(knights[0]) or hurts > 0, 60)
		assert_eq(hurts, 1, "facing %d: a roll under 4.5 into the shield bounces off and hurts" % facing)
		assert_true(not _gone(knights[0]), "facing %d: and the knight survives" % facing)
		await physics_frames(40)
		assert_eq(hurts, 1, "facing %d: no double hit" % facing)
		world.queue_free()
		await physics_frames(1)
		knights = await _knight(facing, 1)
		await _roll_in(-facing, 6.0)
		await W.wait_for(self, func() -> bool: return _gone(knights[0]) or hurts > 0, 60)
		assert_true(_gone(knights[0]) and hurts == 0, "facing %d: a roll at 4.5+ breaks through the front" % facing)
		world.queue_free()
		await physics_frames(1)


func test_knight_front_breaks_to_a_full_spin_dash() -> void:
	for facing in [-1, 1]:
		var knights := await _knight(facing, 1, 90.0)
		press(&"move_down")
		await physics_frames(3)
		for i in 5:
			press(&"jump")
			await physics_frames(1)
			release(&"jump")
			await physics_frames(2)
		assert_eq(player.state, &"spindash", "facing %d: charging a spin dash" % facing)
		release(&"move_down")
		await W.wait_for(self, func() -> bool: return _gone(knights[0]) or hurts > 0, 60)
		assert_true(_gone(knights[0]) and hurts == 0, "facing %d: a full spin dash breaks it from the front" % facing)
		world.queue_free()
		await physics_frames(1)


# --- Lantern pill (Dropper, T4) ----------------------------------------------------

func test_lantern_drops_only_when_sproto_moves_under_it_after_a_telegraph() -> void:
	_set_act("z4_neon_rush_remix", 2)
	var lanterns := await _setup([[LANTERN, Vector2(0, -150), {arm_frames = 10}]], Vector2(-300, 0))
	var lantern := lanterns[0]
	await physics_frames(20)
	await _stand(Vector2(60, 0))  # beside it, outside its trigger width
	await physics_frames(30)
	assert_true(lantern.get(&"mode") == 0, "ignores Sproto beside it")
	var clock := [0]
	var shook_at := [-1]
	lantern.telegraphed.connect(func() -> void: shook_at[0] = clock[0])
	var fell_at := -1
	var y0 := lantern.global_position.y
	player.respawn_at(Vector2(0, -FEET))
	for i in 120:
		await physics_frames(1)
		clock[0] += 1
		if _gone(lanterns[0]):
			break
		if lantern.call(&"is_telegraphing"):
			assert_near(lantern.global_position.y, y0, 0.001, "hangs while shaking")
		elif lantern.call(&"is_falling") and fell_at < 0:
			fell_at = clock[0]
		if hurts > 0:
			break
	assert_true(shook_at[0] >= 0 and fell_at - shook_at[0] >= MIN_TELEGRAPH_FRAMES,
			"shakes %d frames before it drops (>= 0.35 s)" % (fell_at - shook_at[0]))
	assert_eq(hurts, 1, "a standing Sproto under it is hit")


func test_lantern_never_drops_on_a_respawn_underneath() -> void:
	_set_act("test_zone", 1)
	var lantern := (await _setup([[LANTERN, Vector2(0, -150), {arm_frames = 10}]], Vector2(0, 0)))[0]
	await physics_frames(200)
	assert_true(lantern.get(&"mode") == 0, "Sproto spawned under it: it waits")
	await _stand(Vector2(200, 0))
	await physics_frames(5)
	await _stand(Vector2(10, 0))
	var noticed := await W.wait_for(self, func() -> bool: return lantern.call(&"is_telegraphing"), 5)
	assert_true(noticed >= 0, "it drops once he comes back under it")


func test_lantern_breaks_on_landing_without_score_and_a_jump_destroys_it() -> void:
	_set_act("test_zone", 1)
	var lanterns := await _setup([[LANTERN, Vector2(0, -150), {arm_frames = 0}], [LANTERN, Vector2(400, -100), {arm_frames = 100000}]],
			Vector2(-300, 0))
	var landed := [false]
	lanterns[0].connect(&"landed", func() -> void: landed[0] = true)
	var score := GameState.score
	await _stand(Vector2(0, 0))
	await W.wait_for(self, func() -> bool: return lanterns[0].call(&"is_falling"), 60)
	await _stand(Vector2(-200, 0))
	await W.wait_for(self, func() -> bool: return _gone(lanterns[0]), 120)
	assert_true(landed[0] and _gone(lanterns[0]), "breaks when it lands")
	assert_eq(GameState.score, score, "no score for a landing")
	# Jumping up into the second while it hangs.
	await _stand(Vector2(400, 0))
	press(&"jump")
	await W.wait_for(self, func() -> bool: return _gone(lanterns[1]) or hurts > 0, 40)
	release(&"jump")
	assert_true(_gone(lanterns[1]), "a jump destroys it")
	assert_eq(GameState.score, score + 100, "+100")
	assert_eq(hurts, 0, "no hit taken")


# --- In-act ramp ----------------------------------------------------------------------

func test_zone_2_pills_are_livelier_in_the_finale() -> void:
	_set_act("z1_retro_rush_hills", 2)
	var scenes := [SPELLBOOK, DIVER, KNIGHT, LANTERN]
	var placed := {}
	await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		W.place(root, "res://levels/objects/goal_sign.tscn", Vector2(1864, 0))
		for path: String in scenes:
			var y := 0.0 if path == KNIGHT else -120.0
			placed[path] = [W.place(root, path, Vector2(64 + 0.5 * 1800, y)), W.place(root, path, Vector2(64 + 0.95 * 1800, y))])
	for path: String in scenes:
		var middle := placed[path][0] as Enemy
		var finale := placed[path][1] as Enemy
		assert_true(finale.move_speed(1.0) > middle.move_speed(1.0), "%s: faster in the finale" % path.get_file())
		assert_true(finale.interval_frames(90) < middle.interval_frames(90), "%s: shorter rests in the finale" % path.get_file())
		assert_true(finale.telegraph_frames(0.6) >= MIN_TELEGRAPH_FRAMES, "%s: telegraph still >= 0.35 s" % path.get_file())
