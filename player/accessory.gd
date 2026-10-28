extends Node2D
## Zone accessory drawn on Sproto's head: `SceneRouter.current_zone().accessory`
## is "", "wizard_hat" or "sunglasses". Uses the art agent's frames when they
## exist, else a placeholder (purple pointed wizard hat, black sunglasses bar).
## Positioned from `anchors.json` "head" points when available, otherwise from
## the placeholder's head_point(). Child of the visual node, so it mirrors and
## rotates with the body.

const ANCHORS_PATH := "res://assets/sprites/common/sproto/anchors.json"
const FRAMES_PATHS := {
	"wizard_hat": "res://assets/sprites/z2_wizard_academy/wizard_hat/wizard_hat_frames.tres",
	"sunglasses": "res://assets/sprites/z3_capital_mansion/sunglasses/sunglasses_frames.tres",
}
## Frame cells are 64x64; anchor points are in cell pixels.
const CELL_CENTER := Vector2(32.0, 32.0)

const HAT := Color(0.5, 0.22, 0.75)
const HAT_DARK := Color(0.32, 0.12, 0.5)
const STAR := Color(1.0, 0.85, 0.3)
const GLASSES := Color(0.04, 0.04, 0.06)
const GLINT := Color(0.55, 0.6, 0.75)

var accessory := ""

var _player: Player
var _visual: Node2D
var _anchors := {}
var _sprite: AnimatedSprite2D


func _ready() -> void:
	_visual = get_parent() as Node2D
	_player = _visual.get_parent() as Player
	if FileAccess.file_exists(ANCHORS_PATH):
		var data = JSON.parse_string(FileAccess.get_file_as_string(ANCHORS_PATH))
		if data is Dictionary:
			_anchors = data
	refresh()


## Re-reads the zone's accessory (called on ready; call again after a zone change).
func refresh() -> void:
	set_accessory(str(SceneRouter.current_zone().get("accessory", "")))


## Shows `id` ("", "wizard_hat" or "sunglasses") regardless of the zone.
func set_accessory(id: String) -> void:
	accessory = id
	if _sprite != null:
		_sprite.queue_free()
		_sprite = null
	var path: String = FRAMES_PATHS.get(accessory, "")
	if path != "" and ResourceLoader.exists(path):
		var frames := load(path) as SpriteFrames
		if frames != null and not frames.get_animation_names().is_empty():
			_sprite = AnimatedSprite2D.new()
			_sprite.sprite_frames = frames
			_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			add_child(_sprite)
			_sprite.play(frames.get_animation_names()[0])
	visible = accessory != ""
	queue_redraw()


func _process(_delta: float) -> void:
	if accessory == "" or _player == null:
		return
	position = _head_point()
	queue_redraw()


## Head centre in the visual's local space.
func _head_point() -> Vector2:
	var sprite := _visual.get_node_or_null("Sprite") as AnimatedSprite2D
	if sprite != null:
		var point = _anchor_for(String(sprite.animation), sprite.frame)
		if point is Vector2:
			return sprite.position + point - CELL_CENTER
	return _visual.head_point()


## Reads a "head" point from anchors.json. Accepts the layouts
## {anim: [{head: [x, y]}, ...]}, {head: {anim: [[x, y], ...]}} and
## {animations|frames: {anim: [{head: ...}]}}; points as [x, y] or {x, y}.
func _anchor_for(anim: String, frame: int) -> Variant:
	var candidates: Array = []
	for root in [_anchors, _anchors.get("animations", {}), _anchors.get("frames", {})]:
		if root is Dictionary and root.get(anim) is Array:
			var list: Array = root[anim]
			if frame < list.size() and list[frame] is Dictionary:
				candidates.append(list[frame].get("head"))
	var head = _anchors.get("head")
	if head is Dictionary and head.get(anim) is Array and frame < head[anim].size():
		candidates.append(head[anim][frame])
	for value in candidates:
		if value is Array and value.size() >= 2:
			return Vector2(float(value[0]), float(value[1]))
		if value is Dictionary and value.has("x") and value.has("y"):
			return Vector2(float(value.x), float(value.y))
	return null


func _draw() -> void:
	if _sprite != null:
		return
	match accessory:
		"wizard_hat":
			# Brim on the crown of the head, between the tufts.
			var brim := PackedVector2Array()
			for i in 16:
				var t := TAU * i / 16.0
				brim.append(Vector2(cos(t) * 9.5, -8.0 + sin(t) * 2.0))
			draw_colored_polygon(brim, HAT_DARK)
			var cone := PackedVector2Array([Vector2(-6.0, -8.5), Vector2(6.0, -8.5),
					Vector2(-1.0, -19.0), Vector2(-7.0, -23.0)])
			draw_colored_polygon(cone, HAT)
			draw_circle(Vector2(0.0, -13.0), 1.3, STAR)
		"sunglasses":
			# Over the two eyes (centres (1, -2) and (5.5, -2) from the head centre).
			draw_rect(Rect2(-2.5, -3.8, 12.0, 1.4), GLASSES)
			draw_rect(Rect2(-2.0, -4.6, 6.0, 4.6), GLASSES)
			draw_rect(Rect2(3.2, -4.4, 4.8, 4.2), GLASSES)
			draw_line(Vector2(-1.0, -3.6), Vector2(1.0, -3.6), GLINT, 1.0)
