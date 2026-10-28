extends TestCase
## QA probes for the Zone 2 building blocks (qa/reports/05-z2-blocks.md;
## checklists 01 M, 04 J/K): telegraph floors at local difficulty 1 and 10,
## the diver's lock-at-telegraph-start fairness (reacting at the flash always
## avoids it), riding staircase steps and bookshelf tops, the falling book's
## respawn safety, and the knight's four approaches at both facings. Every
## scene is looked up by path and skipped until it exists. Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")
const Z2 := "res://levels/objects/z2/"
const MIN_TELEGRAPH_FRAMES := 21  # 0.35 s


func after_each() -> void:
	GameState.tickets = 0
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		Dev.send_action(action, false)


func _scene(path: String) -> PackedScene:
	if not ResourceLoader.exists(path) or not L.available():
		print("  SKIP qa/test_z2_blocks.gd: no %s yet" % path)
		return null
	return load(path)


## Instantiates `scene` at `at` with its local difficulty fixed to `d`
## (`_d` for objects, `_local_d` for enemies) and records the first
## `telegraphed` tick in meta qa_tele.
func _place(w: Node2D, scene: PackedScene, at: Vector2, d: float, props := {}) -> Node2D:
	var n: Node2D = scene.instantiate()
	n.position = at
	n.set(&"_d", d)
	n.set(&"_local_d", d)
	for k in props:
		n.set(k, props[k])
	n.connect(&"telegraphed", func() -> void:
		if not n.has_meta(&"qa_tele"):
			n.set_meta(&"qa_tele", Engine.get_physics_frames()))
	w.add_child(n)
	return n


func _lead(n: Node2D, started: Callable, max_frames := 900) -> int:
	for i in max_frames:
		if n.has_meta(&"qa_tele") and started.call():
			return Engine.get_physics_frames() - int(n.get_meta(&"qa_tele"))
		await physics_frames(1)
	return -1


func test_telegraph_floors_at_d1_and_d10() -> void:
	var cases := [
		["shifting_staircase.tscn", Vector2(0, -40), func(n: Node2D) -> bool: return str(n.get(&"phase")).length() > 0 and n.call(&"blend") > 0.0, {}],
		["moving_bookshelf.tscn", Vector2(-200, -96), func(n: Node2D) -> bool: return bool(n.call(&"is_closing")), {}],
		["candle.tscn", Vector2(150, 0), func(n: Node2D) -> bool: return bool(n.call(&"is_flaring")), {}],
	]
	for c in cases:
		var scene := _scene(Z2 + c[0])
		if scene == null:
			continue
		for d in [1.0, 10.0]:
			var w := L.world(self)
			L.floor_at(w)
			var n := _place(w, scene, c[1], d, c[3])
			var lead: int = await _lead(n, c[2].bind(n) if false else func() -> bool: return c[2].call(n))
			print("  INFO %s at D %s: moves/harms %d ticks after its telegraph" % [c[0], d, lead])
			assert_true(lead >= MIN_TELEGRAPH_FRAMES, "%s at D %s: telegraph at least 0.35 s (got %d)" % [c[0], d, lead])


func test_falling_book_telegraph_and_respawn_safety() -> void:
	var scene := _scene(Z2 + "falling_book.tscn")
	if scene == null:
		return
	for d in [1.0, 10.0]:
		var w := L.world(self)
		L.floor_at(w)
		var book := _place(w, scene, Vector2(0, -200), d)
		var p: Node2D = await L.spawn(self, w, Vector2(-200, 0))
		await physics_frames(90)
		# Walk in under it.
		p.respawn_at(Vector2(-40, -19))
		await physics_frames(2)
		press(&"move_right")
		var lead: int = await _lead(book, func() -> bool: return bool(book.call(&"is_falling")), 300)
		release(&"move_right")
		print("  INFO falling book at D %s: falls %d ticks after its telegraph" % [d, lead])
		assert_true(lead >= MIN_TELEGRAPH_FRAMES, "book at D %s telegraphs at least 0.35 s (got %d)" % [d, lead])
	# Respawning right under a fresh book never drops it, even after arming.
	var w2 := L.world(self)
	L.floor_at(w2)
	var p2: Node2D = await L.spawn(self, w2, Vector2(0, 0))
	var book2 := _place(w2, scene, Vector2(0, -200), 10.0)
	await physics_frames(240)
	assert_true(not book2.has_meta(&"qa_tele"), "a book above a respawn point stays put while he stands there")
	# Leaving and coming back arms it again.
	p2.respawn_at(Vector2(-120, -19))
	await physics_frames(10)
	p2.respawn_at(Vector2(0, -19))
	await physics_frames(10)
	assert_true(book2.has_meta(&"qa_tele"), "after leaving and coming back, the book telegraphs")


## The diver locks its target when the telegraph STARTS (accepted rule):
## running away the moment it flashes always avoids the swoop. Lead decision
## on BUG-Z2-01: it never dives at a target less than 120 px below its post,
## so a low post (80 px) must not dive at all.
func test_diver_reacting_at_the_flash_always_avoids_it() -> void:
	var scene := _scene("res://levels/enemies/z2/spellbook_diver.tscn")
	if scene == null:
		scene = _scene("res://levels/enemies/diver.tscn")
	if scene == null:
		return
	var has_min_drop: bool = scene.instantiate().get(&"min_dive_drop") != null
	for d in [1.0, 10.0]:
		for dir in [-1, 1]:
			for depth in [80.0, 150.0, 220.0]:
				var w := L.world(self)
				L.floor_at(w)
				var diver := _place(w, scene, Vector2(0, -depth), d)
				var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
				GameState.tickets = 5
				var waited := 0
				while not diver.has_meta(&"qa_tele") and waited < 300:
					await physics_frames(1)
					waited += 1
				if depth < 120.0 + 19.0 and has_min_drop:
					assert_true(waited >= 300, "a diver %s px up never dives at a standing Sproto (min_dive_drop, D %s)" % [depth, d])
					continue
				var hold := &"move_right" if dir > 0 else &"move_left"
				press(hold)
				var hurt := false
				for i in 150:
					await physics_frames(1)
					if str(p.get(&"state")) == "hurt":
						hurt = true
						break
				release(hold)
				assert_true(waited < 300, "the diver at %s px saw him (D %s)" % [depth, d])
				assert_true(not hurt, "running %s at the flash avoids a diver %s px up at D %s" % ["right" if dir > 0 else "left", depth, d])


func _ride_drift(body: Node2D, p: Node2D, ticks: int) -> Array:
	await tree.process_frame
	var rel0 := p.global_position - body.global_position
	var worst := 0.0
	var air := 0
	for i in ticks:
		await tree.process_frame
		worst = maxf(worst, ((p.global_position - body.global_position) - rel0).length())
		if not bool(p.get(&"grounded")):
			air += 1
	return [worst, air]


func test_riding_staircase_steps_and_bookshelf_tops() -> void:
	var stairs := _scene(Z2 + "shifting_staircase.tscn")
	if stairs != null:
		for d in [1.0, 10.0]:
			var w := L.world(self)
			var s := _place(w, stairs, Vector2(0, 0), d)
			await physics_frames(2)
			var step: Node2D = s.get_child(2) if s.get_child_count() > 2 else s.get_child(0)
			for c in s.get_children():
				if c.has_method(&"platform_delta"):
					step = c
			var top: Vector2 = step.global_position
			var p: Node2D = await L.spawn(self, w, top + Vector2(24, 0))
			var r: Array = await _ride_drift(step, p, 600)
			print("  INFO riding a staircase step at D %s for 600 ticks: drift %.3f px, airborne %d ticks, dead %s" % [d, r[0], r[1], str(p.get(&"state")) == "dead"])
			assert_true(r[0] <= 0.01, "carried exactly by the step (D %s)" % d)
			assert_true(str(p.get(&"state")) != "dead", "never crushed riding a step in open air (D %s)" % d)
	var shelf := _scene(Z2 + "moving_bookshelf.tscn")
	if shelf != null:
		var w := L.world(self)
		L.floor_at(w)
		var b := _place(w, shelf, Vector2(-32, -96), 10.0)
		await physics_frames(2)
		var p: Node2D = await L.spawn(self, w, b.global_position + Vector2(32, 0))
		var r: Array = await _ride_drift(b, p, 600)
		print("  INFO riding a bookshelf top at D 10 for 600 ticks: drift %.3f px, airborne %d ticks" % [r[0], r[1]])
		assert_true(r[0] <= 0.01, "carried exactly by the bookshelf top")


func test_knight_approaches_on_the_ground_both_facings() -> void:
	# Ground approaches give deterministic contact; jumps and falls from above
	# are covered by the level agent's tests (test_z2_enemies.gd).
	var scene := _scene("res://levels/enemies/z2/knight_pill.tscn")
	if scene == null:
		scene = _scene("res://levels/enemies/armored.tscn")
	if scene == null:
		return
	# [label, side relative to its facing (+1 front, -1 back), roll speed (0 = walk), expect destroyed]
	var approaches := [
		["slow roll into the front (3 px/f)", 1, 3.0, false],
		["fast roll into the front (6 px/f)", 1, 6.0, true],
		["slow roll into the back (3 px/f)", -1, 3.0, true],
		["walk into the back", -1, 0.0, false],
		["walk into the front", 1, 0.0, false],
	]
	for facing in [-1, 1]:
		for a in approaches:
			var w := L.world(self)
			L.floor_at(w)
			var k: Node2D = scene.instantiate()
			k.position = Vector2(0, 0)
			k.set(&"direction", facing)
			w.add_child(k)
			GameState.tickets = 5
			var side: int = a[1] * facing
			var p: Node2D = await L.spawn(self, w, Vector2(side * 48.0, 0))
			var toward := &"move_left" if side > 0 else &"move_right"
			if a[2] > 0.0:
				p.set(&"ground_speed", -side * a[2])
				press(&"move_down")
				await physics_frames(1)
				release(&"move_down")
			else:
				press(toward)
			var destroyed := false
			var hurt := false
			for i in 90:
				await physics_frames(1)
				if not is_instance_valid(k) or not bool(k.get(&"alive")):
					destroyed = true
				if str(p.get(&"state")) == "hurt":
					hurt = true
				if destroyed or hurt:
					break
			release(toward)
			assert_eq(destroyed, a[3], "facing %d, %s: destroyed" % [facing, a[0]])
			if not a[3]:
				assert_true(hurt, "facing %d, %s: hurts him" % [facing, a[0]])
