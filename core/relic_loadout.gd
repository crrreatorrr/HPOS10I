extends Node
## One read of Relic ownership for HPOS10I.
##
## `resolve()` is the only function that reads owned Relics. It uses the hub
## init result already stored on HubBridge (relics, ranked, and a server
## loadout when init includes one). Offline, that result is empty: nothing is
## owned and the session is unranked. The equipped body and back slots are a
## local choice until the server loadout arrives. This never writes Tickets,
## Relics, beaten flags, or leaderboards, and it never grants a Relic.


const RELIC_GENESIS := "genesis_shard"
const RELIC_CONES := "cones_tip"
const RELIC_CROWN := "tinubu_crown"
## Sproto Fighter's Relic (the hub's fifth game).
const RELIC_BELT := "tidebreaker_belt"
const ITEM_GOLDEN := "hpos_skin_golden_sproto"
const ITEM_NOBU := "hpos_skin_nobu"
const ITEM_TIDEBREAKER := "hpos_skin_tidebreaker"
const ITEM_CAPE := "hpos_cape_duelist"
const SPEED_MULT := 1.05
## Tidebreaker's spin-dash charge per jump press (the hub item matrix part
## `spindash_charge`, `{ charge_per_press: 3 }`). The base is
## Tuning.physics.spindash_charge_per_press (2.0). The max charge
## (spindash_max_charge, 8.0) and the release speed (8 + floor(charge) / 2,
## 12 at most) are unchanged, so it reaches a full dash in 3 presses instead
## of 4 but never goes faster. A sidegrade to Golden's extra life and Nobu's
## top speed.
const SPINDASH_CHARGE_PER_PRESS := 3.0
## Equip choice only. Not progress.json and not an ownership record.
const SLOTS_PATH := "user://hpos10i/relic_slots.json"

const _KNOWN := [RELIC_GENESIS, RELIC_CONES, RELIC_CROWN, RELIC_BELT]

var _slots := {}
var _slots_loaded := false


## Owned Relics, the equipped body/back slots, and the gameplay that follows.
## Cosmetics stay on in Ranked. Gameplay (extra life, speed, spin-dash charge,
## time focus) does not. `spindash_charge` is the charge per press while
## Tidebreaker is worn unranked, else 0.0 (the player keeps the base rate).
func resolve() -> Dictionary:
	var owned: Array = []
	var ranked := false
	var server_slots := {}
	# Local fallback: init has not succeeded, so nothing is owned.
	if HubBridge.reach == "ready":
		owned = _known_relics(HubBridge.relics)
		ranked = HubBridge.ranked == true
		if HubBridge.server_loadout is Dictionary:
			server_slots = HubBridge.server_loadout
	var choice := _slots_from(server_slots) if not server_slots.is_empty() else _local_slots()
	var skins := _owned_skins(owned)
	var body := _pick_body(skins, choice)
	var back := _pick_back(owned, choice)
	var gameplay := not ranked
	var choices := skins.duplicate()
	if not choices.is_empty():
		choices.append("")
	return {
		"owned": owned,
		"ranked": ranked,
		"body": body,
		"back": back,
		"body_choices": choices,
		"skin": _skin_id(body),
		"cape": back == ITEM_CAPE,
		"extra_life": gameplay and body == ITEM_GOLDEN,
		"speed_mult": SPEED_MULT if gameplay and body == ITEM_NOBU else 1.0,
		"spindash_charge": SPINDASH_CHARGE_PER_PRESS if gameplay and body == ITEM_TIDEBREAKER else 0.0,
		"time_focus": gameplay and back == ITEM_CAPE,
	}


## Cycles the body slot through owned skins and empty. False when there is
## nothing to switch. Writes the local equip file only.
func cycle_body(step: int) -> bool:
	if not HubBridge.server_loadout.is_empty():
		return false
	var state := resolve()
	var choices: Array = state["body_choices"]
	if choices.size() < 2:
		return false
	var index := choices.find(str(state["body"]))
	if index < 0:
		index = 0
	var count := choices.size()
	var next := str(choices[posmod(index + step, count)])
	var slots := _local_slots()
	slots["body"] = next
	slots["body_set"] = true
	_slots = slots
	_write_slots(slots)
	return true


func _known_relics(value: Variant) -> Array:
	var out: Array = []
	if value is not Array:
		return out
	for item in value:
		var id := str(item)
		if id in _KNOWN and id not in out:
			out.append(id)
	return out


func _owned_skins(owned: Array) -> Array:
	var skins: Array = []
	if RELIC_GENESIS in owned:
		skins.append(ITEM_GOLDEN)
	if RELIC_CONES in owned:
		skins.append(ITEM_NOBU)
	if RELIC_BELT in owned:
		skins.append(ITEM_TIDEBREAKER)
	return skins


func _pick_body(skins: Array, choice: Dictionary) -> String:
	if bool(choice.get("body_set", false)):
		var want := str(choice.get("body", ""))
		if want == "" or want in skins:
			return want
	return str(skins[0]) if not skins.is_empty() else ""


func _pick_back(owned: Array, choice: Dictionary) -> String:
	var owns := RELIC_CROWN in owned
	if bool(choice.get("back_set", false)):
		var want := str(choice.get("back", ""))
		if want == ITEM_CAPE and owns:
			return ITEM_CAPE
		return ""
	return ITEM_CAPE if owns else ""


func _skin_id(body: String) -> String:
	match body:
		ITEM_GOLDEN:
			return "golden"
		ITEM_NOBU:
			return "nobu"
		ITEM_TIDEBREAKER:
			return "tidebreaker"
	return ""


func _slots_from(server_slots: Dictionary) -> Dictionary:
	var slots: Dictionary = server_slots.get("slots", server_slots)
	if slots is not Dictionary:
		return {"body_set": true, "back_set": true, "body": "", "back": ""}
	return {
		"body_set": true,
		"back_set": true,
		"body": _item_or_empty(slots.get("body", "")),
		"back": _item_or_empty(slots.get("back", "")),
	}


func _item_or_empty(value: Variant) -> String:
	if value == null:
		return ""
	return str(value)


func _local_slots() -> Dictionary:
	if not _slots_loaded:
		_slots = _read_slots()
		_slots_loaded = true
	return _slots


func _read_slots() -> Dictionary:
	if not FileAccess.file_exists(SLOTS_PATH):
		return {}
	var text := FileAccess.get_file_as_string(SLOTS_PATH)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is not Dictionary:
		return {}
	return {
		"body_set": bool(parsed.get("body_set", false)),
		"back_set": bool(parsed.get("back_set", false)),
		"body": str(parsed.get("body", "")),
		"back": str(parsed.get("back", "")),
	}


func _write_slots(slots: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://hpos10i"))
	var file := FileAccess.open(SLOTS_PATH, FileAccess.WRITE)
	if file == null:
		push_warning("[RelicLoadout] could not save the local equip choice")
		return
	file.store_string(JSON.stringify({
		"v": 1,
		"body": str(slots.get("body", "")),
		"body_set": bool(slots.get("body_set", false)),
		"back": str(slots.get("back", "")),
		"back_set": bool(slots.get("back_set", false)),
	}))
