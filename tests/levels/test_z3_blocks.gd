extends TestCase
## Capital Mansion blocks: the conveyor (conveyor_speed meta), the security
## beam (telegraphed timer hazard), the door and floor switch, and the zone's
## pills: drone pill (Floater), drone diver (Diver), clerk pill (Pellet pill
## throwing paper in aimed arcs), bouncer pill (Armored), security pill
## (Spike), chandelier pill (Dropper) and camera pill (the new T4 Sniper:
## aimed burst after a long telegraph, line of sight, no shots from off
## screen). QA checklist 04-zones sections C, F and J.

const W := preload("res://tests/levels/level_world.gd")
const Z3 := "res://levels/objects/z3/"
const E3 := "res://levels/enemies/z3/"
const CONVEYOR := Z3 + "conveyor.tscn"
const BEAM := Z3 + "security_beam.tscn"
const DOOR := Z3 + "door.tscn"
const SWITCH := Z3 + "floor_switch.tscn"
const DRONE := E3 + "drone_pill.tscn"
const DRONE_DIVER := E3 + "drone_diver.tscn"
const CLERK := E3 + "clerk_pill.tscn"
const BOUNCER := E3 + "bouncer_pill.tscn"
const SECURITY := E3 + "security_pill.tscn"
const CHANDELIER := E3 + "chandelier_pill.tscn"
const CAMERA := E3 + "camera_pill.tscn"
const SNIPER := "res://levels/enemies/sniper.tscn"

const MIN_TELEGRAPH_FRAMES := 21
const FEET := 19.0

var world: Node2D
var player: Player
var hurts := 0


func _set_act(zone: String, stage: int) -> void:
	SceneRouter.zone_id = zone
	SceneRouter.stage = stage


func _setup(feet := Vector2(-300, 0), floor := true) -> void:
	world = W.new_world(self)
	if floor:
		W.add_floor(world)
	player = W.spawn_player(world, feet)
	hurts = 0
	player.hurt_taken.connect(_on_hurt)
	player.state_changed.connect(_on_state)
	GameState.add_tickets(10)
	await W.settle(self, player, feet)


func _on_hurt() -> void:
	hurts += 1


func _on_state(_old: StringName, new: StringName) -> void:
	if new == &"dead":
		hurts += 1


func _place(path: String, at: Vector2, props := {}) -> Node:
	return W.place(world, path, at, props)


func _stand(feet: Vector2) -> void:
	player.respawn_at(feet - Vector2(0.0, FEET))
	await physics_frames(2)


func _gone(enemy: Variant) -> bool:
	return not is_instance_valid(enemy) or not (enemy as Enemy).alive


func _pellets() -> Array[Node]:
	return tree.get_nodes_in_group(&"pellets")


# --- Conveyor -----------------------------------------------------------------------

func test_conveyor_carries_a_standing_sproto_and_fights_a_runner() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-300, 0), false)
	W.add_rect(world, Rect2(-600, 0, 300, 200))
	var belt := _place(CONVEYOR, Vector2(-300, 0), {size = Vector2(1200, 48), speed = -3.0})
	assert_eq((belt as CollisionObject2D).collision_layer, Layers.TERRAIN_SOLID, "a solid floor")
	assert_near(float(belt.get_meta(&"conveyor_speed")), -3.0, 0.001, "carries the conveyor_speed meta")
	await _stand(Vector2(600, 0))
	var x0 := player.global_position.x
	await physics_frames(60)
	assert_near(player.global_position.x - x0, -180.0, 6.0, "standing still, carried 3 px/f left")
	assert_true(player.grounded and absf(player.ground_speed) < 0.1, "grounded, ground speed untouched")
	var x1 := player.global_position.x
	press(&"move_right")
	await physics_frames(180)
	release(&"move_right")
	assert_true(player.ground_speed > 5.0 and player.global_position.x > x1 + 100.0,
			"running right beats a 3 px/f belt (%.0f px gained)" % (player.global_position.x - x1))


# --- Security beam ------------------------------------------------------------------

func _beam_runs(beam: Node, frames: int) -> Dictionary:
	var out := {warning = [], on = [], cycle = [], telegraphs = 0, hurt_off = 0}
	beam.connect(&"telegraphed", func() -> void: out.telegraphs += 1)
	var last := -1
	var run := 0
	var off_started := -1
	var hurts_before := hurts
	for i in frames:
		await physics_frames(1)
		var phase: int = beam.get(&"phase")
		if hurts > hurts_before and phase != 2 and last != 2:
			out.hurt_off += 1
		hurts_before = hurts
		if phase == last:
			run += 1
			continue
		if last == 1:
			out.warning.append(run)
		elif last == 2:
			out.on.append(run)
		if phase == 0:
			if off_started >= 0:
				out.cycle.append(i - off_started)
			off_started = i
		last = phase
		run = 1
	return out


func test_security_beam_telegraphs_then_hurts_even_a_roller() -> void:
	_set_act("z4_neon_rush_remix", 2)
	await _setup(Vector2(0, 0))
	var beam := _place(BEAM, Vector2(0, -160), {off_frames = 60, on_frames = 60, length = 160.0})
	await _stand(Vector2(0, 0))
	var runs := await _beam_runs(beam, 400)
	assert_true(runs.on.size() >= 2, "fires on a timer (%s)" % [runs])
	for w: int in runs.warning:
		assert_true(w >= MIN_TELEGRAPH_FRAMES, "blinks %d frames before the beam (>= 0.35 s)" % w)
	assert_true(runs.telegraphs >= runs.on.size(), "the telegraph sound each time")
	assert_true(hurts >= 1, "standing in the beam hurts")
	assert_eq(runs.hurt_off, 0, "harmless while off")
	# A roll through the beam while it is on still hurts.
	await _stand(Vector2(-120, 0))
	await W.wait_for(self, func() -> bool: return not player.is_invincible(), 300)
	await W.wait_for(self, func() -> bool: return beam.call(&"is_on"), 200)
	var before := hurts
	player.ground_speed = 6.0
	press(&"move_down")
	await physics_frames(2)
	release(&"move_down")
	await W.wait_for(self, func() -> bool: return hurts > before, 60)
	assert_eq(hurts, before + 1, "a roll through the beam is hurt too")


func test_security_beam_cycle_scales_with_interval_mult() -> void:
	var cycles := {}
	for act: Array in [["test_zone", 1], ["z4_neon_rush_remix", 2]]:
		_set_act(act[0], act[1])
		await _setup()
		var beam := _place(BEAM, Vector2(0, -160))
		var runs := await _beam_runs(beam, 700)
		assert_true(runs.cycle.size() >= 1, "%s: a full cycle" % act[0])
		var expected: int = int(beam.call(&"quiet")) + int(beam.get(&"on_frames"))
		assert_true(absi(runs.cycle[-1] - expected) <= 1, "%s: cycle %d (expected %d)" % [act[0], runs.cycle[-1], expected])
		cycles[act[0]] = runs.cycle[-1]
		world.queue_free()
		await physics_frames(1)
	assert_true(cycles.z4_neon_rush_remix < cycles.test_zone, "shorter at a higher difficulty %s" % cycles)


# --- Door and switch ----------------------------------------------------------------

func test_a_floor_switch_opens_its_door_which_blocks_until_then() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-200, 0))
	var door := _place(DOOR, Vector2(100, 0))
	door.name = "HallDoor"
	var pad := _place(SWITCH, Vector2(300, 0))
	pad.name = "FloorSwitch"
	pad.set(&"doors", [pad.get_path_to(door)] as Array[NodePath])
	await physics_frames(2)
	assert_true(door is AnimatableBody2D and door.has_method(&"platform_delta"), "a moving solid")
	press(&"move_right")
	await physics_frames(180)
	assert_true(player.global_position.x < 100.0, "the closed door blocks him (x %.0f)" % player.global_position.x)
	assert_true(not door.get(&"is_open"), "still closed")
	release(&"move_right")
	# Press the switch: the door slides up and he can pass.
	await _stand(Vector2(300, 0))
	await W.wait_for(self, func() -> bool: return pad.get(&"is_pressed"), 5)
	assert_true(pad.get(&"is_pressed"), "stepping on the switch presses it")
	var opened := await W.wait_for(self, func() -> bool: return door.get(&"is_open"), 60)
	assert_true(opened >= 0, "the door opens")
	await _stand(Vector2(-200, 0))
	press(&"move_right")
	await physics_frames(180)
	release(&"move_right")
	assert_true(player.global_position.x > 150.0, "and he runs through (x %.0f)" % player.global_position.x)
	assert_eq(hurts, 0, "a door never hurts")


func test_a_door_opening_over_sproto_never_crushes_him() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-200, 0))
	var door := _place(DOOR, Vector2(0, 0), {size = Vector2(32, 96)})
	W.add_rect(world, Rect2(-100, -200, 300, 60))  # a ceiling 140 px up: the door slides into clear air below it
	await physics_frames(2)
	await _stand(Vector2(60, 0))
	door.call(&"open")
	await W.wait_for(self, func() -> bool: return door.get(&"is_open"), 60)
	assert_true(player.state != &"dead", "alive next to the opening door")


# --- Zone 3 pills -------------------------------------------------------------------

func test_zone_3_pills_are_on_the_roster_and_draw() -> void:
	_set_act("test_zone", 1)
	await _setup()
	var enemies := [_place(DRONE, Vector2(0, -80)), _place(DRONE_DIVER, Vector2(200, -150)), _place(CLERK, Vector2(400, 0)),
			_place(BOUNCER, Vector2(600, 0)), _place(SECURITY, Vector2(800, 0)), _place(CHANDELIER, Vector2(1000, -150)),
			_place(CAMERA, Vector2(1200, 0)), _place(SNIPER, Vector2(1400, 0))]
	await physics_frames(30)
	var tiers := enemies.map(func(e: Node) -> int: return int(e.get(&"tier")))
	assert_eq(tiers, [2, 3, 2, 3, 3, 4, 4, 4], "drone T2, diver T3, clerk T2, bouncer T3, security T3, chandelier T4, camera/sniper T4")


func test_clerk_throws_paper_in_an_arc_at_where_sproto_stood() -> void:
	_set_act("z4_neon_rush_remix", 2)
	await _setup(Vector2(-200, 0))
	var clerk := _place(CLERK, Vector2(0, 0), {facing = -1}) as Enemy
	var aim := [Vector2.ZERO]
	clerk.telegraphed.connect(func() -> void: aim[0] = player.global_position)
	await W.wait_for(self, func() -> bool: return not _pellets().is_empty(), 400)
	assert_eq(_pellets().size(), 1, "threw a sheet")
	var sheet := _pellets()[0] as Node2D
	var top := INF
	var landing := Vector2.INF
	for i in 200:
		await physics_frames(1)
		if not is_instance_valid(sheet):
			break
		top = minf(top, sheet.global_position.y)
		landing = sheet.global_position
	assert_true(top < -50.0, "flies in an arc (top %.0f)" % top)
	assert_true(hurts == 1 or landing.distance_to(aim[0]) < 24.0, "comes down where he stood at the flash (hurt %d, %.0f px off)" % [hurts, landing.distance_to(aim[0])])


func test_moving_after_the_clerks_flash_avoids_the_sheet() -> void:
	_set_act("z4_neon_rush_remix", 2)
	await _setup(Vector2(-200, 0))
	var clerk := _place(CLERK, Vector2(0, 0), {facing = -1}) as Enemy
	var flashed := [false]
	clerk.telegraphed.connect(func() -> void: flashed[0] = true)
	await W.wait_for(self, func() -> bool: return flashed[0], 400)
	press(&"move_left")
	await physics_frames(150)
	release(&"move_left")
	assert_eq(hurts, 0, "running away at the flash: the sheet lands behind him")


func test_sniper_telegraphs_long_fires_a_burst_at_the_locked_spot_and_running_avoids_it() -> void:
	for act: Array in [["test_zone", 1], ["z4_neon_rush_remix", 3]]:
		_set_act(act[0], act[1])
		await _setup(Vector2(-400, 0))
		var sniper := _place(SNIPER, Vector2(0, 0)) as Enemy
		var clock := [0]
		var flash_at := [-1]
		sniper.telegraphed.connect(func() -> void: flash_at[0] = clock[0])
		await _stand(Vector2(-260, 0))
		var first_shot := -1
		var shots := 0
		var seen := {}
		for i in 400:
			await physics_frames(1)
			clock[0] += 1
			for s in _pellets():
				if not seen.has(s.get_instance_id()):
					seen[s.get_instance_id()] = true
					shots += 1
					if first_shot < 0:
						first_shot = clock[0]
			if flash_at[0] >= 0 and clock[0] == flash_at[0] + 1:
				press(&"move_left")  # he runs the moment it flashes
			if sniper.get(&"mode") == 3:  # resting after the burst
				break
		release(&"move_left")
		assert_true(flash_at[0] >= 0 and first_shot - flash_at[0] >= MIN_TELEGRAPH_FRAMES and first_shot - flash_at[0] >= int(sniper.telegraph_frames(0.8)),
				"%s: a long telegraph before the first shot (%d frames)" % [act[0], first_shot - flash_at[0]])
		assert_eq(shots, 3, "%s: a 3-shot burst" % act[0])
		assert_eq(hurts, 0, "%s: running at the flash avoids the burst" % act[0])
		assert_true((sniper.get(&"target") as Vector2).distance_to(Vector2(-260, -FEET)) < 1.0, "%s: aimed at where he stood" % act[0])
		world.queue_free()
		await physics_frames(1)


func test_sniper_hits_a_standing_sproto_but_not_one_behind_a_wall_or_too_close() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-400, 0))
	var sniper := _place(SNIPER, Vector2(0, 0)) as Enemy
	await _stand(Vector2(-100, 0))
	await physics_frames(90)
	assert_true(sniper.get(&"mode") == 0, "too close (under 192 px): no attack")
	await _stand(Vector2(-300, 0))
	await W.wait_for(self, func() -> bool: return hurts > 0, 300)
	assert_eq(hurts, 1, "standing still in range: hit by the burst")
	# Behind a wall: no line of sight, no attack.
	await _stand(Vector2(-700, 0))  # out of range while it rests
	await W.wait_for(self, func() -> bool: return not player.is_invincible() and sniper.get(&"mode") == 0, 400)
	W.add_rect(world, Rect2(-200, -120, 16, 120))
	await physics_frames(2)
	await _stand(Vector2(-300, 0))
	await physics_frames(120)
	assert_eq(hurts, 1, "a wall between them blocks the attack")
	assert_true(sniper.get(&"mode") == 0, "no telegraph without line of sight")


func test_sniper_never_fires_from_off_screen_and_shots_pop_on_terrain() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-400, 0))
	var sniper := _place(SNIPER, Vector2(0, 0)) as Enemy
	var camera := Camera2D.new()
	camera.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	camera.position = Vector2(3000, 0)
	world.add_child(camera)
	camera.make_current()
	await physics_frames(2)
	await _stand(Vector2(-300, 0))
	await physics_frames(150)
	assert_true(sniper.get(&"mode") == 0 and _pellets().is_empty(), "off screen: no telegraph, no shots")
	camera.position = Vector2(-150, -100)
	await physics_frames(2)
	sniper.set(&"_aim", Vector2.DOWN)
	var shots := [sniper.call(&"fire")]
	await W.wait_for(self, func() -> bool: return not is_instance_valid(shots[0]), 60)
	assert_true(not is_instance_valid(shots[0]), "a shot into the floor pops")


func test_zone_3_pills_are_livelier_in_the_finale() -> void:
	_set_act("z3_capital_mansion", 2)
	var scenes := [DRONE, DRONE_DIVER, CLERK, BOUNCER, SECURITY, CHANDELIER, CAMERA]
	var placed := {}
	await W.mini_level(self, Vector2(64, -19), 0.0, 2000.0, func(root: Node) -> void:
		W.place(root, "res://levels/objects/goal_sign.tscn", Vector2(1864, 0))
		for path: String in scenes:
			var y := -150.0 if path in [DRONE, DRONE_DIVER, CHANDELIER] else 0.0
			placed[path] = [W.place(root, path, Vector2(64 + 0.5 * 1800, y)), W.place(root, path, Vector2(64 + 0.95 * 1800, y))])
	for path: String in scenes:
		var middle := placed[path][0] as Enemy
		var finale := placed[path][1] as Enemy
		assert_true(finale.move_speed(1.0) > middle.move_speed(1.0), "%s: faster in the finale" % path.get_file())
		assert_true(finale.telegraph_frames(0.5) >= MIN_TELEGRAPH_FRAMES, "%s: telegraph still >= 0.35 s" % path.get_file())
