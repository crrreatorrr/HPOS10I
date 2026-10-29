extends TestCase
## Client-side duplication tests for the hub earn and exchange flow
## (core/hub_bridge.gd, core/hub_save.gd, core/game_state.gd,
## ui/zone_select/exchange_panel.gd).
##
## The SDK (earnTickets, reportEvent, exchange, submitScore, init) is the
## double in sdk_double.gd. Tests count each key and the amount credited.
## The client's pending outbox is the unacked rows in user://hpos10i/write_keys.json.
## The JS hub-outbox lives in the SDK, which this process does not run.
##
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd -- --filter=hub_duplication
## CI runs the same script from the "Run tests" step in .github/workflows/web.yml.

const DOUBLE := preload("res://tests/hub/sdk_double.gd")
const UI := preload("res://tests/ui/ui_test_helpers.gd")

const ZONE_A := "z1_retro_rush_hills"
const ZONE_B := "z2_wizard_academy"

var _live: Array = []


func before_each() -> void:
	_wipe_store()
	_silence_autoload()
	_reset_autoload_memory()
	SceneRouter.set(&"_free_scene", "")
	SceneRouter.zone_id = ""
	SceneRouter.stage = 1
	GameState.reset_game()


func after_each() -> void:
	for bridge in _live:
		_disconnect_bridge(bridge)
	_live.clear()
	_wipe_store()
	_restore_autoload()
	_reset_autoload_memory()
	SceneRouter.set(&"_free_scene", "")
	SceneRouter.zone_id = ""
	SceneRouter.stage = 1
	tree.paused = false
	UI.clear_scene(tree)
	GameState.reset_game()


# --- Case 1: earn rejection -------------------------------------------------


func test_case1_rejection_acks_and_does_not_credit_or_resend() -> void:
	# idempotency_mismatch, a session cap, and a daily cap. Any *_cap is terminal.
	for code in ["idempotency_mismatch", "session_ticket_cap", "daily_cap"]:
		_wipe_store()
		GameState.reset_game()
		var bridge = _spawn()
		var key := _play_attempt(bridge, ZONE_B, 1, 7)
		var sent := _earns(bridge)
		assert_eq(sent.size(), 1, "%s: earnTickets sent once before the error (%s)" % [code, _ledger(bridge)])
		if sent.is_empty():
			_drop_live()
			continue
		assert_eq(sent[0].key, key, "%s: sent the attempt key" % code)
		assert_eq(sent[0].amount, 7, "%s: sent the attempt amount" % code)
		assert_eq(sent[0].reason, HubBridge.EARN_REASON, "%s: earn reason" % code)
		_reply(sent[0], false, {"code": code, "message": code})
		assert_eq(bridge.ticket_balance, 0, "%s: nothing credited" % code)
		assert_true(not bridge.balance_known, "%s: balance was not applied" % code)
		assert_eq(_pending_earn_keys(), PackedStringArray(), "%s: dropped from pending" % code)
		var row := _earn_row(key)
		assert_true(bool(row.get("acked", false)), "%s: pending row is acked in write_keys.json" % code)
		assert_eq(int(row.get("amount", -1)), 7, "%s: acked row keeps the amount" % code)
		var reloaded = _reload(bridge)
		var resent := _earns(reloaded)
		assert_eq(resent.size(), 0, "%s: re-init resent %s" % [code, _ledger(reloaded)])
		assert_eq(reloaded.ticket_balance, 0, "%s: re-init credited nothing" % code)
		assert_true(not reloaded.balance_known, "%s: re-init did not apply a balance" % code)
		_drop_live()


# --- Case 2: transport failure ----------------------------------------------


func test_case2_transport_failure_resends_same_key_and_credits_once() -> void:
	for mode in ["rpc_failed", "lost"]:
		_wipe_store()
		GameState.reset_game()
		var bridge = _spawn()
		var key := _play_attempt(bridge, ZONE_B, 1, 9)
		var first := _earns(bridge)
		assert_eq(first.size(), 1, "%s: first send (%s)" % [mode, _ledger(bridge)])
		if first.is_empty():
			_drop_live()
			continue
		assert_eq(first[0].key, key, "%s: first key" % mode)
		assert_eq(first[0].amount, 9, "%s: first amount" % mode)
		if mode == "rpc_failed":
			_reply(first[0], false, {"code": "rpc_failed", "message": "HTTP 503"})
		# A lost response never calls the callback.
		assert_eq(bridge.ticket_balance, 0, "%s: no credit before a success" % mode)
		assert_true(not bridge.balance_known, "%s: balance unknown before a success" % mode)
		assert_eq(_pending_earn_keys(), PackedStringArray([key]), "%s: earn stays pending" % mode)
		var again = _reload(bridge)
		var resent := _earns(again)
		assert_eq(resent.size(), 1, "%s: resent on the next init (%s)" % [mode, _ledger(again)])
		if resent.is_empty():
			_drop_live()
			continue
		assert_eq(resent[0].key, key, "%s: resent the same key" % mode)
		assert_eq(resent[0].amount, 9, "%s: resent the same amount" % mode)
		_reply(resent[0], true, {"balance": 9, "capped": false})
		assert_eq(again.ticket_balance, 9, "%s: credited the attempt once" % mode)
		assert_true(again.balance_known, "%s: balance applied once" % mode)
		assert_eq(_pending_earn_keys(), PackedStringArray(), "%s: success clears pending" % mode)
		var sends_after_success := _earns(again).size()
		_boot(again)
		assert_eq(_earns(again).size(), sends_after_success, "%s: the following init on this session does not resend" % mode)
		var later = _reload(again)
		assert_eq(_earns(later).size(), 0, "%s: a later init does not resend (%s)" % [mode, _ledger(later)])
		assert_true(not later.balance_known, "%s: the later init does not credit again" % mode)
		_drop_live()


# --- Case 3: two tabs -------------------------------------------------------


func test_case3_both_write_orders_keep_both_earn_keys_and_credit_once() -> void:
	for a_first in [true, false]:
		var order := "A then B" if a_first else "B then A"
		_wipe_store()
		GameState.reset_game()
		var tabs := _commit_both_tabs(a_first)
		var id_a: String = str(tabs["id_a"])
		var id_b: String = str(tabs["id_b"])
		var earns := _earn_map()
		assert_true(earns.has(id_a), "%s: tab A's earn key was lost" % order)
		assert_true(earns.has(id_b), "%s: tab B's earn key was lost" % order)
		if earns.has(id_a):
			assert_eq(int(earns[id_a].get("amount", -1)), 11, "%s: tab A amount" % order)
		if earns.has(id_b):
			assert_eq(int(earns[id_b].get("amount", -1)), 22, "%s: tab B amount" % order)
		var bridge = _spawn()
		_boot(bridge)
		var sent := _earns(bridge)
		var by_key := {}
		for row in sent:
			var times := int(by_key.get(row.key, 0))
			by_key[row.key] = times + 1
		assert_eq(int(by_key.get(id_a, 0)), 1, "%s: key A sent %s times (%s)" % [order, str(by_key.get(id_a, 0)), _ledger(bridge)])
		assert_eq(int(by_key.get(id_b, 0)), 1, "%s: key B sent %s times (%s)" % [order, str(by_key.get(id_b, 0)), _ledger(bridge)])
		assert_eq(sent.size(), 2, "%s: one send per attempt" % order)
		var credited := {}
		var server_balance := 0
		for row in sent:
			var amount := int(row.amount)
			if not credited.has(row.key):
				credited[row.key] = amount
				server_balance += amount
			_reply(row, true, {"balance": server_balance, "capped": false})
		assert_eq(int(credited.get(id_a, 0)), 11, "%s: attempt A credited once" % order)
		assert_eq(int(credited.get(id_b, 0)), 22, "%s: attempt B credited once" % order)
		assert_eq(bridge.ticket_balance, 33, "%s: client balance is the two credits, not a double charge" % order)
		assert_eq(_pending_earn_keys(), PackedStringArray(), "%s: both earns acked" % order)
		var sends_after := _earns(bridge).size()
		_boot(bridge)
		assert_eq(_earns(bridge).size(), sends_after, "%s: the next init does not resend either key" % order)
		_drop_live()


func test_case3_stale_write_keeps_ack_and_open_exchange() -> void:
	# Open slot: tab B still holds an older exchange in memory, then saves
	# after tab A has opened a different slot. The merge has to keep A's slot.
	_wipe_store()
	var early := HubSave.new()
	early.load_all()
	var opener := HubSave.new()
	opener.load_all()
	assert_true(opener.begin_exchange(40), "open exchange did not persist")
	var open_key := str(opener.exchange_pending().get("key", ""))
	var rival := UuidV7.mint()
	early._keys["exchange_pending"] = {"amount": 90, "key": rival, "acked": false}
	assert_true(early.begin_attempt(ZONE_B, 1), "stale tab could not save its attempt")
	var slot := _exchange_row()
	assert_eq(str(slot.get("key", "")), open_key, "stale write replaced an open exchange slot")
	assert_eq(int(slot.get("amount", -1)), 40, "stale write changed the open exchange amount")
	assert_true(not bool(slot.get("acked", false)), "open exchange must stay unacked")

	# Ack: both tabs have seen the unacked row. One acks. The other then
	# saves from its old copy. That write must not clear the ack, and must
	# not replace the open exchange that is still unacked on a second slot.
	_wipe_store()
	var tab_a := HubSave.new()
	var tab_b := HubSave.new()
	tab_a.load_all()
	tab_b.load_all()
	assert_true(tab_a.begin_attempt(ZONE_A, 1), "tab A attempt")
	var earn_id := tab_a.current_run_id()
	assert_true(tab_a.commit_earn(earn_id, 15), "tab A earn")
	tab_b.load_all()
	tab_a.ack_earn(earn_id)
	assert_true(bool(_earn_row(earn_id).get("acked", false)), "ack reached the file before the stale write")
	assert_true(tab_a.begin_exchange(30), "exchange slot did not open")
	var exchange_key := str(tab_a.exchange_pending().get("key", ""))
	# B last read the earn before the ack, and has not seen the exchange.
	assert_true(tab_b.begin_attempt(ZONE_B, 2), "stale tab attempt")
	assert_true(tab_b.commit_earn(tab_b.current_run_id(), 8), "stale tab earn")
	var earn_after := _earn_row(earn_id)
	assert_true(earns_has(earn_id), "stale write dropped the acked earn key")
	assert_true(bool(earn_after.get("acked", false)), "stale write cleared an earn ack")
	assert_eq(int(earn_after.get("amount", -1)), 15, "stale write changed the acked earn amount")
	var stale_id := tab_b.current_run_id()
	assert_true(earns_has(stale_id), "stale tab's own earn key was lost")
	assert_eq(int(_earn_row(stale_id).get("amount", -1)), 8, "stale tab earn amount")
	var exchange_after := _exchange_row()
	assert_eq(str(exchange_after.get("key", "")), exchange_key, "stale write replaced the open exchange slot")
	assert_eq(int(exchange_after.get("amount", -1)), 30, "stale write changed the open exchange amount")
	assert_true(not bool(exchange_after.get("acked", false)), "the open exchange must stay unacked")

	# Same shape for an exchange ack. B loaded the open slot, A got a receipt
	# and acked it, then B saves. B's old unacked copy must not clear the ack.
	tab_b.load_all()
	tab_a.ack_exchange()
	assert_true(bool(_exchange_row().get("acked", false)), "exchange ack reached the file")
	assert_true(tab_b.persist_run(), "stale tab rewrote write_keys.json")
	var exchange_acked := _exchange_row()
	assert_eq(str(exchange_acked.get("key", "")), exchange_key, "stale write replaced the acked exchange")
	assert_true(bool(exchange_acked.get("acked", false)), "stale write cleared an exchange ack")

	# Each attempt that is still outstanding is credited once. The acked earn
	# must not be sent again.
	var bridge = _spawn()
	_boot(bridge)
	var sent := _earns(bridge)
	var by_key := {}
	for row in sent:
		by_key[row.key] = int(by_key.get(row.key, 0)) + 1
	assert_eq(int(by_key.get(earn_id, 0)), 0, "acked earn was sent again (%s)" % _ledger(bridge))
	assert_eq(int(by_key.get(stale_id, 0)), 1, "open earn sent %s times" % str(by_key.get(stale_id, 0)))
	var credited := 0
	for row in sent:
		if row.key != stale_id:
			continue
		credited += int(row.amount)
		_reply(row, true, {"balance": int(row.amount), "capped": false})
	assert_eq(credited, 8, "the open attempt was credited once")
	assert_eq(bridge.ticket_balance, 8, "client balance matches that one credit")
	var exchange_sends := _exchanges(bridge)
	assert_eq(exchange_sends.size(), 0, "an acked exchange was resent (%s)" % _ledger(bridge))


# --- Case 4: regressions ----------------------------------------------------


func test_case4_one_earn_key_across_restart_and_respawn() -> void:
	var bridge = _spawn()
	SceneRouter.start_zone("test_zone", 1)
	await physics_frames(2)
	var key := str(bridge._save.current_run_id())
	assert_true(key != "", "start_zone did not mint an earn key")
	assert_eq(_earns(bridge).size(), 0, "starting an attempt must not send earnTickets")
	GameState.add_tickets(4)
	GameState.restart_from_checkpoint()
	assert_eq(str(bridge._save.current_run_id()), key, "restart_from_checkpoint minted a new earn key")
	assert_eq(GameState.tickets, 0, "restart clears the act tickets but not the earn key")
	await physics_frames(1)
	var lives := GameState.lives
	SceneRouter.respawn()
	await physics_frames(2)
	assert_eq(GameState.lives, lives - 1, "respawn did not run")
	assert_eq(str(bridge._save.current_run_id()), key, "respawn minted a new earn key")
	assert_eq(_earns(bridge).size(), 0, "respawn sent an earn (%s)" % _ledger(bridge))
	GameState.add_tickets(4)
	GameState.complete_level()
	var sent := _earns(bridge)
	assert_eq(sent.size(), 1, "one earn for the attempt (%s)" % _ledger(bridge))
	if sent.is_empty():
		return
	assert_eq(sent[0].key, key, "the earn used a different key than the attempt")
	assert_eq(sent[0].amount, 4, "the earn amount is the tickets banked for that attempt")
	# Die, come back, clear again with a different pile. Still the same key.
	await physics_frames(1)
	SceneRouter.respawn()
	await physics_frames(2)
	assert_eq(str(bridge._save.current_run_id()), key, "respawn after a clear minted a new earn key")
	GameState.add_tickets(9)
	GameState.complete_level()
	var again := _earns(bridge)
	assert_eq(again.size(), 2, "the second clear should retry the same pending earn (%s)" % _ledger(bridge))
	if again.size() < 2:
		return
	assert_eq(again[1].key, key, "the second clear used a new key")
	assert_eq(again[1].amount, 4, "the second clear changed the amount")


func test_case4_commit_earn_keeps_the_first_amount() -> void:
	var bridge = _spawn()
	var key := _play_attempt(bridge, ZONE_B, 1, 5)
	var first := _earns(bridge)
	assert_eq(first.size(), 1, "first clear sends one earn")
	if first.is_empty():
		return
	assert_eq(first[0].key, key, "first key")
	assert_eq(first[0].amount, 5, "first amount")
	GameState.restart_from_checkpoint()
	GameState.add_tickets(12)
	GameState.complete_level()
	var second := _earns(bridge)
	assert_eq(second.size(), 2, "second clear retries the pending earn (%s)" % _ledger(bridge))
	if second.size() < 2:
		return
	assert_eq(second[1].key, key, "second clear kept the key")
	assert_eq(second[1].amount, 5, "commit_earn replaced the first amount with 12")
	assert_eq(int(_earn_row(key).get("amount", -1)), 5, "write_keys.json kept the first amount")


func test_case4_failed_persist_sends_nothing() -> void:
	_block_keys_file()
	var bridge = _spawn()
	SceneRouter.set(&"_free_scene", "")
	GameState.start_level(ZONE_B, 1)
	var key := str(bridge._save.current_run_id())
	assert_true(key != "", "the attempt id is minted in memory before the save")
	assert_true(not bridge._save.run_on_disk(), "a blocked write_keys.json must not count as persisted")
	GameState.add_tickets(3)
	GameState.complete_level()
	assert_eq(_earns(bridge).size(), 0, "failed persist sent earnTickets (%s)" % _ledger(bridge))
	assert_eq(str(bridge._save.current_run_id()), key, "failed persist minted a replacement earn key")
	assert_eq(_calls(bridge, "earnTickets").size(), 0, "earnTickets count")
	bridge.reach = "ready"
	bridge.in_session = true
	bridge.exchange(10)
	assert_eq(_exchanges(bridge).size(), 0, "failed persist sent exchange (%s)" % _ledger(bridge))
	assert_true(not bridge.exchange_is_pending(), "a failed exchange persist must not leave a slot")
	# The same attempt id is what a later successful save would send. Nothing
	# new was minted while the file was blocked.
	assert_eq(str(bridge._save.current_run_id()), key, "exchange persist failure minted a new run id")


func test_case4_begin_exchange_does_not_replace_an_unacked_slot() -> void:
	var bridge = _spawn()
	bridge.reach = "ready"
	bridge.in_session = true
	bridge.exchange(20)
	var first := _exchanges(bridge)
	assert_eq(first.size(), 1, "first exchange send (%s)" % _ledger(bridge))
	if first.is_empty():
		return
	assert_eq(first[0].amount, 20, "first exchange amount")
	assert_true(bridge.exchange_is_pending(), "slot stays open until a receipt")
	bridge.exchange(50)
	var second := _exchanges(bridge)
	assert_eq(second.size(), 2, "a second exchange resends the pending slot (%s)" % _ledger(bridge))
	if second.size() < 2:
		return
	assert_eq(second[1].key, first[0].key, "begin_exchange replaced the unacked key")
	assert_eq(second[1].amount, 20, "begin_exchange replaced the unacked amount with 50")
	assert_eq(bridge.pending_exchange_amount(), 20, "pending amount changed")
	var other := HubSave.new()
	other.load_all()
	assert_true(not other.begin_exchange(50), "HubSave.begin_exchange opened a second slot")
	assert_eq(str(_exchange_row().get("key", "")), first[0].key, "the stored exchange key changed")
	assert_eq(int(_exchange_row().get("amount", -1)), 20, "the stored exchange amount changed")


func test_case4_lost_exchange_resends_same_key_and_clears_on_receipt() -> void:
	var bridge = _spawn()
	bridge.reach = "ready"
	bridge.in_session = true
	bridge.session_on = true
	bridge.exchange(30)
	var first := _exchanges(bridge)
	assert_eq(first.size(), 1, "exchange sent once (%s)" % _ledger(bridge))
	if first.is_empty():
		return
	var key: String = first[0].key
	assert_eq(first[0].amount, 30, "exchange amount")
	# Lost response: the callback never runs.
	assert_true(bridge.exchange_is_pending(), "a lost response cleared the slot")
	_boot(bridge)
	var resent := _exchanges(bridge)
	assert_eq(resent.size(), 2, "init should resend the pending exchange (%s)" % _ledger(bridge))
	if resent.size() < 2:
		return
	assert_eq(resent[1].key, key, "init resent a different exchange key")
	assert_eq(resent[1].amount, 30, "init resent a different exchange amount")
	_reply(resent[1], true, {"receiptId": "noop", "verse": 0, "ticketsLeft": 0})
	assert_true(bridge.exchange_is_pending(), "receiptId noop cleared the slot")
	assert_eq(bridge.ticket_balance, 0, "noop credited a ticket balance")
	bridge.exchange(30)
	var after_noop := _exchanges(bridge)
	assert_eq(after_noop.size(), 3, "exchange after noop should resend (%s)" % _ledger(bridge))
	if after_noop.size() < 3:
		return
	assert_eq(after_noop[2].key, key, "resend after noop changed the key")
	_reply(after_noop[2], false, {"code": "rpc_failed", "message": "HTTP 503", "receiptId": "not-a-success"})
	assert_true(bridge.exchange_is_pending(), "rpc_failed cleared the slot")
	_reply_new_exchange(bridge, true, {})
	assert_true(bridge.exchange_is_pending(), "a success without receiptId cleared the slot")
	_reply_new_exchange(bridge, true, {"receiptId": "", "ticketsLeft": 1, "verse": 1})
	assert_true(bridge.exchange_is_pending(), "an empty receiptId cleared the slot")
	assert_eq(bridge.ticket_balance, 0, "a missing receipt credited tickets")
	_reply_new_exchange(bridge, true, {"receiptId": "rcpt-real-1", "ticketsLeft": 70, "verse": 3})
	assert_true(not bridge.exchange_is_pending(), "a real receiptId should clear the slot")
	assert_eq(bridge.ticket_balance, 70, "the receipt credits ticketsLeft once")
	assert_eq(bridge.verse_balance, 3, "the receipt records the verse balance")
	var sends_after := _exchanges(bridge).size()
	_boot(bridge)
	assert_eq(_exchanges(bridge).size(), sends_after, "the following init resent a cleared exchange")
	var fresh = _reload(bridge)
	assert_eq(_exchanges(fresh).size(), 0, "a new init resent a cleared exchange (%s)" % _ledger(fresh))


func test_case4_exchange_panel_stays_disabled_while_pending_and_after_reload() -> void:
	var bridge = _spawn()
	bridge.reach = "ready"
	bridge.in_session = true
	bridge.exchange(20)
	var sent := _exchanges(bridge)
	assert_eq(sent.size(), 1, "pending exchange was not sent (%s)" % _ledger(bridge))
	if sent.is_empty():
		return
	# The response is lost, which is what leaves the slot pending.
	assert_true(HubBridge.exchange_is_pending(), "autoload does not see the pending slot")
	var panel := ExchangePanel.new()
	add_node(panel)
	panel.open_panel()
	_assert_exchange_locked(panel, "while the exchange response is lost")
	var key: String = sent[0].key
	panel._on_confirm()
	panel._step(-HubBridge.TICKETS_PER_VERSE)
	panel._step(HubBridge.TICKETS_PER_VERSE)
	assert_eq(_exchanges(bridge).size(), 1, "a locked panel sent another exchange")
	assert_eq(str(_exchange_row().get("key", "")), key, "a locked panel replaced the exchange key")
	panel.queue_free()
	await physics_frames(1)
	# Reload: the save is read again the way a new boot reads it, and a new
	# panel is built from that file.
	_disconnect_bridge(bridge)
	HubBridge._save.load_all()
	var reloaded := ExchangePanel.new()
	add_node(reloaded)
	reloaded.open_panel()
	_assert_exchange_locked(reloaded, "after reload")
	assert_eq(HubBridge.pending_exchange_amount(), 20, "reload changed the pending amount")
	assert_eq(str(HubBridge._save.exchange_pending().get("key", "")), key, "reload changed the pending key")
	reloaded._on_confirm()
	assert_eq(str(_exchange_row().get("key", "")), key, "confirm after reload replaced the pending key")
	assert_true(HubBridge.exchange_is_pending(), "confirm after reload cleared the slot")


# --- fixtures ---------------------------------------------------------------


func _spawn():
	var bridge = DOUBLE.new()
	bridge.session_on = true
	add_node(bridge)
	_live.append(bridge)
	return bridge


func _boot(bridge) -> void:
	var at: int = bridge.sdk_calls.size()
	bridge._invoke("init", [HubBridge.GAME_ID], bridge._on_init)
	_reply(bridge.sdk_calls[at], true, {"effects": {}, "ticketsCapLeft": 40})


func _reload(bridge):
	_disconnect_bridge(bridge)
	_live.erase(bridge)
	if is_instance_valid(bridge):
		bridge.free()
	var next = _spawn()
	_boot(next)
	return next


func _drop_live() -> void:
	for bridge in _live:
		_disconnect_bridge(bridge)
		if is_instance_valid(bridge):
			bridge.free()
	_live.clear()


func _disconnect_bridge(bridge) -> void:
	if bridge == null or not is_instance_valid(bridge):
		return
	if GameState.level_started.is_connected(bridge._on_level_started):
		GameState.level_started.disconnect(bridge._on_level_started)
	if GameState.level_completed.is_connected(bridge._on_level_completed):
		GameState.level_completed.disconnect(bridge._on_level_completed)


func _play_attempt(bridge, zone: String, act: int, tickets: int) -> String:
	SceneRouter.set(&"_free_scene", "")
	GameState.start_level(zone, act)
	var key := str(bridge._save.current_run_id())
	if tickets > 0:
		GameState.add_tickets(tickets)
		GameState.complete_level()
	return key


func _commit_both_tabs(a_first: bool) -> Dictionary:
	# Both tabs load the file before either earn is committed, then their
	# commits run in the requested order. Each begin_attempt writes immediately;
	# the earn rows land in commit_earn.
	var tab_a := HubSave.new()
	var tab_b := HubSave.new()
	tab_a.load_all()
	tab_b.load_all()
	assert_true(tab_a.begin_attempt(ZONE_A, 1), "tab A begin_attempt")
	assert_true(tab_b.begin_attempt(ZONE_B, 1), "tab B begin_attempt")
	var id_a := tab_a.current_run_id()
	var id_b := tab_b.current_run_id()
	if a_first:
		assert_true(tab_a.commit_earn(id_a, 11), "tab A commit_earn")
		assert_true(tab_b.commit_earn(id_b, 22), "tab B commit_earn")
	else:
		assert_true(tab_b.commit_earn(id_b, 22), "tab B commit_earn")
		assert_true(tab_a.commit_earn(id_a, 11), "tab A commit_earn")
	return {"id_a": id_a, "id_b": id_b}


func _reply(entry: Dictionary, ok: bool, payload: Dictionary) -> void:
	var call: Dictionary = entry["call"] if entry.has("call") else entry
	(call["done"] as Callable).call(ok, payload.duplicate(true))


func _reply_new_exchange(bridge, ok: bool, payload: Dictionary) -> void:
	var before := _exchanges(bridge).size()
	bridge.exchange(30)
	var sent := _exchanges(bridge)
	assert_eq(sent.size(), before + 1, "expected a resend of the pending exchange")
	if sent.size() == before + 1:
		assert_eq(sent[before].key, sent[0].key, "resend changed the exchange key")
		assert_eq(sent[before].amount, 30, "resend changed the exchange amount")
		_reply(sent[before], ok, payload)


func _earns(bridge) -> Array:
	var out: Array = []
	for call in bridge.sdk_calls:
		if str(call.method) != "earnTickets":
			continue
		out.append({
			"call": call,
			"amount": int(call.args[0]),
			"reason": str(call.args[1]),
			"key": str(call.args[2]),
		})
	return out


func _exchanges(bridge) -> Array:
	var out: Array = []
	for call in bridge.sdk_calls:
		if str(call.method) != "exchange":
			continue
		out.append({
			"call": call,
			"amount": int(call.args[0]),
			"key": str(call.args[1]),
		})
	return out


func _calls(bridge, method: String) -> Array:
	var out: Array = []
	for call in bridge.sdk_calls:
		if str(call.method) == method:
			out.append(call)
	return out


func _ledger(bridge) -> String:
	var parts := PackedStringArray()
	for call in bridge.sdk_calls:
		parts.append("%s%s" % [str(call.method), str(call.args)])
	return ", ".join(parts)


func _keys_data() -> Dictionary:
	var save := HubSave.new()
	return save._read_json(HubSave.KEYS_PATH)


func _earn_map() -> Dictionary:
	var earns: Variant = _keys_data().get("earn_by_run", {})
	return earns if earns is Dictionary else {}


func _earn_row(run_id: String) -> Dictionary:
	var row: Variant = _earn_map().get(run_id, {})
	return row if row is Dictionary else {}


func earns_has(run_id: String) -> bool:
	return _earn_map().has(run_id)


func _pending_earn_keys() -> PackedStringArray:
	var save := HubSave.new()
	save.load_all()
	var keys := PackedStringArray()
	for row in save.unacked_earns():
		keys.append(str(row.get("run_id", "")))
	keys.sort()
	return keys


func _exchange_row() -> Dictionary:
	var pending: Variant = _keys_data().get("exchange_pending", {})
	return pending if pending is Dictionary else {}


func _assert_exchange_locked(panel: ExchangePanel, where: String) -> void:
	assert_true(panel._busy, "%s: panel is not marked busy" % where)
	assert_true(panel._confirm.disabled, "%s: EXCHANGE stays enabled" % where)
	assert_true(panel._minus.disabled, "%s: -10 stays enabled" % where)
	assert_true(panel._plus.disabled, "%s: +10 stays enabled" % where)
	assert_eq(panel._status.text, "Exchange pending", "%s: status" % where)
	assert_true(not panel._close.disabled, "%s: CLOSE should stay available" % where)


func _silence_autoload() -> void:
	if GameState.level_started.is_connected(HubBridge._on_level_started):
		GameState.level_started.disconnect(HubBridge._on_level_started)
	if GameState.level_completed.is_connected(HubBridge._on_level_completed):
		GameState.level_completed.disconnect(HubBridge._on_level_completed)


func _restore_autoload() -> void:
	if not GameState.level_started.is_connected(HubBridge._on_level_started):
		GameState.level_started.connect(HubBridge._on_level_started)
	if not GameState.level_completed.is_connected(HubBridge._on_level_completed):
		GameState.level_completed.connect(HubBridge._on_level_completed)


func _reset_autoload_memory() -> void:
	HubBridge._save.load_all()
	HubBridge.reach = "offline"
	HubBridge.in_session = false
	HubBridge.ticket_balance = 0
	HubBridge.balance_known = false
	HubBridge.verse_balance = 0
	HubBridge.verse_known = false
	HubBridge.earn_capped = false
	HubBridge.verse_cap_left = 0
	HubBridge.verse_cap_known = false
	HubBridge.tickets_cap_left = 0
	HubBridge.effects = {}
	HubBridge.time_focus = {}
	HubBridge._receipts = {}


func _wipe_store() -> void:
	var root := DirAccess.open("user://")
	if root == null:
		return
	root.make_dir_recursive("hpos10i")
	var folder := DirAccess.open("user://hpos10i")
	if folder == null:
		return
	if folder.dir_exists("write_keys.json"):
		folder.remove("write_keys.json")
	elif folder.file_exists("write_keys.json"):
		folder.remove("write_keys.json")
	if folder.file_exists("progress.json"):
		folder.remove("progress.json")


func _block_keys_file() -> void:
	_wipe_store()
	var folder := DirAccess.open("user://hpos10i")
	assert_true(folder != null, "user://hpos10i is missing")
	if folder == null:
		return
	var err := folder.make_dir("write_keys.json")
	assert_eq(err, OK, "could not block write_keys.json (error %s)" % err)
