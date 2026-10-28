class_name ZoneRegistry
## Static list of zones, their acts, boss arenas and per-zone settings.
## Scene paths may not exist yet; callers check with ResourceLoader.exists().

const TEST_ZONE := {
	id = "test_zone",
	name = "Test Zone",
	acts = ["res://levels/test_zone/test_zone.tscn"],
	boss = "",
	accessory = "",
	music = &"z1",
}

const ZONES := [
	{
		id = "z1_retro_rush_hills",
		name = "Retro Rush Hills",
		acts = [
			"res://levels/z1_retro_rush_hills/act1.tscn",
			"res://levels/z1_retro_rush_hills/act2.tscn",
		],
		boss = "res://bosses/rug_pull/arena.tscn",
		accessory = "",
		music = &"z1",
	},
	{
		id = "z2_wizard_academy",
		name = "Wizard Academy",
		acts = [
			"res://levels/z2_wizard_academy/act1.tscn",
			"res://levels/z2_wizard_academy/act2.tscn",
		],
		boss = "res://bosses/library_demon/arena.tscn",
		accessory = "wizard_hat",
		music = &"z2",
	},
	{
		id = "z3_capital_mansion",
		name = "Capital Mansion",
		acts = [
			"res://levels/z3_capital_mansion/act1.tscn",
			"res://levels/z3_capital_mansion/act2.tscn",
		],
		boss = "res://bosses/broccoli_head/arena.tscn",
		accessory = "sunglasses",
		music = &"z3",
	},
	{
		id = "z4_neon_rush_remix",
		name = "Neon Rush Remix",
		acts = [
			"res://levels/z4_neon_rush_remix/act1.tscn",
			"res://levels/z4_neon_rush_remix/act2.tscn",
		],
		boss = "res://bosses/the_executive/arena.tscn",
		accessory = "",
		music = &"z4",
	},
]


static func all_zones(include_test := false) -> Array:
	var list := ZONES.duplicate()
	if include_test:
		list.push_front(TEST_ZONE)
	return list


static func get_zone(id: String) -> Dictionary:
	if id == TEST_ZONE.id:
		return TEST_ZONE
	for zone in ZONES:
		if zone.id == id:
			return zone
	return {}


## Stages of a zone in play order: acts first, then the boss arena.
## Stage numbers are 1-based; the boss is stage acts.size() + 1.
static func stage_path(id: String, stage: int) -> String:
	var zone := get_zone(id)
	if zone.is_empty():
		return ""
	if stage >= 1 and stage <= zone.acts.size():
		return zone.acts[stage - 1]
	if stage == zone.acts.size() + 1:
		return zone.boss
	return ""


static func next_zone_id(id: String) -> String:
	for i in ZONES.size():
		if ZONES[i].id == id and i + 1 < ZONES.size():
			return ZONES[i + 1].id
	return ""
