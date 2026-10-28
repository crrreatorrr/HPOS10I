class_name PlayerArea
extends Area2D
## An Area2D that keeps track of the player hitboxes touching it (mask bit 5,
## docs/CONTRACTS.md). Objects and enemies extend it and read
## players_inside() every physics frame, so a touch that starts while the
## player can't use the object (hurt, invincible, airborne...) still counts
## once he can, and nothing depends on enter/exit signal order.

signal player_entered(player: Player)
signal player_exited(player: Player)

const LAYER_PLAYER := Layers.PLAYER
const LAYER_ENEMIES := Layers.ENEMIES
const LAYER_OBJECTS := Layers.OBJECTS
const LAYER_HAZARDS := Layers.HAZARDS

## Player instance id -> Player.
var _inside := {}


func _notification(what: int) -> void:
	if what == NOTIFICATION_READY:
		collision_mask = LAYER_PLAYER
		monitoring = true
		if not area_entered.is_connected(_on_area_entered):
			area_entered.connect(_on_area_entered)
			area_exited.connect(_on_area_exited)


## Players overlapping this area right now.
func players_inside() -> Array[Player]:
	var out: Array[Player] = []
	for id: int in _inside.keys():
		var player := instance_from_id(id) as Player
		if player == null or not is_instance_valid(player) or not player.is_inside_tree():
			_inside.erase(id)
			continue
		out.append(player)
	return out


func _on_area_entered(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player == null:
		return
	_inside[player.get_instance_id()] = player
	player_entered.emit(player)


func _on_area_exited(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player == null:
		return
	_inside.erase(player.get_instance_id())
	player_exited.emit(player)
