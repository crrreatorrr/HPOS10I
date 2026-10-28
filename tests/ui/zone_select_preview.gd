extends Node
## Zone select preview (dev only, never ships) with two emeralds won:
##   godot --path . -- --scene=res://tests/ui/zone_select_preview.tscn


func _ready() -> void:
	GameState.emeralds[Emeralds.key("z1_retro_rush_hills", 1)] = true
	GameState.emeralds[Emeralds.key("z3_capital_mansion", 2)] = true
	add_child(load("res://ui/zone_select/zone_select.tscn").instantiate())
