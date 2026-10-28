# QA report 00: full QA of main @ 967b981 (+ open branches)

- **Date:** 2026-10-28
- **Reviewed:**
  - main at 967b981. a8cd42b landed later; it only touches `DESIGN.md`.
  - The CI web artifact of run 40661350550, which is the live build.
  - The open branches as context: `physics` at 2339845 (see `qa/reports/03-camera.md` 03b), `art` at 52daae8, `levels`.
- **Not covered here:** hands-on browser play of the live site. The lead does that in parallel.
- **Method:**
  - Throw-away copies (`git archive`); no worktree was touched.
  - Headless runs, bots and Movie Maker captures.
  - Planted failures in a scratch copy to test the CI gates.
  - Two read-only helper passes: static code review and docs-vs-code.

## Verdict

**No blockers.** Main is healthy:

- 159 tests pass, identical across 5 runs (7–9 s each).
- Import is clean; smoke passes 7/7; the originality scan is clean on every branch and every commit message.
- `web_check` passes on the live artifact.
- Bots ran 5 × 90 s and 3 × 5 min with no errors, no NaN, no leaks and no softlocks.

There are three majors:

1. The camera snap smear, which matters once interpolation is on.
2. A hole in the test gate.
3. Missing contract sections that other agents need right now.

Everything else is minor or polish.

## Findings

Severity follows `qa/README.md`. Each finding has exactly one owner, or a stated split.

### Major

| ID | Owner | Finding | Evidence | Fix |
|---|---|---|---|---|
| FQ-01 | physics | With interpolation on, the camera smears for 1–2 frames on every respawn or teleport at 120/144 Hz. `_snap_to_target()` resets interpolation before the new position is applied. Main has no GameCamera yet; this is on `physics`. | BUG-03-01 in `03-camera.md`, `evidence/03-camera/respawn_smear_144hz.png` | In `_snap_to_target`, call `_apply_position()` just before `reset_physics_interpolation()`. Verified by recording. |
| FQ-02 | lead | **The test runner counts a test that hits a runtime script error as passed.** A planted test that calls a method on `null` printed `SCRIPT ERROR`, then `1 passed, 0 failed`, exit 0. A gameplay crash inside a test (null access in `player.gd`, a bad cast) would pass CI and deploy. Failing asserts, parse errors and hangs are caught (exit 1, and a 7,200-frame time-out). | Planted tests in a scratch copy: assert fails → exit 1; parse error → exit 1; hang → FAIL timed out, exit 1; null call → **exit 0** | In `tests/run_tests.gd`, register a `Logger` (`OS.add_logger`) that records script errors during each test and fails that test. As a backstop, have CI fail the test step when the log contains `SCRIPT ERROR`. |
| FQ-03 | lead | `docs/CONTRACTS.md` lacks the APIs that levels, HUD and bosses are building against now. | `CONTRACTS.md` vs `core/game_state.gd`, `core/scene_router.gd`, `core/zone_registry.gd`, `project.godot [input]`, `core/dev.gd` | Add three sections: "Core autoloads", an input-actions table, and a Dev flag table (global vs playground-only). A checker script is available to promote (see "Tools"). |

The missing pieces in FQ-03:

- **GameState:**
  - Signals: `tickets_changed`, `score_changed`, `lives_changed`, `checkpoint_reached`, `level_completed`.
  - Methods and properties: `add_score`, `set_checkpoint`, `checkpoint_position`, `complete_level`, and `lose_tickets()`, which `player.gd` already calls.
- **SceneRouter:** `go_title`, `go_zone_select`, `open_scene`, `stage_started`, `in_gameplay`.
- **ZoneRegistry:** its functions and dict keys.
- **Input actions:** the action names. Touch controls must "press the normal input actions", but no action name appears in the contract.
- **Dev CLI flags:**
  - `--scene`, `--zone`, `--stage`, `--inputs`, `--dev`, `--overlay`.
  - Playground only: `--trace`, `--accessory`, `--start`.
  - Physics branch: `--interp`, `--terrain-root`.

### Minor

| ID | Owner | Finding | Evidence | Fix |
|---|---|---|---|---|
| FQ-04 | lead | **The CI `mainPack ?v=` patch kills the loading progress bar.** The engine looks up `fileSizes[mainPack]`, which is `fileSizes["index.pck?v=…"]`. That key is missing, so the total is 0 and the shell shows an indeterminate bar for the whole first download of about 10 MB. | `index.js`: `preloadFile(file) → preloader.preload(file, path, this.config.fileSizes[file])`. `web_check` now WARNs on the live artifact. | In the CI patch, also rename the key: `"index.pck":` → `"index.pck?v=<sha>":`. `web_check` accepts versioned keys (tested). |
| FQ-05 | lead | **Integer scaling is all-or-nothing.** A 1920×1080 screen whose browser window is under 960 px tall (tabs, address and bookmarks bars) drops to 3×: a 1272×720 picture covering 51 % of the window, where fractional scaling would give about 3.9×. | Display table below; `core/display.gd` `choose_stretch` | Use integer only when it loses less than ~15–20 % of the fractional size, otherwise fractional. Or use "sharp bilinear": integer prescale, then a linear upscale to fill, which stays crisp at any size. |
| FQ-06 | lead / ui-audio | **Pause keys do nothing, and there is no way back to the menu.** Enter, Esc, P and Start are bound to `pause`, but no pause menu exists yet (`Display` adds it once `ui/pause/pause_menu.tscn` exists). On the web the only exit is reloading the page. Esc is also reserved by browsers to leave fullscreen, so pause-on-Esc will also drop fullscreen. | `project.godot [input] pause`; no handler in core/ or playground/ | ui-audio: the pause menu with "Back to menu". Until then, lead: Start or Esc in a free scene returns to the boot menu. Hints should name P/Start for pause. |
| FQ-07 | lead (menu), physics (playground hint) | **Key hints assume QWERTY, but the bindings are physical.** On AZERTY the jump key printed "Z" is labelled W, and the key labelled Z is `move_up`. On QWERTZ, Z and Y are swapped. The boot menu's number shortcuts compare the logical `keycode`, so on AZERTY the number row needs Shift. | `test_project_setup.gd` confirms every key is physical; `core/main.gd:46`; playground `HINT` | Build hint labels with `DisplayServer.keyboard_get_label_from_physical()`. In `main.gd`, compare `physical_keycode`. |
| FQ-08 | lead | **Gamepad left-stick diagonals press both directions.** Each axis has its own 0.5 deadzone, so a 45° push gives 0.71 on both axes. Running down-diagonally crouches or rolls; jumping up-diagonally starts look-up. There is no radial deadzone. | `project.godot` deadzones | Set `move_up`/`move_down` to about 0.7 (keep left/right at 0.5), or map the stick by angle sector. |
| FQ-09 | physics | **The playground respawn takes 180 frames (3 s);** the contract says about 2 s. `died` fires after 60 frames, then the playground waits another 120. No life is lost (correct). | `tests/qa/test_playground_flow.gd` INFO line | `RESPAWN_FRAMES = 60` |
| FQ-10 | lead | **The GameState level timer runs in `_process`.** Under web frame catch-up it drifts from the 60 Hz gameplay. `reset_game()` turns it back on, so it also runs on the title screen. | `core/game_state.gd:27, 90-105` | Tick it in `_physics_process`; `reset_game` stops it. |
| FQ-11 | lead | **Core robustness gaps:** | `core/tuning.gd:17`, `core/dev.gd:31-33, 84`, `core/scene_router.gd:82, 143` | `load(...) as PhysicsConstants` with a fallback and `push_error`; store `""` for bare flags; validate timeline events; check `exists()` and the error code, then fall back to MAIN. |
| FQ-12 | physics | **Stray 1 px lip-highlight pixels float in the air at loop bases** with textured terrain (physics branch). | BUG-03-04, `evidence/03-camera/textured_loop_base_3120.png` | Skip tiny or sharply turning lip segments, or clip the lip to the fill polygon. |
| FQ-13 | physics | **The invincibility blink counts render frames.** It runs at 7.5 Hz at 60 Hz, 15 Hz at 120 and 18 Hz at 144: inconsistent, and a flashing concern. | BUG-03-03; `player_visual.gd:14, 68` | Count physics ticks. Later, consider a reduced-flash option (translucency instead of a blink). |
| FQ-14 | lead | **Web start-up is about 10.4 MB on the first visit.** `index.wasm` is 39.5 MB raw and 10.25 MB gzip as Pages serves it; the pck is only 93 KB. Pages' ETag is mtime-plus-size, so returning players re-download the wasm after every deploy, even though it is byte-identical. | `curl -I` on the live site: gzip, `max-age=600`, `etag "6ae1bbd8-25af282"` | Build a slim custom web template (3D and unused modules disabled), which usually halves the wasm. Track the gzip size in `web_check`'s budget. |
| FQ-15 | lead | **CI downloads the Godot editor and export templates without checking their checksums.** | `.github/workflows/web.yml` install step | Verify against the release's `SHA512-SUMS.txt` (pinned in the workflow) before unzipping. |
| FQ-16 | lead | **README drift:** | `README.md:16, 30-31, 46-48, 57-58` | Reword those lines, mark the touch rows "(coming)", and list the dev flags and tools. |
| FQ-17 | lead | **DESIGN contradictions:** | `DESIGN.md:23, 84, 100-109` | Pick one outline rule, drop the stale parentheticals, and add short zone and boss briefs with the "no real person" guardrail. |
| FQ-18 | lead | **CONTRACTS drift:** | `CONTRACTS.md:43, 168-170, 211, 269` | Write the heights and anchoring into the contract and fix the stale lines. |
| FQ-19 | lead | **Collision layer bits are duplicated in 9 places:** `sensors.gd`, `curve_terrain.gd`, both tickets, `dummy_enemy.gd`, `path_switcher.gd`, and three test libraries. | static review | Add one `core/layers.gd` mirroring the CONTRACTS table. |
| FQ-20 | physics | **Hot paths allocate every physics tick.** This matters on the single-threaded web build on low-end phones. | `sensors.gd:80-81`, `player.gd:449, 464, 604, 670, 803, 818`, `path_switcher.gd:38-46` | Add a record flag toggled by the overlay; use consts; `set_physics_process` only while occupied. |
| FQ-21 | physics | **Gameplay numbers outside tuning.** | `player_visual.gd:16, 121`, `player.gd:264, 839-840, 901, 952`, `physics_playground.gd:22` | Read them from `Tuning.physics` or name them as consts. |
| FQ-22 | physics | **`tests/physics/test_loop.gd:24` tracks `lowest` but never asserts it,** so that check doesn't run. | static review (UNUSED_VARIABLE) | Assert it, or remove it. |
| FQ-23 | qa (tooling); listed owners (fixes) | **GDScript warnings only print with `-d`, so CI never sees them.** | helper run of `parse_check.gd -d` | QA adds a `-d` warning pass with a baseline to `scene_smoke.sh`; owners fix the 9 shipping warnings. |
| FQ-24 | art | **prompts.md:** | main `prompts.md:9-11`; art `prompts.md:15` | Fix the template. Use the statuses that `06-art.md` ART-F6 now checks (`pending`/`approved`/`rejected`/`replaced`). |
| FQ-25 | ui-audio | **Audio manager:** a missing music file leaves the previous track playing, and `play_sfx` creates a new player for every sound with no cap. | `audio/audio_manager.gd:22-41` | Stop the music when the track is missing; pool about 8 SFX players. |

Details for the multi-part rows:

- **FQ-11, core robustness gaps:**
  - `core/tuning.gd` doesn't check its `load()`. With the `.tres` renamed, every tick raises script errors in `player.gd`.
  - `dev.gd`: a bare `--inputs` passes `true` to `load_timeline`, which is a SCRIPT ERROR (also flagged as an INCOMPATIBLE_TERNARY warning).
  - Timeline events are not validated.
  - `SceneRouter.open_scene` doesn't check that the scene exists, and drops the `change_scene` error.
- **FQ-16, README drift:**
  - "Every push to main redeploys" is wrong: deploys depend on `PAGES_ENABLED` and on every check passing.
  - The touch Roll and Spin dash rows are not marked "(coming)".
  - "Every movement constant lives in physics_constants.tres" is wrong: `player.gd` hard-codes JUMP_CLEARANCE, SNAP_*, TOP_ONLY_GRACE and others.
  - The dev commands list only mentions `--dev`.
- **FQ-17, DESIGN contradictions:**
  - Art direction says sprites get a "1 px dark outline", but the pill robots get a "thick dark outline".
  - The "replaces …" parentheticals name enemies that no doc defines.
  - There are no zone or boss briefs, and the boss ids (`rug_pull`, `broccoli_head`, `the_executive`) have no design guardrail.
- **FQ-18, CONTRACTS drift:**
  - Background layer heights and anchoring are not given. The art tool makes 240/180/160/112 px, bottom-aligned; QA's checklist now follows that.
  - "Player white" placeholder is stale.
  - The gate step "`--import` shows no script errors" is wrong, because `--import` exits 0 on parse errors. Use `tools/lead/gate.sh` instead.
- **FQ-20, per-tick allocations:**
  - `sensors.gd` builds a Dictionary for every ray every tick, even with the overlay hidden.
  - `player.gd` builds `PackedStringArray`s on every call, including on ground sub-steps.
  - Each `PathSwitcher` polls `_sides.keys()` every tick.
- **FQ-21, numbers outside tuning:**
  - The walk/run switch `6.0` in `player_visual.gd` duplicates `top_speed`.
  - The landing split (23°/45°, ×0.5).
  - The push lock of 16 frames.
  - The playground spawn height `-19.0`.
- **FQ-23, warnings:**
  - With the project's own settings, shipping code has 9 warnings:
    - shadowed base-class names: `main.gd:91` `name`, `player.gd:652` `tr`, `scattered_ticket.gd:79` `gravity`;
    - 2 integer divisions;
    - 2 int-as-enum;
    - the `dev.gd:31` ternary (FQ-11);
    - an unused parameter, `player.gd:594`.
  - Strict typing adds 88 more in shipping code, mostly from untyped Dictionary data (`Dev.args`, the ZoneRegistry dicts, menu entries).
- **FQ-24, prompts.md:**
  - The background template offers `[far/mid/near]`, but there are 4 layers (far, distant, mid, near).
  - On the art branch, row 1 names two models.
  - Status values are never defined.
  - The post-processing command isn't logged.

### Polish

| ID | Owner | Finding | Fix |
|---|---|---|---|
| FQ-26 | physics | **The F1 debug overlay ships and is advertised in the public hint.** The page handler calls `preventDefault` on every key while the canvas has focus. That is why F1 reaches the game, but it also swallows F5 and Ctrl+R. With focus elsewhere, F1 opens the browser's help. | Gate it behind `OS.is_debug_build()` or a Dev flag for the public build, or use a non-function key. |
| FQ-27 | lead | **The loading screen is only a bar on #12141f.** No title, no size, no disclaimer. | Add "HPOS10I – loading (10 MB)" and the one-line disclaimer to the shell. |
| FQ-28 | lead / ui-audio | **The disclaimer appears only in the README and the page meta,** never in-game. | Require one disclaimer line on the title screen (contract). |
| FQ-29 | lead | **Touch-capable laptops get fractional scaling (and later the touch overlay) in desktop browsers.** | Switch mode on the first touch event, and back on the first key press. |
| FQ-30 | lead | **Menu key repeat is inconsistent.** Arrows repeat (GUI `ui_*` echo); WASD and D-pad through `main.gd` don't. | Accept echo for `move_up`/`move_down` in `main.gd`. |
| FQ-31 | ui-audio | **Text uses the default anti-aliased font at 8–12 px.** Contrast is fine: 7.1:1 for the hint on dirt (with outline), about 12:1 in the menu. On phones (~1.6×) the 8 px hint is about 13 CSS px. | Use a pixel font made for 424×240 (UI step). |
| FQ-32 | lead | **The playground's right end is a wall with no "end" marker.** The runner bot idles there for 69 s. | Add a sign or a loop-back. |
| FQ-33 | lead | **The local `origin` remote still uses the old account URL.** The repo is now `crrreatorrr/HPOS10I`; the README link is correct. | `git remote set-url origin …` |

## Area notes

### 1. Gameplay feel on main (playground)

- **Bots** (`tools/qa/playtest_bot.gd`, 90 s each):
  - Runs: runner, runner jump-every 60, fuzz seeds 1/2/3.
  - Results: 0 errors, 0 NaN, 0 orphans; nodes stable at 159; static memory flat.
  - The runner reaches the right end (x 4,150) every run. Fuzz never softlocks. Its long "no progress" spells are the fuzz policy holding jump.
- **Death and respawn:** no life is lost, and Sproto respawns at PlayerStart standing on the floor after 180 frames (FQ-09). Promoted as `tests/qa/test_playground_flow.gd`.
- **Accessories:** `--accessory=wizard_hat` and `sunglasses` show the placeholders. `bogus` and an empty value show nothing and raise no errors. Promoted.
- **Debug overlay:** hidden by default; the `debug_overlay` action toggles it. Promoted.
- **First-time player:**
  - There is no way back to the menu (FQ-06).
  - Phones can open the playground but can't play it; touch controls are coming, and the README says so.
  - The hint fits on main. On `physics` it is reworded, and Tickets moves to the top right.
- **Level lint on the playground:** `loop.intrusion` at (3296, -4) and `loop.runup` 376 px, both at the x 3120 loop. Unchanged by the quarter-pipe work; minor, physics.

### 2. Web export health (live artifact of run 40661350550)

- **`web_check`:** 0 FAIL and 1 WARN (FQ-04, the new check). Single-threaded: no COOP/COEP, wasm memory not shared. `fileSizes` match the files. The pck holds 62 entries and no tests/tools/docs/qa.
- **Size:** wasm 39.5 MB raw / 10.25 MB gzip as served; pck 116 KB; js 280 KB raw / 69 KB gzip. Inside the budget.
- **HTML shell:**
  - Title "HPOS10I"; PNG icon plus apple-touch-icon; description and theme-color meta; viewport meta.
  - `canvasResizePolicy` 2 (adaptive); `focusCanvas: true`.
  - The engine logo is hidden on the loading screen.
- **Caching:**
  - `mainPack` is versioned per commit. `index.js` and `index.wasm` are not, which is fine while the engine version stays the same.
  - Pages sends `max-age=600` and gzip for everything.
- **While loading:** a dark page with an indeterminate bar (FQ-04, FQ-27).

### 3. Input

- **Keyboard:** every key is bound by physical position (now guarded by a test), so the movement keys sit in the same place on any layout. Only the printed labels are wrong (FQ-07).
- **Gamepad:**
  - D-pad buttons 11–14, the left stick, jump on A/B/X/Y, pause on Start.
  - Deadzone 0.5 on every action (FQ-08).
  - Every gameplay action has both a key and a pad binding (test).
- **Pause and escape:** FQ-06.
- **F1 and other browser keys:** FQ-26.
- **Menu key repeat:** FQ-30.

### 4. Display (`core/display.gd` at 967b981)

Rule: integer scaling when the window is at least 2× the 424×240 base on both axes and the device isn't touch; otherwise fractional. Viewport stretch mode; pixel snap on (transforms and vertices).

| Window (inner size) | Mode | Scale | Picture | Used area |
|---|---|---|---|---|
| 1280×720 | integer | 3× | 1272×720 | 99 % |
| 1366×768 | integer | 3× | 1272×720 | 87 % |
| 1920×1080 (fullscreen) | integer | 4× | 1696×960 | 78 % |
| 1920×~940 (browser with bookmarks bar) | integer | 3× | 1272×720 | **51 % of the window** (FQ-05) |
| 2560×1440 | integer | 6× | 2544×1440 | 99 % |
| 844×390 phone, landscape (touch) | fractional | 1.625× | 689×390 | uneven pixel sizes, but the game fills the screen |

- **Integer vs fractional:** integer is right for desktop; it removes the 3- and 4-px-wide game pixels that fractional scaling makes at 4.5×. The threshold needs the FQ-05 refinement.
- **Physics interpolation:** recommend ON together with the FQ-01 line. It gives smooth 2–3 px per frame scrolling at 120/144 Hz instead of 0/6 judder, keeps gameplay byte-identical, and pixel snap keeps Sproto steady (see `03-camera.md`).

### 5. Code quality

- See FQ-10, FQ-11, FQ-19 to FQ-23 and FQ-26.
- No TODO, FIXME or HACK anywhere.
- No signal is connected twice, and no autoload depends on another at `_ready` time.
- Only one function is over 80 lines (`player_visual._draw_sproto`, 91), and the deepest nesting is 4 levels.
- Gameplay never runs in `_process`, except the GameState timer (FQ-10).
- Nothing unsafe for the web: no threads, `OS.execute`, `user://` use or `res://` writes. JSON files (for `anchors.json`) do ship in the pck; verified with `--export-pack`.

### 6. Tests and CI

- **Suite:** 159 tests (9 SKIP for parts not built yet), 7–9 s locally. Five runs gave byte-identical PASS lists, so no flaky tests.
- **CI:** 55 s – 1 min 27 s per run. The Godot editor and templates are cached; the import is not (it's fast).
- **Gates:** originality → tests → smoke → export → version patch → `web_check` → upload. Deploy needs the build job, and every step runs with `bash -e`.
- **Planted failures in a scratch copy:**
  - Originality hit, smoke parse error, failing assert, test parse error and hanging test all exit non-zero and would block a deploy.
  - A runtime script error inside a test does **not** (FQ-02).
- **Coverage gaps:**
  - Boot menu scene discovery in an exported build (`.remap` names).
  - `SceneRouter.respawn` lives handling in free scenes vs stages.
  - The GameState timer.
  - Dev timeline validation.
  - Accessory placement from `anchors.json`.
  - Anything browser-only: focus, keys, resize. That needs a headless-browser smoke test later.

### 7. Docs

- FQ-03, FQ-16, FQ-17, FQ-18 and FQ-24.
- The contract checker found **no signature drift**: every Player signal, method, arity, property and state, the 9 layers, the zone ids and the SFX/music names match.
- What's left is missing documentation plus items still pending on `physics`: GameCamera, `set_art_zone`, `--interp`.
- The README controls match `project.godot` exactly, and the play link is correct.

### 8. Repo hygiene

- 148 tracked files; the largest is a 119 KB QA evidence PNG.
- `.gitignore` covers `.godot/`, `build/*` (keeping `build/.gdignore`), `.worktrees/`, `_raw/` and OS junk. `.gitattributes` forces LF and marks binaries.
- Every `.gd` has its `.uid`. The only exception is under `qa/`, which has `.gdignore`, so that's fine.
- No stray files. `build/clips` and `build/gate` exist but are ignored. `CRASH/` is excluded and was not touched.

### 9. Originality and legal

- `originality_scan.sh` (439 terms) on the files of main, art, levels, physics and qa: **0 hits**.
- Commit messages with `--commits` on all five branches (70–78 commits each): **0 hits**.
- In-game text (boot menu, hints) is clean.
- The README disclaimer is clear: non-commercial, not affiliated, original, no real person. It isn't shown in-game yet (FQ-28).

### 10. Accessibility basics

- **Text size and contrast:** FQ-31.
- **Flashing:** FQ-13. The sprite is a small area, below the general-flash area threshold, but the blink rate should not depend on the display.
- **Not built yet:** the colour roles for enemies, hazards, springs and tickets against real backgrounds (checklist 06 ART-D3), and control remapping.

## Tools and tests added (branch `qa`)

- `tests/qa/test_project_setup.gd`:
  - every key bound by physical position;
  - every gameplay action has a key and a gamepad binding, with sane deadzones;
  - 424×240 viewport, nearest filtering, pixel snap;
  - physics ticks = `PhysicsConstants.FPS`;
  - the Web preset is single-threaded, excludes tests/tools/docs/qa, focuses the canvas, and uses adaptive resize.
- `tests/qa/test_playground_flow.gd`: death and respawn without a life lost; the `--accessory` preview; the F1 overlay toggle.
- `tests/qa/test_camera_review.gd`: 15 camera probes; they skip until the camera merges.
- `tools/qa/web_check.sh`: WARN when a versioned `mainPack` has no `fileSizes` key (FQ-04), and it accepts `?v=` keys.
- All of these pass on main (167 passed) and on main merged with `physics` (196 + 8).
- Available to promote (helper scripts, kept outside the repo for now):
  - a `CONTRACTS.md`-vs-code checker that labels each finding DRIFT, PENDING or NOT-YET;
  - a `prompts.md` row linter.
- QA owns the follow-up for both, and for FQ-23.
