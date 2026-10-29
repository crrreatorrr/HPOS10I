class_name HubSave
extends RefCounted
## Progress and idempotency keys under user://hpos10i/ (IndexedDB on the web
## export). Cleared acts and best times live in progress.json.
## write_keys.json holds idempotency keys only. Relic ownership and Ticket
## balances are server-side and are never written here.
##
## An earn key is the attempt's run id (one UUIDv7 per start_level). It is
## saved before earnTickets. A failed save does not mint a replacement.
## exchange_pending is a single slot and is never overwritten while unacked.


const PROGRESS_PATH := "user://hpos10i/progress.json"
const KEYS_PATH := "user://hpos10i/write_keys.json"

var cleared := {}
var best_times := {}
var _keys := {}
var _run_id := ""
var _run_zone := ""
var _run_act := 0
var _run_on_disk := false


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
	_run_id = str(_keys.get("run_id", ""))
	_run_zone = str(_keys.get("run_zone", ""))
	_run_act = int(_keys.get("run_act", 0))
	_run_on_disk = _run_id != "" and str(_read_json(KEYS_PATH).get("run_id", "")) == _run_id


## Records a cleared act and its best (lowest) time. Returns that best time.
func record_clear(zone: String, act: int, time_sec: float) -> float:
	var id := "%s:%d" % [zone, act]
	cleared[id] = true
	var best := time_sec
	if best_times.has(id):
		best = minf(float(best_times[id]), time_sec)
	best_times[id] = best
	_write_progress()
	return best


## Relic keys only. A retry of the same completion id reuses the stored key.
func key_for(bucket: String, id: String) -> String:
	var map: Dictionary = _bucket(bucket)
	if map.has(id) and str(map[id]) != "":
		return str(map[id])
	var key := UuidV7.mint()
	map[id] = key
	_keys[bucket] = map
	_write_keys()
	return key


## One id per level attempt. Persists it before any earn. False means the id
## is only in memory; the caller must not send earnTickets.
func begin_attempt(zone: String, act: int) -> bool:
	_run_id = UuidV7.mint()
	_run_zone = zone
	_run_act = act
	_run_on_disk = false
	_keys["run_id"] = _run_id
	_keys["run_zone"] = _run_zone
	_keys["run_act"] = _run_act
	return persist_run()


func current_run_id() -> String:
	return _run_id


func run_matches(zone: String, act: int) -> bool:
	return _run_id != "" and _run_zone == zone and _run_act == act


func run_on_disk() -> bool:
	return _run_on_disk


func persist_run() -> bool:
	if _run_id == "":
		return false
	_keys["run_id"] = _run_id
	_keys["run_zone"] = _run_zone
	_keys["run_act"] = _run_act
	if not _write_keys():
		_run_on_disk = false
		return false
	_run_on_disk = str(_read_json(KEYS_PATH).get("run_id", "")) == _run_id
	return _run_on_disk


func earn_record(run_id: String) -> Dictionary:
	var earns := _earn_map()
	var rec: Variant = earns.get(run_id, {})
	return rec if rec is Dictionary else {}


## Saves {amount, acked} for this run id. An existing amount is kept, so a
## second completion cannot change the body that belongs to the key.
## False means it is not on disk; do not send.
func commit_earn(run_id: String, amount: int) -> bool:
	if run_id == "" or amount <= 0:
		return false
	if _earn_on_disk(run_id):
		return true
	var earns := _earn_map()
	var existing := earn_record(run_id)
	if existing.is_empty():
		earns[run_id] = {"amount": amount, "acked": false}
	else:
		earns[run_id] = existing
	_keys["earn_by_run"] = earns
	if not _write_keys():
		return false
	return _earn_on_disk(run_id)


func ack_earn(run_id: String) -> void:
	var earns := _earn_map()
	var rec := earn_record(run_id)
	if rec.is_empty():
		return
	rec["acked"] = true
	earns[run_id] = rec
	_keys["earn_by_run"] = earns
	_write_keys()


## Unacked earns that were actually written. Each entry is {run_id, amount}.
func unacked_earns() -> Array:
	var out: Array = []
	var earns := _earn_map()
	for run_id in earns.keys():
		var rec: Variant = earns[run_id]
		if rec is Dictionary and not bool(rec.get("acked", false)) and _earn_on_disk(str(run_id)):
			var amount := int(rec.get("amount", 0))
			if amount > 0:
				out.append({"run_id": str(run_id), "amount": amount})
	return out


func exchange_is_pending() -> bool:
	var pending := _disk_exchange()
	return str(pending.get("key", "")) != "" and not bool(pending.get("acked", false))


func exchange_pending() -> Dictionary:
	var pending := _disk_exchange()
	if str(pending.get("key", "")) == "" or bool(pending.get("acked", false)):
		return {}
	_keys["exchange_pending"] = pending
	return pending


## Opens the single slot. Refuses to replace an unacked exchange. False means
## nothing was saved (or a slot is already pending); do not send a new key.
func begin_exchange(amount: int) -> bool:
	if exchange_is_pending():
		return false
	if amount <= 0:
		return false
	var record := {"amount": amount, "key": UuidV7.mint(), "acked": false}
	_keys["exchange_pending"] = record
	if not _write_keys() or not _exchange_on_disk(record):
		_keys.erase("exchange_pending")
		return false
	return true


func ack_exchange() -> void:
	var pending := _pending()
	if str(pending.get("key", "")) == "":
		return
	pending["acked"] = true
	_keys["exchange_pending"] = pending
	_write_keys()


func _earn_map() -> Dictionary:
	var earns: Variant = _keys.get("earn_by_run", {})
	return earns if earns is Dictionary else {}


func _earn_on_disk(run_id: String) -> bool:
	var earns: Variant = _read_json(KEYS_PATH).get("earn_by_run", {})
	if not earns is Dictionary:
		return false
	var rec: Variant = earns.get(run_id, {})
	if not rec is Dictionary or not rec.has("amount"):
		return false
	var mem := earn_record(run_id)
	if mem.is_empty():
		return true
	return int(rec.get("amount", -1)) == int(mem.get("amount", -2))


func _disk_exchange() -> Dictionary:
	var pending: Variant = _read_json(KEYS_PATH).get("exchange_pending", {})
	return pending if pending is Dictionary else {}


func _exchange_on_disk(record: Dictionary) -> bool:
	var pending := _disk_exchange()
	return str(pending.get("key", "")) == str(record.get("key", "")) \
			and int(pending.get("amount", -1)) == int(record.get("amount", -2)) \
			and not bool(pending.get("acked", false))


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


func _write_keys() -> bool:
	return _write_json(KEYS_PATH, _keys)


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	return parsed if parsed is Dictionary else {}


func _write_json(path: String, data: Dictionary) -> bool:
	var root := DirAccess.open("user://")
	if root == null:
		return false
	var err := root.make_dir_recursive("hpos10i")
	if err != OK and err != ERR_ALREADY_EXISTS:
		return false
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.flush()
	var failed := file.get_error() != OK
	file.close()
	return not failed
