extends TestCase
## Animation frame timing from the community Physics Guide: walk/run frames
## last max(0, 8 - |gsp|) + 1 ticks, rolling frames max(0, 4 - |gsp|) + 1.

const W := preload("res://tests/physics/physics_world.gd")
const Visual := preload("res://player/player_visual.gd")


func test_frame_ticks_formula() -> void:
	assert_eq(Visual.frame_ticks(&"run", 0.0), 9, "standing-slow walk: 9 ticks a frame;")
	assert_eq(Visual.frame_ticks(&"run", 2.5), 7, "2.5 px/f: 8 - 2 + 1;")
	assert_eq(Visual.frame_ticks(&"run", 6.0), 3, "top speed: 3 ticks a frame;")
	assert_eq(Visual.frame_ticks(&"run", 12.0), 1, "12 px/f: every tick;")
	assert_eq(Visual.frame_ticks(&"roll", 2.0), 3, "rolling at 2: 4 - 2 + 1;")
	assert_eq(Visual.frame_ticks(&"roll", 8.0), 1, "rolling at 8: every tick;")
	assert_eq(Visual.frame_ticks(&"idle", 0.0), 0, "idle: the sprite's own rate;")


func test_run_frames_advance_at_the_guide_rate() -> void:
	var world := W.new_world(self)
	W.add_floor(world)
	var player := W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)
	var visual: Node2D = player.get_node("Visual")
	player.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(1)
	var start: int = visual.anim_frame
	await physics_frames(30)
	release(&"move_right")
	# 3 ticks a frame at 6 px/f: 10 frames in 30 ticks.
	assert_eq(visual.anim_frame - start, 10, "10 run frames in 30 ticks at top speed;")
