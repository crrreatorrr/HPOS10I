class_name PlaceholderBackdrop
extends RefCounted
## Placeholder parallax art drawn in code, used by LevelRoot while
## res://assets/backgrounds/<zone_id>/ has no layer files. Four layers like the
## real art: 1 far (sky, full screen height), 2 distant, 3 mid and 4 near
## (shorter, transparent above their shapes, bottom-aligned by LevelRoot).
## Every layer tiles horizontally (all shapes use whole periods of WIDTH).
## Drawing all four takes a few milliseconds, so nothing is cached (a static
## texture cache would outlive the scene tree and leak at exit).

const WIDTH := 512
const HEIGHTS: Array[int] = [240, 128, 96, 56]

const STYLES := {
	"hills": {
		sky_top = Color(0.31, 0.56, 0.95), sky_bottom = Color(0.74, 0.9, 1.0),
		sun = Color(1.0, 0.95, 0.7), cloud = Color(1.0, 1.0, 1.0), cloud_shade = Color(0.84, 0.92, 1.0),
		distant = Color(0.45, 0.72, 0.78), distant_rim = Color(0.62, 0.85, 0.86),
		mid = Color(0.24, 0.58, 0.36), mid_rim = Color(0.38, 0.72, 0.42), trunk = Color(0.42, 0.28, 0.18),
		near = Color(0.15, 0.42, 0.24), near_rim = Color(0.3, 0.6, 0.32), accent = Color(1.0, 0.86, 0.35),
	},
	"academy": {
		sky_top = Color(0.08, 0.05, 0.2), sky_bottom = Color(0.4, 0.25, 0.52),
		sun = Color(0.95, 0.93, 0.8), cloud = Color(0.5, 0.38, 0.62), cloud_shade = Color(0.36, 0.26, 0.48),
		distant = Color(0.22, 0.15, 0.36), distant_rim = Color(0.36, 0.26, 0.52),
		mid = Color(0.17, 0.11, 0.27), mid_rim = Color(0.3, 0.2, 0.42), trunk = Color(0.95, 0.8, 0.4),
		near = Color(0.12, 0.2, 0.18), near_rim = Color(0.22, 0.34, 0.28), accent = Color(0.95, 0.8, 0.4),
	},
	"mansion": {
		sky_top = Color(0.96, 0.55, 0.34), sky_bottom = Color(1.0, 0.88, 0.6),
		sun = Color(1.0, 0.97, 0.82), cloud = Color(1.0, 0.8, 0.66), cloud_shade = Color(0.94, 0.66, 0.52),
		distant = Color(0.5, 0.46, 0.62), distant_rim = Color(0.64, 0.6, 0.74),
		mid = Color(0.3, 0.32, 0.5), mid_rim = Color(0.86, 0.84, 0.78), trunk = Color(1.0, 0.9, 0.55),
		near = Color(0.16, 0.36, 0.22), near_rim = Color(0.28, 0.5, 0.3), accent = Color(0.95, 0.95, 0.9),
	},
	"neon": {
		sky_top = Color(0.03, 0.01, 0.08), sky_bottom = Color(0.26, 0.04, 0.3),
		sun = Color(1.0, 0.35, 0.75), cloud = Color(0.2, 0.05, 0.28), cloud_shade = Color(0.12, 0.03, 0.2),
		distant = Color(0.08, 0.03, 0.14), distant_rim = Color(1.0, 0.25, 0.75),
		mid = Color(0.05, 0.05, 0.12), mid_rim = Color(0.2, 0.95, 1.0), trunk = Color(0.2, 0.95, 1.0),
		near = Color(0.04, 0.02, 0.08), near_rim = Color(1.0, 0.3, 0.8), accent = Color(0.2, 0.95, 1.0),
	},
}
const ZONE_STYLES := {
	"test_zone": "hills",
	"z1_retro_rush_hills": "hills",
	"z2_wizard_academy": "academy",
	"z3_capital_mansion": "mansion",
	"z4_neon_rush_remix": "neon",
}

## Texture for layer `index` (0 far .. 3 near) of `zone_id`'s placeholder.
static func layer_texture(zone_id: String, index: int) -> Texture2D:
	var style: String = ZONE_STYLES.get(zone_id, "hills")
	return ImageTexture.create_from_image(draw_layer(style, index))


static func draw_layer(style_name: String, index: int) -> Image:
	var s: Dictionary = STYLES.get(style_name, STYLES.hills)
	var image := Image.create(WIDTH, HEIGHTS[index], false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	match index:
		0:
			_draw_sky(image, s, style_name)
		1:
			if style_name == "academy" or style_name == "mansion":
				_draw_skyline(image, s, style_name == "academy", 7)
			else:
				_draw_ridge(image, s.distant, s.distant_rim, 0.55, [2, 5, 9], [22.0, 9.0, 4.0])
		2:
			if style_name == "hills":
				_draw_trees(image, s)
			else:
				_draw_skyline(image, s, style_name == "academy", 13, true)
		3:
			_draw_bushes(image, s)
	return image


# --- Layers ----------------------------------------------------------------------

## Banded vertical gradient (retro steps), a sun or moon, and clouds or stars.
static func _draw_sky(image: Image, s: Dictionary, style_name: String) -> void:
	var h := image.get_height()
	var bands := 12
	for y in h:
		var t := floorf(float(y) / h * bands) / (bands - 1)
		image.fill_rect(Rect2i(0, y, WIDTH, 1), s.sky_top.lerp(s.sky_bottom, clampf(t, 0.0, 1.0)))
	_disc(image, 380, 54, 18, s.sun)
	if style_name == "academy" or style_name == "neon":
		var rng := RandomNumberGenerator.new()
		rng.seed = 7
		for i in 60:
			var x := rng.randi_range(0, WIDTH - 1)
			var y := rng.randi_range(0, h * 2 / 3)
			image.set_pixel(x, y, s.sun.lerp(Color.WHITE, 0.5) if i % 3 else s.accent)
		if style_name == "academy":
			_disc(image, 387, 49, 15, s.sky_top.lerp(s.sky_bottom, 0.25))  # crescent
	else:
		for c in [[60, 70, 1.0], [170, 40, 0.8], [270, 96, 1.2], [440, 120, 0.9]]:
			_cloud(image, c[0], c[1], c[2], s.cloud, s.cloud_shade)


## Rolling hill silhouette: a sum of sines with whole periods across WIDTH.
static func _draw_ridge(image: Image, color: Color, rim: Color, base: float, freqs: Array, amps: Array) -> void:
	var h := image.get_height()
	for x in WIDTH:
		var y := h * base
		for i in freqs.size():
			y -= amps[i] * sin(TAU * freqs[i] * x / WIDTH + i * 1.7)
		var top := clampi(roundi(y), 0, h - 1)
		image.fill_rect(Rect2i(x, top, 1, h - top), color)
		image.fill_rect(Rect2i(x, top, 1, 2), rim)


## Rows of towers (academy spires) or blocks (mansion city), with lit windows.
static func _draw_skyline(image: Image, s: Dictionary, spires: bool, seed_value: int, front := false) -> void:
	var h := image.get_height()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var color: Color = s.mid if front else s.distant
	var rim: Color = s.mid_rim if front else s.distant_rim
	var x := 0
	while x < WIDTH:
		var w := rng.randi_range(18, 40) if not front else rng.randi_range(14, 22)
		w = mini(w, WIDTH - x)
		var top := rng.randi_range(h / 4, h * 2 / 3) if not front else rng.randi_range(h / 3, h / 2)
		image.fill_rect(Rect2i(x, top, w, h - top), color)
		image.fill_rect(Rect2i(x, top, w, 1), rim)
		if spires:
			for k in w / 2:
				image.fill_rect(Rect2i(x + k, top - (k * 3) / 2, w - 2 * k, 1), color)
		for wy in range(top + 6, h - 6, 10):
			for wx in range(x + 4, x + w - 4, 7):
				if rng.randf() < 0.55:
					image.fill_rect(Rect2i(wx, wy, 2, 3), s.accent)
		x += w + rng.randi_range(4, 14)


## Round-topped trees on a low hedge line.
static func _draw_trees(image: Image, s: Dictionary) -> void:
	var h := image.get_height()
	_draw_ridge_into(image, s.mid, s.mid_rim, h - 22, [3, 7], [5.0, 2.0])
	for t in [[30, 26], [118, 34], [196, 22], [300, 30], [372, 24], [455, 32]]:
		var cx: int = t[0]
		var r: int = t[1] / 2 + 6
		var top: int = h - 22 - t[1]
		image.fill_rect(Rect2i(cx - 2, top + r, 5, h - top - r), s.trunk)
		_disc(image, cx, top + r / 2, r, s.mid)
		_disc(image, cx - r / 3, top + r / 3, r / 2, s.mid_rim)


## Foreground bushes along the bottom edge, with a few accent flowers.
static func _draw_bushes(image: Image, s: Dictionary) -> void:
	var h := image.get_height()
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	_draw_ridge_into(image, s.near, s.near_rim, h - 12, [4, 11], [3.0, 2.0])
	var x := 8
	while x < WIDTH:
		var r := rng.randi_range(10, 18)
		_disc(image, x, h - 8, r, s.near)
		_disc(image, x - r / 3, h - 8 - r / 3, r / 2, s.near_rim)
		if rng.randf() < 0.5:
			image.fill_rect(Rect2i(wrapi(x + r / 2, 0, WIDTH), h - 14, 2, 2), s.accent)
		x += r + rng.randi_range(14, 40)


# --- Helpers ---------------------------------------------------------------------

static func _draw_ridge_into(image: Image, color: Color, rim: Color, base: int, freqs: Array, amps: Array) -> void:
	var h := image.get_height()
	for x in WIDTH:
		var y := float(base)
		for i in freqs.size():
			y -= amps[i] * sin(TAU * freqs[i] * x / WIDTH + i)
		var top := clampi(roundi(y), 0, h - 1)
		image.fill_rect(Rect2i(x, top, 1, h - top), color)
		image.fill_rect(Rect2i(x, top, 1, 1), rim)


## Filled disc, wrapped horizontally so layers tile.
static func _disc(image: Image, cx: int, cy: int, r: int, color: Color) -> void:
	var h := image.get_height()
	for dy in range(-r, r + 1):
		var y := cy + dy
		if y < 0 or y >= h:
			continue
		var half := floori(sqrt(float(r * r - dy * dy)))
		for shift: int in [-WIDTH, 0, WIDTH]:
			var x0: int = cx - half + shift
			var x1: int = cx + half + shift
			x0 = maxi(x0, 0)
			x1 = mini(x1, WIDTH - 1)
			if x1 >= x0:
				image.fill_rect(Rect2i(x0, y, x1 - x0 + 1, 1), color)


static func _cloud(image: Image, cx: int, cy: int, scale_value: float, color: Color, shade: Color) -> void:
	for puff in [[-18, 4, 10], [0, 0, 14], [18, 3, 11], [32, 6, 8]]:
		_disc(image, cx + roundi(puff[0] * scale_value), cy + roundi(puff[1] * scale_value) + 2, roundi(puff[2] * scale_value), shade)
	for puff in [[-18, 4, 10], [0, 0, 14], [18, 3, 11], [32, 6, 8]]:
		_disc(image, cx + roundi(puff[0] * scale_value), cy + roundi(puff[1] * scale_value), roundi(puff[2] * scale_value) - 1, color)
