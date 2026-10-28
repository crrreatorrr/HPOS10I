extends TestCase
## QA guards for moving terrain (docs/CONTRACTS.md "Moving terrain"; checklist
## 01-physics section M). QA builds its own platforms to the contract:
## AnimatableBody2D, sync_to_physics, terrain bits, moved in _physics_process
## before the player, exposing platform_delta(). Skips until player/ reads
## platform_delta(). Written ahead of the physics work: if a check disagrees
## with a documented choice, QA updates it at review. Owned by QA.

const L := preload("res://tests/qa/qa_physics_lib.gd")

const MOVER_SRC := """extends AnimatableBody2D
var velocity := Vector2.ZERO
## Reverse every N ticks (0 = never); stop after N ticks (0 = never).
var reverse_ticks := 0
var stop_after := 0
var _tick := 0
var _delta := Vector2.ZERO

func _ready() -> void:
	sync_to_physics = true
	process_physics_priority = -10

func platform_delta() -> Vector2:
	return _delta

func _physics_process(_d: float) -> void:
	_tick += 1
	if stop_after > 0 and _tick > stop_after:
		velocity = Vector2.ZERO
	elif reverse_ticks > 0 and _tick % reverse_ticks == 0:
		velocity = -velocity
	_delta = velocity
	position += velocity
"""

var _mover: GDScript


func after_each() -> void:
	GameState.tickets = 0
	for action in [&"move_right", &"move_left", &"move_down", &"jump"]:
		Dev.send_action(action, false)


func _skip() -> bool:
	if not L.available():
		print("  SKIP qa/test_moving_terrain.gd: no player yet")
		return true
	var dir := DirAccess.open("res://player")
	var reads := false
	if dir != null:
		for f in dir.get_files():
			if f.ends_with(".gd") and FileAccess.get_file_as_string("res://player/" + f).contains("platform_delta"):
				reads = true
	if not reads:
		print("  SKIP qa/test_moving_terrain.gd: the player does not read platform_delta() yet")
		return true
	return false


## A moving platform: `rect` in world space (its top edge is the walkable
## surface), moving `velocity` px per tick.
func _platform(w: Node2D, rect: Rect2, velocity: Vector2, reverse_ticks := 0, stop_after := 0, layer := L.SOLID) -> AnimatableBody2D:
	if _mover == null:
		_mover = GDScript.new()
		_mover.source_code = MOVER_SRC
		_mover.reload()
	var body := AnimatableBody2D.new()
	body.set_script(_mover)
	body.collision_layer = layer
	body.collision_mask = 0
	body.position = rect.get_center()
	var shape := CollisionShape2D.new()
	var box := RectangleShape2D.new()
	box.size = rect.size
	shape.shape = box
	body.add_child(shape)
	body.set(&"velocity", velocity)
	body.set(&"reverse_ticks", reverse_ticks)
	body.set(&"stop_after", stop_after)
	w.add_child(body)
	return body


func _top(body: Node2D) -> float:
	var box := (body.get_child(0) as CollisionShape2D).shape as RectangleShape2D
	return body.global_position.y - box.size.y / 2.0


func _dead(p: Node2D) -> bool:
	return str(p.get(&"state")) == "dead"


func _ride(velocity: Vector2, reverse_ticks: int, ticks: int) -> Dictionary:
	var w := L.world(self)
	var plat := _platform(w, Rect2(-120, 0, 240, 16), velocity, reverse_ticks)
	var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
	var worst_dx := 0.0
	var worst_feet := 0.0
	var airborne := 0
	var max_gsp := 0.0
	var last := p.global_position
	for i in ticks:
		await physics_frames(1)
		var d: Vector2 = plat.call(&"platform_delta")
		worst_dx = maxf(worst_dx, absf((p.global_position.x - last.x) - d.x))
		worst_feet = maxf(worst_feet, absf(L.feet_y(p) - _top(plat)))
		if not bool(p.get(&"grounded")):
			airborne += 1
		max_gsp = maxf(max_gsp, absf(float(p.get(&"ground_speed"))))
		last = p.global_position
	return {dx = worst_dx, feet = worst_feet, airborne = airborne, gsp = max_gsp, inside = L.centre_in_terrain(p)}


func test_m1_ride_horizontal_with_reversals() -> void:
	if _skip():
		return
	var r: Dictionary = await _ride(Vector2(2, 0), 60, 240)
	print("  INFO horizontal ride: worst dx error %.3f, feet error %.3f, airborne ticks %d, max |gsp| %.3f" % [r.dx, r.feet, r.airborne, r.gsp])
	assert_true(r.dx <= 0.01, "carried exactly by platform_delta().x")
	assert_eq(r.airborne, 0, "stays grounded through reversals")
	assert_true(r.gsp <= 0.01, "the platform's speed is not added to ground speed")


func test_m2_ride_vertical() -> void:
	if _skip():
		return
	for v in [Vector2(0, -2), Vector2(0, 2), Vector2(0, -3)]:
		var r: Dictionary = await _ride(v, 60, 180)
		print("  INFO vertical ride %s: feet error %.3f, airborne %d" % [v, r.feet, r.airborne])
		assert_true(r.feet <= 0.5, "feet on the surface riding %s" % v)
		assert_eq(r.airborne, 0, "grounded riding %s" % v)
		assert_true(not r.inside, "never inside the platform riding %s" % v)


func test_m3_ride_diagonal() -> void:
	if _skip():
		return
	var r: Dictionary = await _ride(Vector2(2, -1), 50, 200)
	print("  INFO diagonal ride: dx error %.3f, feet error %.3f, airborne %d" % [r.dx, r.feet, r.airborne])
	assert_true(r.dx <= 0.01 and r.feet <= 0.5 and r.airborne == 0, "carried on both axes")


func test_m4_platform_dropping_faster_than_gravity() -> void:
	if _skip():
		return
	for speed in [8.0, 12.0]:
		var w := L.world(self)
		L.floor_at(w, -2000, 2000, 400.0)
		var plat := _platform(w, Rect2(-120, 0, 240, 16), Vector2(0, speed), 0, 20)
		var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
		var below := false
		var nan := false
		var grounded_at := -1
		for i in 80:
			await physics_frames(1)
			if L.feet_y(p) > _top(plat) + 1.0 and absf(p.global_position.x) < 110.0:
				below = true
			if is_nan(p.global_position.x) or is_nan(p.global_position.y):
				nan = true
			if i > 20 and grounded_at < 0 and bool(p.get(&"grounded")):
				grounded_at = i - 20
		print("  INFO drop at %s px/f: grounded %d ticks after the stop" % [speed, grounded_at])
		assert_true(not below and not nan, "never below the dropping surface (%s px/f)" % speed)
		assert_true(grounded_at >= 0 and grounded_at <= 30, "lands within 30 ticks of the stop (%s px/f)" % speed)


func test_m5_jumping_off_keeps_own_speed() -> void:
	if _skip():
		return
	var w := L.world(self)
	var plat := _platform(w, Rect2(-400, 0, 800, 16), Vector2(2, 0))
	var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
	await physics_frames(20)
	press(&"jump")
	await physics_frames(6)
	release(&"jump")
	var vx := 0.0
	for i in 10:
		await physics_frames(1)
		if not bool(p.get(&"grounded")):
			vx = (p.get(&"velocity") as Vector2).x
	print("  INFO air x velocity after jumping off a 2 px/f platform: %.3f" % vx)
	assert_true(absf(vx) <= 0.05, "the platform's speed is not added on jumping off (got %.3f)" % vx)


func test_m7_conveyors_both_ways() -> void:
	if _skip():
		return
	for speed in [2.0, -2.0]:
		var w := L.world(self)
		var belt := L.rect(w, Rect2(-600, 0, 1200, 300))
		belt.set_meta(&"conveyor_speed", speed)
		var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
		var x0 := p.global_position.x
		var max_gsp := 0.0
		for i in 60:
			await physics_frames(1)
			max_gsp = maxf(max_gsp, absf(float(p.get(&"ground_speed"))))
		var moved := p.global_position.x - x0
		print("  INFO conveyor %s px/f: moved %.2f px in 60 ticks, max |gsp| %.3f" % [speed, moved, max_gsp])
		assert_near(moved, speed * 60.0, 2.0 * absf(speed) + 0.5, "standing on a %s px/f conveyor" % speed)
		assert_true(max_gsp <= 0.01, "conveyor speed is not ground speed")


func test_m8_crush_from_above_kills_at_the_right_gap() -> void:
	if _skip():
		return
	var w := L.world(self)
	L.floor_at(w)
	# The platform's bottom starts 60 px above the floor and closes at 1 px/f.
	var plat := _platform(w, Rect2(-100, -60 - 40, 200, 40), Vector2(0, 1))
	var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
	var gap_at_death := -1.0
	for i in 70:
		await physics_frames(1)
		var gap: float = (_top(plat) + 40.0)  # platform bottom
		gap = 0.0 - gap  # floor is y = 0
		if _dead(p):
			gap_at_death = gap
			break
	print("  INFO crushed from above when the gap was %.1f px (standing height 38)" % gap_at_death)
	assert_true(gap_at_death > 0.0, "crushed")
	assert_true(gap_at_death < 38.0 and gap_at_death > 34.0, "dies as the gap gets smaller than his hitbox, not earlier")


func test_m9_no_false_kill_when_a_platform_stops_above_the_head() -> void:
	if _skip():
		return
	var w := L.world(self)
	L.floor_at(w)
	# Closes from 60 px to 39 px (1 px above a 38 px standing hitbox), then stops.
	var plat := _platform(w, Rect2(-100, -60 - 40, 200, 40), Vector2(0, 1), 0, 21)
	var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
	await physics_frames(90)
	assert_true(not _dead(p), "a platform stopping 1 px above his head never kills")
	assert_true(not L.centre_in_terrain(p), "and never pushes him into the floor")


func test_m8_side_crush_and_m9_side_push() -> void:
	if _skip():
		return
	# Into a wall: dies when the gap is narrower than his body.
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(40, -200, 100, 200))
	_platform(w, Rect2(-140, -100, 60, 100), Vector2(1.5, 0))
	var p: Node2D = await L.spawn(self, w, Vector2(0, 0))
	var died := false
	for i in 120:
		await physics_frames(1)
		if _dead(p):
			died = true
			break
	assert_true(died, "a side pusher pressing him into a wall kills")
	# Into open space: pushed or carried, never killed.
	w = L.world(self)
	L.floor_at(w)
	_platform(w, Rect2(-140, -100, 60, 100), Vector2(1.5, 0))
	p = await L.spawn(self, w, Vector2(0, 0))
	await physics_frames(120)
	assert_true(not _dead(p), "a side pusher with open space ahead never kills")
	assert_true(not L.centre_in_terrain(p), "and never ends up inside it")


func test_m12_platform_fuzz() -> void:
	if _skip():
		return
	for seed in [1, 2, 3]:
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		var w := L.world(self)
		L.floor_at(w, -3000, 3000, 0.0)
		_platform(w, Rect2(-600, -80, 160, 16), Vector2(2, 0), 90)
		_platform(w, Rect2(-300, -60, 120, 16), Vector2(0, -2), 50)
		_platform(w, Rect2(-100, -120, 120, 16), Vector2(2, -1), 60)
		_platform(w, Rect2(150, -100, 120, 16), Vector2(0, 9), 12)
		var belt := L.rect(w, Rect2(350, -10, 300, 10))
		belt.set_meta(&"conveyor_speed", -2.0)
		var crusher := _platform(w, Rect2(800, -120, 120, 60), Vector2(0, 1.5), 50)
		var p: Node2D = await L.spawn(self, w, Vector2(-800, 0))
		var actions := [&"move_left", &"move_right", &"move_down", &"jump"]
		var bad := ""
		for i in 1500:
			if i % 6 == 0:
				for a in actions:
					if rng.randf() < 0.3:
						if Input.is_action_pressed(a):
							release(a)
						else:
							press(a)
			await physics_frames(1)
			if is_nan(p.global_position.x) or is_nan(p.global_position.y):
				bad = "NaN at tick %d" % i
				break
			if _dead(p):
				if absf(p.global_position.x - crusher.global_position.x) > 120.0:
					bad = "died outside the crusher at (%.0f, %.0f), tick %d" % [p.global_position.x, p.global_position.y, i]
				break
			if L.centre_in_terrain(p):
				bad = "inside terrain at (%.0f, %.0f), tick %d" % [p.global_position.x, p.global_position.y, i]
				break
		for a in actions:
			release(a)
		assert_eq(bad, "", "platform fuzz seed %d" % seed)
