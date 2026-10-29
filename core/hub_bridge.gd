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
## Optional tickets.exchange field (Verse still earnable today). Absent until a result includes it.
var verse_cap_left := 0
var verse_cap_known := false
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
	if not GameState.level_started.is_connected(_on_level_started):
		GameState.level_started.connect(_on_level_started)
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


func exchange_is_pending() -> bool:
	return _save.exchange_is_pending()


func pending_exchange_amount() -> int:
	return int(_save.exchange_pending().get("amount", 0))


func exchange(tickets: int) -> void:
	# A pending slot is resent as-is. A new amount must not replace it.
	if _save.exchange_is_pending():
		_send_pending_exchange()
		return
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
	if not _save.begin_exchange(amount):
		if _save.exchange_is_pending():
			_send_pending_exchange()
			return
		push_warning("[HubBridge] exchange left pending; the key was not saved, so exchange was not sent")
		exchange_settled.emit(false, {"code": "exchange_pending", "message": "Exchange pending"})
		state_changed.emit()
		return
	_send_pending_exchange()


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


func _on_level_started(zone_id: String, act: int) -> void:
	# Respawn keeps the attempt. Only start_level (a fresh attempt) mints a run id.
	if str(SceneRouter._free_scene) != "" or zone_id == "":
		return
	if not _save.begin_attempt(zone_id, act):
		push_warning("[HubBridge] level attempt id was not saved; earnTickets will not be sent until it is")


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
		_bank_tickets(zone, act, tickets)


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
	# Resend only with a session. A no-session call returns receiptId "noop"
	# and must not clear the slot while hub-outbox may still drain the key.
	if in_session:
		_resend_pending_earns()
		_send_pending_exchange()
	state_changed.emit()


func _bank_tickets(zone: String, act: int, tickets: int) -> void:
	if not _save.run_matches(zone, act):
		_save.begin_attempt(zone, act)
	if not _save.run_on_disk() and not _save.persist_run():
		push_warning("[HubBridge] earn left pending; run id was not saved, so earnTickets was not sent")
		return
	var run_id := _save.current_run_id()
	var existing := _save.earn_record(run_id)
	var amount := tickets if existing.is_empty() else int(existing.get("amount", tickets))
	if not _save.commit_earn(run_id, amount):
		push_warning("[HubBridge] earn left pending; could not save the idempotency key, so earnTickets was not sent")
		return
	var saved := _save.earn_record(run_id)
	if bool(saved.get("acked", false)):
		return
	_invoke("earnTickets", [int(saved.get("amount", amount)), EARN_REASON, run_id], _on_earn.bind(run_id))


func _resend_pending_earns() -> void:
	for rec in _save.unacked_earns():
		var run_id := str(rec.get("run_id", ""))
		var amount := int(rec.get("amount", 0))
		if run_id == "" or amount <= 0:
			continue
		_invoke("earnTickets", [amount, EARN_REASON, run_id], _on_earn.bind(run_id))


func _send_pending_exchange() -> void:
	if not _save.exchange_is_pending():
		return
	var pending := _save.exchange_pending()
	state_changed.emit()
	_invoke("exchange", [int(pending.get("amount", 0)), str(pending.get("key", ""))], _on_exchange.bind(str(pending.get("key", ""))))


func _on_earn(ok: bool, payload: Dictionary, run_id: String) -> void:
	if not ok or not payload.has("balance"):
		return
	if not in_session and not _read_session():
		return
	in_session = true
	_save.ack_earn(run_id)
	ticket_balance = int(payload["balance"])
	balance_known = true
	earn_capped = bool(payload.get("capped", false))
	state_changed.emit()


func _on_exchange(ok: bool, payload: Dictionary, key: String) -> void:
	_note_verse_cap(payload)
	var receipt := str(payload.get("receiptId", ""))
	var acked := ok and receipt != "" and receipt != "noop" and key == str(_save.exchange_pending().get("key", ""))
	if acked:
		_save.ack_exchange()
		_apply_receipt(payload)
	else:
		# Lost response, server error, or a no-session noop. Keep the slot so
		# a later attempt cannot mint a second key while this one may still drain.
		ok = false
		payload["pending"] = true
		payload["code"] = "exchange_pending"
		payload["message"] = "Exchange pending"
	exchange_settled.emit(ok, payload)
	state_changed.emit()


func _note_verse_cap(payload: Dictionary) -> void:
	if not payload.has("verseCapLeft"):
		return
	verse_cap_left = int(payload["verseCapLeft"])
	verse_cap_known = true


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
