# QA report 10: live web check @ main a8616a7

- **Date:** 2026-10-28
- **Build:** the live site after the deploy of a8616a7 (physics accuracy, slip angle 45, the released-zones flag). Fetched fresh from the site: `index.html`, `index.js`, `index.pck?v=a8616a7b7309` and `index.wasm`.
- **Method:** `tools/qa/web_check.sh` on the downloaded files; the pack's entry list; the live `index.pck` booted in a host project with no Zone 3 or 4 files on disk, driven by pointer events only (mouse, then touch) from a cold boot; a direct `--zone=z3_capital_mansion` boot of the same pack.

## Verdict: MERGE (nothing odd)

| Check | Result |
|---|---|
| `web_check` | 0 FAIL, 0 WARN. Pack 5.5 MB (2.8 MB gzip), 436 entries, 34 Ogg streams; wasm 39.5 MB (10.1 MB gzip); `fileSizes` has the versioned `mainPack` key. |
| Title → zone select → Zone 1 Act 1 | Plays. Mouse: title clicked at frame 41, "ACT 1" at frame 101, Zone 1 Act 1 current at frame 102, Sproto idle on the floor 300 frames later. Touch: identical. |
| Zone 2 selectable | Yes: both Zone 2 act buttons are enabled. |
| Zone 3 and 4 | Not in the pack: no `levels/z3_*` or `z4_*` scene or script entries, and no `bosses/`. `ResourceLoader.exists` is false for their acts in the live pack. The zone select already shows all four Zone 3 and 4 act buttons **disabled** (it greys acts whose scene doesn't exist), so nothing can be chosen even before the UI agent's released-flag lock lands. `ZoneRegistry.is_released` reports z1 and z2 true, z3 and z4 false. |
| Direct `--zone=z3` boot of the live pack | Falls back to the boot menu with `[SceneRouter] stage not built yet: z3_capital_mansion stage 1`; no crash, no player. |

## Notes (polish, no action needed now)

- The Zone 3 tileset still ships: `levels/common/tiles/z3_capital_mansion_tiles.tres` and its PNG (about 0.3 MB) live under `levels/common/`, outside the excluded `levels/z3_*/` folder. It leaks only the stone palette, no layout. If it matters, move zone tilesets under their zone folder or add them to the export exclude filter.
- `levels/z1_*/build_act*.gd` and `z2_*/build_act*.gd` (the dev scene builders) are in the pack too; small, harmless.
- The z3 fallback also logs `[SceneRouter] ignored go_title: a scene change is already pending this frame`: harmless noise from two fallbacks racing on one frame.
