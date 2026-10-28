# QA report 09: Zone 2 (Wizard Academy) @ levels 5f925ee

- **Date:** 2026-10-28
- **Reviewed:** branch `levels` at 5f925ee (main bcc7431 merged in; only `levels/` and `tests/levels/` changed). Acts 1 and 2, the Dropper and lantern pill, the Zone 2 tile palette, the Zone 1 polish (Z1-02) and the recorder fixes.
- **Checklists:** 04-zones (A–C, I, J, K), 01 M (moving terrain), LEVELS.md rules.

## Verdict: MERGE

Both acts sit on their rows, every bot and fuzz run is clean, the autoscroll section is safe, the "dead ends" are cliff faces beside lifts and terrace steps, not traps, and the new Dropper keeps the telegraph floor and respawn safety. Two polish notes, no bugs.

## Tool results

| Check | Result |
|---|---|
| Import / tests / smoke / originality | 0 errors / 524 passed, 0 failed (QA probes included) / 52 of 52 / 0 hits (566 files) |
| Level lint, every act | 0 errors. Zone 2: 0 warnings. Zone 1 and the test zone keep their two accepted spike-step warnings each. New rules in force: `enemy.diver_post` (≥ 120 px), `difficulty.safe_spot`, the momentum rules: all clean. |
| Act-to-act order (5 acts) | 0 findings |
| `difficulty_bot.sh`, 5 runner variants per act | 25 of 25 runs finish. Medians rise: 28.1 s (test) → 91.0 (Z1 A1) → 132.0 (Z1 A2) → 143.2 (Z2 A1) → 175.1 (Z2 A2). |
| Runner bots with detail (jump every 45 / 150) | Both acts: goal reached, no stuck period before the goal. Two of four runs died once in a pit (Act 1 at x 24062, Act 2 at x 20185); the bot never looks before it leaps. |
| Fuzz, no pause, 2 seeds × 18,000 frames per act | 0 errors, 0 NaN, 0 deaths, 0 orphans; nodes fall as tickets are taken. |
| Recorded runs, new timeline clock | All five reach the goal on the recorded frame, headless **and** windowed: test zone 1518, Z1 Act 1 4232, Z1 Act 2 5120, Z2 Act 1 6667, Z2 Act 2 9506. |
| QA enemy probes (`test_enemy_behaviours.gd`) | Chaser, pellet pill, spike pill as before; **Dropper** (new): drops 31 ticks after its telegraph at D 1 and 22 at D 10 (floor 21); a Sproto placed under a fresh dropper for 300 ticks never triggers it; leaving and coming back does. |
| QA Zone 2 block probes | Still pass with the diver's `min_dive_drop` (posts at 150 px in the acts). |

Difficulty, against the rows:

| Measure | Act 1 (D3, row R3) | Act 2 (D4, row R4, before the boss) |
|---|---|---|
| Length | 67.3 screens (row 55, +22 %) | 76.1 screens (row 65, +17 %) |
| Enemies | 0.70 per screen (row 0.8) | 0.79 per screen (row 1.0) |
| Tier mix | T1 36 / T2 32 / T3 28 / T4 4 | T1 27 / T2 45 / T3 23 / T4 5 |
| Ramp, enemies per screen | 0.4 (T2) → 0.7 (T3) → 1.0 (T4) | 0.6 (T2) → 0.6 (T3) → 1.3 (T4) |
| Checkpoints | 4, one at the finale start | 5, one at the finale start and one 192 px before the gate |
| Tickets | 4.6 per screen (row 4.0) | 4.6 per screen (row 4.0) |
| Direction | R4 (vertical 3.4 screens, 7 dead ends) | R4 (vertical 3.1, leftward 1.4, forced 1, 6 dead ends) |

- Act 1 measures R4 against a row of R3: harder, allowed (the lint only fails below the row).
- The T4 share (4–5 %) is the finale droppers; the rows have no T4 column, so the tier-mix warning threshold (25 points) is not reached. Fine for D3–4.

## The lint's "dead ends"

I listed the 7 + 6 spots and what stands within 220 px of each:

- **Beside lifts (4 + 3):** two staircase flights (`Step2..Step5` 32–191 px away, in both acts) and the two `BookshelfLift` shelves (90 px away). The cliff face next to a lift is the lift's own wall: the rule "a wall over 96 px with no spring" fires because it doesn't know lifts.
- **Finale terraces (3 + 3):** at Act 1 x 25377/26241/26753 (y −480 → −320 → −160) and Act 2 x 28065/29025/30081 (y −640 → −512 → −384): a descending flight of terraces with a walker, hopper, chaser or pellet pill on the ledge above each face. The "dead end" is the face of the step above, seen from the lower terrace, which the route descends. Nobody travels up them.
- Bots: 14 runner runs and 4 fuzz runs on the two acts, no stuck period anywhere. So none is a trap.
- QA follow-up: teach the lint about lifts (a MovingBody within 160 px of the wall) and about terrace faces behind the travel direction; both acts would then count 0–2.

## Autoscroll section (Act 2, the broom chase)

- Starts at x 8304, 2560 px long (6.0 screens), 90 px/s.
- A checkpoint sits 896 px (2.1 screens) before its start (x 7408), the next one 1088 px after its end. A respawn restarts the section from its trigger (the level agent's test).
- Enemies inside its span: five spellbook pills (floaters) only; no ground enemies, no crushers.
- Crush fairness, death stopping the scroll, reload and pause are covered by the level agent's `test_z2_objects.gd`, which passes. The recorded run goes through it without damage.

## Zone 1 after Z1-02

- Lint: 0 errors, the same two accepted warnings per act.
- Lengths unchanged: Act 1 53.3 screens, Act 2 68.1 screens. Tickets 303 / 359 (was 299 / 354).
- The level agent's Z1 tests and the recorded Z1 runs (4232 / 5120 under the new clock) pass.
- The bot medians moved from 87.6 / 123.7 to 91.0 / 132.0 s, still rising act to act.

## Look and originality

Evidence in `qa/reports/evidence/09-zone2/`: `act1_opening.png` (the first 160 frames of the Act 1 run), `tileset.png` (the Zone 2 tile palette) and `blocks_and_lantern_pill.png` (every block and costume side by side).

- Tiles: grey stone brick with a purple-and-gold rune lip, slope tiles in the same stone. No brown-and-tan checker.
- Backdrop: a placeholder night skyline with a crescent moon and a dark lawn. Sproto wears the zone's wizard hat (the accessory works).
- Costumes: purple and cream capsules on books (spellbook pill and diving spellbook), a plain knight with helmet and plume, and the lantern pill in a gold cage that glows while it shakes. The plain Dropper is a bare capsule on a chain.
- No crests, no house colours, no scarves, no lightning marks, no names from existing wizard stories. Originality scan: 0 hits over all 566 files, node names and tile resources included.

## Movie Maker freezes: yes, seen here too, and it is not the game

- Long `--write-movie` runs froze on this machine today in every form: the plain `--zone` launch (Zone 2 and Zone 1 alike: 23–484 unique frames of 400–3000), a `--scene` playground run (fine, 393 of 400), and even the bot path, which stalled at frame 947 and died. Six retries of the Zone 2 runs all froze. Short recordings (150 frames) still succeed every time.
- The frozen frames repeat the last drawn image, HUD timer included, while physics keeps running (the replays above all finish on their recorded frame). That is the macOS redraw throttle on a window it considers occluded or idle, which `caffeinate` and always-on-top no longer prevent on this machine today; earlier in the day the same commands recorded 4,700-frame runs cleanly.
- So: not a Zone 2 problem. `record_clip.sh`'s always-on-top plus unique-frame retry is the right guard, and a better fix is to render clips through a `SubViewport` saved frame by frame from a headless-style script rather than through the OS window. QA will try that for the next long clip.

## Findings

| ID | Severity | Owner | Finding | Fix |
|---|---|---|---|---|
| Z2-01 | polish | levels | Act 1's finale (from x ≈ 21144) has pits the runner bot falls into once in two runs (x 24062); Act 2 likewise at x 20185. Players look before they jump, the bot doesn't, so this is a note, not a bug: confirm the landings are visible (LEVELS.md "no blind drops"). | A ticket arc over each pit, or a look-down cue. |
| Z2-02 | polish | qa | The dead-end rule counts lift walls and terrace faces. | Lint follow-up above. |
