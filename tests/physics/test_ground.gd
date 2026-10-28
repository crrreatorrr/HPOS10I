extends TestCase
## Ground movement on flat floor: acceleration, deceleration, friction,
## skidding, rolling, spin dash and walls.

const W := preload("res://tests/physics/physics_world.gd")

var world: Node2D
var player: Player


func _flat(feet := Vector2.ZERO) -> void:
	world = W.new_world(self)
	W.add_floor(world)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)


func test_reaches_top_speed_after_exactly_128_frames() -> void:
	await _flat()
	assert_true(player.grounded, "grounded before running")
	press(&"move_right")
	await physics_frames(127)
	assert_true(player.ground_speed < 6.0 - 0.01, "below top speed after 127 frames (%s)" % player.ground_speed)
	assert_near(player.ground_speed, 127 * 0.046875, 1e-6, "127 frames of acceleration")
	await physics_frames(1)
	assert_near(player.ground_speed, 6.0, 1e-6, "top speed at frame 128")
	await physics_frames(60)
	assert_near(player.ground_speed, 6.0, 1e-9, "stays at top speed")
	assert_eq(player.state, &"run", "state")


func test_deceleration_and_turnaround_quirk() -> void:
	await _flat()
	player.ground_speed = 2.0
	press(&"move_left")
	await physics_frames(1)
	assert_near(player.ground_speed, 1.5, 1e-6, "one frame of deceleration")
	await physics_frames(3)
	# 1.5 -> 1.0 -> 0.5 -> 0.0 flips: the classic quirk sets -0.5 instead of 0.
	assert_near(player.ground_speed, -0.5, 1e-6, "turnaround at 0.5 the other way")
	assert_eq(player.facing, -1, "facing left after turning")


func test_friction_to_zero() -> void:
	await _flat()
	player.ground_speed = 1.0
	await physics_frames(1)
	assert_near(player.ground_speed, 1.0 - 0.046875, 1e-6, "one frame of friction")
	await physics_frames(30)
	assert_eq(player.ground_speed, 0.0, "friction stops at exactly zero")
	assert_eq(player.state, &"idle", "idle when stopped")


func test_skid_when_reversing_fast() -> void:
	await _flat()
	player.ground_speed = 6.0
	press(&"move_left")
	await physics_frames(1)
	assert_eq(player.state, &"skid", "skids at speed 6")
	await physics_frames(12)
	assert_true(player.ground_speed < 0.0, "turned around")
	assert_true(player.state != &"skid", "skid ends after turning")


func test_roll_friction_and_unroll() -> void:
	await _flat()
	player.ground_speed = 3.0
	press(&"move_down")
	await physics_frames(1)
	assert_eq(player.state, &"roll", "down while moving rolls")
	release(&"move_down")
	var before := player.ground_speed
	await physics_frames(1)
	assert_near(before - player.ground_speed, 0.0234375, 1e-6, "roll friction per frame")
	assert_true(player.is_attacking(), "rolling attacks")
	var frames := 0
	while player.state == &"roll" and frames < 400:
		before = player.ground_speed
		await physics_frames(1)
		frames += 1
	assert_eq(player.state, &"run", "unrolled")
	assert_true(before >= 0.5 and player.ground_speed < 0.5, "unrolls when dropping below 0.5 (%s)" % player.ground_speed)


func test_roll_needs_minimum_speed() -> void:
	await _flat()
	player.ground_speed = 0.9
	press(&"move_down")
	await physics_frames(1)
	assert_true(player.state != &"roll", "too slow to roll")


func test_spindash_zero_presses_is_base_speed() -> void:
	await _flat()
	press(&"move_down")
	await physics_frames(2)
	assert_true(player.crouching, "down while idle crouches")
	# A press made from a test is seen as "just pressed" on the following tick.
	press(&"jump")
	await physics_frames(2)
	release(&"jump")
	assert_eq(player.state, &"spindash", "jump while crouching starts the spin dash")
	assert_eq(player.spindash_charge, 0.0, "starts uncharged")
	await physics_frames(1)
	release(&"move_down")
	await physics_frames(1)
	assert_eq(player.state, &"roll", "released into a roll")
	assert_near(player.ground_speed, 8.0, 1e-6, "base speed")


## Presses jump `count` times, one press every other frame, while crouched in a spin dash.
func _charge(count: int) -> void:
	press(&"move_down")
	await physics_frames(2)
	press(&"jump")
	await physics_frames(1)
	release(&"jump")
	await physics_frames(1)
	for i in count:
		press(&"jump")
		await physics_frames(1)
		release(&"jump")
		await physics_frames(1)


func test_spindash_four_presses() -> void:
	await _flat()
	await _charge(4)
	# 4 x 2 = 8, but the classic per-frame decay runs between presses, so the
	# charge is 7.29... and floor(charge) / 2 adds 3.5, not 4.
	assert_true(player.spindash_charge > 7.0 and player.spindash_charge < 8.0,
			"charge after 4 presses (%s)" % player.spindash_charge)
	release(&"move_down")
	await physics_frames(1)
	assert_near(player.ground_speed, 11.5, 1e-6, "8 + floor(charge) / 2")


func test_spindash_full_charge_is_12() -> void:
	await _flat()
	await _charge(6)
	release(&"move_down")
	await physics_frames(1)
	assert_near(player.ground_speed, 12.0, 1e-6, "fully charged spin dash")
	assert_eq(player.state, &"roll", "rolling")


func test_spindash_charge_decays() -> void:
	await _flat()
	await _charge(3)
	var charge := player.spindash_charge
	await physics_frames(10)
	assert_true(player.spindash_charge < charge, "charge decays while held")
	# One classic decay step: charge -= floor(charge / 0.125) / 256.
	charge = player.spindash_charge
	await physics_frames(1)
	assert_near(player.spindash_charge, charge - floorf(charge / 0.125) / 256.0, 1e-9, "decay formula")


func test_spindash_left() -> void:
	await _flat()
	press(&"move_left")
	await physics_frames(1)
	release(&"move_left")
	await physics_frames(20)
	await _charge(0)
	release(&"move_down")
	await physics_frames(1)
	assert_near(player.ground_speed, -8.0, 1e-6, "spin dash goes the way Sproto faces")


func test_wall_stops_ground_speed() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	W.add_rect(world, Rect2(200, -100, 50, 100))
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)
	player.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(60)
	assert_eq(player.ground_speed, 0.0, "wall stopped the run")
	assert_near(player.global_position.x, 200.0 - Tuning.physics.push_radius, 0.01, "pushed out to the wall")
	assert_true(player.grounded, "still grounded")


func test_wall_at_speed_16_no_tunnelling() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	W.add_rect(world, Rect2(300, -100, 12, 100))
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)
	player.ground_speed = 16.0
	await physics_frames(40)
	assert_true(player.global_position.x < 300.0, "did not pass through a thin wall")
	assert_eq(player.ground_speed, 0.0, "stopped")
