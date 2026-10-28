extends TestCase
## QA: the boss difficulty table (core/difficulty.gd BOSSES, docs/LEVELS.md
## "Bosses") rises boss by boss and keeps the fairness floors, and boss
## scripts read it (05-bosses BOS-H0). Skips until the table exists.

const DIFFICULTY := "res://core/difficulty.gd"
const ORDER := ["z1_retro_rush_hills", "z2_wizard_academy", "z3_capital_mansion", "z4_neon_rush_remix"]


func _table() -> Dictionary:
	if not ResourceLoader.exists(DIFFICULTY):
		return {}
	var consts := (load(DIFFICULTY) as GDScript).get_script_constant_map()
	return consts.get("BOSSES", {})


func test_boss_table_rises_and_stays_fair() -> void:
	var table := _table()
	if table.is_empty():
		print("  SKIP qa/test_boss_difficulty.gd: no Difficulty.BOSSES yet")
		return
	var diff: GDScript = load(DIFFICULTY)
	var prev := {}
	for zone in ORDER:
		assert_true(table.has(zone), "%s has a boss row" % zone)
		if not table.has(zone):
			continue
		var b: Dictionary = table[zone]
		var telegraph := float(diff.call(&"telegraph", float(b.telegraph), float(b.d)))
		print("  INFO %s: d %s, window %.2f s, %d attacks/cycle, telegraph %.3f s, x%.2f, desperation %s, %d refills" % [
				zone, str(b.d), b.weak_window, b.attacks_per_cycle, telegraph, b.escalation, b.desperation, b.ticket_refills])
		assert_true(telegraph >= 0.35 - 0.0001, "%s telegraph %.3f s >= 0.35 s" % [zone, telegraph])
		assert_true(float(b.escalation) >= 1.0, "%s escalation speeds up" % zone)
		assert_eq(bool(b.desperation), zone in ["z3_capital_mansion", "z4_neon_rush_remix"], "%s desperation only for the last two" % zone)
		var zone_info := ZoneRegistry.get_zone(zone)
		if not zone_info.is_empty():
			var stage: int = (zone_info.acts as Array).size() + 1
			assert_near(float(diff.call(&"for_stage", zone, stage)), float(b.d), 0.001, "%s arena stage uses the boss d" % zone)
		if not prev.is_empty():
			assert_true(float(b.d) > float(prev.d), "%s d rises" % zone)
			assert_true(float(b.weak_window) < float(prev.weak_window), "%s weak window shrinks" % zone)
			assert_true(int(b.attacks_per_cycle) >= int(prev.attacks_per_cycle), "%s attacks per cycle never drop" % zone)
			assert_true(int(b.ticket_refills) <= int(prev.ticket_refills), "%s refills never rise" % zone)
		prev = b


func test_boss_scripts_read_the_table() -> void:
	if _table().is_empty():
		print("  SKIP qa/test_boss_difficulty.gd: no Difficulty.BOSSES yet")
		return
	var scripts := PackedStringArray()
	_collect("res://bosses", scripts)
	if scripts.is_empty():
		print("  SKIP qa/test_boss_difficulty.gd: no boss scripts yet")
		return
	var reads := false
	for path in scripts:
		if FileAccess.get_file_as_string(path).contains("Difficulty.boss("):
			reads = true
	assert_true(reads, "a boss script (or the base) reads Difficulty.boss(zone_id)")


func _collect(dir_path: String, out: PackedStringArray) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	for sub in dir.get_directories():
		_collect(dir_path.path_join(sub), out)
	for file in dir.get_files():
		if file.ends_with(".gd"):
			out.append(dir_path.path_join(file))
