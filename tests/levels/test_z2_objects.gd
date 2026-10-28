extends TestCase
## Wizard Academy objects (levels/objects/z2/): the shifting staircase and the
## moving bookshelf (moving terrain, docs/CONTRACTS.md "Moving terrain"), the
## candle and the falling book (telegraphed hazards) and the flying-broom
## autoscroll section (GameCamera autoscroll and Player.clamp_rect). QA
## checklist 04-zones sections C and E, 01-physics PHY-M13.

const W := preload("res://tests/levels/level_world.gd")
const STAIRCASE := "res://levels/objects/z2/shifting_staircase.tscn"
const BOOKSHELF := "res://levels/objects/z2/moving_bookshelf.tscn"
const CANDLE := "res://levels/objects/z2/candle.tscn"
const BOOK := "res://levels/objects/z2/falling_book.tscn"
const AUTOSCROLL := "res://levels/objects/z2/autoscroll_section.tscn"

## 0.35 s, the shortest telegraph allowed at any difficulty.
const MIN_TELEGRAPH_FRAMES := 21
const FEET := 19.0

var world: Node2D
var player: Player
var hurts := 0


func _set_act(zone: String, stage: int) -> void:
	SceneRouter.zone_id = zone
	SceneRouter.stage = stage


## A flat floor (top y = 0) and Sproto with his feet at `feet`; objects come after.
func _setup(feet := Vector2(-300, 0), floor := true) -> void:
	world = W.new_world(self)
	if floor:
		W.add_floor(world)
	player = W.spawn_player(world, feet)
	hurts = 0
	player.hurt_taken.connect(_on_hurt)
	GameState.add_tickets(10)  # a hit with no tickets would kill
	await W.settle(self, player, feet)


func _on_hurt() -> void:
	hurts += 1


func _place(path: String, at: Vector2, props := {}) -> Node:
	var node := W.place(world, path, at, props)
	return node


## Sproto standing with his feet at `feet` (respawned there).
func _stand(feet: Vector2) -> void:
	player.respawn_at(feet - Vector2(0.0, FEET))
	await physics_frames(2)


# --- Shifting staircase -------------------------------------------------------------

func test_staircase_steps_are_moving_terrain() -> void:
	_set_act("test_zone", 1)
	await _setup()
	var stairs := _place(STAIRCASE, Vector2(0, -40))
	await physics_frames(1)
	var bodies: Array = stairs.call(&"step_bodies")
	assert_eq(bodies.size(), 5, "five steps")
	for body: Node in bodies:
		assert_true(body is AnimatableBody2D and (body as AnimatableBody2D).sync_to_physics, "%s: AnimatableBody2D, sync_to_physics" % body.name)
		assert_eq((body as CollisionObject2D).collision_layer, Layers.TERRAIN_SOLID, "%s: solid terrain" % body.name)
		assert_true(body.has_method(&"platform_delta"), "%s: platform_delta()" % body.name)


func test_staircase_shifts_on_a_timer_after_a_telegraph_and_never_too_fast() -> void:
	_set_act("z4_neon_rush_remix", 2)  # the hardest act: shortest holds and telegraphs
	await _setup()
	var stairs := _place(STAIRCASE, Vector2(0, -40), {hold_frames = 60, shift_frames = 10})
	var telegraphs := [0]
	stairs.connect(&"telegraphed", func() -> void: telegraphs[0] += 1)
	var bodies: Array = stairs.call(&"step_bodies")
	var warning := 0
	var warnings: Array[int] = []
	var shifts := 0
	var fastest := 0.0
	var was_shifting := false
	var last: Array[Vector2] = []
	for body: Node2D in bodies:
		last.append(body.call(&"target_position"))
	var blends := Vector2(INF, -INF)
	for i in 600:
		await physics_frames(1)
		if stairs.call(&"is_telegraphing"):
			warning += 1
		var shifting: bool = stairs.call(&"is_shifting")
		if shifting and not was_shifting:
			shifts += 1
			warnings.append(warning)
		if not shifting and not stairs.call(&"is_telegraphing"):
			warning = 0
		var was_moving := was_shifting
		was_shifting = shifting
		for k in bodies.size():
			var now: Vector2 = bodies[k].call(&"target_position")
			var moved := now - last[k]
			assert_true(moved.is_equal_approx(bodies[k].call(&"platform_delta")), "platform_delta is the tick's move")
			fastest = maxf(fastest, moved.length())
			if moved.length() > 0.0 and not (shifting or was_moving):
				fail("step %d moved outside a shift (frame %d)" % [k, i])
			last[k] = now
		var b: float = stairs.call(&"blend")
		blends = Vector2(minf(blends.x, b), maxf(blends.y, b))
	assert_true(shifts >= 3, "shifts on a timer (%d)" % shifts)
	for w in warnings:
		assert_true(w >= MIN_TELEGRAPH_FRAMES, "glows %d frames before a shift (>= 0.35 s)" % w)
	assert_eq(telegraphs[0], shifts, "the telegraph sound before every shift")
	assert_true(fastest <= 4.0 + 0.01, "no step faster than max_speed 4 px/f (%.2f)" % fastest)
	assert_true(blends.x <= 0.001 and blends.y >= 0.999, "goes all the way between layouts %s" % blends)


func test_staircase_carries_sproto_down_and_up_and_never_swallows_him() -> void:
	_set_act("test_zone", 1)
	await _setup()
	var stairs := _place(STAIRCASE, Vector2(0, -40), {hold_frames = 40})
	await physics_frames(2)
	var top := Vector2(4 * 48 + 24, -40 - 4 * 32)  # the middle of the top step, layout A
	await _stand(top)
	assert_true(player.grounded, "standing on the top step")
	var bodies: Array = stairs.call(&"step_bodies")
	var top_step := bodies[4] as Node2D
	var worst := 0.0
	var lowest := -INF
	var highest := INF
	var cycle_frames: int = stairs.call(&"hold") * 2 + int(stairs.call(&"shift")) * 2 + 10
	var prev_top := INF
	for i in cycle_frames:
		await physics_frames(1)
		var step_top := (stairs as Node2D).global_position.y + (top_step.call(&"target_position") as Vector2).y
		var feet := player.global_position.y + FEET
		# He is carried by the step's motion over the last physics step: his
		# feet match its top now or a tick ago.
		worst = maxf(worst, minf(absf(feet - step_top), absf(feet - prev_top)))
		prev_top = step_top
		lowest = maxf(lowest, step_top)
		highest = minf(highest, step_top)
		assert_true(player.grounded, "grounded on the moving step (frame %d)" % i)
		for body: Node2D in bodies:
			var rect := Rect2((stairs as Node2D).global_position + (body.call(&"target_position") as Vector2), Vector2(48, 16))
			assert_true(not rect.has_point(player.global_position), "never inside a step (frame %d)" % i)
		if not player.grounded:
			break
	assert_true(lowest - highest >= 127.0, "rode the whole shift (%.0f px)" % (lowest - highest))
	assert_true(worst <= 1.0, "feet stay on the step (worst %.2f px)" % worst)
	assert_eq(player.state != &"dead", true, "alive")


# --- Moving bookshelf ---------------------------------------------------------------

func test_bookshelf_telegraphs_before_every_close_including_the_first() -> void:
	_set_act("z4_neon_rush_remix", 2)
	await _setup()
	var shelf := _place(BOOKSHELF, Vector2(0, -96), {rest_frames = 60, out_frames = 20})
	assert_true(shelf is AnimatableBody2D and shelf.has_method(&"platform_delta"), "moving terrain")
	var events: Array = []  # [frame, "telegraph" | "close"]
	var clock := [0]
	shelf.connect(&"telegraphed", func() -> void: events.append([clock[0], "telegraph"]))
	shelf.connect(&"closing_started", func() -> void: events.append([clock[0], "close"]))
	var last_offset := Vector2.ZERO
	var was_closing := false
	for i in 700:
		await physics_frames(1)
		clock[0] += 1
		var offset: Vector2 = shelf.call(&"offset")
		var closing: bool = shelf.call(&"is_closing")
		if offset.length() > last_offset.length() and not (closing or was_closing):
			fail("closed outside its closing phase (frame %d)" % i)
		last_offset = offset
		was_closing = closing
	var closes := events.filter(func(e: Array) -> bool: return e[1] == "close")
	assert_true(closes.size() >= 3, "closes on a timer (%d)" % closes.size())
	assert_eq(events[0][1], "telegraph", "the very first cycle is telegraphed")
	for k in events.size():
		if events[k][1] != "close":
			continue
		assert_true(k > 0 and events[k - 1][1] == "telegraph", "a telegraph before close %d" % k)
		if k > 0:
			var lead: int = events[k][0] - events[k - 1][0]
			assert_true(lead >= MIN_TELEGRAPH_FRAMES and lead >= int(shelf.call(&"warning")),
					"telegraph %d frames before the close (>= 0.35 s)" % lead)


func test_bookshelf_pushes_sproto_out_of_its_way() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(100, 0))
	var shelf := _place(BOOKSHELF, Vector2(0, -96), {rest_frames = 40}) as Node2D
	await _stand(Vector2(100, 0))
	var rect_of := func() -> Rect2: return Rect2(shelf.call(&"target_position"), Vector2(64, 96))
	for i in 200:
		await physics_frames(1)
		assert_true(not (rect_of.call() as Rect2).has_point(player.global_position), "never inside the shelf (frame %d)" % i)
		assert_true(player.state != &"dead", "not crushed in the open (frame %d)" % i)
	assert_true(player.global_position.x >= 160.0 + 8.0, "pushed clear of the shelf (x %.1f)" % player.global_position.x)


func test_bookshelf_crushes_sproto_against_a_wall_only_after_its_telegraph() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(140, 0))
	W.add_rect(world, Rect2(170, -200, 32, 200))  # leaves a 10 px gap when the shelf is out
	var shelf := _place(BOOKSHELF, Vector2(0, -96), {rest_frames = 40})
	await _stand(Vector2(140, 0))
	var telegraphed := [false]
	shelf.connect(&"telegraphed", func() -> void: telegraphed[0] = true)
	var died := await W.wait_for(self, func() -> bool: return player.state == &"dead", 240)
	assert_true(died >= 0, "crushed between the shelf and the wall")
	assert_true(telegraphed[0], "after a telegraph")


# --- Candle -------------------------------------------------------------------------

## Phase runs over `frames`: {warning = [lengths], flare = [lengths], cycle = [LOW-to-LOW]}.
func _candle_runs(candle: Node, frames: int) -> Dictionary:
	var out := {warning = [], flare = [], cycle = [], telegraphs = 0, hurt_outside_flare = 0}
	candle.connect(&"telegraphed", func() -> void: out.telegraphs += 1)
	var last := -1
	var run := 0
	var low_started := -1
	var hurts_before := hurts
	for i in frames:
		await physics_frames(1)
		var phase: int = candle.get(&"phase")
		if hurts > hurts_before and phase != 2 and last != 2:
			out.hurt_outside_flare += 1
		hurts_before = hurts
		if phase == last:
			run += 1
			continue
		if last == 1:
			out.warning.append(run)
		elif last == 2:
			out.flare.append(run)
		if phase == 0:
			if low_started >= 0:
				out.cycle.append(i - low_started)
			low_started = i
		last = phase
		run = 1
	return out


func test_candle_flares_after_a_telegraph_and_only_the_flare_hurts() -> void:
	_set_act("z4_neon_rush_remix", 2)
	await _setup(Vector2(0, 0))
	var candle := _place(CANDLE, Vector2(0, 0), {low_frames = 60, flare_frames = 30})
	await _stand(Vector2(0, 0))
	var runs := await _candle_runs(candle, 400)
	assert_true(runs.flare.size() >= 2, "flares on a timer (%s)" % [runs])
	for w: int in runs.warning:
		assert_true(w >= MIN_TELEGRAPH_FRAMES, "sputters %d frames before a flare (>= 0.35 s)" % w)
	assert_true(runs.telegraphs >= runs.flare.size(), "the telegraph sound before each flare")
	assert_true(hurts >= 1, "standing in the flare hurts")
	assert_eq(runs.hurt_outside_flare, 0, "the low flame never hurts")


func test_candle_flare_hurts_a_jumping_sproto_too() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-200, 0))
	var candle := _place(CANDLE, Vector2(0, 0), {low_frames = 40})
	await W.wait_for(self, func() -> bool: return candle.call(&"is_flaring"), 200)
	press(&"jump")
	await physics_frames(2)
	player.global_position = Vector2(0, -60)
	player.velocity = Vector2(0, 3)
	await W.wait_for(self, func() -> bool: return hurts > 0, 10)
	release(&"jump")
	assert_eq(hurts, 1, "a jump into the flare still hurts")


func test_candle_quiet_time_scales_with_interval_mult() -> void:
	var cycles := {}
	for act: Array in [["test_zone", 1], ["z4_neon_rush_remix", 2]]:
		_set_act(act[0], act[1])
		await _setup()
		var candle := _place(CANDLE, Vector2(0, 0))
		var runs := await _candle_runs(candle, 700)
		assert_true(runs.cycle.size() >= 1, "%s: a full cycle" % act[0])
		var expected: int = int(candle.call(&"quiet")) + int(candle.get(&"flare_frames"))
		assert_true(absi(runs.cycle[-1] - expected) <= 1, "%s: cycle %d frames (expected %d)" % [act[0], runs.cycle[-1], expected])
		cycles[act[0]] = runs.cycle[-1]
		world.queue_free()
		await physics_frames(1)
	assert_true(cycles.z4_neon_rush_remix < cycles.test_zone, "a shorter cycle at a higher difficulty %s" % cycles)


# --- Falling book -------------------------------------------------------------------

func test_book_drops_when_sproto_moves_under_it_after_a_telegraph() -> void:
	_set_act("z4_neon_rush_remix", 2)
	await _setup(Vector2(-200, 0))
	var book := _place(BOOK, Vector2(0, -150), {arm_frames = 10})
	var books := [book]
	await physics_frames(20)
	assert_true(not book.call(&"is_telegraphing") and not book.call(&"is_falling"), "hangs while nobody is under it")
	var clock := [0]
	var shook_at := [-1]
	book.connect(&"telegraphed", func() -> void: shook_at[0] = clock[0])
	var fell_at := -1
	var y0: float = (book as Node2D).global_position.y
	player.respawn_at(Vector2(0, -FEET))
	for i in 120:
		await physics_frames(1)
		clock[0] += 1
		if not is_instance_valid(books[0]):
			break
		if book.call(&"is_telegraphing"):
			assert_near((book as Node2D).global_position.y, y0, 0.001, "stays put while shaking")
		elif book.call(&"is_falling") and fell_at < 0:
			fell_at = clock[0]
		if hurts > 0:
			break
	assert_true(shook_at[0] >= 0 and fell_at - shook_at[0] >= MIN_TELEGRAPH_FRAMES,
			"shakes %d frames first (>= 0.35 s)" % (fell_at - shook_at[0]))
	assert_eq(hurts, 1, "a standing Sproto is hit")
	await physics_frames(2)
	assert_true(not is_instance_valid(books[0]), "and the book bursts")


func test_book_never_drops_on_a_respawn_underneath() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(0, 0))
	var book := _place(BOOK, Vector2(0, -150), {arm_frames = 10})
	await physics_frames(200)
	assert_true(not book.call(&"is_telegraphing") and not book.call(&"is_falling"), "Sproto spawned under it: it waits")
	await _stand(Vector2(200, 0))
	await physics_frames(5)
	await _stand(Vector2(10, 0))
	var noticed := await W.wait_for(self, func() -> bool: return book.call(&"is_telegraphing"), 5)
	assert_true(noticed >= 0, "it drops once he comes back under it")


func test_book_bursts_on_landing_and_a_jump_pops_it() -> void:
	_set_act("test_zone", 1)
	await _setup(Vector2(-200, 0))
	var books := [_place(BOOK, Vector2(0, -150), {arm_frames = 0}), _place(BOOK, Vector2(400, -150), {arm_frames = 0})]
	var landed := [false]
	books[0].connect(&"landed", func() -> void: landed[0] = true)
	await physics_frames(2)
	await _stand(Vector2(0, 0))
	await W.wait_for(self, func() -> bool: return books[0].call(&"is_falling"), 60)
	await _stand(Vector2(-200, 0))  # step out of the way
	await W.wait_for(self, func() -> bool: return not is_instance_valid(books[0]), 120)
	assert_true(landed[0] and not is_instance_valid(books[0]), "landed and burst")
	assert_eq(hurts, 0, "out of the way: no hit")
	# Under the second one, jumping up into it as it falls.
	await _stand(Vector2(400, 0))
	await W.wait_for(self, func() -> bool: return books[1].call(&"is_falling"), 60)
	press(&"jump")
	await W.wait_for(self, func() -> bool: return not is_instance_valid(books[1]), 60)
	release(&"jump")
	assert_true(not is_instance_valid(books[1]), "popped by the jump")
	assert_eq(hurts, 0, "no hit while jumping")


# --- Autoscroll (flying-broom chase) -----------------------------------------------

func _scroll_level(extra := Callable()) -> Array:
	var made := {}
	var level := await W.mini_level(self, Vector2(64, -19), 0.0, 4000.0, func(root: Node) -> void:
		made.section = W.place(root, AUTOSCROLL, Vector2(300, 0), {length = 1200.0, speed = 120.0})
		if extra.is_valid():
			extra.call(root))
	return [level, made.section]


func _camera() -> Camera2D:
	return tree.get_first_node_in_group(&"game_camera") as Camera2D


func test_autoscroll_starts_keeps_sproto_on_screen_and_stops_at_the_end() -> void:
	_set_act("test_zone", 1)
	var made := await _scroll_level()
	var level := made[0] as LevelRoot
	var section := made[1] as Node2D
	var hero := level.player
	assert_true(not section.get(&"active"), "idle before the start line")
	hero.respawn_at(Vector2(320, -19))
	var began := await W.wait_for(self, func() -> bool: return section.get(&"active"), 5)
	assert_true(began >= 0, "started when Sproto crossed the start line")
	var camera := _camera()
	await physics_frames(2)
	assert_true(hero.clamp_rect.has_area(), "Player.clamp_rect is set")
	var x0 := camera.global_position.x
	await physics_frames(60)
	assert_near(camera.global_position.x - x0, 120.0, 3.0, "the view scrolls at 2 px/frame")
	# Standing still: the left edge pushes him along.
	var start_x := hero.global_position.x
	await physics_frames(200)
	var view: Rect2 = camera.call(&"view_rect")
	assert_true(hero.global_position.x >= view.position.x and hero.global_position.x > start_x + 100.0,
			"pushed along by the left edge (x %.0f, view from %.0f)" % [hero.global_position.x, view.position.x])
	# Running ahead: held back by the right edge.
	press(&"move_right")
	for i in 120:
		await physics_frames(1)
		view = camera.call(&"view_rect")
		assert_true(hero.global_position.x <= view.end.x - 8.0, "never ahead of the screen (frame %d)" % i)
	release(&"move_right")
	var stop_view := [Rect2()]
	section.connect(&"finished", func() -> void: stop_view[0] = camera.call(&"view_rect"))
	var stopped := await W.wait_for(self, func() -> bool: return section.get(&"done"), 900)
	assert_true(stopped >= 0, "stopped at the end")
	assert_true(stop_view[0].end.x >= 300.0 + 1200.0 - 0.5, "where the section ends (view end %.0f)" % stop_view[0].end.x)
	assert_true(not hero.clamp_rect.has_area(), "clamp_rect cleared")
	var x1 := camera.global_position.x
	await physics_frames(30)
	assert_true(absf(camera.global_position.x - x1) < 30.0, "the camera follows Sproto again")


func test_autoscroll_crushes_sproto_against_a_wall_and_stops() -> void:
	_set_act("test_zone", 1)
	var made := await _scroll_level(func(root: Node) -> void:
		W.add_rect(root.get_node(^"Terrain"), Rect2(700, -400, 32, 400)))
	var level := made[0] as LevelRoot
	var section := made[1] as Node2D
	var hero := level.player
	hero.respawn_at(Vector2(600, -19))
	var died := await W.wait_for(self, func() -> bool: return hero.state == &"dead", 600)
	assert_true(died >= 0, "pinned against the wall by the left edge: crushed")
	await physics_frames(2)
	assert_true(section.get(&"done") and not section.get(&"active"), "the scroll stops when he dies")
	assert_true(not hero.clamp_rect.has_area(), "clamp_rect cleared")


func test_a_respawned_act_starts_the_section_over() -> void:
	_set_act("test_zone", 1)
	var made := await _scroll_level()
	var level := made[0] as LevelRoot
	var section := made[1] as Node2D
	level.player.respawn_at(Vector2(320, -19))
	await W.wait_for(self, func() -> bool: return section.get(&"active"), 5)
	await physics_frames(60)
	level.player.kill()
	await W.wait_for(self, func() -> bool: return section.get(&"done"), 5)
	assert_true(section.get(&"done"), "stopped by the death")
	var respawned := [false]
	level.respawn_requested.connect(func() -> void: respawned[0] = true)
	await W.wait_for(self, func() -> bool: return respawned[0], 300)
	assert_true(respawned[0], "LevelRoot asks for the respawn")
	# SceneRouter.respawn reloads the act: a fresh copy, Sproto at a checkpoint before the start.
	level.queue_free()
	await physics_frames(2)
	made = await _scroll_level()
	var again := made[1] as Node2D
	var camera := _camera()
	var x0 := camera.global_position.x
	await physics_frames(30)
	assert_true(not again.get(&"active") and not (made[0] as LevelRoot).player.clamp_rect.has_area(), "idle again before the start")
	assert_near(camera.global_position.x, x0, 1.0, "the camera isn't scrolling")
	(made[0] as LevelRoot).player.respawn_at(Vector2(320, -19))
	var began := await W.wait_for(self, func() -> bool: return again.get(&"active"), 5)
	assert_true(began >= 0, "and scrolls again from its start line")


func test_pausing_pauses_the_scroll() -> void:
	_set_act("test_zone", 1)
	var made := await _scroll_level()
	var level := made[0] as LevelRoot
	level.player.respawn_at(Vector2(320, -19))
	await physics_frames(10)
	var camera := _camera()
	var x0 := camera.global_position.x
	tree.paused = true
	await physics_frames(30)
	var x1 := camera.global_position.x
	tree.paused = false
	await physics_frames(30)
	assert_near(x1, x0, 0.01, "no scrolling while paused")
	assert_true(camera.global_position.x > x1 + 30.0, "scrolls on after the pause")
