#!/usr/bin/env python3
"""Download Higgsfield generations and turn them into game-ready assets.

Reads tools/asset_list.json, downloads each entry's result URL into tools/_raw/,
applies the listed ops, writes the result into public/assets/<dest>, and
regenerates public/assets/manifest.json (asset id -> file + prompt + model).

Ops (applied in order):
  cutout[:tol]  flood-fill the near-white background from the image border to alpha
  trim          crop to the opaque bounding box (+ small padding)
  max:N         fit inside N x N pixels
  size:N        resize to exactly N x N (textures)
  seamless      blend with a half-offset copy so the texture wraps without seams
  jpg:Q         save as JPEG at quality Q
  webp:Q        save as WebP (keeps alpha) at quality Q (otherwise PNG)

Usage: python3 tools/process_assets.py [asset_id ...]   (no ids = all entries)
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "_raw"
OUT = ROOT / "public" / "assets"
LIST = ROOT / "tools" / "asset_list.json"


def download(entry):
    RAW.mkdir(parents=True, exist_ok=True)
    ext = ".glb" if entry["dest"].endswith(".glb") else ".png"
    raw = RAW / f"{entry['id']}{ext}"
    if not raw.exists():
        print(f"  downloading {entry['id']}")
        req = urllib.request.Request(entry["url"], headers={"User-Agent": "nobu-asset-fetch"})
        with urllib.request.urlopen(req, timeout=120) as r:
            raw.write_bytes(r.read())
    return raw


def cutout(img, tol):
    """Remove a near-white background connected to the image border."""
    img = img.convert("RGBA")
    rgb = img.convert("RGB")
    w, h = rgb.size
    sentinel = (255, 0, 254)
    work = rgb.copy()
    arr = np.asarray(rgb).astype(np.int16)
    near_white = (np.abs(255 - arr).sum(axis=2) <= tol * 3)
    seeds = []
    step = max(1, min(w, h) // 64)
    for x in range(0, w, step):
        seeds += [(x, 0), (x, h - 1)]
    for y in range(0, h, step):
        seeds += [(0, y), (w - 1, y)]
    for sx, sy in seeds:
        if near_white[sy, sx] and work.getpixel((sx, sy)) != sentinel:
            ImageDraw.floodfill(work, (sx, sy), sentinel, thresh=tol)
    warr = np.asarray(work)
    bg = (warr[:, :, 0] == 255) & (warr[:, :, 1] == 0) & (warr[:, :, 2] == 254)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(a)
    return img


def trim(img, pad=8):
    if img.mode != "RGBA":
        return img
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((l, t, r, b))


def seamless(img):
    img = img.convert("RGB")
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    rolled = np.roll(np.roll(arr, h // 2, axis=0), w // 2, axis=1)
    yy = np.abs(np.linspace(-1, 1, h))[:, None]
    xx = np.abs(np.linspace(-1, 1, w))[None, :]
    # weight 1 in the middle, 0 at the borders (borders come from the rolled copy)
    wgt = np.clip((1 - np.maximum(xx, yy)) * 2.2, 0, 1)[:, :, None]
    out = arr * wgt + rolled * (1 - wgt)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGB")


def process(entry):
    raw = download(entry)
    dest = OUT / entry["dest"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    if entry["dest"].endswith(".glb"):
        dest.write_bytes(raw.read_bytes())
        return
    img = Image.open(raw)
    img.load()
    jpg_q = webp_q = None
    for op in entry.get("ops", []):
        name, _, arg = op.partition(":")
        if name == "cutout":
            img = cutout(img, int(arg or 22))
        elif name == "trim":
            img = trim(img)
        elif name == "max":
            n = int(arg)
            img.thumbnail((n, n), Image.LANCZOS)
        elif name == "size":
            n = int(arg)
            img = img.resize((n, n), Image.LANCZOS)
        elif name == "seamless":
            img = seamless(img)
        elif name == "jpg":
            jpg_q = int(arg or 85)
        elif name == "webp":
            webp_q = int(arg or 86)
    if webp_q:
        img.save(dest, "WEBP", quality=webp_q, method=5)
    elif jpg_q:
        img.convert("RGB").save(dest, "JPEG", quality=jpg_q, optimize=True)
    else:
        img.save(dest, "PNG", optimize=True)
    print(f"  wrote {dest.relative_to(ROOT)} {img.size}")


def write_manifest(entries):
    manifest = json.loads(LIST.read_text())
    out = {
        "style": manifest.get("style", ""),
        "nobuElement": manifest.get("nobuElement", ""),
        "assets": {},
    }
    for e in entries:
        if not (OUT / e["dest"]).exists():
            continue
        out["assets"][e["id"]] = {
            "file": e["dest"],
            "usedFor": e.get("usedFor", ""),
            "model": e.get("model", ""),
            "jobId": e.get("jobId", ""),
            "prompt": e.get("prompt", ""),
        }
    (OUT / "manifest.json").write_text(json.dumps(out, indent=2) + "\n")
    print(f"manifest: {len(out['assets'])} assets")


def main():
    data = json.loads(LIST.read_text())
    entries = data["assets"]
    wanted = set(sys.argv[1:])
    for e in entries:
        if wanted and e["id"] not in wanted:
            continue
        if not e.get("url"):
            continue
        print(e["id"])
        process(e)
    write_manifest(entries)


if __name__ == "__main__":
    main()
