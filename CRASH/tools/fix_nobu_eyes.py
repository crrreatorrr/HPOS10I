#!/usr/bin/env python3
"""Paint out the stray third pupil that Meshy baked into the Nobu GLB texture.
Usage: python3 tools/fix_nobu_eyes.py SEED_X SEED_Y [SEED_X SEED_Y ...]  -> public/assets/models/nobu_tex_fixed.jpg"""
import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

src = Image.open('tools/_raw/nobu_tex.jpg').convert('RGB')
work = src.copy()
seeds = list(zip(map(int, sys.argv[1::2]), map(int, sys.argv[2::2])))
mask = np.zeros((src.height, src.width), bool)
for sx, sy in seeds:
    tmp = src.copy()
    ImageDraw.floodfill(tmp, (sx, sy), (255, 0, 255), thresh=150)
    a = np.asarray(tmp)
    mask |= (a[:, :, 0] == 255) & (a[:, :, 1] == 0) & (a[:, :, 2] == 255)
m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1.5))
white = Image.new('RGB', src.size, (250, 250, 248))
out = Image.composite(white, work, m)
out.save('public/assets/models/nobu_tex_fixed.jpg', quality=92)
print('painted', int(mask.sum()), 'px')
