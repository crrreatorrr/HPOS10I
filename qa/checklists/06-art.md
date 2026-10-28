# 06 – Art

Branch: `art` · Owner: art agent · Folders: `assets/`, `tools/art/`, `prompts.md`.

Tags: **[auto]** script/test · **[manual]** human judgement.
Image checks marked (img) use Python + Pillow; they will live in
`tools/qa/art_check.py`, written when the art branch is first reviewed.
Run it as `python3 -I tools/qa/art_check.py <project>` (isolated, paths as
arguments). Thresholds below are the pass lines.

Art direction (docs/DESIGN.md "Art direction"):
- The look is the classic early-90s 16-bit console platformer.
- Saturated colour ramps of 3–5 steps, lit from the top-left.
- Crisp pixels on a true grid.
- Sprites have a 1 px dark outline; backgrounds have none.
- Far layers are lighter and bluer.

Terrain contract (docs/CONTRACTS.md): `assets/terrain/<zone_id>/fill.png`,
`top.png`, optional `side.png`; `LevelRoot.art_zone_id`;
`CurveTerrain.set_art_zone(id)`.

## A. Import settings and filtering

- [ ] ART-A1 [auto] `tests/qa/test_contracts.gd`: every PNG under `assets/` has a `.import` with lossless (or VRAM uncompressed) storage and `mipmaps/generate=false`. Backgrounds may use VRAM compressed only if they still look clean (ART-F5).
- [ ] ART-A2 [auto] The `.import` files are committed: `git ls-files 'assets/*.png' | while read f; do git ls-files --error-unmatch "$f.import" >/dev/null 2>&1 || echo "missing $f.import"; done` prints nothing.
- [ ] ART-A3 [auto] Nearest-neighbour everywhere: `project.godot` has `default_texture_filter=0`, and no scene overrides it to linear: `grep -rn 'texture_filter = [2-5]' --include=*.tscn .` finds nothing.
- [ ] ART-A4 [auto] `_raw/` folders are git-ignored and contain a `.gdignore`: `git ls-files | grep /_raw/` prints nothing.
- [ ] ART-A5 [auto] (img) Sizes:
  - Sprite cells are 64×64.
  - `fill.png` and `side.png` are 64×64 or 128×128.
  - `top.png` is 16–24 px tall, and its width is a multiple of 8 and at least 64.
  - `1_far` is exactly 240 px tall; the other layers are 240 px tall or less (bottom-aligned).
  - Every background width is a multiple of 8 and at least 424 px.
- [ ] ART-A6 [auto] (img) True-grid crispness. The art is at 1× (one image pixel = one game pixel), so no layer is stored as an upscaled fake-pixel image:
  - Under 60 % of the aligned 2×2 blocks are a single colour (90 % or more means the art was saved at 2×).
  - No odd scale either: no column or row of every 3×3 or 4×4 cell is a duplicate of its neighbour.
- [ ] ART-A7 [auto] (img) No blur or smearing:
  - Sprites, `top.png` and the near layers only use alpha 0 or 255.
  - `1_far` uses alpha 255 only.
  - "Speckle" pixels (all 4 neighbours a different colour from the pixel and from each other) are under 3 % of the opaque pixels, except dithered areas (ART-F7 manual).
- [ ] ART-A8 [auto] (img) Colour count per palette:
  - The zone palette `tools/art/palettes/<zone_id>.png` has 32 colours or fewer.
  - Every background and terrain PNG of that zone uses only palette colours plus at most 8 extra (the `--extra` ramps).
  - Each character sheet has 32 colours or fewer (Sproto and every enemy, counted separately).
  - Report the per-file count and the colours that are not in the palette.

## B. Sproto sprite sheet

- [ ] ART-B1 [auto] `assets/sprites/common/sproto/sproto_frames.tres` is a `SpriteFrames` with `idle`, `run` (at least 4 frames), `jump`, `hurt` (test_contracts).
- [ ] ART-B2 [auto] Every frame is a 64×64 cell (test_contracts).
- [ ] ART-B3 [auto] (img) Feet centre at (32, 60) in every cell: the lowest opaque row is 59–61 and its horizontal centre is 32 ± 3 in idle/run/hurt frames.
- [ ] ART-B4 [auto] (img) No frame-to-frame jitter: the bottom row and centre move by at most 1 px between frames of one animation (except intentional bobbing in run).
- [ ] ART-B5 [auto] (img) Pixel-art cleanliness: alpha is only 0 or 255 (no soft edges), at most 32 colours per character sheet, no stray single pixels outside the silhouette (opaque pixels with no opaque 8-neighbour).
- [ ] ART-B8 [auto] (img) 1 px dark outline on sprites:
  - At least 90 % of the opaque pixels that touch a transparent pixel have a luminance of 35 % or less.
  - Under 10 % of them are pure black `#000000`.
  - Backgrounds (`3_mid`, `4_near`) do *not* pass this test: under 50 % of their silhouette edge is dark.
- [ ] ART-B9 [auto] (img) Sproto is about 40 px tall: the opaque bounding-box height of idle frames is 36–44 px inside the 64×64 cell.
- [ ] ART-B6 [manual] Reads as an original fast white dog; does not resemble any existing mascot's silhouette, colour scheme, shoes, gloves or quills.
- [ ] ART-B7 [manual] Animations play at sensible speeds; run speed-up with ground speed looks right in game.

## C. Accessories

- [ ] ART-C1 [auto] `assets/sprites/z2_wizard_academy/wizard_hat/` and `assets/sprites/z3_capital_mansion/sunglasses/` exist with their sheets.
- [ ] ART-C2 [auto] When accessories exist, Sproto's `anchors.json` parses and has `head` points for every frame (test_contracts checks presence; img checks one point per frame).
- [ ] ART-C3 [manual] Hat and sunglasses sit correctly on every frame and both facings.

## D. Other sprites

- [ ] ART-D1 [auto] Folder layout `assets/sprites/<zone_id>/<name>/` with a valid zone id (test_contracts); `<name>_sheet.png` and `<name>_frames.tres` names.
- [ ] ART-D2 [auto] Every `SpriteFrames` has at least one animation and no empty or missing frame textures (test_contracts).
- [ ] ART-D3 [manual] Enemies, hazards, springs and tickets keep their readable colour roles (enemies red, hazards orange, springs yellow, tickets gold) against every background.

## E. Backgrounds and parallax

- [ ] ART-E1 [auto] Each zone has `assets/backgrounds/<zone_id>/1_far.png`, `2_distant.png`, `3_mid.png`, `4_near.png` (test_contracts checks names and zone ids).
- [ ] ART-E2 [auto] (img) Seamless horizontal tiling. Define the seam ratio = mean colour difference across the wrap (last column vs first column) ÷ mean difference across interior adjacent columns:
  - The seam ratio is 1.5 or less on every layer (the art tool reports the same metric in `_raw/previews/*_report.json`).
  - Over opaque pixels, the mean RGB difference of the wrap columns is under 8 per channel.
- [ ] ART-E7 [manual] Background seams in game: run past each layer's wrap point (`3_mid` and `4_near` wrap most often). No visible join, no 1 px gap or double column at any window size (also 00-full-qa display sizes), with interpolation on and off.
- [ ] ART-E8 [auto] (img) Atmospheric depth:
  - Mean OKLab lightness of the opaque pixels falls from far to near: `1_far` ≥ `2_distant` ≥ `3_mid` ≥ `4_near`, with 0.02 tolerance.
  - Mean OKLab b (blue–yellow) rises from far to near: far layers are bluer.
  - Near layers are the most saturated: the mean OKLab chroma of `4_near` is at least that of `1_far`.
- [ ] ART-E3 [auto] (img) Near layers (`3_mid`, `4_near`) have real transparency (a large share of alpha-0 pixels); `1_far` is fully opaque.
- [ ] ART-E4 [auto] (img) Heights as in ART-A5 (`1_far` 240 px, the others 240 px or less and bottom-aligned); widths at least 424 px; consistent pixel scale with the sprites (ART-A6; no layer drawn at 2× pixel size next to 1× sprites, unless chosen on purpose).
- [ ] ART-E5 [auto] Runtime scroll scales are 0.1 / 0.3 / 0.6 / 0.9 (04 ZN-A5).
- [ ] ART-E6 [manual] Layers read as one scene; far layers do not compete with the play field; terrain stays readable.

## T. Terrain materials (`assets/terrain/<zone_id>/`)

- [ ] ART-T1 [auto] (img) `fill.png` (and `side.png`) tiles seamlessly on **both** axes:
  - The seam ratio (ART-E2) is 1.5 or less for x and for y.
  - The 3×3 tiled preview shows no grid of lines (manual glance at `_raw/previews/fill_tiled3x3.png` or a QA render).
  - Fully opaque: alpha 255 only.
- [ ] ART-T2 [auto] (img) `top.png` tiles horizontally: the x seam ratio is 1.5 or less. There is no y tiling.
- [ ] ART-T3 [auto] (img) `top.png` has hard alpha below the lip:
  - Alpha is 0 or 255 only.
  - Row 0 (the walkable surface) is at least 95 % opaque.
  - In every column the opaque pixels form one run starting at row 0 (tufts hang from the lip; nothing floats below a gap).
  - The bottom row is at least 30 % transparent, so the fill shows between tufts.
- [ ] ART-T4 [auto] The lip's top row sits on the walkable surface. In a probe level with a flat CurveTerrain at y = 0 and `set_art_zone(<zone>)`, the first opaque lip row is drawn at y = 0 ± 1 px. Same for a 45° slope (the strip follows the surface).
- [ ] ART-T5 [auto] Missing files fall back to the placeholder look:
  - With `assets/terrain/<zone_id>/` renamed away in a scratch copy, `tools/qa/scene_smoke.sh` and the test suite show no errors or warnings.
  - `set_art_zone("nonexistent")` is a no-op.
- [ ] ART-T6 [auto] `LevelRoot.art_zone_id` defaults to the zone id, and LevelRoot calls `set_art_zone` on every CurveTerrain in the level (probe: count the calls, or read back each terrain's zone).
- [ ] ART-T7 [manual] Zone look: a bright grass lip with a highlight row and hanging tufts; patterned dirt below (Zone 1: diamond/argyle checker in warm oranges and browns, darker toward the bottom); rock faces on steep sides. Ramps of 3–5 steps lit from the top-left.

## P. Physics stays identical with art and effects on

- [ ] ART-P1 [auto] Frame-identical physics with textured terrain on vs off. Run the fuzz bot (seed 5, 5,400 ticks) and the runner timeline with `--trace=1` on the playground and the test level, once with the zone's terrain materials and once with the placeholder look (`set_art_zone("")`, or the material folder renamed away in a scratch copy). The traces must be byte-identical.
- [ ] ART-P2 [auto] The same with effects on vs off: dust puffs, ticket sparkles, the high-speed afterimage, capsule pops and water sparkle. Use the effects toggle if there is one, otherwise free the effect nodes as they spawn. The traces must be byte-identical.
- [ ] ART-P3 [auto] `set_art_zone` changes no collision. Every `CollisionPolygon2D`/`CollisionShape2D` point, collision layer and mask is identical before and after.
- [ ] ART-P4 [auto] Art and effect nodes are visual only:
  - They add no `CollisionObject2D` or `Area2D`.
  - Nothing is on the player's collision layers.
  - They do no gameplay work in `_physics_process` (grep their scripts).
  - Animated tiles (water sparkle, waterfall shimmer) are shader or `_process` only.
- [ ] ART-P5 [auto] Cost: after warm-up, the playground with materials, effects and 4 parallax layers stays within 1 ms of the placeholder build's physics tick time (`Performance.TIME_PHYSICS_PROCESS` average over 600 ticks, headless).

## F. Prompts, originality and size

- [ ] ART-F1 [auto] Every generated asset has a row in `prompts.md` (asset, model, prompt, job id); every row's asset exists.
- [ ] ART-F6 [auto] `prompts.md` format, parsed by `art_check.py`:
  - The table has exactly 8 columns (`# | Date | Asset | Model | Prompt | Reference | Job ID | Status`).
  - `#` counts up 1, 2, 3… with no gaps.
  - Dates are ISO `YYYY-MM-DD`.
  - Asset is a backticked repo path.
  - Model, Prompt and Job ID are non-empty, and the Job ID looks like a UUID.
  - Status is one of `pending`, `approved`, `rejected`, `replaced` (never empty).
- [ ] ART-F7 [auto] Every committed PNG under `assets/backgrounds/`, `assets/terrain/` and `assets/sprites/` has a `prompts.md` row with Status `approved`. Before a merge to main, `pending` is a FIX FIRST. Placeholders made by a script are exempt only if the script's path is named in a row's Model column (e.g. `tools/art/…`).
  - Conversely, every `approved` row's asset exists in the tree.
- [ ] ART-F8 [auto] Prompts contain no banned names: `tools/qa/originality_scan.sh` over `prompts.md` (prompt and reference columns included) finds 0 hits.
  - Prompts follow the template in the `prompts.md` header (sprite or background template phrase present).
  - The Reference column names only our own files or "none", never a screenshot of an existing game.
- [ ] ART-F2 [auto] `tools/qa/originality_scan.sh` finds nothing in `prompts.md`, asset names or `.tres` files.
- [ ] ART-F3 [manual] No generated text, logos, watermarks, signatures or real brand marks in any image (zoom to 400%).
- [ ] ART-F4 [manual] No recognisable copies of existing games' level art, characters or HUD.
- [ ] ART-F5 [auto] Size: each PNG under 2 MB, `assets/` under 25 MB total; web `index.pck` stays inside the budget (`tools/qa/web_check.sh`).
