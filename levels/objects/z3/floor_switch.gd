extends PlayerArea
## A floor switch (Capital Mansion): a brass plate in the floor that Sproto
## presses by stepping (or landing) on it; its sensor reaches `trigger_height`
## px up, so running or jumping across the plate presses it too. It opens the doors at `doors`
## (NodePaths to door.gd nodes), plays `menu_select` as its click and stays
## pressed. The origin is the plate's centre, on the floor. Node names should
## contain "switch" (QA's lint counts doors and switches for R4).

signal pressed

const PLATE := Color(0.95, 0.8, 0.4)
const PLATE_DARK := Color(0.6, 0.48, 0.2)
const FRAME := Color(0.3, 0.32, 0.4)
const OUTLINE := Color(0.08, 0.08, 0.12)

@export var doors: Array[NodePath] = []
@export var width := 32.0
@export var trigger_height := 96.0

var is_pressed := false


func _ready() -> void:
	collision_layer = LAYER_OBJECTS
	monitorable = false
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(width, trigger_height + 2.0)
	shape.shape = rect
	shape.position = Vector2(0.0, -trigger_height / 2.0 + 1.0)
	add_child(shape)


func _physics_process(_delta: float) -> void:
	if is_pressed:
		return
	for player in players_inside():
		if player.state != &"dead":
			press()
			return


func press() -> void:
	if is_pressed:
		return
	is_pressed = true
	Audio.play_sfx(&"menu_select")
	for path in doors:
		var door := get_node_or_null(path)
		if door != null and door.has_method(&"open"):
			door.call(&"open")
	pressed.emit()
	queue_redraw()


func _draw() -> void:
	var half := width / 2.0
	var h := 2.0 if is_pressed else 5.0
	draw_rect(Rect2(-half - 2.0, -7.0, width + 4.0, 7.0), OUTLINE)
	draw_rect(Rect2(-half - 1.0, -6.0, width + 2.0, 6.0), FRAME)
	draw_rect(Rect2(-half + 1.0, -h, width - 2.0, h), PLATE_DARK)
	draw_rect(Rect2(-half + 1.0, -h, width - 2.0, 1.0), PLATE)
	if not is_pressed:
		# A faint light column over the plate: the sensor.
		draw_rect(Rect2(-half + 4.0, -trigger_height, width - 8.0, trigger_height - 6.0), Color(PLATE, 0.12))
