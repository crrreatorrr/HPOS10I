extends Node
## Thin wrapper over window.hubSdk (JavaScriptBridge.get_interface("hubSdk")).
## The HTML shell calls installHubSdk before the engine boots. init('hpos10i')
## runs here. Editor and non-web runs never touch JavaScriptBridge and stay
## offline, so the game still plays standalone. Writes are fire-and-forget:
## the SDK's IndexedDB outbox ('hub-outbox') resends each UUIDv7 key until ack.


const GAME_ID := "hpos10i"
const EVENT_LEVEL_COMPLETE := "hpos10i.level_complete"
const BOARD_ACT_TIME := "hpos10i_act_time"
const EARN_REASON := "level_end"
const RELIC_ZONE := "z1_retro_rush_hills"
const RELIC_ACT := 1
## Ken's rate and cap. The exchange panel shows both. The server enforces them.
const TICKETS_PER_VERSE := 10
const VERSE_DAILY_CAP := 50

## "offline" (no web SDK), "pending" (init in flight), "ready" (init returned).
var reach := "offline"
var in_session := false
## Server Ticket balance mirrored in memory. Not written to the local save.
var ticket_balance := 0
var balance_known := false
var verse_balance := 0
var verse_known := false
var tickets_cap_left := 0
var earn_capped := false
## This game's resolved effects from init. M3 applies them; this milestone does not.
var effects := {}
## Last begin_time_focus request. Pause uses get_tree().paused, so M3 must
## apply this through Engine.time_scale for duration_sec and then restore it.
var time_focus := {}

signal state_changed
signal exchange_settled(ok: bool, payload: Dictionary)

var _save := HubSave.new()
var _receipts := {}
var _held: Array[Callable] = []


func _ready() -> void:
	_save.load_all()
	if not GameState.level_completed.is_connected(_on_level_completed):
		GameState.level_completed.connect(_on_level_completed)
	if not OS.has_feature("web"):
		reach = "offline"
		return
	reach = "pending"
	_invoke("init", [GAME_ID], _on_init)


## M3 hook. Does not pause the tree and does not apply a relic effect yet.
func begin_time_focus(time_scale: float, duration_sec: float) -> void:
	time_focus = {"time_scale": time_scale, "duration_sec": duration_sec}


func exchange(tickets: int) -> void:
	var amount := int(tickets)
	if amount <= 0:
		exchange_settled.emit(false, {"code": "bad_amount", "message": "Exchange amount must be positive"})
		return
	if reach == "offline":
		exchange_settled.emit(false, {
			"code": "offline",
			"message": "Open this game from the hub to exchange.",
		})
		return
	var key := _save.exchange_key(amount)
	_invoke("exchange", [amount, key], _on_exchange.bind(amount))


func exit_to_hub() -> void:
	if not OS.has_feature("web"):
		return
	var js := _js()
	if js == null:
		return
	var hub: Variant = js.call(&"get_interface", &"hubSdk")
	if hub == null:
		return
	# SDK exit flushes the outbox and goes to /hub/#from=hpos10i when a
	# session is open. With no session it returns and the game keeps running.
	hub.call(&"exit", &"exit_to_hub")


func _on_level_completed() -> void:
	# Sandboxes and the dev menu set SceneRouter._free_scene. Real acts leave it empty.
	if str(SceneRouter._free_scene) != "":
		return
	var zone := str(GameState.zone_id)
	var act := int(GameState.act)
	if zone == "":
		return
	var time_ms := int(round(GameState.level_time * 1000.0))
	var time_sec := float(time_ms) / 1000.0
	var tickets := int(GameState.tickets)
	var best := _save.record_clear(zone, act, time_sec)
	_invoke("submitScore", [BOARD_ACT_TIME, best, {"zone": zone, "act": act}], _ignore)
	if zone == RELIC_ZONE and act == RELIC_ACT:
		var relic_key := _save.key_for("relic", "%s:%d:%d" % [zone, act, time_ms])
		_invoke("reportEvent", [
			EVENT_LEVEL_COMPLETE,
			{"zone": zone, "act": act, "time": time_sec},
			relic_key,
		], _ignore)
	if tickets > 0:
		var earn_key := _save.key_for("earn", "%s:%d:%d:%d" % [zone, act, time_ms, tickets])
		_invoke("earnTickets", [tickets, EARN_REASON, earn_key], _on_earn)


func _on_init(ok: bool, payload: Dictionary) -> void:
	if not ok:
		reach = "offline"
		in_session = false
		state_changed.emit()
		return
	reach = "ready"
	var raw_effects: Variant = payload.get("effects", {})
	effects = raw_effects if raw_effects is Dictionary else {}
	tickets_cap_left = int(payload.get("ticketsCapLeft", 0))
	in_session = _read_session()
	state_changed.emit()


func _on_earn(ok: bool, payload: Dictionary) -> void:
	if not ok or not payload.has("balance"):
		return
	if not in_session and not _read_session():
		return
	in_session = true
	ticket_balance = int(payload["balance"])
	balance_known = true
	earn_capped = bool(payload.get("capped", false))
	state_changed.emit()


func _on_exchange(ok: bool, payload: Dictionary, amount: int) -> void:
	if ok:
		var receipt := str(payload.get("receiptId", ""))
		if receipt == "" or receipt == "noop":
			ok = false
			payload = {
				"code": "offline",
				"message": "No hub session. Tickets were not exchanged.",
			}
		else:
			_save.ack_exchange(amount)
			_apply_receipt(payload)
	exchange_settled.emit(ok, payload)


## Lowers the in-memory Ticket balance to the server's ticketsLeft once per receipt.
func _apply_receipt(payload: Dictionary) -> void:
	var receipt := str(payload.get("receiptId", ""))
	if receipt == "" or _receipts.has(receipt) or not payload.has("ticketsLeft"):
		return
	_receipts[receipt] = true
	ticket_balance = int(payload["ticketsLeft"])
	balance_known = true
	if payload.has("verse"):
		verse_balance = int(payload["verse"])
		verse_known = true
	state_changed.emit()


func _ignore(_ok: bool, _payload: Dictionary) -> void:
	pass


func _invoke(method: String, args: Array, done: Callable) -> void:
	if not OS.has_feature("web"):
		done.call(false, {"code": "offline", "message": "Hub SDK is not available"})
		return
	var js := _js()
	if js == null:
		done.call(false, {"code": "offline", "message": "Hub SDK is not available"})
		return
	var hub: Variant = js.call(&"get_interface", &"hubSdk")
	if hub == null:
		done.call(false, {"code": "offline", "message": "window.hubSdk is missing"})
		return
	var promise: Variant = _call_hub(hub, method, args)
	if promise == null:
		done.call(true, {})
		return
	var on_ok := _on_js_ok.bind(done)
	var on_err := _on_js_err.bind(done)
	_held.append(on_ok)
	_held.append(on_err)
	promise.call(&"then", js.call(&"create_callback", on_ok), js.call(&"create_callback", on_err))


func _call_hub(hub: Object, method: String, args: Array) -> Variant:
	match args.size():
		0:
			return hub.call(method)
		1:
			return hub.call(method, args[0])
		2:
			return hub.call(method, args[0], args[1])
		3:
			return hub.call(method, args[0], args[1], args[2])
		_:
			return hub.callv(method, args)


func _on_js_ok(args: Array, done: Callable) -> void:
	done.call(true, _decode(args, false))


func _on_js_err(args: Array, done: Callable) -> void:
	done.call(false, _decode(args, true))


func _decode(args: Array, is_error: bool) -> Dictionary:
	if args.is_empty() or args[0] == null:
		if is_error:
			return {"code": "rejected", "message": "rejected"}
		return {}
	var value: Variant = args[0]
	if value is Dictionary:
		return value
	if value is String:
		return _dict_from_json(value)
	return _dict_from_json(_describe(value, is_error))


func _describe(value: Variant, is_error: bool) -> String:
	var js := _js()
	if js != null:
		var win: Variant = js.call(&"get_interface", &"window")
		if win != null:
			var fn := "hposDescribeError" if is_error else "hposDescribe"
			var described: Variant = win.call(fn, value)
			if described is String:
				return described
	if is_error:
		return JSON.stringify({"code": "rejected", "message": str(value)})
	return JSON.stringify(value)


func _dict_from_json(text: String) -> Dictionary:
	if text == "" or text == "null":
		return {}
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed
	if parsed == null:
		return {}
	return {"value": parsed}


func _read_session() -> bool:
	if not OS.has_feature("web"):
		return false
	var js := _js()
	if js == null:
		return false
	var store: Variant = js.call(&"get_interface", &"sessionStorage")
	if store == null:
		return false
	var raw: Variant = store.call(&"getItem", "hub:%s:session" % GAME_ID)
	return raw != null and str(raw) != ""


func _js() -> Object:
	if not OS.has_feature("web"):
		return null
	return Engine.get_singleton(&"JavaScriptBridge")
