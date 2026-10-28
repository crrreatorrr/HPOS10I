extends TestCase
## BUG-01-04 repro (fails on physics @ 3aa4be3). respawn_at() sets the position
## first and then calls _set_ball(false), which moves the centre up by 5 px
## when the player was in the small hitbox (jump, roll, spin dash).
## Expected: global_position == the requested point.
## Actual: (300, -24) instead of (300, -19).

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_respawn_at_from_roll() -> void:
	var w := L.world(self)
	L.floor_at(w)
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = 4.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	assert_eq(p.state, &"roll", "rolling")
	p.respawn_at(Vector2(300, -19))
	assert_eq(p.global_position, Vector2(300, -19), "respawn_at target")
