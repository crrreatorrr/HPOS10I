extends Node2D
## Tally preview (dev only, never ships): the physics playground with the
## act-clear tally on top, as LevelRoot shows it after the goal.
##   godot --path . -- --scene=res://tests/ui/tally_preview.tscn            the emerald moment
##   ... --tally=earlier   this act's emerald was won before (quiet line)
##   ... --tally=none      the test zone (no emerald)

const TALLY := "res://ui/tally/score_tally.tscn"


func _ready() -> void:
	var mode := str(Dev.args.get("tally", "won"))
	GameState.zone_id = "test_zone" if mode == "none" else "z1_retro_rush_hills"
	GameState.act = 1
	GameState.emeralds[Emeralds.key("z2_wizard_academy", 1)] = true
	if mode == "earlier":
		GameState.emeralds[Emeralds.key("z1_retro_rush_hills", 1)] = true
	GameState.add_tickets(37)
	GameState.level_time = 52.4
	GameState.complete_level()
	add_child(load(TALLY).instantiate())
