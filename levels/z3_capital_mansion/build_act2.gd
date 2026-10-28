extends SceneTree
## Builds levels/z3_capital_mansion/act2.tscn (Capital Mansion, Act 2).
##
##   godot --headless --path . -s res://levels/z3_capital_mansion/build_act2.gd
##
## D6 (docs/LEVELS.md): about 75 screens, 1.2 enemies per screen (T2 35 %,
## T3 45 %, T4 20 %), R4 (the underground bunker: shafts up and down, locked
## halls, the exit reached by travelling left), 6 checkpoints, about 3.5
## tickets per screen, the act before Broccoli Head.
##   Opening (teach): the back lawn, down a first shaft into the bunker, a
##     first beam hall and locked hall below ground.
##   Middle (test): shafts down and lifts up between the bunker levels, belts
##     against the way, beam halls, cameras and chandeliers, every pill.
##   Finale (the boss approach gauntlet): a checkpoint, then the densest
##     stretch of the zone, a last shaft into a lower corridor that runs LEFT
##     on a conveyor to the arena gate, with the gate checkpoint and the goal
##     at its left end (next stage: the boss arena).

const OUT := "res://levels/z3_capital_mansion/act2.tscn"
const TILESET := "res://levels/common/tiles/z3_capital_mansion_tiles.tres"
const ZONE := "z3_capital_mansion"


func _initialize() -> void:
	_build.call_deferred()


func _build() -> void:
	var b := LevelBuilder.new("CapitalMansionAct2", ZONE, ZONE, TILESET, -1240)
	b.soil = Color(0.86, 0.86, 0.9)
	b.grass = Color(0.6, 0.1, 0.16)
	b.cave = Color(0.2, 0.18, 0.26)
	b.guard_ticket_step = 128
	b.guard_lead_ticket = false
	var C := LevelBuilder.CHASER
	var D := LevelBuilder.DRONE
	var DD := LevelBuilder.DRONE_DIVER
	var CL := LevelBuilder.CLERK
	var BO := LevelBuilder.BOUNCER
	var SP := LevelBuilder.SECURITY_PILL
	var left := {facing = -1}
	var right := {direction = 1}

	# Opening: teach. The back lawn is high (-736); the bunker levels lie below.
	b.start(640)
	b.guard(D, 256, 128, 80.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(C, 256, 160)
	b.stairs_up(2)                            # -64
	b.guard(D, 256, 128, 80.0)
	b.guard(BO, 288, 192, 0.0, right)
	b.lift_up(192)                            # the garden terrace (-256)
	b.flat(128)
	b.guard(DD, 256, 160, 150.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.stairs_up(4)                            # -384
	b.guard(D, 256, 128, 80.0)
	b.guard(SP, 288, 192)
	b.lift_up(192)                            # -576
	b.flat(128)
	b.guard(C, 256, 160)
	b.guard(D, 256, 128, 80.0)
	b.stairs_up(5)                            # the back lawn (-736)
	b.guard(CL, 288, 160, 0.0, left)
	b.flat(384)
	print("checkpoint 1 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)

	# Middle: test. Down into the bunker, level by level.
	b.switch_door(320)                        # the bunker door
	b.shaft_down(480)                         # -256
	b.guard(D, 224, 128, 80.0)
	b.beam_hall(512, 2)
	b.guard(DD, 224, 128, 150.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.conveyor(256, -3.0)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(SP, 256, 160)
	b.camera_post(320)
	b.guard(C, 224, 128)
	b.flat(448)
	print("checkpoint 2 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.lift_up(192, 128)                            # -448
	b.flat(128)
	b.guard(D, 224, 128, 80.0)
	b.ballroom(512)                           # the war room
	b.guard(DD, 224, 128, 150.0)
	b.guard(D, 224, 128, 80.0)
	b.guard(C, 224, 128)
	b.switch_door(384)
	b.guard(CL, 288, 160, 0.0, left)
	b.guard(BO, 256, 160, 0.0, right)
	b.beam_hall(512, 3)
	b.guard(SP, 256, 160)
	b.guard(D, 224, 128, 80.0)
	b.guard(C, 224, 128)
	b.shaft_down(448)                         # 0
	b.guard(C, 224, 128)
	b.guard(CL, 288, 160, 0.0, left)
	b.flat(448)
	print("checkpoint 3 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.conveyor(320, 4.0)
	b.guard(DD, 224, 128, 150.0)
	b.camera_post(320)
	b.guard(D, 224, 128, 80.0)
	b.guard(SP, 256, 160)
	b.ballroom(512)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(CL, 288, 160, 0.0, left)
	b.lift_up(192, 128)                            # -192
	b.flat(128)
	b.guard(C, 224, 128)
	b.beam_hall(512, 3)
	b.guard(D, 224, 128, 80.0)
	b.guard(DD, 224, 128, 150.0)
	b.switch_door(384)
	b.guard(SP, 256, 160)
	b.flat(448)
	print("checkpoint 4 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.camera_post(320)
	b.guard(CL, 288, 160, 0.0, left)
	b.conveyor(256, -3.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(D, 224, 128, 80.0)
	b.ballroom(512)
	b.guard(C, 224, 128)
	b.guard(DD, 224, 128, 150.0)
	b.lift_up(192, 128)                            # -384
	b.flat(128)
	b.guard(SP, 256, 160)
	b.guard(CL, 288, 160, 0.0, left)
	b.beam_hall(448, 2)
	b.guard(D, 224, 128, 80.0)
	b.switch_door(320)
	b.camera_post(288)
	b.guard(DD, 224, 128, 150.0)
	b.guard(CL, 256, 160, 0.0, left)
	b.flat(448)

	# Finale: the boss approach gauntlet.
	print("checkpoint 5 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.flat(64)
	b.beam_hall(448, 3)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(D, 224, 128, 80.0)
	b.guard(SP, 256, 160)
	b.guard(C, 224, 128)
	b.guard(D, 224, 128, 80.0)
	b.guard(CL, 256, 160, 0.0, left)
	b.ballroom(384)
	b.guard(CL, 256, 160, 0.0, left)
	b.guard(DD, 224, 128, 150.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.camera_post(288)
	b.guard(D, 224, 128, 80.0)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(SP, 256, 160)
	b.guard(SP, 256, 160)
	b.guard(D, 224, 128, 80.0)
	b.beam_hall(448, 3)
	b.guard(C, 224, 128)
	b.guard(CL, 256, 160, 0.0, left)
	b.guard(DD, 224, 128, 150.0)
	b.ballroom(384)
	b.guard(DD, 224, 128, 150.0)
	b.guard(D, 224, 128, 80.0)
	b.guard(C, 224, 128)
	b.camera_post(288)
	b.guard(BO, 256, 160, 0.0, right)
	b.guard(SP, 256, 160)
	b.guard(CL, 256, 160, 0.0, left)
	b.guard(D, 224, 128, 80.0)
	# The exit: a shaft into the lower corridor that runs left to the gate.
	b.flat(256)
	b.leftward_exit(640, 288)                 # the corridor two levels down: out of the upper floor's view
	print("goal (left end) at ", b.x)
	var err := b.save(OUT)
	b.free_level()
	quit(0 if err == OK else 1)
