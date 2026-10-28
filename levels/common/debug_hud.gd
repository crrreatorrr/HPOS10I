extends CanvasLayer
## Minimal stand-in HUD (LevelRoot adds it while res://ui/hud/hud.tscn does
## not exist): golden tickets, time and score in the top-left corner.

const TICKET_ICON_OFFSET := Vector2(10, 11)

var _label: Label
var _icon: Node2D


func _ready() -> void:
	layer = 10
	_icon = _TicketIcon.new()
	_icon.position = TICKET_ICON_OFFSET
	add_child(_icon)
	_label = Label.new()
	_label.position = Vector2(20, 3)
	_label.add_theme_font_size_override(&"font_size", 10)
	_label.add_theme_color_override(&"font_color", Color(1.0, 0.95, 0.75))
	_label.add_theme_color_override(&"font_outline_color", Color(0.08, 0.06, 0.14))
	_label.add_theme_constant_override(&"outline_size", 4)
	add_child(_label)
	_refresh()


func _process(_delta: float) -> void:
	_refresh()


func _refresh() -> void:
	var minutes := floori(GameState.level_time / 60.0)
	var seconds := floori(GameState.level_time) % 60
	_label.text = "%d   TIME %d:%02d   SCORE %d" % [GameState.tickets, minutes, seconds, GameState.score]


class _TicketIcon:
	extends Node2D

	func _draw() -> void:
		ScatteredTicket.draw_ticket(self, 1.0)
