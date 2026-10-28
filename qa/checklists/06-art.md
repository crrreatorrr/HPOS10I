# 06 – Art

Branch: `art` · Owner: art agent · Folders: `assets/`, `tools/art/`, `prompts.md`.

Tags: **[auto]** script/test · **[manual]** human judgement.
Image checks marked (img) use Python + Pillow; they will live in
`tools/qa/art_check.py`, written when the art branch is first reviewed.

## A. Import settings and filtering

- [ ] ART-A1 [auto] `tests/qa/test_contracts.gd`: every PNG under `assets/` has a `.import` with lossless (or VRAM uncompressed) storage and `mipmaps/generate=false`. Backgrounds may use VRAM compressed only if they still look clean (ART-F5).
- [ ] ART-A2 [auto] The `.import` files are committed: `git ls-files 'assets/*.png' | while read f; do git ls-files --error-unmatch "$f.import" >/dev/null 2>&1 || echo "missing $f.import"; done` prints nothing.
- [ ] ART-A3 [auto] Nearest-neighbour everywhere: `project.godot` has `default_texture_filter=0`, and no scene overrides it to linear: `grep -rn 'texture_filter = [2-5]' --include=*.tscn .` finds nothing.
- [ ] ART-A4 [auto] `_raw/` folders are git-ignored and contain a `.gdignore`: `git ls-files | grep /_raw/` prints nothing.

## B. Sproto sprite sheet

- [ ] ART-B1 [auto] `assets/sprites/common/sproto/sproto_frames.tres` is a `SpriteFrames` with `idle`, `run` (at least 4 frames), `jump`, `hurt` (test_contracts).
- [ ] ART-B2 [auto] Every frame is a 64×64 cell (test_contracts).
- [ ] ART-B3 [auto] (img) Feet centre at (32, 60) in every cell: the lowest opaque row is 59–61 and its horizontal centre is 32 ± 3 in idle/run/hurt frames.
- [ ] ART-B4 [auto] (img) No frame-to-frame jitter: the bottom row and centre move by at most 1 px between frames of one animation (except intentional bobbing in run).
- [ ] ART-B5 [auto] (img) Pixel-art cleanliness: alpha is only 0 or 255 (no soft edges), at most 32 colours per character sheet, no stray single pixels outside the silhouette.
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
- [ ] ART-E2 [auto] (img) Seamless horizontal tiling: the mean colour difference between the leftmost and rightmost pixel columns is small (< 8 per channel), and no visible seam at the wrap in game.
- [ ] ART-E3 [auto] (img) Near layers (`3_mid`, `4_near`) have real transparency (a large share of alpha-0 pixels); `1_far` is fully opaque.
- [ ] ART-E4 [auto] (img) Heights at least 240 px; widths at least 424 px; consistent pixel scale with the sprites (no layer drawn at 2× pixel size next to 1× sprites, unless chosen on purpose).
- [ ] ART-E5 [auto] Runtime scroll scales are 0.1 / 0.3 / 0.6 / 0.9 (04 ZN-A5).
- [ ] ART-E6 [manual] Layers read as one scene; far layers do not compete with the play field; terrain stays readable.

## F. Prompts, originality and size

- [ ] ART-F1 [auto] Every generated asset has a row in `prompts.md` (asset, model, prompt, job id); every row's asset exists.
- [ ] ART-F2 [auto] `tools/qa/originality_scan.sh` finds nothing in `prompts.md`, asset names or `.tres` files.
- [ ] ART-F3 [manual] No generated text, logos, watermarks, signatures or real brand marks in any image (zoom to 400%).
- [ ] ART-F4 [manual] No recognisable copies of existing games' level art, characters or HUD.
- [ ] ART-F5 [auto] Size: each PNG under 2 MB, `assets/` under 25 MB total; web `index.pck` stays inside the budget (`tools/qa/web_check.sh`).
