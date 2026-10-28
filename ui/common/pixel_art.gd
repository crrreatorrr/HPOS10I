class_name PixelArt
extends RefCounted
## Small pixel-art icons drawn in code (one character per pixel), turned into
## nearest-filtered textures once and cached. Used by the HUD and menus until
## the art agent's sprites exist.

## Shared palette. Outlines are dark navy, never pure black (art direction).
const PALETTE := {
	"o": Color8(24, 20, 48),
	"b": Color8(44, 104, 236),
	"B": Color8(28, 64, 170),
	"y": Color8(255, 216, 56),
	"Y": Color8(220, 156, 28),
	"w": Color8(255, 255, 255),
	"s": Color8(255, 255, 255),
	"k": Color8(20, 18, 40),
	"r": Color8(232, 44, 52),
	"R": Color8(150, 22, 40),
	"p": Color8(255, 160, 160),
	"g": Color8(255, 214, 64),
	"G": Color8(214, 140, 24),
	"h": Color8(255, 244, 170),
}

## Sproto's head for the lives counter: soft tufts, blue/yellow split face,
## big round eyes, red clown nose and a wide open grin.
const SPROTO_HEAD := [
	".....oo..oo.....",
	"....obbooyyo....",
	"...obbbbyyyyo...",
	"..obwwbbyywwyo..",
	".obwwwwbywwwwyo.",
	"obbwskwbywskwyyo",
	"obbwkkwbywkkwyyo",
	"obbbwwbbyywwyyyo",
	"obbbbbrrrryyyyyo",
	"oBbbbrprrrryyyYo",
	"oBbbbbrrrryyyyYo",
	".oBRbbbbyyyyRYo.",
	".oBbRkkkkkkRyYo.",
	"..oBbRrrrrRyYo..",
	"...ooBBBYYYoo...",
	".....oooooo.....",
]

## A golden ticket: punched side notches, a star and a perforation line.
const TICKET := [
	"ooooooooooooo",
	"ohhhhhhhhhhgo",
	".oggsggg.ggo.",
	"ogsssssgggggo",
	"oggsssgg.ggGo",
	".ogsgsgggggo.",
	"ogggggggGgGGo",
	"oGGGGGGGGGGGo",
	"ooooooooooooo",
]

static var _cache := {}


## Returns a cached texture for a pixel map. `key` names the cache entry.
static func texture(key: String, rows: Array, palette := PALETTE) -> ImageTexture:
	if _cache.has(key):
		return _cache[key]
	var height := rows.size()
	var width: int = String(rows[0]).length()
	var image := Image.create_empty(width, height, false, Image.FORMAT_RGBA8)
	for y in height:
		var row: String = rows[y]
		for x in mini(width, row.length()):
			var color = palette.get(row[x])
			if color != null:
				image.set_pixel(x, y, color)
	var tex := ImageTexture.create_from_image(image)
	_cache[key] = tex
	return tex


static func sproto_head() -> ImageTexture:
	return texture("sproto_head", SPROTO_HEAD)


static func ticket() -> ImageTexture:
	return texture("ticket", TICKET)
