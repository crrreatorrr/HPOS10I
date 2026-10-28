extends TestCase
## BUG-01-05: WONTFIX. The lead accepted this as classic behaviour (re-check
## @ 9f3303c). Kept as documentation; it still fails by design.
## Repro (fails on physics @ 3aa4be3 and 9f3303c). On a 22 degree slope the slope
## factor (0.125 * sin 22 = 0.04683) almost cancels friction (0.046875). After a
## one-frame tap downhill Sproto creeps at ~0.045 px/frame for ~950 frames
## (16 s) and cannot crouch or spin dash meanwhile (down + jump = jump). On
## 22.5-24 degree slopes he never stops again. The classic integer maths
## truncates the slope factor, so a stop takes about a dozen frames.
## Expected: stopped within 60 frames, then down + jump starts a spin dash.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_stop_after_tap_on_22_degrees() -> void:
	var w := L.world(self)
	L.slope(w, 22.0, 3000.0)
	var p = await L.spawn(self, w, Vector2(0, -2))
	press(&"move_left")
	await physics_frames(1)
	release(&"move_left")
	await physics_frames(60)
	assert_eq(p.ground_speed, 0.0, "stopped 60 frames after the tap")
	Dev.send_action(&"move_down", true)
	await physics_frames(3)
	Dev.send_action(&"jump", true)
	await physics_frames(1)
	Dev.send_action(&"jump", false)
	await physics_frames(2)
	assert_eq(p.state, &"spindash", "down + jump on the slope starts a spin dash")
	Dev.send_action(&"move_down", false)
