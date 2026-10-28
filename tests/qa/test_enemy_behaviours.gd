extends TestCase
## QA probes for the T2-T4 enemy behaviours (checklist 04-zones section J),
## run at the extremes the curve allows: local difficulty 1 and 10 (Zone 4's
## pre-boss finale reaches D 8 + 1.5). Each scene is looked up by path and
## skipped until it exists; enemies are driven only through their public
## API (telegraphed signal, mode/phase helpers). Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const DIR := "res://levels/enemies/"
const MIN_TELEGRAPH_FRAMES := 21  # 0.35 s at 60 Hz


func after_each() -> void:
	GameState.tickets = 0
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		Dev.send_action(action, false)


func _scene(name: String) -> PackedScene:
	var path := DIR + name + ".tscn"
	if not ResourceLoader.exists(path) or not L.available():
		print("  SKIP qa/test_enemy_behaviours.gd: no %s yet" % path)
		return null
	return load(path)


## An enemy on a floor, facing Sproto, at a fixed local difficulty.
func _setup(scene: PackedScene, d: float, enemy_x: float, player_x: float) -> Array:
	var w := L.world(self)
	L.floor_at(w)
	var e: Node2D = scene.instantiate()
	e.position = Vector2(enemy_x, 0.0)
	e.set(&"_local_d", d)
	# Listen before it enters the tree: it may telegraph while Sproto spawns.
	e.connect(&"telegraphed", func() -> void:
		if not e.has_meta(&"qa_telegraph_tick"):
			e.set_meta(&"qa_telegraph_tick", Engine.get_physics_frames()))
	w.add_child(e)
	var p: Node2D = await L.spawn(self, w, Vector2(player_x, 0.0))
	return [e, p]


## Physics ticks from the first `telegraphed` signal to `harmful_started`
## returning true, or -1.
func _telegraph_lead(e: Node2D, harmful_started: Callable, max_frames := 900) -> int:
	for i in max_frames:
		if e.has_meta(&"qa_telegraph_tick") and harmful_started.call():
			return Engine.get_physics_frames() - int(e.get_meta(&"qa_telegraph_tick"))
		await physics_frames(1)
	return -1


func test_chaser_telegraph_floor_and_sight() -> void:
	var scene := _scene("chaser")
	if scene == null:
		return
	for d in [1.0, 10.0]:
		var made: Array = await _setup(scene, d, 0.0, -150.0)
		var e: Node2D = made[0]
		var lead: int = await _telegraph_lead(e, func() -> bool: return bool(e.call(&"is_rushing")))
		print("  INFO chaser at D %s: rush starts %d frames after the telegraph" % [d, lead])
		assert_true(lead >= MIN_TELEGRAPH_FRAMES, "chaser at D %s telegraphs at least 0.35 s (got %d frames)" % [d, lead])
	# Sight: half a screen (212 px) ahead; not beyond.
	for case in [[180.0, true], [260.0, false]]:
		var made: Array = await _setup(scene, 1.0, 0.0, -float(case[0]))
		var e: Node2D = made[0]
		await physics_frames(60)
		assert_eq(e.has_meta(&"qa_telegraph_tick"), case[1], "chaser notices Sproto %s px ahead: %s" % [case[0], case[1]])


func test_pellet_pill_telegraph_floor_and_no_leaks() -> void:
	var scene := _scene("pellet_pill")
	if scene == null:
		return
	for d in [1.0, 10.0]:
		var made: Array = await _setup(scene, d, 0.0, -150.0)
		var e: Node2D = made[0]
		var w: Node = e.get_parent()
		var count_pellets := func() -> int:
			var n := 0
			for c in w.get_children():
				if c.scene_file_path.ends_with("pellet.tscn"):
					n += 1
			return n
		var before: int = count_pellets.call()
		var lead: int = await _telegraph_lead(e, func() -> bool: return count_pellets.call() > before)
		print("  INFO pellet pill at D %s: pellet fired %d frames after the telegraph" % [d, lead])
		assert_true(lead >= MIN_TELEGRAPH_FRAMES, "pellet pill at D %s telegraphs at least 0.35 s (got %d)" % [d, lead])
	# Leaks: at D 10 for 3,000 ticks with Sproto in range but out of reach.
	var made2: Array = await _setup(scene, 10.0, 0.0, -180.0)
	var e2: Node2D = made2[0]
	var p2: Node2D = made2[1]
	p2.call(&"freeze", true)
	var peak := 0
	for i in 3000:
		await physics_frames(1)
		var n := 0
		for c in e2.get_parent().get_children():
			if c.scene_file_path.ends_with("pellet.tscn"):
				n += 1
		peak = maxi(peak, n)
	print("  INFO pellet pill at D 10 for 3,000 ticks: at most %d pellets alive" % peak)
	assert_true(peak <= 4, "pellets don't pile up (peak %d)" % peak)


func test_spike_pill_telegraph_floor_and_spikes_hurt_attackers() -> void:
	var scene := _scene("spike_pill")
	if scene == null:
		return
	for d in [1.0, 10.0]:
		var made: Array = await _setup(scene, d, 0.0, -300.0)
		var e: Node2D = made[0]
		var lead: int = await _telegraph_lead(e, func() -> bool: return bool(e.call(&"spikes_out")))
		print("  INFO spike pill at D %s: spikes out %d frames after the telegraph" % [d, lead])
		assert_true(lead >= MIN_TELEGRAPH_FRAMES, "spike pill at D %s telegraphs at least 0.35 s (got %d)" % [d, lead])
	# Spikes out: even a rolling (attacking) Sproto is hurt, never destroying it.
	var made3: Array = await _setup(scene, 1.0, 0.0, -300.0)
	var e3: Node2D = made3[0]
	var p3: Node2D = made3[1]
	for i in 900:
		await physics_frames(1)
		if bool(e3.call(&"spikes_out")):
			break
	GameState.tickets = 5
	p3.respawn_at(Vector2(-60.0, -19.0))
	await physics_frames(2)
	p3.set(&"ground_speed", 5.0)
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	var hurt := false
	for i in 40:
		await physics_frames(1)
		if str(p3.get(&"state")) == "hurt":
			hurt = true
			break
	assert_true(hurt, "a rolling Sproto is hurt by the spikes")
	assert_true(bool(e3.get(&"alive")), "and the spike pill survives")


func test_t2_t3_scale_with_local_difficulty() -> void:
	var scene := _scene("pellet_pill")
	if scene == null:
		return
	var intervals := []
	for d in [1.0, 10.0]:
		var made: Array = await _setup(scene, d, 0.0, -150.0)
		var e: Node2D = made[0]
		intervals.append(int(e.call(&"interval_frames", 120.0)))
	print("  INFO interval_frames(120) at D 1 / D 10: %s" % [intervals])
	assert_true(intervals[1] < intervals[0], "shorter intervals at D 10")


func test_dropper_telegraph_floor_and_respawn_safety() -> void:
	var scene := _scene("dropper")
	if scene == null:
		return
	# Telegraph floor at D 1 and D 10: walk in under it.
	for d in [1.0, 10.0]:
		var made: Array = await _setup(scene, d, 0.0, -300.0)
		var e: Node2D = made[0]
		var p: Node2D = made[1]
		e.position.y = -160.0
		await physics_frames(90)  # arm_frames
		p.respawn_at(Vector2(-120.0, -19.0))
		await physics_frames(2)
		press(&"move_right")
		var lead: int = await _telegraph_lead(e, func() -> bool: return bool(e.call(&"is_falling")), 400)
		release(&"move_right")
		print("  INFO dropper at D %s: drops %d frames after the telegraph" % [d, lead])
		assert_true(lead >= MIN_TELEGRAPH_FRAMES, "dropper at D %s telegraphs at least 0.35 s (got %d)" % [d, lead])
	# Respawn safety: a Sproto placed under a fresh dropper never triggers it.
	var made2: Array = await _setup(scene, 10.0, 0.0, 0.0)
	var e2: Node2D = made2[0]
	e2.position.y = -160.0
	await physics_frames(300)
	assert_true(not e2.has_meta(&"qa_telegraph_tick"), "a dropper above a (re)spawn point never drops on him")
	var p2: Node2D = made2[1]
	p2.respawn_at(Vector2(-150.0, -19.0))
	await physics_frames(5)
	p2.respawn_at(Vector2(0.0, -19.0))
	await physics_frames(30)
	assert_true(e2.has_meta(&"qa_telegraph_tick"), "leaving and coming back triggers it")
