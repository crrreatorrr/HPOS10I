# Level design and difficulty curve

The director's rule: **as you pass the levels, it gets harder**, in both
**enemy difficulty** and **direction difficulty** (how hard it is to find and
follow the way forward). Every act is built against this file. QA's level
lint measures each act against the targets in `core/difficulty.gd`. Owned by
the lead.

## Principles

1. **Teach, test, twist.**
   - Each act introduces one new idea where it's safe (no pit, no enemy
     nearby).
   - Then it tests the idea in the middle of the act.
   - Then it twists the idea near the end (combined with an enemy, a
     hazard or speed).
2. **Speed is the reward.**
   - Every act has a fast HIGH route for skilled players and a safer, slower
     LOW route.
   - Later acts make the high route harder to stay on (narrower, more
     enemies, timing) and the low route longer and more maze-like.
3. **Fair, never cheap.**
   - Every hazard and attack is telegraphed, for at least 0.35 s and longer
     early on.
   - No blind drops into pits: show the landing, use arrow signs, or let
     look-down reveal it.
   - Nothing that can't be avoided at top speed: an enemy on a fast route is
     visible at least 1 s ahead at that speed, or can be destroyed by a
     rolling Sproto.
   - No enemy within 2 screens after a spring landing, a loop exit or a
     checkpoint until difficulty 5.
4. **Readable direction.** When the way forward isn't simply "right":
   - Signal it with level art (arrows, lit doors, ticket trails).
   - Never require backtracking more than 3 screens without a visible
     reason.
5. **Generosity tapers off.**
   - Ticket density and checkpoint frequency drop slowly across the game.
   - Extra lives move from in plain sight to hidden.

## Enemy tiers (pill robots, see docs/DESIGN.md)

| Tier | Name | Behaviour | How to beat it |
|---|---|---|---|
| T1 | Walker | Patrols, turns at walls and edges | Jump or roll |
| T1 | Hopper | Bounces in place on a timer | Time the jump |
| T2 | Chaser | Patrols; sees Sproto within 6 screens' width ahead, telegraphs (eye flash), then rushes | Jump over or roll through |
| T2 | Floater | Hovers on a sine path | Jump to its height |
| T2 | Pellet pill | Stands still; telegraphs, then fires a slow pellet along the ground or in an arc | Jump the pellet, or hit it between shots |
| T3 | Armored pill | Front shield; hit from above or behind, or roll into it at ground speed 4.5 or more | Spin dash or bounce on it |
| T3 | Spike pill | Spikes pop out on a timer (telegraphed) | Hit while retracted |
| T3 | Diver | Hovers, telegraphs, then swoops at where Sproto was | Move after the telegraph |
| T4 | Splitter | Pops into two mini pills on the first hit | Chain bounces |
| T4 | Orbit shield | Two capsule shields orbit it | Hit through the gap |
| T4 | Sniper | Aimed 3-shot burst after a long telegraph | Break line of sight |
| T4 | Dropper | Hangs from the ceiling, drops when Sproto passes under it | Don't linger |

Each zone dresses these behaviours in its own costume (DESIGN.md):
- **Wizard Academy:** the spellbook pill is a Floater or Diver; the knight
  pill is the Armored pill.
- **Capital Mansion:** the drone pill is a Floater or Diver with a
  searchlight; the clerk pill is a Pellet pill throwing paper in arcs.
- **Neon Rush Remix:** neon pills are the T3/T4 versions.

**Aggression scaling.** On top of placement, every enemy reads the act's
difficulty D (1–8, from `Difficulty.current()`):
- speed × `Difficulty.speed_mult()` = 1 + 0.06·(D−1), so up to +42%
- attack interval × `Difficulty.interval_mult()` = 1 − 0.05·(D−1), so down
  to −35%
- telegraph time via `Difficulty.telegraph(seconds)` = seconds ×
  (1 − 0.04·(D−1)), never below 0.35 s

The same Walker is noticeably livelier in Zone 4.

## Direction difficulty, explained

| Level | What it means |
|---|---|
| R1 Straight | Mostly left to right. High and low routes split and rejoin within a few screens. No dead ends. |
| R2 Switchback | Short leftward runs (1–2 screens), and a spring chain or slope that climbs a screen. |
| R3 Vertical | Real climbs and descents of 2–4 screens, staircases that zigzag up and down, routes that cross. |
| R4 Maze | Hall networks with 1–2 dead ends (holding secrets), doors or switches that open shortcuts, leftward travel to reach the exit. |
| R5 Gauntlet | Several routes with very different risk. The fast route demands precise jumps at speed. Forced-direction sections (autoscroll, reverse runs). |

## The curve

Lengths are in screens (424 px). Enemy density is enemies per screen of
route length. The tier mix shows the percentage of enemies by tier. The
director asked for longer acts, so they run about 50–70% longer than the
first draft, with more checkpoints so a death never sends you far back.

| Act | D | Screens | Par time | Enemies/screen | Tier mix | Direction | New idea (teach → test → twist) | Checkpoints | Tickets/screen |
|---|---|---|---|---|---|---|---|---|---|
| Test zone | 0 | ~20 | 1:00 | 0.2 | T1 | R1 | Everything, gently | 2 | 6 |
| Z1 Act 1 | 1 | 45 | 2:30 | 0.4 | T1 100 | R1 | Loops, springs, boosters | 3 | 5 |
| Z1 Act 2 | 2 | 55 | 3:15 | 0.6 | T1 75 / T2 25 | R2 | Roll tunnels, quarter pipes, a breakable-wall secret, a first switchback | 4 | 4.5 |
| Z1 Boss (Rug Pull) | 2.5 | arena | – | – | – | – | – | – | – |
| Z2 Act 1 | 3 | 55 | 3:30 | 0.8 | T1 45 / T2 40 / T3 15 | R3 | Shifting staircases, moving bookshelves | 4 | 4 |
| Z2 Act 2 | 4 | 65 | 4:15 | 1.0 | T1 25 / T2 45 / T3 30 | R3 to R4 | Tower climb and hall maze; the flying-broom autoscroll chase | 5 | 4 |
| Z2 Boss (Library Demon) | 4.5 | arena | – | – | – | – | – | – | – |
| Z3 Act 1 | 5 | 65 | 4:15 | 1.1 | T2 50 / T3 40 / T4 10 | R4 | Rooftop speed run into ballrooms; doors and switches that open shortcuts | 5 | 3.5 |
| Z3 Act 2 | 6 | 75 | 5:00 | 1.2 | T2 35 / T3 45 / T4 20 | R4 | Underground bunker: vertical shafts up AND down, timed security beams, the exit reached by travelling left | 6 | 3.5 |
| Z3 Boss (Broccoli Head) | **8** | arena | – | – | – | – | – | – | – |
| Z4 Act 1 | 7 | 75 | 5:00 | 1.3 | T2 30 / T3 40 / T4 30 | R5 | Zone 1 ideas remixed at speed: reverse runs (right to left), vanishing neon platforms | 6 | 3 |
| Z4 Act 2 | 8 | 85 | 5:45 | 1.4 | T3 50 / T4 50 | R5 | A spiral ascent to the rooftop: everything combined, crossfire, timed platforms over pits | 7 | 3 |
| Z4 Boss (The Executive) | **10** | arena | – | – | – | – | – | – | – |

## Rising difficulty inside every act

The director asked for difficulty to build towards the end of each level,
peaking right before the boss. Every act has three sections along its
route, measured by progress from 0 (start) to 1 (goal):

| Section | Progress | Enemy difficulty | Enemy density | Highest tier | Feel |
|---|---|---|---|---|---|
| Opening | 0–25% | D − 0.5, rising to D | 0.7× | the act's lowest tiers | Teach the act's new idea safely |
| Middle | 25–75% | D | 1.0× | the act's tier mix | Test it, with high and low routes |
| Finale | 75–100% | rising to D + 0.75 | 1.4× | one tier above the act's ceiling (max T4) | Twist: the idea combined with enemies, hazards and speed |
| Finale, act before a boss | 75–100% | rising to D + 1.5 | 1.4× | one tier above the act's ceiling (max T4) | The **boss approach gauntlet** (below) |

Enemies get their local difficulty from where they stand:
`Difficulty.local(LevelRoot.progress_at(global_position.x))`. They pass it
to `speed_mult()`, `interval_mult()` and `telegraph()`, so the same enemy
is quicker and more aggressive near the end of an act.

**Boss approach gauntlet** (the last quarter of each zone's Act 2):
- Combines every mechanic the zone has taught, at the highest density in
  the zone.
- The high route is the hardest stretch of the act; the low route is
  longer and full of hazards.
- Opens with a checkpoint (the finale checkpoint). It ends with a short
  calm corridor holding a few tickets and a checkpoint right outside the
  arena gate, so a failed boss attempt never replays the gauntlet.

**Fairness still holds:** telegraphs never drop below 0.35 s, there are no
blind drops, and every finale starts at a checkpoint.

**Hazards** grow along the same curve:
- Z1: spikes and the odd pit.
- Z2: candle flames, falling books, crushing shelves.
- Z3: security beams, crushers, conveyor belts.
- Z4: everything, in neon, with vanishing platforms.

## Bosses

Every boss keeps the director's rules:
- 8 hits, landed by jumping or rolling into the weak point
- 1–2 s of invincibility after each hit
- faster after hits 4 and 6
- the camera locked to the arena
- a clear telegraph before every attack
- on defeat: an explosion, the gate opens, a score tally

Difficulty comes from `Difficulty.boss(zone_id)`. **The last two bosses
are deliberately very difficult** (director):

| Boss | D | Weak-point window | Attacks chained per opening | Base telegraph | Speed-up after hits 4 and 6 | Desperation (hits 7–8) | Ticket refills |
|---|---|---|---|---|---|---|---|
| The Rug Pull (Z1) | 2.5 | 2.0 s | 1 | 0.8 s | ×1.15 | no | 3 |
| Library Demon (Z2) | 4.5 | 1.7 s | 2 | 0.7 s | ×1.15 | no | 2 |
| **Broccoli Head (Z3)** | **8** | **1.1 s** | **3** | **0.5 s** | **×1.25** | **yes** | **1** |
| **The Executive (Z4)** | **10** | **0.9 s** | **4** | **0.45 s** | **×1.3** | **yes** | **1** |

**Broccoli Head, very difficult:**
- **Phase 1 (hits 1–4):** each cycle chains 3 attacks before the hair-fix
  pause (the weak point):
  - hoverboard zips across the arena at two heights
  - bouncing energy-drink cans that split on their second bounce
  - a fake-out zip that stops short
- **Phase 2 (hits 5–6):**
  - tornado dashes across the floor; jump them, or spin dash under at speed
  - the chandelier drops sparks over half the arena at a time, as a moving
    no-go zone, *during* his attacks
- **Desperation (hits 7–8):**
  - tornado and can throws overlap
  - the hair-fix pause shrinks to 1.1 s
  - he zips to a random side after each hit
- **Tickets:** one refill, after hit 4 only.

**The Executive, very difficult (the final boss):**
- **Phase 1 (hits 1–4):** each cycle chains 4 attacks before the
  phone-check pause (the weak point):
  - briefcase throws that burst into paper storms (drifting, damaging
    sheets that linger 2 s)
  - a "market crash" of falling chart arrows in telegraphed lanes, with
    gaps that move
  - a quick dash
  - a double briefcase
- **Phase 2 (hits 5–6):**
  - the rooftop splits into floating platforms over a deadly drop
  - he slides between them on the giant red chart arrow and knocks
    platforms loose; they respawn on a timer
  - the paper storms push Sproto sideways
- **Desperation (hits 7–8):**
  - market crash and briefcase storms at once
  - the phone check shrinks to 0.9 s
  - platforms crumble a second after you land
- **Final hit:** slow motion, the tie flies off, Sproto poses.
- **Tickets:** one refill, after hit 4 only.

**Fairness is not optional, even here:**
- Every attack is telegraphed: at least 0.35 s, and longer for anything
  that fills the screen.
- There's always a safe spot or a dodge.
- No attack can hit the instant Sproto respawns.
- Invincibility frames after a hit are honoured.
- The checkpoint outside the arena means a failed attempt restarts the
  boss, not the act.
- QA must show a human-viable no-damage route exists for every phase.

## How it's checked

- `core/difficulty.gd` holds D and the numeric targets for every stage.
- QA's level lint measures each built act and fails if it's off the curve.
  It checks length, enemy density, tier mix, checkpoint count and spacing,
  ticket density, route count per third, vertical screens, leftward
  screens and dead ends, plus the in-act ramp: finale density at least
  1.3× the middle, and a checkpoint at the finale start and outside every
  boss gate.
- **Playtest bot:** it must finish every act, and its median time must
  rise from act to act.
- **Human playtest:** the director plays every act and gives feedback.
