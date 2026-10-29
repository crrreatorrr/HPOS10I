class_name HubSave
extends RefCounted
## Progress and idempotency keys under user://hpos10i/ (IndexedDB on the web
## export). Cleared acts and best times live in progress.json. Write keys live
## in write_keys.json so a retry reuses the UUIDv7 minted for that completion.
## Relic ownership and Ticket balances are server-side and are never written here.


const DIR := "user://hpos10i"
const PROGRESS_PATH := "user://hpos10i/progress.json"
const KEYS_PATH := "user://hpos10i/write_keys.json"

var cleared := {}
var best_times := {}
var _keys := {}


func load_all() -> void:
	var progress := _read_json(PROGRESS_PATH)
	cleared = {}
	best_times = {}
	if progress.get("cleared") is Array:
		for item in progress["cleared"]:
			cleared[str(item)] = true
	if progress.get("best_times") is Dictionary:
		for id in progress["best_times"]:
			best_times[str(id)] = float(progress["best_times"][id])
	var keys := _read_json(KEYS_PATH)
	_keys = keys if not keys.is_empty() else {}


## Records a cleared act and its best (lowest) time. Returns that best time.
func record_clear(zone: String, act: int, time_sec: float) -> float:
	var id := _act_id(zone, act)
	cleared[id] = true
	var best := time_sec
	if best_times.has(id):
		best = minf(float(best_times[id]), time_sec)
	best_times[id] = best
	_write_progress()
	return best


func key_for(bucket: String, id: String) -> String:
	var map: Dictionary = _bucket(bucket)
	if map.has(id) and str(map[id]) != "":
		return str(map[id])
	var key := UuidV7.mint()
	map[id] = key
	_keys[bucket] = map
	_write_keys()
	return key


## One key per exchange attempt. The same amount retries with the same key
## until the receipt is acked; a later exchange mints a new one.
func exchange_key(amount: int) -> String:
	var pending := _pending()
	if int(pending.get("amount", -1)) == amount and not bool(pending.get("acked", false)) \
			and str(pending.get("key", "")) != "":
		return str(pending["key"])
	var key := UuidV7.mint()
	_keys["exchange_pending"] = {"amount": amount, "key": key, "acked": false}
	_write_keys()
	return key


func ack_exchange(amount: int) -> void:
	var pending := _pending()
	if int(pending.get("amount", -1)) != amount or str(pending.get("key", "")) == "":
		return
	pending["acked"] = true
	_keys["exchange_pending"] = pending
	_write_keys()


func _act_id(zone: String, act: int) -> String:
	return "%s:%d" % [zone, act]


func _bucket(bucket: String) -> Dictionary:
	var map: Variant = _keys.get(bucket, {})
	if map is Dictionary:
		return map
	return {}


func _pending() -> Dictionary:
	var pending: Variant = _keys.get("exchange_pending", {})
	return pending if pending is Dictionary else {}


func _write_progress() -> void:
	var list: Array = cleared.keys()
	list.sort()
	_write_json(PROGRESS_PATH, {"cleared": list, "best_times": best_times})


func _write_keys() -> void:
	_write_json(KEYS_PATH, _keys)


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}


func _write_json(path: String, data: Dictionary) -> void:
	var root := DirAccess.open("user://")
	if root != null:
		root.make_dir_recursive("hpos10i")
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(data))
