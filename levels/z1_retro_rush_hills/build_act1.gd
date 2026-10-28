extends SceneTree
## Builds levels/z1_retro_rush_hills/act1.tscn (Retro Rush Hills, Act 1).
##
##   godot --headless --path . -s res://levels/z1_retro_rush_hills/build_act1.gd
##
## D1 (docs/LEVELS.md): about 45 screens, 0.4 enemies per screen (T1; the
## finale adds one T2), R1 straight with high and low routes, 3 checkpoints,
## about 5 tickets per screen. New idea: loops, springs and boosters.
##   Opening (teach): sunny rolling hills, a first loop on safe ground with a
##     booster, a first up spring onto a mesa.
##   Middle (test): the spring gate over the pits (high and low routes),
##     hills with walkers and hoppers, a quarter pipe onto the upper hills, a
##     second loop up there, waterfalls behind.
##   Finale (twist): a checkpoint, then loops, springs and boosters with
##     enemies close together, a floater (T2) over the last hill, the goal.

const OUT := "res://levels/z1_retro_rush_hills/act1.tscn"
const TILESET := "res://levels/common/tiles/z1_retro_rush_hills_tiles.tres"
const ZONE := "z1_retro_rush_hills"


func _initialize() -> void:
	_build.call_deferred()


func _build() -> void:
	var b := LevelBuilder.new("RetroRushHillsAct1", ZONE, ZONE, TILESET)
	var W := LevelBuilder.WALKER
	var H := LevelBuilder.HOPPER

	# Opening: teach.
	b.start(640)
	b.hill(48, 96, false, W)
	b.flat(256, 32, 40)
	b.loop(true, 384)                         # first loop, a booster before it
	b.flat(512, 64, 64)
	b.waterfall(b.x - 320, -300, 40, 300)
	b.up_spring(128)                          # first up spring, onto the mesa
	b.flat(768, 96, 64)
	b.hill(32, 96, false, H)
	b.flat(192, 32, 40)
	b.descent(128)
	b.flat(192, 32, 40)
	b.hill(64, 64, false, W)
	b.flat(320, 32, 40)                       # no enemy within a screen of a respawn
	print("checkpoint 1 at ", b.x)
	b.checkpoint()

	# Middle: test.
	b.flat(640, 32, 64)
	b.hill(48, 128, false, H)
	b.spring_gate()
	b.flat(576, 160, 64)
	b.hill(48, 96, false, W)
	b.hill(32, 64, false, H)
	b.waterfall(b.x + 64, -260, 48, 260)
	b.quarter_pipe(64, 384)                   # onto the upper hills
	b.flat(864, 64, 64)
	b.hill(48, 96, false, W)
	b.stump(W)
	b.flat(320, 32, 40)
	print("checkpoint 2 at ", b.x)
	b.checkpoint()
	b.flat(704, 32, 64)
	b.hill(32, 96, true, H)
	b.loop(true, 384)                         # second loop, on the upper hills
	b.flat(640, 64, 64)
	b.hill(48, 96, false, W)
	b.descent(64)                             # a slope, not a drop: no hard landing on the next hill
	b.flat(256, 32, 40)
	b.hill(48, 128, false, H)
	b.up_spring(96)
	b.flat(768, 96, 64)
	b.hill(32, 96, false, W)
	b.descent(96)
	b.flat(320, 32, 40)

	# Finale: twist (denser, faster).
	print("checkpoint 3 at ", b.x)
	b.checkpoint()
	b.loop(true, 768)
	b.flat(640, 32, 64)
	b.hill(48, 64, false, W)
	b.hill(32, 64, false, H)
	b.hill(48, 64, true, W)
	b.flat(192, 32, 40)
	b.hill(32, 96, false, LevelBuilder.FLOATER, {}, 160, -44.0)
	b.hill(48, 64, false, H)
	b.hill(32, 64, false, W)
	b.hill(48, 64, true, H)
	b.goal(384, 384)
	print("goal at ", b.x - 384)
	var err := b.save(OUT)
	b.free_level()
	quit(0 if err == OK else 1)
