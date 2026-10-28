class_name EmeraldIcon
extends Node2D
## The act-clear emerald as a flat icon spinning around its vertical axis,
## drawn centred on this node. Used by the tally (big) and the zone select
## (small slots).
##
## The face is squashed to width = size x |cos(phase)|, rounded to an even
## number of whole pixels so the columns stay crisp and the icon keeps its
## centre. Past edge-on (cos < 0) the back shows: the same face mirrored and
## darkened. Near edge-on a 2 px green-and-gold strip keeps it from vanishing.
## Uses Emeralds.icon(); until the art exists, a procedural faceted gem.

const BIG_SIZE := 48
const SMALL_SIZE := 16
## Below this width the icon is drawn as the edge strip.
const EDGE_WIDTH := 2
const BACK_TINT := Color(0.65, 0.65, 0.65)
## An empty slot: the gem's silhouette, dark and see-through.
const EMPTY_TINT := Color(0.12, 0.14, 0.3, 0.75)
const EDGE_GREEN := Color8(40, 170, 90)
const EDGE_GOLD := Color8(250, 204, 72)
const BOB_HZ := 0.6
const SPARKLE_SECONDS := 0.7
const SPARKLE_COLOR := Color(1.0, 1.0, 0.9)

## Turns per second.
@export var spin_speed := 1.0
## 16 px slot icon instead of the 48 px face.
@export var small := false
## Gentle up-and-down float.
@export var bob := true
## Draw an empty slot (dim outline) instead of the gem.
@export var empty := false

## Spin angle in radians; 0 = face-on.
var phase := 0.0

var _clock := 0.0
var _texture: Texture2D
var _texture_small := false
var _sparkle_left := 0.0
var _sparkle_points: Array[Vector2] = []

static var _placeholders := {}


func _process(delta: float) -> void:
	if spin_speed != 0.0 and not empty:
		phase = fmod(phase + TAU * spin_speed * delta, TAU)
	_clock += delta
	if _sparkle_left > 0.0:
		_sparkle_left = maxf(0.0, _sparkle_left - delta)
	queue_redraw()


## Twinkles around the gem for a moment (when it is first shown).
func sparkle() -> void:
	_sparkle_left = SPARKLE_SECONDS
	_sparkle_points.clear()
	var r := face_size() * 0.6
	for i in 6:
		var angle := TAU * i / 6.0 + 0.4
		_sparkle_points.append(Vector2(cos(angle), sin(angle)) * r * (0.8 + 0.25 * (i % 2)))


func face_size() -> int:
	return SMALL_SIZE if small else BIG_SIZE


## Width of the face in whole pixels for the current phase: even, never 0.
func face_width() -> int:
	return width_for(phase, face_size())


static func width_for(angle: float, size: int) -> int:
	var even := 2 * roundi(size * absf(cos(angle)) * 0.5)
	return maxi(EDGE_WIDTH, even)


func is_back_face() -> bool:
	return cos(phase) < 0.0


func is_edge_on() -> bool:
	return face_width() <= EDGE_WIDTH


## The face texture: the director's art when it exists, else a placeholder.
func face_texture() -> Texture2D:
	if _texture == null or _texture_small != small:
		_texture_small = small
		var art := Emeralds.icon(small)
		_texture = art if art != null else placeholder_texture(face_size())
	return _texture


func _bob_offset() -> float:
	if not bob:
		return 0.0
	var amplitude := 1.0 if small else 2.0
	return roundf(sin(_clock * TAU * BOB_HZ) * amplitude)


func _draw() -> void:
	var size := face_size()
	var top := -size / 2.0 + _bob_offset()
	if empty:
		# A dark gem-shaped hollow, face-on and still.
		draw_texture_rect(face_texture(), Rect2(-size * 0.5, top, size, size), false, EMPTY_TINT)
		return
	var width := face_width()
	if width <= EDGE_WIDTH:
		var strip_top := top + 2
		var strip_h := size - 4
		draw_rect(Rect2(-1, strip_top, 1, strip_h), EDGE_GREEN)
		draw_rect(Rect2(0, strip_top, 1, strip_h), EDGE_GOLD)
	else:
		var rect := Rect2(-width * 0.5, top, width, size)
		if is_back_face():
			# Mirror around the vertical axis, darkened.
			draw_set_transform(Vector2.ZERO, 0.0, Vector2(-1, 1))
			draw_texture_rect(face_texture(), rect, false, BACK_TINT)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			draw_texture_rect(face_texture(), rect, false)
	if _sparkle_left > 0.0:
		var t := _sparkle_left / SPARKLE_SECONDS
		var color := SPARKLE_COLOR
		color.a = t
		for i in _sparkle_points.size():
			var p := (_sparkle_points[i] * (1.2 - 0.2 * t)).round() + Vector2(0, roundf(top + size / 2.0))
			var arm := 2.0 if (i + int(_clock * 12.0)) % 2 == 0 else 1.0
			draw_rect(Rect2(p.x - arm, p.y, arm * 2 + 1, 1), color)
			draw_rect(Rect2(p.x, p.y - arm, 1, arm * 2 + 1), color)


## A faceted green gem disc, size x size, lit from the top-left (cached).
static func placeholder_texture(size: int) -> ImageTexture:
	if _placeholders.has(size):
		return _placeholders[size]
	var image := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	var c := (size - 1) / 2.0
	var r := size / 2.0 - 0.5
	var outline := Color8(16, 40, 34)
	var table := Color8(120, 236, 160)
	var light := Vector2(-0.7, -0.7).normalized()
	for y in size:
		for x in size:
			var d := Vector2(x - c, y - c)
			var dist := d.length()
			if dist > r:
				continue
			if dist > r - 1.2:
				image.set_pixel(x, y, outline)
				continue
			var color: Color
			if dist < r * 0.42:
				color = table
			else:
				# Eight facets around the table, shaded by how much each faces
				# the light.
				var sector := posmod(roundi(atan2(d.y, d.x) / (TAU / 8.0)), 8)
				var normal := Vector2.from_angle(sector * TAU / 8.0)
				var lit := clampf(0.55 + 0.45 * normal.dot(light), 0.2, 1.0)
				color = Color8(30, 120, 70).lerp(Color8(90, 220, 130), lit)
				if dist > r * 0.8:
					color = color.darkened(0.18)
			image.set_pixel(x, y, color)
	# A small white glint on the upper-left facet.
	var glint := Vector2i(roundi(c - r * 0.45), roundi(c - r * 0.45))
	image.set_pixelv(glint, Color.WHITE)
	if size >= 32:
		image.set_pixelv(glint + Vector2i(1, 0), Color(1, 1, 1, 0.8))
		image.set_pixelv(glint + Vector2i(0, 1), Color(1, 1, 1, 0.8))
	var tex := ImageTexture.create_from_image(image)
	_placeholders[size] = tex
	return tex
