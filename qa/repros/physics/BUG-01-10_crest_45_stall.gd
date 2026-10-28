extends TestCase
## BUG-01-10 repro (fails on physics @ 94dcac3; passes @ 9f3303c, so it is a
## regression from the BUG-01-08 fix). At a sharp crest of two 45 degree
## slopes the ground reading flips 45 <-> 315, which is more than the 45
## degree "suspicious step", so the angle is re-measured from two parallel
## rays. The re-measured 315 comes back as 314.999563, just on the wall side of
## the floor/left-wall boundary: Sproto switches to left-wall mode for a frame
## and loses 2.7-5.2 px/frame (4-10 px/frame runs); at 4 and 6 px/frame he
## stalls on the peak. Expected: no more than 0.2 px/frame lost at the crest,
## as at 9f3303c.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_sharp_45_crest_keeps_speed() -> void:
	for dir in [1, -1]:
		for speed in [4.0, 6.0, 10.0]:
			var w := L.world(self)
			L.floor_at(w, -3000, 3000)
			L.poly(w, PackedVector2Array([Vector2(100, 0), Vector2(250, -150), Vector2(400, 0)]))
			var p = await L.spawn(self, w, Vector2(250.0 - 350.0 * dir, 0))
			p.ground_speed = speed * dir
			var action := &"move_right" if dir > 0 else &"move_left"
			press(action)
			var drop := 0.0
			var last: float = absf(p.ground_speed)
			for i in 120:
				await physics_frames(1)
				if p.grounded:
					drop = maxf(drop, last - absf(p.ground_speed))
				last = absf(p.ground_speed)
			release(action)
			assert_true(drop < 0.2, "dir %d speed %s: lost %.2f px/frame in one frame at the crest" % [dir, speed, drop])
