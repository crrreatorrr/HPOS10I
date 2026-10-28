extends SceneTree
## Builds levels/z3_capital_mansion/act1.tscn (Capital Mansion, Act 1).
##
##   godot --headless --path . -s res://levels/z3_capital_mansion/build_act1.gd
##
## D5 (docs/LEVELS.md): about 65 screens, 1.1 enemies per screen (T2 50 %,
## T3 40 %, T4 10 %), R4 (doors and switches that open the way, a climb of
## two screens to the rooftops and back down), 5 checkpoints, about 3.5
## tickets per screen. New ideas: a rooftop speed run into ballrooms, doors
## and switches, security beams on timers, conveyors.
##   Opening (teach): the lawn and the porch, a first switch and door, a
##     first conveyor, the lift up to the rooftops. T2 and T3 only.
##   Middle (test): the rooftop speed run (boosters, roof gaps), down into the
##     ballrooms: chandeliers, beam halls, locked halls, belts against the
##     way, bouncers and security pills; drones and clerks throughout.
##   Finale (twist): a checkpoint, then the service wing at its densest:
##     cameras over beam halls, chandeliers, belts, every pill, the goal.

const OUT := "res://levels/z3_capital_mansion/act1.tscn"
const TILESET := "res://levels/common/tiles/z3_capital_mansion_tiles.tres"
const ZONE := "z3_capital_mansion"


func _initialize() -> void:
	_build.call_deferred()


func _build() -> void:
	var b := LevelBuilder.new("CapitalMansionAct1", ZONE, ZONE, TILESET, -1040)
	b.soil = Color(0.86, 0.86, 0.9)
	b.grass = Color(0.6, 0.1, 0.16)
	b.cave = Color(0.2, 0.18, 0.26)
	b.guard_ticket_step = 96
	var C := LevelBuilder.CHASER
	var D := LevelBuilder.DRONE
	var DD := LevelBuilder.DRONE_DIVER
	var CL := LevelBuilder.CLERK
	var BO := LevelBuilder.BOUNCER
	var SP := LevelBuilder.SECURITY_PILL
	var left := {facing = -1}
	var right := {direction = 1}

	# Opening: teach (the lawn at 0, the porch and the lift to the roofs).
	b.start(640)
	b.guard(D, 256, 128, 80.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.stairs_up(2)                            # the porch (-64)
	b.switch_door(320)                        # a first switch and door
	b.guard(D, 256, 128, 80.0)
	b.conveyor(256, -2.0)                     # a first belt, against the way
	b.guard(C, 256, 160)
	b.guard(D, 256, 128, 80.0)
	b.hall(256)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(BO, 288, 192, 0.0, right)
	b.lift_up(192)                            # the service lift (-256)
	b.flat(128)
	b.guard(D, 256, 128, 80.0)
	b.guard(C, 256, 160)
	b.stairs_up(4)                            # -384
	b.guard(DD, 256, 160, 150.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.flat(384)
	print("checkpoint 1 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)

	# Middle: test. The rooftop speed run, then down into the ballrooms.
	b.stairs_up(7)                            # the roofs (-608)
	b.rooftops(3)                             # 3 gaps, stepping down (-560)
	b.guard(D, 224, 128, 80.0)
	b.guard(SP, 256, 160)
	b.rooftops(3)                             # -512
	b.guard(DD, 224, 128, 150.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(C, 224, 128)
	b.flat(448)
	print("checkpoint 2 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.stairs_down(4)                          # into the attic (-384)
	b.guard(D, 224, 128, 80.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.beam_hall(512, 2)
	b.guard(DD, 224, 128, 150.0)
	b.conveyor(256, 4.0)                      # a belt with the way
	b.guard(SP, 256, 160)
	b.guard(CL, 288, 160, 0.0, left)
	b.stairs_down(4)                          # the ballroom floor (-256)
	b.ballroom(448)                           # a first chandelier (T4)
	b.guard(D, 224, 128, 80.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(C, 224, 128)
	b.guard(D, 224, 128, 80.0)
	b.switch_door(384)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(DD, 224, 128, 150.0)
	b.flat(448)
	print("checkpoint 3 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.beam_hall(512, 3)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(D, 224, 128, 80.0)
	b.conveyor(320, -3.0)
	b.guard(SP, 256, 160)
	b.guard(C, 224, 128)
	b.ballroom(448)
	b.guard(DD, 224, 128, 150.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(D, 224, 128, 80.0)
	b.stairs_down(4)                          # the lower halls (-128)
	b.guard(CL, 288, 160, 0.0, left)
	b.switch_door(384)
	b.guard(SP, 256, 160)
	b.guard(D, 224, 128, 80.0)
	b.flat(448)
	print("checkpoint 4 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.conveyor(256, 4.0)
	b.guard(DD, 224, 128, 150.0)
	b.guard(C, 224, 128)
	b.camera_post(320)                        # a first camera (T4)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(BO, 256, 160, 0.0, right)
	b.stairs_down(4)                          # the kitchens (0)
	b.guard(D, 224, 128, 80.0)
	b.flat(448)

	# Finale: twist (the service wing, densest; cameras and chandeliers).
	print("checkpoint 5 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.beam_hall(384, 2)
	b.guard(D, 224, 128, 80.0)
	b.guard(SP, 256, 160)
	b.guard(CL, 256, 160, 0.0, left)
	b.camera_post(288)
	b.guard(DD, 224, 128, 150.0)
	b.guard(C, 224, 128)
	b.conveyor(256, -3.0)
	b.guard(SP, 256, 160)
	b.guard(D, 224, 128, 80.0)
	b.ballroom(384)
	b.guard(D, 224, 128, 80.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(CL, 256, 160, 0.0, left)
	b.camera_post(288)
	b.guard(DD, 224, 128, 150.0)
	b.guard(D, 224, 128, 80.0)
	b.guard(C, 224, 128)
	b.beam_hall(384, 2)
	b.guard(C, 224, 128)
	b.guard(SP, 256, 160)
	b.guard(BO, 256, 160, 0.0, right)
	b.ballroom(384)
	b.guard(CL, 256, 160, 0.0, left)
	b.guard(DD, 224, 128, 150.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(D, 224, 128, 80.0)
	b.goal(256, 384)
	print("goal at ", b.x - 384, " ground ", b.ground)
	var err := b.save(OUT)
	b.free_level()
	quit(0 if err == OK else 1)
