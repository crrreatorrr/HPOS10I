extends TestCase
## BUG-01-06 repro (fails on physics @ 9f3303c; introduced by the BUG-01-03
## fix). The force-roll keeps the ball creeping at 0.5 px/frame in its
## facing direction while there is no standing headroom. Against the wall of
## a low dead end the speed is 0 every frame, so pressing the other way never
## turns the ball (the roll decel/turnaround branch needs a non-zero speed),
## and jump (no clearance) and spin dash (needs a crouch) are unavailable:
## softlock. Expected: holding the other direction gets the ball back out.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_back_out_of_a_low_dead_end() -> void:
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(100, -332, 300, 300))  # 32 px tunnel from x 100
	L.rect(w, Rect2(400, -400, 100, 400))  # wall closing it at x 400
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = 4.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	await physics_frames(240)
	var x0: float = p.global_position.x
	press(&"move_left")
	await physics_frames(120)
	release(&"move_left")
	assert_true(p.global_position.x < x0 - 20.0,
			"holding left 2 s in the dead end: x %.1f -> %.1f, state %s, facing %d" % [x0, p.global_position.x, p.state, p.facing])
