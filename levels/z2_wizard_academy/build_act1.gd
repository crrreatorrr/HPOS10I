extends SceneTree
## Builds levels/z2_wizard_academy/act1.tscn (Wizard Academy, Act 1).
##
##   godot --headless --path . -s res://levels/z2_wizard_academy/build_act1.gd
##
## D3 (docs/LEVELS.md): about 55 screens, 0.8 enemies per screen (T1 45 %,
## T2 40 %, T3 15 %; the finale adds T4 lantern pills), R3 (a real climb:
## the route rises over 2.5 screens from the courtyard to the tower walk and
## comes back down), 4 checkpoints, about 4 tickets per screen. New ideas:
## shifting staircases and moving bookshelves.
##   Opening (teach): the courtyard, stone stairs into the academy, a first
##     candle on its own, a first shifting staircase and a first bookshelf
##     lift, with no enemy near either. T1 and T2 only.
##   Middle (test): the library halls (falling books, candle rows), knights
##     and diving spellbooks join, more stairs and lifts up to the tower walk,
##     then shelf gates on the way down.
##   Finale (twist): a checkpoint, then the densest stretch: staircases and
##     lifts with enemies around them, candle rows under diving spellbooks,
##     lantern pills (T4) over the halls, and the descent to the goal.

const OUT := "res://levels/z2_wizard_academy/act1.tscn"
const TILESET := "res://levels/common/tiles/z2_wizard_academy_tiles.tres"
const ZONE := "z2_wizard_academy"


func _initialize() -> void:
	_build.call_deferred()


func _build() -> void:
	var b := LevelBuilder.new("WizardAcademyAct1", ZONE, ZONE, TILESET, -1040)
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

	# Opening: teach (courtyard at 0, academy halls up to -384).
	b.start(640)
	b.flat(192)
	b.stump(W, {}, 160)
	b.stairs_up(3)                            # into the academy (-96)
	b.hall(384)
	b.stair_hump(3)
	b.candles(1, 256, {low_frames = 200})     # a first candle, on its own
	b.stump(H, {}, 160)
	b.shifting_flight(5, 128)                 # a first shifting staircase (-224)
	b.flat(128)
	b.guard(SB, 320, 192, 64.0)
	b.stump(W, {}, 160)
	b.bookshelf_lift(96, 128)                 # a first bookshelf lift (-384)
	b.flat(128)
	b.stump(W, {}, 160)
	b.book_hall(512, 2)
	b.stump(H, {}, 160)
	b.guard(SB, 320, 192, 64.0)
	b.stair_hump(3)
	print("checkpoint 1 at ", b.x, " ground ", b.ground)
	b.checkpoint()

	# Middle: test (library halls, up to the tower walk at -640, down to -448).
	b.candles(3, 160)                         # no enemy for 2 screens: hazards only
	b.stairs_up(4)                            # -512
	b.flat(64)
	b.guard(K, 384, 256, 0.0, right)
	b.hall(448)
	b.enemy(DV, Vector2(b.x - 224, b.ground - 150))
	b.stump(W, {}, 160)
	b.stump(H, {}, 160)
	b.guard(SB, 320, 192, 64.0)
	b.shifting_flight(5, 128, {first_delay = 90, hold_frames = 240})  # the tower walk (-640)
	b.flat(128)
	b.guard(P, 384, 288, 0.0, left)
	b.stump(W, {}, 160)
	b.guard(DV, 320, 192, 150.0)
	b.stair_hump(3)
	print("checkpoint 2 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.book_hall(512, 2)                       # no enemy for 2 screens: hazards only
	b.stairs_down(4)                          # -512
	b.flat(128)
	b.guard(SB, 320, 192, 64.0)
	b.guard(K, 320, 224, 0.0, right)
	b.stump(H, {}, 160)
	b.guard(C, 384, 256)
	b.shelf_gate(96, 96)
	b.drop(64)                                # -448
	b.stair_hump(3)
	b.flat(64)
	print("checkpoint 3 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.shelf_gate(96, 128)                     # no enemy for 2 screens: hazards only
	b.candles(2, 160)
	b.flat(128)
	b.stump(W, {}, 160)
	b.guard(SB, 320, 192, 64.0)
	b.guard(K, 384, 256, 0.0, right)
	b.guard(DV, 320, 192, 150.0)
	b.flat(128)
	b.bookshelf_lift(96, 128, {rest_frames = 210})  # -608
	b.flat(128)
	b.stump(H, {}, 160)
	b.hall(448)
	b.enemy(DV, Vector2(b.x - 224, b.ground - 150))
	b.guard(P, 384, 288, 0.0, left)
	b.guard(K, 320, 224, 0.0, right)
	b.shifting_flight(4, 128, {first_delay = 120, hold_frames = 240})  # -704
	b.flat(128)
	b.stairs_down(3)                          # -608
	b.candles(2, 160)
	b.stump(W, {}, 160)
	b.guard(SB, 320, 192, 64.0)
	b.stair_hump(3)
	b.flat(64)

	# Finale: twist (denser, faster; T4 lanterns), down to the gardens at 0.
	print("checkpoint 4 at ", b.x, " ground ", b.ground)
	b.checkpoint()
	b.candles(2, 192)                         # no enemy for 2 screens: hazards only
	b.shifting_flight(4, 128, {first_delay = 60, hold_frames = 240})  # -704
	b.flat(128)
	b.guard(K, 320, 224, 0.0, right)
	b.book_hall(384, 1)
	b.enemy(L, Vector2(b.x - 128, b.ground - 176))
	b.guard(DV, 256, 160, 150.0)
	b.stump(W, {}, 160)
	b.guard(SB, 256, 160, 64.0)
	b.hall(320)
	b.enemy(L, Vector2(b.x - 160, b.ground - 150))
	b.guard(C, 320, 224)
	b.stair_hump(3)
	b.guard(SB, 256, 160, 64.0)
	b.drop(96)                                # -608
	b.guard(DV, 256, 160, 150.0)
	b.stump(W, {}, 160)
	b.drop(128)                               # -480
	b.stump(H, {}, 160)
	b.guard(SB, 256, 160, 64.0)
	b.guard(P, 320, 224, 0.0, left)
	b.drop(160)                               # -320
	b.guard(K, 256, 160, 0.0, right)
	b.guard(DV, 256, 160, 150.0)
	b.drop(160)                               # -160
	b.stump(W, {}, 160)
	b.stump(H, {}, 160)
	b.stairs_down(5)                          # 0: the gardens
	b.guard(SB, 256, 160, 64.0)
	b.goal(256, 384)
	print("goal at ", b.x - 384, " ground ", b.ground)
	var err := b.save(OUT)
	b.free_level()
	quit(0 if err == OK else 1)
