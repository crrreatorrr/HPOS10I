class_name ExchangePanel
extends Control
## Zone-select exchange. 10 Tickets = 1 Verse, at most 50 Verse per game per day.
## HubBridge.exchange talks to window.hubSdk. The local Ticket balance drops
## once per receiptId inside HubBridge.


signal closed

var _amount := HubBridge.TICKETS_PER_VERSE
var _busy := false
var _status_text := ""
var _status_set := false

var _tickets: Label
var _cap: Label
var _worth: Label
var _amount_label: Label
var _status: Label
var _confirm: Button
var _close: Button
var _minus: Button
var _plus: Button


func _ready() -> void:
	_build()
	visible = false
	if not HubBridge.state_changed.is_connected(_on_state):
		HubBridge.state_changed.connect(_on_state)
	if not HubBridge.exchange_settled.is_connected(_on_settled):
		HubBridge.exchange_settled.connect(_on_settled)


func open_panel() -> void:
	visible = true
	_clamp_amount()
	if not _status_set:
		_status_text = _default_status()
	_refresh()
	if _confirm.disabled:
		_close.grab_focus()
	else:
		_confirm.grab_focus()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed(&"ui_cancel") or event.is_action_pressed(&"pause"):
		get_viewport().set_input_as_handled()
		_close_panel()


func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.09, 0.78)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(250, 0)
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", 3)
	panel.add_child(box)
	var title := Label.new()
	title.theme_type_variation = &"HeaderLabel"
	title.text = "EXCHANGE"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	box.add_child(_line("10 Tickets = 1 Verse", &"HudLabel"))
	_cap = _line("", &"HudValue")
	box.add_child(_cap)
	_tickets = _line("", &"HudLabel")
	box.add_child(_tickets)
	var stepper := HBoxContainer.new()
	stepper.alignment = BoxContainer.ALIGNMENT_CENTER
	stepper.add_theme_constant_override(&"separation", 6)
	box.add_child(stepper)
	_minus = _button("-10")
	_amount_label = _line("10", &"HudLabel")
	_amount_label.custom_minimum_size = Vector2(36, 0)
	_amount_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_plus = _button("+10")
	stepper.add_child(_minus)
	stepper.add_child(_amount_label)
	stepper.add_child(_plus)
	_minus.pressed.connect(_step.bind(-HubBridge.TICKETS_PER_VERSE))
	_plus.pressed.connect(_step.bind(HubBridge.TICKETS_PER_VERSE))
	_worth = _line("", &"HudValue")
	_worth.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_worth)
	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override(&"separation", 6)
	box.add_child(actions)
	_confirm = _button("EXCHANGE")
	_close = _button("CLOSE")
	actions.add_child(_confirm)
	actions.add_child(_close)
	_confirm.pressed.connect(_on_confirm)
	_close.pressed.connect(_close_panel)
	_status = _line("", &"HudValue")
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.custom_minimum_size = Vector2(230, 0)
	box.add_child(_status)


func _line(text: String, variation: StringName) -> Label:
	var label := Label.new()
	label.theme_type_variation = variation
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return label


func _button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(64, 20)
	return button


func _step(delta: int) -> void:
	if _busy:
		return
	_amount += delta
	_clamp_amount()
	_refresh()


func _clamp_amount() -> void:
	var step := HubBridge.TICKETS_PER_VERSE
	var cap_tickets := HubBridge.VERSE_DAILY_CAP * step
	var max_amount := cap_tickets
	if HubBridge.balance_known:
		max_amount = mini(cap_tickets, int(HubBridge.ticket_balance / float(step)) * step)
	if max_amount < step:
		_amount = 0
		return
	_amount = clampi(_amount, step, max_amount)


func _on_confirm() -> void:
	if _busy or _confirm.disabled:
		return
	_busy = true
	_status_set = true
	_status_text = "Exchanging…"
	_refresh()
	HubBridge.exchange(_amount)


func _on_settled(ok: bool, payload: Dictionary) -> void:
	_busy = false
	_status_set = true
	if ok:
		var verse := int(payload.get("verse", 0))
		var left := int(payload.get("ticketsLeft", 0))
		var receipt := str(payload.get("receiptId", ""))
		_status_text = "Verse balance %d. Tickets left %d.\nReceipt %s" % [verse, left, receipt]
	else:
		_status_text = _error_text(payload)
	if visible:
		_clamp_amount()
		_refresh()


func _on_state() -> void:
	if not _status_set:
		_status_text = _default_status()
	if visible:
		_clamp_amount()
		_refresh()


func _refresh() -> void:
	if _cap == null:
		return
	var cap_text := "Daily cap: %d Verse per game" % HubBridge.VERSE_DAILY_CAP
	if HubBridge.reach == "ready" and HubBridge.in_session:
		cap_text += "\nTicket earn room today: %d" % HubBridge.tickets_cap_left
		if HubBridge.earn_capped:
			cap_text += " (reached)"
	_cap.text = cap_text
	if HubBridge.balance_known:
		_tickets.text = "Tickets: %d" % HubBridge.ticket_balance
	elif HubBridge.in_session:
		_tickets.text = "Tickets: not reported yet"
	else:
		_tickets.text = "Tickets: —"
	_amount_label.text = str(_amount)
	var verse := int(_amount / float(HubBridge.TICKETS_PER_VERSE)) if _amount > 0 else 0
	_worth.text = "Worth %d Verse" % verse
	_status.text = _status_text
	var can := not _busy and HubBridge.reach == "ready" and HubBridge.in_session and _amount >= HubBridge.TICKETS_PER_VERSE
	if HubBridge.balance_known and HubBridge.ticket_balance < _amount:
		can = false
	_confirm.disabled = not can
	_minus.disabled = _busy or _amount <= HubBridge.TICKETS_PER_VERSE
	var step := HubBridge.TICKETS_PER_VERSE
	var cap_tickets := HubBridge.VERSE_DAILY_CAP * step
	var max_amount := cap_tickets
	if HubBridge.balance_known:
		max_amount = mini(cap_tickets, int(HubBridge.ticket_balance / float(step)) * step)
	_plus.disabled = _busy or _amount + step > max_amount


func _default_status() -> String:
	match HubBridge.reach:
		"pending":
			return "Connecting to the hub…"
		"offline":
			return "Standalone play. Exchange needs a hub session."
		_:
			if not HubBridge.in_session:
				return "No hub session. Open this game from the hub to exchange."
			if not HubBridge.balance_known:
				return "Banked Tickets show here after a level is cleared."
			return "Exchange banked Tickets for Verse."


func _error_text(payload: Dictionary) -> String:
	var code := str(payload.get("code", ""))
	match code:
		"verse_cap":
			return "Daily Verse cap reached (%d per game)." % HubBridge.VERSE_DAILY_CAP
		"insufficient_tickets":
			return "Not enough Tickets."
		"below_rate":
			return "Need at least %d Tickets for 1 Verse." % HubBridge.TICKETS_PER_VERSE
		"offline":
			return str(payload.get("message", "Open this game from the hub to exchange."))
		_:
			var message := str(payload.get("message", ""))
			return message if message != "" else "Exchange failed."


func _close_panel() -> void:
	visible = false
	closed.emit()
