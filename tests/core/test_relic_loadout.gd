extends TestCase
## Relic skins in the body slot (core/relic_loadout.gd): ownership from the hub
## init relics, the exclusive body slot, Ranked, and Tidebreaker's spin-dash
## charge per press (player/player.gd _spindash_step), and the Breakwater Coin
## owning the Nobu skin just as Cone's Tip does.
##
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd -- --filter=relic_loadout

const W := preload("res://tests/physics/physics_world.gd")
const VISUAL := preload("res://player/player_visual.gd")

var player: Player


func before_each() -> void:
	_set_hub([], false, {})
	_clear_slots()


func after_each() -> void:
	HubBridge.reach = "offline"
	HubBridge.relics = []
	HubBridge.ranked = false
	HubBridge.server_loadout = {}
	_clear_slots()
	RelicLoadout.set(&"_slots_loaded", false)


# --- Ownership and the body slot --------------------------------------------------


func test_belt_owns_the_tidebreaker_skin() -> void:
	_set_hub(["tidebreaker_belt"], false, {})
	var state := RelicLoadout.resolve()
	assert_eq(state["owned"], ["tidebreaker_belt"], "the belt is a known relic")
	assert_eq(state["body"], RelicLoadout.ITEM_TIDEBREAKER, "the only owned skin is worn")
	assert_eq(RelicLoadout.ITEM_TIDEBREAKER, "hpos_skin_tidebreaker", "hub item id")
	assert_eq(state["skin"], "tidebreaker", "skin id")
	assert_eq(state["body_choices"], [RelicLoadout.ITEM_TIDEBREAKER, ""], "picker choices")
	assert_eq(state["spindash_charge"], 3.0, "3 charge per press unranked")
	assert_eq(state["speed_mult"], 1.0, "no Nobu speed")
	assert_eq(state["extra_life"], false, "no Golden life")
	assert_eq(state["cape"], false, "the belt is not the cape")


func test_no_belt_no_tidebreaker() -> void:
	_set_hub(["genesis_shard", "cones_tip", "tinubu_crown"], false, {})
	var state := RelicLoadout.resolve()
	assert_true(RelicLoadout.ITEM_TIDEBREAKER not in state["body_choices"], "not owned without the belt")
	assert_eq(state["spindash_charge"], 0.0, "base charge")
	# Offline: init never succeeded, so even a belt in memory owns nothing.
	_set_hub(["tidebreaker_belt"], false, {})
	HubBridge.reach = "offline"
	state = RelicLoadout.resolve()
	assert_eq(state["owned"], [], "offline owns nothing")
	assert_eq(state["body"], "", "offline wears nothing")
	assert_eq(state["spindash_charge"], 0.0, "offline: base charge")


func test_coin_owns_the_nobu_skin() -> void:
	_set_hub(["breakwater_coin"], false, {})
	var state := RelicLoadout.resolve()
	assert_eq(state["owned"], ["breakwater_coin"], "the coin is a known relic")
	assert_eq(state["body"], RelicLoadout.ITEM_NOBU, "the coin gives Cone's Tip's skin")
	assert_eq(state["skin"], "nobu", "skin id")
	assert_eq(state["body_choices"], [RelicLoadout.ITEM_NOBU, ""], "picker choices")
	assert_eq(state["speed_mult"], RelicLoadout.SPEED_MULT, "Nobu speed unranked")
	assert_eq(state["extra_life"], false, "no Golden life")
	assert_eq(state["spindash_charge"], 0.0, "base charge")
	assert_eq(state["cape"], false, "the coin is not the cape")
	_set_hub(["breakwater_coin"], true, {})
	state = RelicLoadout.resolve()
	assert_eq(state["skin"], "nobu", "cosmetic stays on in Ranked")
	assert_eq(state["speed_mult"], 1.0, "gameplay is off in Ranked")


func test_cone_and_coin_give_one_nobu_skin() -> void:
	_set_hub(["cones_tip", "breakwater_coin"], false, {})
	var state := RelicLoadout.resolve()
	assert_eq(state["owned"], ["cones_tip", "breakwater_coin"], "both relics are owned")
	assert_eq(state["body_choices"], [RelicLoadout.ITEM_NOBU, ""], "one Nobu skin, not two")
	assert_eq(state["speed_mult"], RelicLoadout.SPEED_MULT, "one speed boost, not stacked")
	# With the coin alone, a server loadout naming the Nobu skin is honoured.
	_set_hub(["genesis_shard", "breakwater_coin"], false,
			{"slots": {"body": RelicLoadout.ITEM_NOBU, "back": null}})
	state = RelicLoadout.resolve()
	assert_eq(state["body"], RelicLoadout.ITEM_NOBU, "server loadout body")
	assert_eq(state["speed_mult"], RelicLoadout.SPEED_MULT, "Nobu speed")
	assert_eq(state["extra_life"], false, "one body at a time: no Golden life")


func test_no_cone_or_coin_no_nobu() -> void:
	_set_hub(["genesis_shard", "tinubu_crown", "tidebreaker_belt"], false, {})
	var state := RelicLoadout.resolve()
	assert_true(RelicLoadout.ITEM_NOBU not in state["body_choices"], "not owned without either relic")
	assert_eq(state["speed_mult"], 1.0, "base speed")
	_set_hub(["breakwater_coin"], false, {})
	HubBridge.reach = "offline"
	state = RelicLoadout.resolve()
	assert_eq(state["owned"], [], "offline owns nothing")
	assert_eq(state["speed_mult"], 1.0, "offline: base speed")


func test_body_slot_is_exclusive() -> void:
	_set_hub(["genesis_shard", "cones_tip", "tidebreaker_belt"], false, {})
	var state := RelicLoadout.resolve()
	assert_eq(state["body_choices"], [RelicLoadout.ITEM_GOLDEN, RelicLoadout.ITEM_NOBU,
			RelicLoadout.ITEM_TIDEBREAKER, ""], "every owned skin, then none")
	assert_eq(state["body"], RelicLoadout.ITEM_GOLDEN, "first owned skin by default")
	assert_eq(state["spindash_charge"], 0.0, "Golden worn: base charge")
	# The server loadout picks the body.
	_set_hub(["genesis_shard", "cones_tip", "tidebreaker_belt"], false,
			{"slots": {"body": RelicLoadout.ITEM_TIDEBREAKER, "back": null}})
	state = RelicLoadout.resolve()
	assert_eq(state["body"], RelicLoadout.ITEM_TIDEBREAKER, "server loadout body")
	assert_eq(state["spindash_charge"], 3.0, "Tidebreaker charge")
	assert_eq(state["extra_life"], false, "one body at a time: no Golden life")
	assert_eq(state["speed_mult"], 1.0, "one body at a time: no Nobu speed")
	# A loadout naming the skin without the belt falls back to the default.
	_set_hub(["genesis_shard"], false, {"slots": {"body": RelicLoadout.ITEM_TIDEBREAKER}})
	state = RelicLoadout.resolve()
	assert_eq(state["body"], RelicLoadout.ITEM_GOLDEN, "unowned Tidebreaker is not worn")
	assert_eq(state["spindash_charge"], 0.0, "unowned: base charge")


func test_pause_picker_cycles_to_tidebreaker() -> void:
	_set_hub(["genesis_shard", "tidebreaker_belt"], false, {})
	assert_eq(RelicLoadout.resolve()["body"], RelicLoadout.ITEM_GOLDEN, "starts on Golden")
	assert_true(RelicLoadout.cycle_body(1), "cycles")
	var state := RelicLoadout.resolve()
	assert_eq(state["body"], RelicLoadout.ITEM_TIDEBREAKER, "next is Tidebreaker")
	assert_eq(state["spindash_charge"], 3.0, "Tidebreaker charge")
	assert_eq(state["extra_life"], false, "Golden's life is off")
	assert_true(RelicLoadout.cycle_body(1), "cycles again")
	assert_eq(RelicLoadout.resolve()["body"], "", "then no skin")
	assert_eq(RelicLoadout.resolve()["spindash_charge"], 0.0, "no skin: base charge")


func test_ranked_keeps_the_look_only() -> void:
	_set_hub(["tidebreaker_belt"], true, {})
	var state := RelicLoadout.resolve()
	assert_eq(state["skin"], "tidebreaker", "cosmetic stays on in Ranked")
	assert_eq(state["spindash_charge"], 0.0, "gameplay is off in Ranked")


# --- Spin dash charge ---------------------------------------------------------------


func test_tidebreaker_one_press_adds_3() -> void:
	_set_hub(["tidebreaker_belt"], false, {})
	await _flat()
	await _charge(1)
	# 3 on the press frame, then at most one classic decay step (3 - 24/256).
	assert_true(player.spindash_charge > 2.0 and player.spindash_charge <= 3.0,
			"one press adds 3, more than the base 2 (%s)" % player.spindash_charge)


func test_tidebreaker_two_presses_beat_the_base() -> void:
	_set_hub(["tidebreaker_belt"], false, {})
	await _flat()
	await _charge(2)
	# Base 2 + 2 can never pass 4; 3 + 3 less a few decay steps is about 5.8.
	assert_true(player.spindash_charge > 4.0 and player.spindash_charge <= 6.0,
			"two presses at 3 (%s)" % player.spindash_charge)


func test_tidebreaker_max_charge_and_release_unchanged() -> void:
	_set_hub(["tidebreaker_belt"], false, {})
	await _flat()
	var top := 0.0
	press(&"move_down")
	await physics_frames(2)
	press(&"jump")
	await physics_frames(1)
	release(&"jump")
	await physics_frames(1)
	for i in 6:
		press(&"jump")
		await physics_frames(1)
		top = maxf(top, player.spindash_charge)
		release(&"jump")
		await physics_frames(1)
		top = maxf(top, player.spindash_charge)
	assert_true(top <= Tuning.physics.spindash_max_charge, "never past the max charge (%s)" % top)
	release(&"move_down")
	await physics_frames(1)
	assert_near(player.ground_speed, 12.0, 1e-6, "full charge still releases at 12")


func test_ranked_tidebreaker_uses_the_base_charge() -> void:
	_set_hub(["tidebreaker_belt"], true, {})
	await _flat()
	await _charge(2)
	assert_true(player.spindash_charge <= 4.0, "Ranked: base 2 per press (%s)" % player.spindash_charge)


func test_tidebreaker_placeholder_colors() -> void:
	_set_hub(["tidebreaker_belt"], false, {})
	await _flat()
	await tree.process_frame
	var visual := player.get_node("Visual")
	assert_eq(visual.get(&"_body_color"), VISUAL.SEA, "sea-green body")
	assert_eq(visual.get(&"_face_color"), VISUAL.YELLOW, "face stays yellow")
	assert_eq(VISUAL._skin_frames_path("tidebreaker"), VISUAL.TIDEBREAKER_FRAMES_PATH, "future frames path")
	assert_eq(VISUAL._skin_frames_path("nobu"), "", "Nobu tints the base frames")


# --- Helpers -------------------------------------------------------------------------


func _set_hub(relics: Array, ranked: bool, loadout: Dictionary) -> void:
	HubBridge.reach = "ready"
	HubBridge.relics = relics
	HubBridge.ranked = ranked
	HubBridge.server_loadout = loadout


## No local equip choice in memory or on disk.
func _clear_slots() -> void:
	RelicLoadout.set(&"_slots", {})
	RelicLoadout.set(&"_slots_loaded", true)
	if FileAccess.file_exists(RelicLoadout.SLOTS_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(RelicLoadout.SLOTS_PATH))


func _flat(feet := Vector2.ZERO) -> void:
	var world := W.new_world(self)
	W.add_floor(world)
	player = W.spawn_player(world, feet)
	await W.settle(self, player, feet)


## Starts a spin dash, then presses jump `count` times, one press every other
## frame (as tests/physics/test_ground.gd does).
func _charge(count: int) -> void:
	press(&"move_down")
	await physics_frames(2)
	press(&"jump")
	await physics_frames(1)
	release(&"jump")
	await physics_frames(1)
	assert_eq(player.state, &"spindash", "charging")
	for i in count:
		press(&"jump")
		await physics_frames(1)
		release(&"jump")
		await physics_frames(1)
