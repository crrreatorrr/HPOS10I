extends TestCase
## Moving terrain, the player side (docs/CONTRACTS.md): riding platforms,
## conveyors and crushing. Uses the playground's demo platform and conveyor.

const W := preload("res://tests/physics/physics_world.gd")
const PLATFORM := preload("res://playground/demo_moving_platform.gd")
const CONVEYOR := preload("res://playground/demo_conveyor.gd")

const PLATFORM_Y := -200.0


## Records Sproto's offset from a body at the end of every physics tick, once
## both have moved: what the renderer interpolates between.
class Sampler:
	extends Node
	var player: Player
	var body: Node2D
	var offsets: Array[Vector2] = []
	var airborne := 0

	func _physics_process(_delta: float) -> void:
		offsets.append(player.global_position - body.global_position)
		if not player.grounded:
			airborne += 1

	## Largest change of the offset since the first sample.
	func drift() -> float:
		var worst := 0.0
		for offset in offsets:
			worst = maxf(worst, (offset - offsets[0]).length())
		return worst


func after_each() -> void:
	for action in [&"move_left", &"move_right", &"move_down", &"jump"]:
		release(action)


func _platform(world: Node2D, at: Vector2, motion: Callable, size := Vector2(96.0, 12.0)) -> AnimatableBody2D:
	var body: AnimatableBody2D = PLATFORM.new()
	body.size = size
	body.position = at
	body.offset_at = motion
	world.add_child(body)
	return body


## Moves `velocity` px per frame from frame `start` to frame `stop`.
static func _linear(velocity: Vector2, start := 0, stop := 100000) -> Callable:
	return func(frame: int) -> Vector2:
		return velocity * float(clampi(frame, start, stop) - start)


## Shuttles `velocity` px per frame, turning instantly every `half` frames.
static func _shuttle(velocity: Vector2, half: int) -> Callable:
	return func(frame: int) -> Vector2:
		var t := frame % (2 * half)
		return velocity * float(t if t <= half else 2 * half - t)


## A world with a floor far below and one platform; Sproto stands on it, then
## the platform starts its motion. Returns [world, platform, player, sampler].
func _ride(motion: Callable, size := Vector2(96.0, 12.0)) -> Array:
	var world := W.new_world(self)
	W.add_floor(world, -3000.0, 3000.0, 400.0)
	var body := _platform(world, Vector2(0.0, PLATFORM_Y), _linear(Vector2.ZERO), size)
	var player := W.spawn_player(world, Vector2(0.0, PLATFORM_Y))
	await W.settle(self, player, Vector2(0.0, PLATFORM_Y))
	body.set(&"frame", 0)
	body.set(&"offset_at", motion)
	return [world, body, player, _sample(world, player, body)]


func _sample(world: Node2D, player: Player, body: Node2D) -> Sampler:
	var sampler := Sampler.new()
	sampler.player = player
	sampler.body = body
	sampler.process_physics_priority = 1000
	world.add_child(sampler)
	return sampler


## Sproto's offset from the platform, which must not change while he stands.
static func _offset(player: Player, body: Node2D) -> Vector2:
	return player.global_position - body.global_position


func test_standing_rides_horizontal_vertical_and_diagonal_platforms() -> void:
	for velocity: Vector2 in [Vector2(2, 0), Vector2(-3, 0), Vector2(0, -2), Vector2(0, 2.5),
			Vector2(2, -2), Vector2(-1.5, 1.5), Vector2(6, 0)]:
		var made := await _ride(_linear(velocity))
		var body: Node2D = made[1]
		var player: Player = made[2]
		var sampler: Sampler = made[3]
		var x0 := player.global_position.x
		await physics_frames(60)
		assert_true(sampler.drift() < 0.01, "%s: stays put on the platform (drift %.3f px)" % [velocity, sampler.drift()])
		assert_eq(sampler.airborne, 0, "%s: never airborne;" % velocity)
		assert_eq(player.ground_speed, 0.0, "%s: ground speed untouched;" % velocity)
		assert_true(absf(player.global_position.x - x0) >= absf(velocity.x) * 58.0, "%s: carried" % velocity)
		assert_true(body != null)
		(made[0] as Node).queue_free()
		await physics_frames(1)


func test_running_and_rolling_on_a_platform_keep_their_own_speed() -> void:
	# Two lanes with the same inputs: a moving platform and a still one.
	var world := W.new_world(self)
	var moving := _platform(world, Vector2(0.0, PLATFORM_Y), _linear(Vector2.ZERO), Vector2(1200, 12))
	var still := _platform(world, Vector2(0.0, PLATFORM_Y + 1000.0), _linear(Vector2.ZERO), Vector2(1200, 12))
	var riding := W.spawn_player(world, Vector2(0.0, PLATFORM_Y))
	var walking := W.spawn_player(world, Vector2(0.0, PLATFORM_Y + 1000.0))
	await physics_frames(2)
	riding.respawn_at(Vector2(0.0, PLATFORM_Y - 19.0))
	walking.respawn_at(Vector2(0.0, PLATFORM_Y + 1000.0 - 19.0))
	await physics_frames(2)
	moving.set(&"frame", 0)
	moving.set(&"offset_at", _linear(Vector2(-2, -0.5)))
	var sampler := _sample(world, riding, moving)
	var walk := _sample(world, walking, still)
	riding.ground_speed = 3.0
	walking.ground_speed = 3.0
	for i in 90:
		if i == 10:
			press(&"move_right")
		if i == 40:
			release(&"move_right")
			press(&"move_down")  # roll
		if i == 41:
			release(&"move_down")
		await physics_frames(1)
		assert_eq(riding.ground_speed, walking.ground_speed, "frame %d: same ground speed;" % i)
		assert_eq(riding.state, walking.state, "frame %d: same state;" % i)
		if riding.ground_speed != walking.ground_speed:
			break
	# The same run relative to each platform, tick by tick.
	var worst := 0.0
	for i in mini(sampler.offsets.size(), walk.offsets.size()):
		worst = maxf(worst, (sampler.offsets[i] - walk.offsets[i]).length())
	assert_true(worst < 0.001, "the same run relative to the platform (worst %.4f px)" % worst)
	assert_eq(riding.state, &"roll", "rolling at the end;")


func test_landing_on_moving_platforms() -> void:
	for velocity: Vector2 in [Vector2(3, 0), Vector2(0, -2), Vector2(0, 2), Vector2(-2, 1)]:
		var world := W.new_world(self)
		W.add_floor(world, -3000.0, 3000.0, 400.0)
		var body := _platform(world, Vector2(0.0, PLATFORM_Y), _linear(velocity), Vector2(400, 12))
		var player := W.spawn_player(world, Vector2(0.0, PLATFORM_Y - 80.0))
		await physics_frames(2)
		player.respawn_at(Vector2(0.0, PLATFORM_Y - 80.0))
		var landed := -1
		for i in 120:
			await physics_frames(1)
			if player.grounded:
				landed = i
				break
		assert_true(landed >= 0, "%s: landed" % velocity)
		assert_eq(player.ground_speed, 0.0, "%s: no platform speed in the landing;" % velocity)
		await physics_frames(1)
		var sampler := _sample(world, player, body)
		await physics_frames(30)
		assert_true(sampler.airborne == 0 and sampler.drift() < 0.01,
				"%s: then rides it (drift %.3f px)" % [velocity, sampler.drift()])
		world.queue_free()
		await physics_frames(1)


func test_jumping_off_keeps_only_the_jump() -> void:
	for velocity: Vector2 in [Vector2(3, 0), Vector2(0, -2), Vector2(-2, -1)]:
		var made := await _ride(_linear(velocity))
		var player: Player = made[2]
		await physics_frames(10)
		press(&"jump")
		for i in 5:
			await physics_frames(1)
			if not player.grounded:
				break
		assert_true(not player.grounded, "%s: jumped" % velocity)
		assert_eq(player.velocity, Vector2(0.0, -Tuning.physics.jump_force), "%s: the jump only;" % velocity)
		var x := player.global_position.x
		await physics_frames(10)
		release(&"jump")
		assert_near(player.global_position.x, x, 0.001, "%s: no sideways drift in the air" % velocity)
		(made[0] as Node).queue_free()
		await physics_frames(1)


func test_platforms_reversing_under_him() -> void:
	for velocity: Vector2 in [Vector2(3, 0), Vector2(0, 2), Vector2(0, 3), Vector2(2, 2)]:
		var made := await _ride(_shuttle(velocity, 30))
		var player: Player = made[2]
		var sampler: Sampler = made[3]
		await physics_frames(130)
		assert_eq(sampler.airborne, 0, "%s: never thrown off by a turn;" % velocity)
		assert_true(sampler.drift() < 0.01, "%s: stays put through the turns (drift %.3f px)" % [velocity, sampler.drift()])
		assert_eq(player.ground_speed, 0.0, "%s: no speed picked up;" % velocity)
		(made[0] as Node).queue_free()
		await physics_frames(1)


func test_a_platform_dropping_faster_than_he_falls() -> void:
	# Still, then 9 px a frame down for 20 frames, then still again.
	var made := await _ride(_linear(Vector2(0, 9), 10, 30))
	var body: Node2D = made[1]
	var player: Player = made[2]
	var start := _offset(player, body)
	var lifted := -1
	var landed := -1
	var buried := false
	for i in 150:
		await physics_frames(1)
		if lifted < 0 and not player.grounded:
			lifted = i
		if lifted >= 0 and landed < 0 and player.grounded:
			landed = i
		if player.global_position.y + player.get_radii().y > body.global_position.y + 0.5:
			buried = true
	assert_true(lifted >= 9 and lifted <= 12, "lifts off when it drops (frame %d)" % lifted)
	assert_true(landed > 30, "lands on it again after it stops (frame %d)" % landed)
	assert_true(not buried, "never below its top")
	assert_true(player.grounded and (_offset(player, body) - start).length() < 0.01, "standing on it again")
	(made[0] as Node).queue_free()
	await physics_frames(1)
	# A steady fall is ridden, from a standstill too.
	for speed: float in [2.0, 4.0]:
		made = await _ride(_linear(Vector2(0, speed), 10))
		var sampler: Sampler = made[3]
		await physics_frames(60)
		assert_eq(sampler.airborne, 0, "%s px/f down: ridden, not lifted off;" % speed)
		assert_true(sampler.drift() < 0.01, "%s px/f down: stays put (drift %.3f px)" % [speed, sampler.drift()])
		(made[0] as Node).queue_free()
		await physics_frames(1)


func test_conveyors_both_ways() -> void:
	for speed: float in [2.0, -2.0]:
		var world := W.new_world(self)
		W.add_floor(world, -3000.0, 3000.0, 400.0)
		var belt: StaticBody2D = CONVEYOR.new()
		belt.size = Vector2(1200, 8)
		belt.speed = speed
		belt.position = Vector2(-600.0, PLATFORM_Y)
		world.add_child(belt)
		W.add_rect(world, Rect2(-600.0, PLATFORM_Y + 1000.0, 1200.0, 8.0))
		var riding := W.spawn_player(world, Vector2(0.0, PLATFORM_Y))
		var walking := W.spawn_player(world, Vector2(0.0, PLATFORM_Y + 1000.0))
		await physics_frames(2)
		riding.respawn_at(Vector2(0.0, PLATFORM_Y - 19.0))
		walking.respawn_at(Vector2(0.0, PLATFORM_Y + 1000.0 - 19.0))
		await physics_frames(2)
		# Standing still: carried at the belt's speed.
		var x := riding.global_position.x
		await physics_frames(20)
		assert_near(riding.global_position.x - x, speed * 20.0, 0.001, "%s: standing still carries him" % speed)
		assert_eq(riding.ground_speed, 0.0, "%s: ground speed untouched;" % speed)
		# Walking against it: his own run, minus the belt.
		var against := &"move_left" if speed > 0.0 else &"move_right"
		var rx := riding.global_position.x
		var wx := walking.global_position.x
		press(against)
		for i in 60:
			await physics_frames(1)
			assert_eq(riding.ground_speed, walking.ground_speed, "%s frame %d: same ground speed;" % [speed, i])
		release(against)
		var walked := walking.global_position.x - wx
		assert_near(riding.global_position.x - rx, walked + speed * 60.0, 0.001, "%s: walking against it is slower" % speed)
		assert_true(absf(riding.global_position.x - rx) < absf(walked), "%s: slower than on still ground" % speed)
		world.queue_free()
		await physics_frames(1)


## A block comes down on Sproto standing on the floor: crushed once the gap is
## shorter than he is; a block that stops just touching his head is not.
func test_crushed_between_a_moving_block_and_the_floor() -> void:
	for stop_gap: float in [30.0, 38.0, 37.5]:
		var world := W.new_world(self)
		W.add_floor(world)
		var player := W.spawn_player(world, Vector2.ZERO)
		await W.settle(self, player, Vector2.ZERO)
		# Block bottom from 80 px above the floor down to stop_gap, 2 px a frame.
		var size := Vector2(96, 40)
		var frames := int((80.0 - stop_gap) / 2.0)
		var last := 80.0 - stop_gap
		_platform(world, Vector2(0.0, -80.0 - size.y),
				func(frame: int) -> Vector2: return Vector2(0.0, minf(frame * 2.0, last)), size)
		for i in frames + 20:
			await physics_frames(1)
		var crushed := player.state == &"dead"
		if stop_gap < 38.0 - Player.CRUSH_TOLERANCE:
			assert_true(crushed, "gap %s: crushed" % stop_gap)
		else:
			assert_true(not crushed, "gap %s: only touching, alive" % stop_gap)
		world.queue_free()
		await physics_frames(1)


## Riding a platform up into a ceiling: crushed when it leaves no room, fine
## when it stops with his head touching.
func test_carried_up_into_a_ceiling() -> void:
	for stop_gap: float in [20.0, 38.0]:
		var world := W.new_world(self)
		W.add_floor(world, -3000.0, 3000.0, 400.0)
		W.add_rect(world, Rect2(-300.0, PLATFORM_Y - 100.0 - 40.0, 600.0, 40.0))  # ceiling bottom at -300
		var rise := 100.0 - stop_gap
		var body := _platform(world, Vector2(0.0, PLATFORM_Y),
				func(frame: int) -> Vector2: return Vector2(0.0, -minf(frame * 2.0, rise)))
		var player := W.spawn_player(world, Vector2(0.0, PLATFORM_Y))
		await W.settle(self, player, Vector2(0.0, PLATFORM_Y))
		for i in 80:
			await physics_frames(1)
		if stop_gap < 37.0:
			assert_eq(player.state, &"dead", "gap %s: crushed against the ceiling;" % stop_gap)
		else:
			assert_true(player.state != &"dead" and player.grounded, "gap %s: touching, alive and riding" % stop_gap)
			assert_near(player.global_position.y - player.get_radii().y, PLATFORM_Y - 100.0, 0.01, "head at the ceiling")
			assert_near(player.global_position.y + player.get_radii().y, body.global_position.y, 0.01, "feet on the platform")
		world.queue_free()
		await physics_frames(1)


## A block sliding into Sproto pushes him along; against a wall it crushes him.
func test_pushed_sideways_and_crushed_against_a_wall() -> void:
	for wall: bool in [false, true]:
		var world := W.new_world(self)
		W.add_floor(world)
		if wall:
			W.add_rect(world, Rect2(60.0, -200.0, 40.0, 200.0))
		var player := W.spawn_player(world, Vector2.ZERO)
		await W.settle(self, player, Vector2.ZERO)
		var block := _platform(world, Vector2(-100.0, -60.0), _linear(Vector2(3, 0)), Vector2(40, 59))
		var sampler := _sample(world, player, block)
		await physics_frames(60)
		if wall:
			assert_eq(player.state, &"dead", "squeezed against the wall: crushed;")
		else:
			assert_true(player.state != &"dead", "pushed, alive")
			assert_true(player.global_position.x > 50.0, "pushed along (x %.1f)" % player.global_position.x)
			# At the end of each tick (as drawn), never closer than his push radius.
			var closest := INF
			for offset in sampler.offsets:
				closest = minf(closest, offset.x - 20.0)
			assert_true(closest >= Tuning.physics.push_radius - 0.01, "kept clear of the block (%.2f)" % closest)
		world.queue_free()
		await physics_frames(1)


## With physics interpolation on, Sproto and the platform are drawn moving
## together: both are interpolated between their physics ticks, and at the
## end of every tick (what the interpolation uses) they are the same distance
## apart, so no rendered frame can smear them, whatever the order in which
## their scripts run.
func test_interpolated_ride_has_no_smear() -> void:
	var was_on := tree.physics_interpolation
	tree.physics_interpolation = true
	for priority in [-10, 10]:
		var world := W.new_world(self)
		W.add_floor(world, -3000.0, 3000.0, 400.0)
		var body := _platform(world, Vector2(0.0, PLATFORM_Y), _linear(Vector2.ZERO))
		body.process_physics_priority = priority
		var player := W.spawn_player(world, Vector2(0.0, PLATFORM_Y))
		await W.settle(self, player, Vector2(0.0, PLATFORM_Y))
		body.set(&"frame", 0)
		body.set(&"offset_at", _shuttle(Vector2(5, -1.5), 25))
		var sampler := _sample(world, player, body)
		await physics_frames(80)
		assert_true(player.is_physics_interpolated() and body.is_physics_interpolated(), "both interpolated")
		assert_true(sampler.airborne == 0 and sampler.drift() < 0.01,
				"platform priority %d: drawn together (drift %.3f px)" % [priority, sampler.drift()])
		world.queue_free()
		await physics_frames(1)
	tree.physics_interpolation = was_on
