extends SceneTree
## Builds levels/z1_retro_rush_hills/act2.tscn (Retro Rush Hills, Act 2).
##
##   godot --headless --path . -s res://levels/z1_retro_rush_hills/build_act2.gd
##
## D2 (docs/LEVELS.md): about 55 screens, 0.6 enemies per screen (T1 75 %,
## T2 25 %; the finale adds T3 spike pills), R2 (a switchback climb of more
## than a screen), 4 checkpoints, about 4.5 tickets per screen. New ideas:
## roll tunnels, quarter pipes, a breakable-wall secret, a first switchback.
##   Opening (teach): a tunnel under a terrace after a slope, a quarter pipe
##     onto the upper hills and a loop up there. T1 only.
##   Middle (test): chasers, floaters and pellet pills join; a breakable-wall
##     tunnel full of tickets (the secret), the switchback climb onto the high
##     plateau, a descent, the spring gate over the pits.
##   Finale (twist, the boss approach): a checkpoint, a loop, then the
##     densest stretch of the zone: spike pills, a tunnel with walkers in it,
##     every T2; then a calm corridor with a few tickets, the checkpoint
##     outside the arena gate and the goal (next stage: the boss arena).

const OUT := "res://levels/z1_retro_rush_hills/act2.tscn"
const TILESET := "res://levels/common/tiles/z1_retro_rush_hills_tiles.tres"
const ZONE := "z1_retro_rush_hills"


func _initialize() -> void:
	_build.call_deferred()


func _build() -> void:
	var b := LevelBuilder.new("RetroRushHillsAct2", ZONE, ZONE, TILESET, -640)
	var W := LevelBuilder.WALKER
	var H := LevelBuilder.HOPPER
	var C := LevelBuilder.CHASER
	var F := LevelBuilder.FLOATER
	var P := LevelBuilder.PELLET_PILL
	var S := LevelBuilder.SPIKE_PILL
	var left := {facing = -1}

	# Opening: teach tunnels and quarter pipes.
	b.start(640)
	b.hill(48, 96, false, W)
	b.flat(192, 32, 80)
	b.slope(-48)
	b.flat(128, 16, 80)
	b.slope(48)                               # roll down into the tunnel
	b.terrace_tunnel(448, false)
	b.hill(32, 96, false, H)
	b.quarter_pipe(64, 384)                   # onto the upper hills
	b.flat(256, 32, 80)
	b.loop(true, 384)
	b.flat(640, 64, 80)
	b.waterfall(b.x - 400, b.ground - 280, 40, 280)
	b.hill(48, 64, false, W)
	b.hill(32, 96, false, H)
	b.descent(64)
	b.flat(192, 32, 80)
	b.hill(48, 64, false, W)
	b.flat(352, 32, 80)
	print("checkpoint 1 at ", b.x)
	b.checkpoint()

	# Middle: test.
	b.flat(576, 32, 80)
	b.hill(48, 96, false, C)
	b.flat(320, 32, 64)
	b.terrace_tunnel(448, true)               # the breakable-wall secret
	b.hill(32, 96, false, W)
	b.hill(48, 64, false, H)
	b.waterfall(b.x + 200, -560, 48, 560)
	b.switchback(640)                         # up 320 px
	b.flat(832, 64, 80)
	b.hill(32, 96, false, F, {}, 160, -44.0)
	b.hill(48, 64, false, W, {}, 160, 0.0, 130)
	b.hill(32, 96, false, P, left, 224)
	b.hill(48, 64, false, H)
	b.hill(32, 64, false, C)
	b.flat(448, 32, 80)
	print("checkpoint 2 at ", b.x)
	b.checkpoint()
	b.flat(576, 32, 80)
	b.hill(48, 96, false, W)
	b.hill(32, 64, false, H)
	b.descent(128)
	b.flat(64, 0, 64)                         # a run-up: no V valley into the next hill
	b.hill(32, 64, false, F, {}, 160, -44.0)
	b.descent(96)
	b.flat(64, 0, 64)                         # a run-up: no V valley into the next hill
	b.hill(48, 64, false, W)
	b.drop(96)
	b.spring_gate()
	b.flat(576, 160, 80)
	b.hill(48, 96, false, P, left, 224)
	b.hill(32, 64, false, H)
	b.hill(48, 96, false, W, {}, 160, 0.0, 130)
	b.up_spring(96)
	b.flat(832, 64, 80)
	b.hill(32, 96, false, C)
	b.descent(96)
	b.flat(64, 0, 64)                         # a run-up: no V valley into the next hill
	b.hill(32, 64, false, W)
	b.flat(448, 32, 80)

	# Finale: the boss approach.
	print("checkpoint 3 at ", b.x)
	b.checkpoint()
	b.loop(true, 448)
	b.flat(640, 32, 80)
	b.hill(48, 64, false, W)
	b.hill(32, 64, false, S)
	b.terrace_tunnel(448, false, [W, W])
	b.hill(48, 64, false, F, {}, 160, -44.0)
	b.hill(32, 64, false, H)
	b.hill(48, 64, false, C)
	b.hill(32, 64, true, S)
	b.hill(48, 64, false, W)
	b.hill(32, 64, false, P, left, 224)
	b.hill(48, 64, false, H)
	b.hill(32, 64, false, W)
	b.corridor(848, 5)
	print("gate checkpoint at ", b.x)
	b.checkpoint()
	b.goal(192, 384)
	print("goal at ", b.x - 384)
	var err := b.save(OUT)
	b.free_level()
	quit(0 if err == OK else 1)
