extends TestCase
## BUG-01-11 repro (fails on physics @ 3aa4be3, 9f3303c and 94dcac3). In a
## sharp V valley whose sides are 50-60 degrees (no fillet, or a fillet under
## about 16 px), Sproto stops dead at the bottom in a wall mode with ground
## speed 0: the opposite side stops him as a wall every frame, the slip rule
## re-locks control every 30 frames, the jump-clearance ray finds the
## opposite side (no jump), and a spin dash goes nowhere. Softlock. 45 and 70
## degree sides are fine, and so is a 48 px fillet (CurveTerrain's default).
## Expected: he can always get out (or slides through).

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_get_out_of_a_60_degree_v() -> void:
	var w := L.world(self)
	var x1 := 100.0 + 150.0 / tan(deg_to_rad(60.0))
	var x2 := x1 + 150.0 / tan(deg_to_rad(60.0))
	L.floor_at(w, -3000, 100, -150)
	L.poly(w, PackedVector2Array([Vector2(100, -150), Vector2(x1, 0), Vector2(x2, -150), Vector2(x2, 300), Vector2(100, 300)]))
	L.floor_at(w, x2, 3000, -150)
	var p = await L.spawn(self, w, Vector2(-100, -150))
	p.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(120)
	for k in 6:  # hold right and jump repeatedly
		press(&"jump")
		await physics_frames(20)
		release(&"jump")
		await physics_frames(40)
	release(&"move_right")
	assert_true(absf(p.global_position.x - x1) > 40.0,
			"still at the bottom of the V: x %.1f, mode %d, speed %.2f, state %s" % [p.global_position.x, p.collision_mode, p.ground_speed, p.state])
