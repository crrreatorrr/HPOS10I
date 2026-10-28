extends SceneTree
## Builds levels/z2_wizard_academy/act2.tscn (Wizard Academy, Act 2).
##
##   godot --headless --path . -s res://levels/z2_wizard_academy/build_act2.gd
##
## D4 (docs/LEVELS.md): about 65 screens, 1.0 enemies per screen (T1 25 %,
## T2 45 %, T3 30 %; the finale adds T4 lantern pills), R3 to R4 (the tower
## climb and the hall maze: climbs of over 3 screens, a switchback, side
## halls that end at a wall, a breakable-wall secret), 5 checkpoints, about
## 4 tickets per screen, the act before the Library Demon.
##   Opening (teach): the gatehouse, stairs, a shifting staircase and a lift
##     up to the library floor. T1 and T2 only.
##   Middle (test): the flying-broom chase down the long gallery (an
##     autoscroll section), then the hall maze and the tower climb: shelf
##     gates, a hidden study behind a cracked wall, the switchback up the
##     tower, knights and diving spellbooks.
##   Finale (the boss approach gauntlet): a checkpoint, then every mechanic
##     of the zone at its densest (staircases, lifts, gates, candle rows,
##     falling books, lantern pills), then a calm corridor with a few
##     tickets, the checkpoint outside the arena gate and the goal (next
##     stage: the boss arena).

const OUT := "res://levels/z2_wizard_academy/act2.tscn"
const TILESET := "res://levels/common/tiles/z2_wizard_academy_tiles.tres"
const ZONE := "z2_wizard_academy"


func _initialize() -> void:
	_build.call_deferred()


func _build() -> void:
	var b := LevelBuilder.new("WizardAcademyAct2", ZONE, ZONE, TILESET, -1240)
	b.soil = Color(0.56, 0.54, 0.66)
	b.grass = Color(0.5, 0.28, 0.74)
	b.cave = Color(0.17, 0.13, 0.24)
	var W := LevelBuilder.WALKER
	var H := LevelBuilder.HOPPER
	var C := LevelBuilder.CHASER
	var P := LevelBuilder.PELLET_PILL
	var SB := LevelBuilder.SPELLBOOK
	var DV := LevelBuilder.SPELLBOOK_DIVER
	var K := LevelBuilder.KNIGHT
	var L := LevelBuilder.LANTERN
	var left := {facing = -1}
	var right := {direction = 1}

	# Opening: teach (the gatehouse at 0 up to the library floor at -384).
	b.start(640)
	b.flat(192)
	b.stump(W, {}, 160)
	b.guard(SB, 320, 192, 64.0)
	b.stairs_up(3)                            # -96
	b.hall(384)
	b.stump(H, {}, 160)
	b.candles(2, 192)
	b.stump(W, {}, 160)
	b.guard(C, 384, 256)
	b.shifting_flight(5, 128)                 # -224
	b.flat(128)
	b.guard(SB, 320, 192, 64.0)
	b.stump(W, {}, 160)
	b.guard(P, 384, 288, 0.0, left)
	b.bookshelf_lift(96, 128)                 # -384
	b.flat(128)
	b.stump(H, {}, 160)
	b.guard(SB, 320, 192, 64.0)
	b.book_hall(448, 2)
	b.stump(W, {}, 160)
	b.flat(448)
	print("checkpoint 1 at ", b.x, " ground ", b.ground)
	b.checkpoint()

	# Middle: test. The flying-broom chase down the long gallery.
	b.flat(896, 32, 96)
	var chase := b.x
	b.broom_chase(2560, 90.0)
	for k in [704, 1088, 1472, 1856, 2240]:      # spellbooks over the gallery: jump into them
		b.enemy(SB, Vector2(chase + k, b.ground - 64))
	b.flat(256)
	b.guard(C, 384, 256)
	b.flat(448)
	print("checkpoint 2 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	# The hall maze: gates, a cracked wall into a hidden study, stairs.
	b.shelf_gate(96, 128)                     # no enemy for 2 screens: hazards only
	b.candles(2, 160)
	b.flat(128)
	b.stairs_up(4)                            # -512
	b.guard(DV, 320, 192, 150.0)
	b.guard(SB, 320, 192, 64.0)
	b.terrace_tunnel(448, true)               # the hidden study (roll into the cracked wall)
	b.guard(K, 384, 256, 0.0, right)
	b.guard(C, 384, 256)
	b.shelf_gate(96, 96)
	b.guard(SB, 320, 192, 64.0)
	b.stump(H, {}, 160)
	b.flat(448)
	print("checkpoint 3 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	# The tower climb: a switchback up 320 px, the tower top, down again.
	b.switchback(896)                         # -832 (no enemy for 2 screens)
	b.flat(704, 32, 64)
	b.guard(DV, 256, 160, 150.0)
	b.guard(P, 320, 224, 0.0, left)
	b.guard(SB, 256, 160, 64.0)
	b.guard(K, 320, 224, 0.0, right)
	b.stump(W, {}, 160)
	b.stairs_down(4)                          # -704
	b.guard(SB, 256, 160, 64.0)
	b.guard(C, 320, 224)
	b.drop(96)                                # -608
	b.guard(DV, 256, 160, 150.0)
	b.guard(K, 320, 224, 0.0, right)
	b.drop(96)                                # -512
	b.stump(H, {}, 160)
	b.guard(SB, 256, 160, 64.0)
	b.guard(P, 320, 224, 0.0, left)
	b.flat(192)
	b.candles(2, 192)
	b.shifting_flight(4, 128, {first_delay = 60})  # -608
	b.flat(256)

	# Finale: the boss approach gauntlet (every mechanic, densest; T4 lanterns).
	print("checkpoint 4 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.shelf_gate(96, 96)                      # no enemy for 2 screens: hazards only
	b.book_hall(448, 2)
	b.guard(K, 256, 192, 0.0, right)
	b.guard(DV, 224, 128, 150.0)
	b.guard(L, 224, 128, 150.0)
	b.guard(SB, 224, 128, 64.0)
	b.guard(C, 256, 160)
	b.stump(H, {}, 160)
	b.stump(W, {}, 160)
	b.guard(DV, 224, 128, 150.0)
	b.bookshelf_lift(96, 128)                 # -768
	b.guard(SB, 224, 128, 64.0)
	b.guard(K, 256, 160, 0.0, right)
	b.hall(256)
	b.enemy(L, Vector2(b.x - 128, b.ground - 150))
	b.guard(P, 256, 160, 0.0, left)
	b.stump(W, {}, 160)
	b.stump(H, {}, 160)
	b.drop(128)                               # -640
	b.guard(DV, 224, 128, 150.0)
	b.guard(K, 256, 160, 0.0, right)
	b.guard(SB, 224, 128, 64.0)
	b.guard(C, 256, 160)
	b.drop(128)                               # -512
	b.stump(W, {}, 160)
	b.hall(256)
	b.enemy(L, Vector2(b.x - 128, b.ground - 150))
	b.stump(H, {}, 160)
	b.guard(DV, 224, 128, 150.0)
	b.drop(128)                               # -384
	b.guard(K, 256, 160, 0.0, right)
	b.guard(SB, 224, 128, 64.0)
	b.stump(W, {}, 160)
	# The calm corridor, the checkpoint outside the arena gate, the goal.
	b.corridor(848, 5)
	print("gate checkpoint at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.goal(192, 384)
	print("goal at ", b.x - 384, " ground ", b.ground)
	var err := b.save(OUT)
	b.free_level()
	quit(0 if err == OK else 1)
