# QA report 04: Zone 1 (Retro Rush Hills) @ levels 878daeb

- **Date:** 2026-10-28
- **Reviewed:**
  - Branch `levels` at 878daeb (5abc5c0 levels, e879341 tests, main merged).
  - Also merged with main 709346f (`git merge-tree`: clean).
- **Checklists:** `qa/checklists/04-zones.md` (A–D, I, J, K) and the LEVELS.md rules, including rule 4, "momentum-friendly terrain".

## Verdict: MERGE

- **Both acts are on their rows:**
  - lint 0 errors;
  - the in-act ramp holds;
  - checkpoints sit at the finale starts and outside the boss gate.
- **Bots:**
  - The bot clears both acts every time with 0 deaths.
  - Median clear times rise act to act: 27.3 s (test zone) → 87.6 s (Act 1) → 123.7 s (Act 2).
  - Fuzz runs are clean.
- **Enemies:** the new T2/T3 enemies meet the telegraph floor even at difficulty 10.
- **Look:** the terrain is a diamond checker.
- **Open:** one tooling issue (Z1-01, minor) and two polish notes. Nothing blocks.

## Tool results

| Check | Result |
|---|---|
| Scope | Only `levels/` and `tests/levels/` changed against main. |
| Import / tests / smoke / originality | 0 errors / 436 passed, 0 failed / 32 of 32 / 0 hits (442 files) |
| Level lint, design rules | 0 errors in each act. 2 × `step.height` (16 px) per act at the spike blocks in the spring gates: accepted, as in the test zone. |
| QA momentum lint (new, rule 4) | 0 warnings on all three acts and the playground. It flags a ≥22° up-slope with under 64 px of flat run-up, and a checkpoint within 160 px before one. The fixture self-test (`tests/qa/test_momentum_rules.gd`) shows both warnings fire. |
| Act 1 (D1, R1) | See the difficulty table below. |
| Act 2 (D2, R2, before the boss) | See the difficulty table below. |
| Act-to-act order | 0 findings: enemy density rises 0.20 → 0.36 → 0.50, and the tier ceiling T1 → T2 → T3 counting the finales. |
| `difficulty_bot.sh` (5 runner variants per act) | Every run finishes. Medians 27.3 s → 87.6 s → 123.7 s, rising: PASS. Act 1 runs 83.6–109.5 s and Act 2 118.2–131.1 s, against par 150 s and 195 s. |
| Runner bots, detail | 0 deaths and no stuck period (over 5 s) before the goal in any of the 10 runs. The runner never attacks, so it is hurt often: 314–1,392 hurt frames per run. |
| Fuzz without pause | 2 seeds × 18,000 frames per act: 0 errors, 0 NaN, 0 deaths, 0 orphans. |
| Recorded runs | Replayed through the bot, headless and windowed: Act 1 reaches the goal at frame 3749 and Act 2 at 4644, 0 deaths. Through the documented plain boot they diverge (Z1-01). |

Difficulty, against each act's row:

| Measure | Act 1 (D1, R1) | Act 2 (D2, R2) |
|---|---|---|
| Length | 53.3 screens (row 45, +18 %) | 68.1 screens (row 55, +24 %, just inside the ±25 % band) |
| Enemies | 0.36 per screen (row 0.40) | 0.50 per screen (row 0.60) |
| Tier mix | T1 95 %, T2 5 % (the finale floater) | T1 65 %, T2 29 %, T3 6 % |
| Checkpoints | 3 | 4 |
| Tickets | 5.6 per screen (row 5.0) | 5.2 per screen (row 4.5) |
| Ramp, enemies per screen | 0.2 → 0.3 → 0.5 (finale 1.67× the middle, T2) | 0.3 → 0.5 → 0.7 (1.4×, finale T3) |
| Direction | R1 | R2: 1.4 leftward screens, 1.4 vertical |
| Checkpoint rules | finale-start checkpoint present; safe-spot clear | finale-start checkpoint, and one 192 px before the gate after the calm corridor; safe-spot clear |

Act 2 is 68.1 screens, just inside the +25 % band, so any added length would push it off its row.

## Checklist 04 status

| Items | Result |
|---|---|
| ZN-A1–A4 structure, smoke, originality | PASS |
| ZN-A5 parallax | PASS (placeholder backdrop until the art lands) |
| ZN-A6 zone music | `z1` exists |
| ZN-A7 accessory | none in Zone 1 (correct) |
| ZN-B1 bot | PASS, 0 deaths |
| ZN-B3 softlocks | none found by bots or fuzz; loop escape is guarded since 883c648 |
| ZN-B4–B8 | PASS (lint, the level agent's tests, fuzz) |
| ZN-B2, B9, B10, B11 | manual: in the lead's browser pass |
| ZN-I1–I9 difficulty curve | PASS (above) |
| ZN-I14–I17 ramp, finale checkpoint, gate checkpoint | PASS. Finale enemies read `Difficulty.local(progress_at(x))` (the level agent's `test_finale_enemies_are_livelier`). |
| ZN-J1 Chaser | PASS. QA probe: the rush starts 31 frames (D 1) and 22 frames (D 10) after the telegraph, never under 21. It notices Sproto 180 px ahead but not 260 px (sight 212). The level agent's tests cover the ledge and wall stops and the destroy rules. |
| ZN-J2 Floater | PASS (the level agent's tests: stays on its path at every D; destroyed at its height) |
| ZN-J3 Pellet pill | PASS. QA probe: fires 37/24 frames after the telegraph (D 1/10). At D 10 for 3,000 ticks at most 1 pellet is alive, so no pile-up. The level agent's tests cover jumping the pellet, pops at walls and ledges, no off-screen shots and no leaks over 5 minutes. |
| ZN-J5 Spike pill | PASS. QA probe: spikes come out 31/22 frames after the telegraph. A rolling Sproto is hurt while the spikes are out and the pill survives. The level agent's tests cover breaking it while retracted and interval scaling. |
| ZN-J4, J6–J10 (Armored, Diver, Splitter, Orbit, Sniper, Dropper) | not in Zone 1 |
| ZN-J11 fair spawns | PASS (`difficulty.safe_spot`: 0 findings in both acts) |
| ZN-K1 diamond checker | PASS. `tools/qa/checker_check.py` on an Act 1 frame: period 16 px, corr(8, 8) = -0.61, corr(8, 0) = 0.06, so a DIAMOND checker. A synthetic square checker is classified SQUARE. Evidence: `qa/reports/evidence/04-zone1/diamond_checker.png`. |
| ZN-K2 Zone 1 look | PASS (manual): sunny hills, waterfalls (decorative), loops, diamond dirt, and no existing game's landmarks. The backdrop trees are still the round placeholder ones; palm trees come with the art. |
| Z1-1 to Z1-4 | PASS. Waterfalls are decorative; the first spring, loop and enemy are safe. Z1-2 is guarded by `test_loop_escape.gd` on main. |

## Findings

### Z1-01: Recorded runs don't replay with the documented plain boot

- **Severity:** minor (dev tooling and evidence)
- **Owners:** lead (`core/dev.gd`) and levels (the meta note in the run files)
- **Repro:** `godot --path . --write-movie out.png --fixed-fps 60 --quit-after 3760 -- --zone=z1_retro_rush_hills --stage=1 --inputs=res://tests/levels/inputs/z1_act1_run.json`
- **Expected:** the run reaches the goal at frame 3749, as it does through `tools/qa/playtest_bot.gd --policy=none`, headless or windowed.
- **Actual:**
  - Through the plain boot the run desyncs. Sproto is hurt at 0:29 and 0:37, and at frame 3749 he is still mid-act (TIME 1:02).
  - Act 2 diverges the same way.
  - Evidence: `qa/reports/evidence/04-zone1/act1_run_windowed.png` and `act2_run_windowed.png`, last frames.
  - The bot boots `core/main.tscn` from a SceneTree script, so its tick 0 is one tick off the plain boot's. Timelines count "physics ticks since boot".
- **Fix:**
  - Start Dev's timeline clock when the target scene (the `--scene` or `--zone` stage) becomes current, rather than at process boot. Then both boot paths agree, and so do `record_clip.sh` clips.
  - Or note in the run files: "replay with `tools/qa/playtest_bot.gd --policy=none`".

### Z1-02: Walkers at the feet of descents

- **Severity:** polish (feel)
- **Owner:** levels
- **Observation:**
  - In both acts several T1 walkers wait at the foot of a downhill run, and the hold-right runner hits most of them.
  - This is within the rules: T1 can be rolled through, and the camera's look-ahead shows about 276 px ahead.
  - At top speed that is under 1 s of warning, so first-time players will take some hits.
- **Suggestion:** move one or two walkers 100–200 px past the slope feet, or put a ticket trail that cues a roll.

### Note: Act 2 length

68.1 screens is just inside the +25 % band. Any lengthening (a new set-piece) would push it off its row.

## Tools and tests added

- `tests/qa/test_enemy_behaviours.gd`: probes the telegraph floor at D 1 and D 10, chaser sight, pellet leaks and spikes against attackers. It skips per scene until the scene exists.
- `tests/qa/qa_level_lint.gd`: two new rules, `momentum.runup` and `momentum.checkpoint` (warnings).
- `tests/qa/test_momentum_rules.gd`: fixture self-test for those rules.
- `tools/qa/checker_check.py`: classifies a diamond vs square checker.
