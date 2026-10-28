class_name Emeralds
## The emerald won for clearing an act (director, 2026-10-28): one for every
## act of every zone in ZoneRegistry.ZONES, 8 in all. The test zone and boss
## arenas give none. It shows as a flat spinning icon made from the
## director's own image (ICON_PATH; a placeholder gem until it lands).
## GameState keeps which ones are won.
##
## The display name is the director's choice and a deliberate exception to
## the originality guardrails, allowlisted for this file only
## (tools/qa/originality_allow.txt). Show it through Emeralds.NAME; never
## write the word anywhere else.

const NAME := "Horcrux Emerald"
const ICON_PATH := "res://assets/sprites/common/emerald/emerald.png"


## GameState's key for one act.
static func key(zone_id: String, act: int) -> String:
	return "%s:%d" % [zone_id, act]


## True for a regular act of a real zone (not the test zone or an arena).
static func is_emerald_act(zone_id: String, act: int) -> bool:
	for zone in ZoneRegistry.ZONES:
		if zone.id == zone_id:
			return act >= 1 and act <= zone.acts.size()
	return false


## Keys of every emerald in play order.
static func all_keys() -> Array[String]:
	var keys: Array[String] = []
	for zone in ZoneRegistry.ZONES:
		for act in range(1, zone.acts.size() + 1):
			keys.append(key(zone.id, act))
	return keys


static func total() -> int:
	return all_keys().size()


## The icon texture, or null until the art exists.
static func icon() -> Texture2D:
	return load(ICON_PATH) if ResourceLoader.exists(ICON_PATH) else null
