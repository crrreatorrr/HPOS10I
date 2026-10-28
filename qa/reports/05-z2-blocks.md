# QA report 05: Zone 2 building blocks @ levels c7258c2 (9cf26ab + main)

- **Date:** 2026-10-28
- **Reviewed:**
  - Branch `levels` at c7258c2: 31d3d57 objects and 9cf26ab enemies, then main merged in.
  - Only `levels/` and `tests/levels/` changed against main.
  - The Zone 2 acts are not built yet.
- **Checklists:**
  - 01 M (moving terrain);
  - 04 J (enemy behaviours) and K (zone looks);
  - 02 TL-D7, new: directional art.

## Verdict: FIX FIRST (diver only, BUG-Z2-01)

- **Everything else is MERGE:** the staircase, bookshelf, candle, falling book, autoscroll, spellbook and knight pills, MovingBody and LevelDifficulty.
- **The diver** breaks the accepted fairness rule at high difficulty when it hangs low over the floor. The fix is small.

## Tool results

| Check | Result |
|---|---|
| Import / tests / smoke / originality | 0 errors / 472 passed, 0 failed / 42 of 42 / 0 hits (with the narrowed allowlist) |
| The level agent's tests | `test_z2_objects.gd` (16) and `test_z2_enemies.gd` (11) all pass. |
| QA probes, new `tests/qa/test_z2_blocks.gd` (skips per scene until it exists) | All pass except the diver, which hits BUG-Z2-01. Details below. |

QA probe results:

- **Telegraph floors at local D 1 and D 10.** Ticks from the first `telegraphed` signal to the first move or harm; the floor is 21 ticks (0.35 s).

  | Block | D 1 | D 10 |
  |---|---|---|
  | Staircase (shift) | 32 | 23 |
  | Bookshelf (close) | 37 | 24 |
  | Candle (flare) | 31 | 22 |
  | Falling book (drop) | 31 | 22 |

- **Riding:** a staircase step at D 1 and D 10 for 600 ticks, and a bookshelf top at D 10. Drift 0.000 px, never airborne, never crushed. This matches the moving-terrain contract (carry by the body's real motion).
- **Falling book respawn safety:**
  - A book spawned above a standing Sproto stays put for 240 ticks.
  - After he leaves and comes back it telegraphs.
- **Knight, both facings, ground approaches:**
  - Slow roll (3 px/f) into the front: hurt, not destroyed.
  - Fast roll (6 px/f) into the front: destroyed.
  - Slow roll into the back: destroyed.
  - Walking into the front or the back: hurt.
  - The level agent's tests cover jumps and falls from above, and the full spin dash.

## Checks by area

| Area | Result |
|---|---|
| Moving terrain contract (01 M) | PASS. `MovingBody` follows the reference: `move_to()` every tick, `platform_delta()`, `target_position()`, and `teleport()` resets interpolation without carrying him. The staircase eases and caps its shifts (≤ 6 px/f down). The bookshelf crushes only after its telegraph and pushes him out otherwise (level agent's tests). QA rides drift 0.000. Level note: keep 39 px of headroom above the highest staircase layout. |
| Telegraphs ≥ 0.35 s at the hardest local D | PASS for every object (table above), and for the diver at every height (it telegraphs 23 ticks at D 10). |
| Falling-book respawn safety | PASS (QA probe and the level agent's `test_book_never_drops_on_a_respawn_underneath`) |
| Autoscroll: edges, crush, death, reload, pause | PASS (level agent's tests, with LevelRoot and GameCamera; details below) |
| Armored / knight: four approaches | PASS (QA ground approaches at both facings; level agent's jump, fall and spin dash tests) |
| Diver: lock at telegraph start, reacting at the flash avoids it | **FAIL at high D for low posts:** BUG-Z2-01 |
| Costume originality and zone look (04 K3) | PASS (manual, gallery below) |
| Directional art (new TL-D7, ZN-B12) | PASS for these blocks. Each knight draws its shield on the side it faces, at both facings. The bookshelf slides out of its alcove the way its `travel` points. The broom sweeps along the left edge it pushes from. Springs are covered by the lead's `test_spring_art.gd` on main. |
| Z1-01 (timeline clock) re-check | **FIXED** on main 6db21c8 (details below) |

Autoscroll, as tested by the level agent:
- It starts at the start line and scrolls at 2 px/f.
- Sproto is never ahead of the right edge, and the left edge pushes him along.
- Pinned against a wall he is crushed; the scroll stops and `clamp_rect` is cleared.
- A respawned act starts the section over.
- Pausing pauses the scroll.

Costume gallery (`qa/reports/evidence/05-z2-blocks/z2_blocks_gallery.png`):
- Purple-and-cream capsules on enchanted books (spellbook pill and diver).
- Knight pills with a plain grey shield, helmet and plume, without crests.
- A stone staircase with a rune line, a plain candle with a tall flare, and a purple book.
- No crests, no house-coloured scarves, no lightning marks, and no names from existing wizard stories (the scan is clean).

Z1-01 re-check:
- The plain launch (`-- --zone --stage --inputs`) and the bot replay both finish Act 1 at timeline frame 3748 and Act 2 at 4643.
- QA's `playtest_bot.gd --record` now counts frame 0 from the tick the boot target becomes current, the same clock as Dev.
- A new runner recording on Act 1 finishes at timeline frame 5255 in the recording run, the plain-launch replay and the bot replay alike.

## BUG-Z2-01: A low diver can't be outrun at high difficulty

- **Severity:** major. It breaks the accepted fairness rule: "reacting at the flash must always avoid it, at the easiest and the hardest D".
- **Owner:** levels (`levels/enemies/diver.gd`)
- **Repro:** `tests/qa/test_z2_blocks.gd :: test_diver_reacting_at_the_flash_always_avoids_it`, and a QA sweep.
  - A diver (spellbook costume) hovers `depth` px above a flat floor, with Sproto standing still under it.
  - The moment it telegraphs, he holds left or right.
- **Expected:** he is never hit.
- **Actual:** hit at these post heights above the floor:

  | Local D | Hit at | Safe from |
  |---|---|---|
  | 1 and 4 | never | 60 px |
  | 6 and 8 | 60 px | 80 px |
  | 10 | 60, 80 and 100 px | 120 px |

  - At D 10 the telegraph is 23 ticks and the swoop 6.2 px/f, so a nearby target is reached about 33 ticks after the flash.
  - From a standstill Sproto covers only about 26 px in that time, less than the reach of his body plus the diver's.
  - Zone 2 itself tops out around D 5.5 (Act 2's pre-boss finale), so Zone 2 posts at 80 px or more are safe. The same block is meant for Zones 3–4 (up to about D 9.5).
- **Fix (any one):**
  - Don't dive at a target less than about 120 px below the post: a minimum `range_y`, so a close Sproto is ignored or the diver first rises to 120 px.
  - Or stretch the telegraph so that telegraph + flight time ≥ about 45 ticks for close targets.
  - Or make it a placement rule, posts ≥ 120 px above the floor beneath, which QA would add to the lint.
- **The QA probe stays:** it checks 80, 150 and 220 px at D 1 and D 10, both directions.

## Notes for the Zone 2 acts

- **Divers:** keep posts at least 80 px above the floor beneath in Zone 2 (the 120 px fix makes this moot).
- **Staircase headroom:** 39 px above the highest layout.
- **Checkpoints:** never on a moving step or shelf.
- **Autoscroll:** put a checkpoint before every autoscroll start (the section restarts on a respawn).
