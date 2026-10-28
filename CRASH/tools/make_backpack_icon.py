"""Builds the level-complete BREAKABLES icon from the user's backpack photo (the Harry Potter / OBAMA
Sonic-with-tulips backpack): the photo's front print goes on a cartoon backpack silhouette with a
carry handle, side straps and a thick ink outline, matching the other HUD/menu icons.

    python3 tools/make_backpack_icon.py   ->  public/assets/items/backpack_icon.webp
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'public/assets/items/backpack_front.jpg'
OUT = ROOT / 'public/assets/items/backpack_icon.webp'

W, H = 640, 740
INK = (26, 10, 36, 255)
FABRIC = (22, 22, 28, 255)
STRAP = (38, 38, 46, 255)
BODY = (78, 112, 562, 708)  # x0, y0, x1, y1


def shape(draw_fn):
    m = Image.new('L', (W, H), 0)
    draw_fn(ImageDraw.Draw(m))
    return m


def body_mask():
    x0, y0, x1, y1 = BODY
    m = shape(lambda d: d.rounded_rectangle((x0, y0 + 90, x1, y1), radius=78, fill=255))
    dome = shape(lambda d: d.ellipse((x0, y0, x1, y0 + 330), fill=255))
    return ImageChops.lighter(m, dome)


def main():
    body = body_mask()
    handle = shape(lambda d: d.arc((232, 34, 408, 196), 180, 360, fill=255, width=34))
    straps = shape(lambda d: (d.rounded_rectangle((44, 300, 118, 650), radius=30, fill=255),
                              d.rounded_rectangle((522, 300, 596, 650), radius=30, fill=255)))
    everything = ImageChops.lighter(ImageChops.lighter(body, handle), straps)

    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # ink outline: the whole silhouette grown by ~12 px
    outline = everything.filter(ImageFilter.MaxFilter(25))
    img.paste(Image.new('RGBA', (W, H), INK), (0, 0), outline)
    img.paste(Image.new('RGBA', (W, H), STRAP), (0, 0), straps)
    img.paste(Image.new('RGBA', (W, H), STRAP), (0, 0), handle)
    # body: dark fabric, then the photo's print feathered into it so there are no hard edges
    img.paste(Image.new('RGBA', (W, H), FABRIC), (0, 0), body)
    photo = Image.open(SRC).convert('RGBA')
    x0, y0, x1, y1 = BODY
    ph = y1 - y0 - 24
    pw = round(photo.width * ph / photo.height)
    photo = photo.resize((pw, ph), Image.LANCZOS)
    feather = Image.new('L', (pw, ph), 0)
    ImageDraw.Draw(feather).rounded_rectangle((18, 10, pw - 18, ph - 10), radius=60, fill=255)
    feather = feather.filter(ImageFilter.GaussianBlur(14))
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    layer.paste(photo, ((W - pw) // 2, y0 + 12), feather)
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), body))
    img = Image.alpha_composite(img, layer)
    # cartoon sheen on the upper left, and a soft shade along the bottom
    sheen = shape(lambda d: d.ellipse((x0 + 30, y0 + 20, x0 + 260, y0 + 300), fill=70)).filter(ImageFilter.GaussianBlur(40))
    shade = shape(lambda d: d.rectangle((x0, y1 - 90, x1, y1), fill=90)).filter(ImageFilter.GaussianBlur(30))
    for m, col in ((sheen, (255, 255, 255)), (shade, (0, 0, 0))):
        tint = Image.new('RGBA', (W, H), col + (0,))
        tint.putalpha(ImageChops.multiply(m, body))
        img = Image.alpha_composite(img, tint)
    # stitched seam around the body edge
    seam = body.filter(ImageFilter.MinFilter(29))
    edge = ImageChops.subtract(seam, seam.filter(ImageFilter.MinFilter(5)))
    dashes = Image.new('L', (W, H), 0)
    dd = ImageDraw.Draw(dashes)
    for y in range(0, H, 22):
        dd.rectangle((0, y, W, y + 11), fill=255)
    for x in range(0, W, 22):
        dd.rectangle((x, 0, x + 11, H), fill=255)
    stitch = ImageChops.multiply(edge, dashes)
    tint = Image.new('RGBA', (W, H), (120, 120, 132, 0))
    tint.putalpha(stitch)
    img = Image.alpha_composite(img, tint)
    img = img.crop(img.getbbox())
    img.thumbnail((520, 600), Image.LANCZOS)
    img.save(OUT, 'WEBP', quality=90, method=6)
    print(OUT.relative_to(ROOT), img.size)


if __name__ == '__main__':
    main()
