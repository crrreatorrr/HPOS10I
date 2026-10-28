extends TestCase
## BUG-01-07 repro (fails on physics @ 3aa4be3 and 9f3303c). On a radius-48
## loop (the minimum radius) the top switcher (y -2r+28, 64 px tall) reaches
## down to y -36, where the standing hitbox crosses it at the loop's bottom.
## Running right, Sproto comes down the left side on path B, the top switcher
## sets A again at the bottom, and he goes round forever (2-3 of 9 runs).
## Expected: every run exits on the far side.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_radius_48_always_exits() -> void:
	for speed in [8.0, 10.0, 12.0]:
		for phase in [0.0, 3.0, 7.0]:
			var w := L.world(self)
			L.floor_at(w, -5000, 5000)
			var lp := L.loop(w, Vector2.ZERO, 48.0)
			var p = await L.spawn(self, w, Vector2(-400.0 - phase, 0))
			p.ground_speed = speed
			press(&"move_right")
			var exit_x: float = lp.radius + lp.thickness + lp.floor_margin + 40.0
			var done := false
			for i in 300:
				await physics_frames(1)
				if p.global_position.x > exit_x:
					done = true
					break
			release(&"move_right")
			assert_true(done, "speed %s phase %s: never exits (path %d, mode %d)" % [speed, phase, p.collision_path, p.collision_mode])
