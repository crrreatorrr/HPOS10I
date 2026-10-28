# 08 – Web build

Owner: lead (`export_presets.cfg`, `.github/`) with every agent's content.
Target: single-threaded Godot web export, Compatibility renderer, GitHub Pages from `main`.

Tags: **[auto]** script/test · **[manual]** human judgement.

## A. Export settings

- [ ] WEB-A1 [auto] `export_presets.cfg`: `variant/thread_support=false`, `variant/extensions_support=false`, `progressive_web_app/ensure_cross_origin_isolation_headers=false`.
- [ ] WEB-A2 [auto] `project.godot`: `renderer/rendering_method="gl_compatibility"` and `.mobile` the same.
- [ ] WEB-A3 [auto] Export filter keeps dev content out: `tests/*`, `tools/*`, `docs/*`, `*.md` excluded; `tools/qa/web_check.sh` confirms nothing from them is in the `.pck`.
- [ ] WEB-A4 [auto] Texture compression enabled for desktop and mobile; pixel art stays lossless (06 ART-A1).

## B. Static checks on the build (`tools/qa/web_check.sh <dir>`)

- [ ] WEB-B1 [auto] `index.html`, `.wasm`, `.pck`, `.js` present; sizes match `fileSizes` in `GODOT_CONFIG`.
- [ ] WEB-B2 [auto] Single-threaded: `GODOT_THREADS_ENABLED = false`, `ensureCrossOriginIsolationHeaders: false`, no `*.worker.js`, and the wasm memory is not shared (no SharedArrayBuffer requirement).
- [ ] WEB-B3 [auto] Budgets: `.pck` < 40 MB, total < 80 MB (variables in the script); gzip sizes printed.
- [ ] WEB-B4 [auto] Audio in the `.pck` is only Ogg Vorbis (no `.wav`, `.mp3` or their imported forms).
- [ ] WEB-B5 [auto] Viewport meta tag present (mobile scaling).

## C. CI and deploy

- [ ] WEB-C1 [auto] `gh run list -R crrreatorrr/HPOS10I -L 3`: latest `main` run green (import, tests, export).
- [ ] WEB-C2 [auto] Artifact `web-build` downloadable and passes section B.
- [ ] WEB-C3 [auto] Pages URL from the README answers 200 once Pages is enabled: `curl -sI https://crrreatorrr.github.io/HPOS10I/`.
- [ ] WEB-C4 [manual] After a new deploy, a hard refresh loads the new version (no stale `.pck` with a new `.wasm`).

## D. Local server test (before publishing)

Serve: `python3 -m http.server 8060 --directory <build dir>` then open `http://localhost:8060/`.
This server sends no COOP/COEP headers, like GitHub Pages.

- [ ] WEB-D1 [manual] Boots in Chrome, Firefox and Safari with no red errors in the console.
- [ ] WEB-D2 [manual] Audio starts after the first click/key (autoplay policy) and keeps playing.
- [ ] WEB-D3 [manual] Keyboard works after one click on the canvas; focus is on the canvas at start.
- [ ] WEB-D4 [manual] Gamepad works after pressing a button (browser Gamepad API needs a press); hot-plug works.
- [ ] WEB-D5 [manual] Browser window resize and browser zoom: canvas fills the window, pixels stay sharp (nearest), aspect kept.
- [ ] WEB-D6 [manual] HiDPI screen (devicePixelRatio 2+): no blur.
- [ ] WEB-D7 [manual] Tab away for 30 s and come back: the game resumes without a burst of catch-up physics that kills the player or skips content.
- [ ] WEB-D8 [manual] 30 minutes of play: memory in the browser task manager stays flat; frame rate steady at 60.

## E. Mobile

- [ ] WEB-E1 [manual] iOS Safari and Android Chrome: loads, touch buttons appear, multi-touch works, 60 fps on a mid phone.
- [ ] WEB-E2 [manual] No page scroll, pinch zoom, double-tap zoom, text selection or long-press menu.
- [ ] WEB-E3 [manual] Rotation and safe areas handled; returning from the home screen resumes audio and input.
- [ ] WEB-E4 [manual] First load on a mobile connection finishes in a reasonable time (wasm is about 9–10 MB gzipped).
