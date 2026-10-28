# QA

Independent verification for HPOS10I. QA reads every branch and changes nothing
outside `qa/`, `tools/qa/` and `tests/qa/`; bugs go to the owning agent through
a report. This folder has a `.gdignore`, so Godot and the web export skip it.

| Path | What |
|---|---|
| `qa/checklists/01-physics.md` … `08-web.md` | One checklist per build step. Items have IDs (`PHY-B3`) and are tagged **[auto]** or **[manual]**. |
| `qa/reports/<NN>-<branch>.md` | One report per review, numbered in order (template below). |
| `tools/qa/scene_smoke.sh` | Runs every scene headless and flags errors and warnings. |
| `tools/qa/parse_check.gd` | Loads every script (used by the smoke run). |
| `tools/qa/originality_scan.sh` | Scans for existing franchises, real people and brands. |
| `tools/qa/denylist.b64` | The scan's term list, base64-encoded. |
| `tools/qa/web_check.sh` | Static checks on an exported web build. |
| `tools/qa/playtest_bot.gd` | Automated playtester for any level. |
| `tests/qa/test_contracts.gd` | Headless contract tests, auto-discovered by `tests/run_tests.gd`. |
| `tests/qa/inputs/` | Input timelines for repros and edge cases, added during reviews (export-excluded). |

All commands below run from the repo root. `P` is the project to test (a
worktree or a review copy, see "Reviewing a branch").

## Tools

### Scene smoke: `tools/qa/scene_smoke.sh [P]`

```bash
tools/qa/scene_smoke.sh                       # this checkout
FRAMES=300 TIMEOUT_S=90 tools/qa/scene_smoke.sh /path/to/review/copy
SMOKE_SKIP='^res://tests/' tools/qa/scene_smoke.sh   # skip by regex
```

Rows, in order:

1. `(import)`: `godot --import`.
2. `(scripts)`: loads every `.gd` once. `godot --import` does **not** report GDScript parse errors, so this row is what catches a broken script that no scene uses yet.
3. `(boot)`: the main scene with no arguments, like a player launching the game.
4. One row per `.tscn`, through the real boot path:
   `godot --headless --fixed-fps 60 --path P --quit-after 120 -- --scene=res://...`

A row fails on any `ERROR`, `SCRIPT ERROR` or `WARNING` line, a crash, a hang
(`TIMEOUT_S`, default 60 s) or a non-zero exit. Godot exits 0 even after script
errors, so the scan of the output is what matters. Full logs go to a temp
directory (printed; override with `SMOKE_LOG_DIR`). Skipped automatically:
`.godot/`, `.git/`, `.worktrees/`, `build/`, hidden folders and folders with a
`.gdignore`. Exit 0 = all pass, 1 = failures, 2 = usage error.

### Originality scan: `tools/qa/originality_scan.sh [P] [options]`

```bash
tools/qa/originality_scan.sh                      # tracked + untracked files of this checkout
tools/qa/originality_scan.sh /Users/kenhiraoka/Desktop/HPOS10I --no-files --commits=main..physics  # a branch's commit messages
tools/qa/originality_scan.sh P --reveal           # show terms in plain text (local only)
```

- Scans text files (`.gd .tscn .tres .md .json .cfg .yml .txt .html` and more), every file name and every folder name. Git-ignored files are skipped when `P` is a git checkout.
- Case-insensitive, accent-folded, whole-word: the characters around a term must not be letters, so `snake_case`, `kebab-case`, `camelCase`, plurals and possessives are caught while longer words that only contain a term are not.
- Output is `path:line: <masked term> [#id] | <masked excerpt>`. Terms (and paths that contain them) are masked by default (first and last letter kept), so the output can go straight into reports and CI logs. Never paste `--reveal` output into anything committed.
- Exit 0 = clean, 1 = hits, 2 = usage or denylist error.
- **Denylist:** `tools/qa/denylist.b64` is base64 of a plain list, one term per line; `#` lines are category comments; ids are line numbers. Edit it outside the repo and never commit the plain list:

  ```bash
  python3 -m base64 -d tools/qa/denylist.b64 > /private/tmp/terms.txt
  # edit /private/tmp/terms.txt
  python3 -m base64 -e /private/tmp/terms.txt > tools/qa/denylist.b64
  rm /private/tmp/terms.txt
  ```

  `--list-terms` prints the decoded list with ids, for local checks only.
- **False positives:** add `<path glob>` or `<path glob>:<line>` to `tools/qa/originality_allow.txt` (create it when first needed) after a human review, with a comment saying why.
- Categories covered: classic platformer mascots, their studios, characters, places and hardware; the boy-wizard book series (author, school, houses, characters, spells, places) and other wizard-school franchises; other game, film, TV, book and toy franchises and studios; real politicians, heads of state, royals and their offices; real business people; real-world brands, logos and crypto names. Very generic words (for example a plant, a colour or a common verb that is also a character name) are left out or only matched as a longer phrase.

### Web build check: `tools/qa/web_check.sh <build_dir> [--project=P]`

Get the latest `main` build and check it (download into a new empty folder
outside the repo; the build is data, never run anything from it):

```bash
gh run list -R crrreatorrr/HPOS10I -L 3
D=$(mktemp -d /private/tmp/web-build.XXXXXX)
gh run download <run id> -R crrreatorrr/HPOS10I -n web-build -D "$D"
tools/qa/web_check.sh "$D"
PCK_BUDGET_MB=30 TOTAL_BUDGET_MB=60 tools/qa/web_check.sh "$D"   # tighter budgets
```

Checks (PASS / FAIL / WARN / INFO lines): required files; `GODOT_CONFIG`
`fileSizes` match the files (catches truncated or stale uploads);
single-threaded (`GODOT_THREADS_ENABLED = false`,
`ensureCrossOriginIsolationHeaders: false`, no `*.worker.js`, and the wasm
linear memory is not shared, so no SharedArrayBuffer is needed); `.pck` and
total size against budgets (gzip sizes printed); the `.pck` directory is parsed
to confirm only Ogg Vorbis audio and no `tests/`, `tools/`, `docs/`, `qa/`,
`*.md` or `_raw/` content (if it cannot be parsed, the project is checked for
non-`.ogg` audio instead); viewport meta tag. Exit 0 = no FAIL, 1 = FAIL,
2 = usage error.

Local browser test (checklist 08, section D): `python3 -m http.server 8060 --directory "$D"` and open `http://localhost:8060/`.

### Contract tests: `tests/qa/test_contracts.gd`

```bash
godot --headless --fixed-fps 60 --path P -s res://tests/run_tests.gd                 # everything
godot --headless --fixed-fps 60 --path P -s res://tests/run_tests.gd -- --filter=qa  # QA only
```

Checks `docs/CONTRACTS.md`: level and boss-arena scenes use `LevelRoot` with
`PlayerStart` and `Bounds`; `SpriteFrames` have animations and frames (Sproto:
`idle`, `run` with 4+ frames, `jump`, `hurt`, 64×64 cells); accessories have
`head` anchors; asset folders use zone ids and background layer names; PNG
imports are pixel-art safe (lossless or VRAM uncompressed, no mipmaps; VRAM
compressed allowed for backgrounds); audio is `.ogg`; the player and camera
expose every contract method (with arity and `static`), typed property and
signal, are in their groups, and the player has a layer-5 hitbox that
`Player.from_area()` recognises; base class names and UI scene roots. Each
check prints `SKIP <reason>` and passes while its target does not exist.

### Playtest bot: `tools/qa/playtest_bot.gd`

```bash
godot --headless --fixed-fps 60 --path P -s res://tools/qa/playtest_bot.gd -- \
    --zone=test_zone --frames=7200 --out=/private/tmp/tz.json --record=/private/tmp/tz_inputs.json
godot --headless --fixed-fps 60 --path P -s res://tools/qa/playtest_bot.gd -- \
    --scene=res://playground/physics_playground.tscn --policy=fuzz --seed=3 --frames=36000
```

| Argument | Meaning |
|---|---|
| `--scene=res://...` | Open a scene (sandboxes). No zone is set, so after a death the game goes through the dev menu. |
| `--zone=<id> --stage=N` | Start a zone stage (real respawns, accessories, music). Prefer this for levels. |
| `--frames=N` | Physics frames to run (default 3600 = 60 s). 216000 = 1 hour. |
| `--policy=runner` | Default. Hold right; jump when blocked for 10 frames or every `--jump-every` frames (240; 0 = off); spin dash after 2 s without progress. |
| `--policy=fuzz` | Seeded random presses and releases every frame, plus rare pause toggles (`--seed=N`). |
| `--policy=none` | Send nothing; observe only. With `--inputs=<file>` the Dev autoload replays a timeline. |
| `--wait-player=N` | Frames to wait for a `player` node (default 300). |
| `--out=PATH` | Also write the JSON summary to a file. |
| `--record=PATH` | Write every input the bot sent as a Dev timeline (a repro). |

The bot boots through `core/main.tscn` exactly like a normal launch, finds the
player through the `player` group and reads only contract properties. It
prints a short text summary and one `PLAYTEST_RESULT {json}` line with:
`player_found`, `missing_contract`, `start`, `max_x`, `progress_px`, `deaths`
and `death_events`, `stuck_periods` (more than 5 s without x progress, with
frame range and position), `longest_no_progress_s`, `level_completed`,
`final` (position, state, speeds, angle, mode), `state_frames`, `scenes`,
`returned_to_menu`, `paused_frames`, `nan_frames`, `game_state` and `perf`
(node, orphan and memory trend for long runs). No player = it says so and
exits 0. Exit 2 = bad arguments, 3 = scene or zone not found.

**Repro timelines:** a timeline recorded by the bot replays frame-exactly both
under the bot (`--policy=none --inputs=<file>`) and in a normal launch, so it
works with the lead's clip recorder:

```bash
tools/lead/record_clip.sh bug_01 600 --scene=res://... --inputs=res://tests/qa/inputs/bug_01.json
```

Timeline format (frames are physics ticks since boot, 60 per second):
`{"events": [[30, "move_right", true], [90, "jump", true], [96, "jump", false]]}`.
Avoid a press and a release of the same action on the same frame: the Dev
loader sorts events with an unstable sort, so their order is not guaranteed.

## Reviewing a branch

Never run tools inside another agent's worktree: an import writes `.godot/`,
`.uid` and `.import` files into it. Review a clean copy with the current QA
tools laid over it (this is what the merge would contain):

```bash
B=physics
R=$(mktemp -d /private/tmp/qa-review-$B.XXXXXX)
git -C /Users/kenhiraoka/Desktop/HPOS10I archive "$B" | tar -x -C "$R"
cp -R tools/qa "$R/tools/" && mkdir -p "$R/tests" && cp -R tests/qa "$R/tests/"
godot --headless --path "$R" --import
godot --headless --fixed-fps 60 --path "$R" -s res://tests/run_tests.gd
tools/qa/scene_smoke.sh "$R"
tools/qa/originality_scan.sh "$R"
tools/qa/originality_scan.sh /Users/kenhiraoka/Desktop/HPOS10I --no-files --commits=main.."$B"
git -C /Users/kenhiraoka/Desktop/HPOS10I diff --name-only main..."$B"   # owned folders only
```

Then run the bot and the branch's checklist, write the report, and send the
bugs to the lead.

## Severity

| Severity | Meaning | Examples | Merge |
|---|---|---|---|
| **blocker** | Breaks the build, the tests, the web export, a contract other agents rely on, or the game for most players; or any originality/legal problem. | Script error at load; crash; softlock on the main route; tunnelling through walls at normal speed; a franchise or real-person name in the repo; a threaded web build. | Must be fixed before merge. |
| **major** | Clearly wrong behaviour players will notice, or a checklist value off spec, with a workaround. | Wrong top speed or jump height; loop fails at normal speed in one direction; pause lets a timer run; camera loses the player at top speed. | Fix in this step (may merge only if the lead accepts it). |
| **minor** | Polish, rare edge cases, cosmetic or dev-only issues. | One-frame animation pop; overlay text overlap; warning in a dev-only path. | Backlog. |

Raise severity when a bug is frequent, hard to notice in testing, or blocks
other agents. Every bug has exactly one owner (the folder owner in
`docs/CONTRACTS.md`).

## Report template: `qa/reports/<NN>-<branch>.md`

`NN` is the next free two-digit number. Re-checks after fixes get a new
report (or an appended "Re-check" section) that lists each bug as FIXED or
STILL OPEN.

````markdown
# QA report NN: <branch> @ <short sha>

- Date: YYYY-MM-DD
- Branch: `<branch>` @ `<sha>`, base `main` @ `<sha>`
- Checklist: `qa/checklists/0X-<step>.md`
- Review copy: `git archive` of the branch + QA tools at `qa` @ `<sha>`

## Verdict: MERGE | FIX FIRST

One or two sentences. FIX FIRST while any blocker is open.
Open bugs: N blocker, N major, N minor.

## Tool results

| Tool | Result | Notes |
|---|---|---|
| `godot --import` | PASS / FAIL | |
| Tests (`tests/run_tests.gd`) | NN passed, N failed | |
| `tools/qa/scene_smoke.sh` | N/N PASS | |
| `tools/qa/originality_scan.sh` (files + `--commits=main..<branch>`) | N hits | masked output only |
| `tools/qa/playtest_bot.gd` | runner: …; fuzz seeds 1–3: … | key JSON fields |
| `git diff --name-only main...<branch>` | owned folders only / list | |

## Checklist

| ID | Result | Evidence |
|---|---|---|
| PHY-A1 | PASS | `tests/core/test_core.gd` |
| PHY-B1 | FAIL | BUG-NN-01: frame 128 ground_speed 5.953 (`tests/qa/inputs/accel.json`) |
| PHY-L1 | SKIP | manual, needs a display; lead to check |

Every item of the checklist appears once: PASS, FAIL (with a bug id) or SKIP
(with the reason).

## Bugs

### BUG-NN-01: <short title>

- **Severity:** blocker | major | minor
- **Owner:** <agent> (`path/to/file.gd`)
- **Checklist:** PHY-B1
- **Repro:** input timeline `tests/qa/inputs/<name>.json`
  ```json
  {"events": [[0, "move_right", true], [200, "move_right", false]]}
  ```
  ```bash
  godot --headless --fixed-fps 60 --path <copy> -s res://tools/qa/playtest_bot.gd -- \
      --scene=res://... --policy=none --inputs=res://tests/qa/inputs/<name>.json --frames=300
  ```
- **Expected:** what the spec or checklist says, with numbers.
- **Actual:** what happens, with numbers (bot JSON fields, overlay values).
- **Evidence:** frames N–M (`tools/lead/record_clip.sh <name> <frames> --scene=... --inputs=...`,
  then `ffmpeg -i build/clips/<name>.mp4 -vf "select=eq(n\,N)" -vframes 1 frame_N.png`),
  log excerpt, JSON summary.

## Notes for the lead

- Risks, untested areas, LEAD-REQUESTs, suggested follow-ups.
````
