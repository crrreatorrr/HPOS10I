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
- telegraph time × `Difficulty.telegraph_mult()` = 1 − 0.04·(D−1), never
  below 0.35 s

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
route length. The tier mix shows the percentage of enemies by tier.

| Act | D | Screens | Par time | Enemies/screen | Tier mix | Direction | New idea (teach → test → twist) | Checkpoints | Tickets/screen |
|---|---|---|---|---|---|---|---|---|---|
| Test zone | 0 | ~20 | 1:00 | 0.2 | T1 | R1 | Everything, gently | 1 | 6 |
| Z1 Act 1 | 1 | 30 | 1:45 | 0.4 | T1 100 | R1 | Loops, springs, boosters | 2 | 5 |
| Z1 Act 2 | 2 | 35 | 2:15 | 0.6 | T1 75 / T2 25 | R2 | Roll tunnels, quarter pipes, a breakable-wall secret, a first switchback | 3 | 4.5 |
| Z1 Boss (Rug Pull) | 2 | arena | – | – | – | – | – | – | – |
| Z2 Act 1 | 3 | 35 | 2:30 | 0.8 | T1 45 / T2 40 / T3 15 | R3 | Shifting staircases, moving bookshelves | 3 | 4 |
| Z2 Act 2 | 4 | 40 | 3:00 | 1.0 | T1 25 / T2 45 / T3 30 | R3 to R4 | Tower climb and hall maze; the flying-broom autoscroll chase | 4 | 4 |
| Z2 Boss (Library Demon) | 4 | arena | – | – | – | – | – | – | – |
| Z3 Act 1 | 5 | 40 | 3:00 | 1.1 | T2 50 / T3 40 / T4 10 | R4 | Rooftop speed run into ballrooms; doors and switches that open shortcuts | 4 | 3.5 |
| Z3 Act 2 | 6 | 45 | 3:30 | 1.2 | T2 35 / T3 45 / T4 20 | R4 | Underground bunker: vertical shafts up AND down, timed security beams, the exit reached by travelling left | 4 | 3.5 |
| Z3 Boss (Broccoli Head) | 6 | arena | – | – | – | – | – | – | – |
| Z4 Act 1 | 7 | 45 | 3:30 | 1.3 | T2 30 / T3 40 / T4 30 | R5 | Zone 1 ideas remixed at speed: reverse runs (right to left), vanishing neon platforms | 4 | 3 |
| Z4 Act 2 | 8 | 50 | 4:00 | 1.4 | T3 50 / T4 50 | R5 | A spiral ascent to the rooftop: everything combined, crossfire, timed platforms over pits | 5 | 3 |
| Z4 Boss (The Executive) | 8 | arena | – | – | – | – | – | – | – |

**Hazards** grow along the same curve:
- Z1: spikes and the odd pit.
- Z2: candle flames, falling books, crushing shelves.
- Z3: security beams, crushers, conveyor belts.
- Z4: everything, in neon, with vanishing platforms.

**Bosses** keep the director's rules (8 hits, 1–2 s of invincibility, faster
after hits 4 and 6, a telegraph before every attack). Each later boss starts
from a higher base aggression, using the same Difficulty multipliers.

## How it's checked

- `core/difficulty.gd` holds D and the numeric targets for every stage.
- QA's level lint measures each built act and fails if it's off the curve.
  It checks length, enemy density, tier mix, checkpoint count and spacing,
  ticket density, route count per third, vertical screens, leftward
  screens and dead ends.
- **Playtest bot:** it must finish every act, and its median time must
  rise from act to act.
- **Human playtest:** the director plays every act and gives feedback.
