# Design notes

Visual and naming decisions from the director. Owned by the lead. The art
agent turns these into Higgsfield prompts; placeholders in code follow them
too. Everything here is original: never copy an existing character's
silhouette, face or signature features.

## Art direction

The director wants the look of a classic early-1990s 16-bit console
platformer: bright, fast, glossy and detailed. Match that era's style, but
never its actual assets, characters, level layouts or the names of existing
games (prompts included).

- **Palette:**
  - Saturated and sunny.
  - Each material has a 3–5 step colour ramp, lit from the top-left.
  - Far layers are lighter and bluer (atmospheric depth); near layers are
    the richest.
- **Pixels:**
  - Crisp pixels on a true grid, no blur or smearing.
  - Dithering only where it reads as texture.
  - Sprites have a 1 px dark outline (not pure black); backgrounds don't.
- **Terrain:**
  - A bright grass lip with a highlight row and hanging tufts along every
    top surface.
  - Under it, patterned dirt: Zone 1 uses a diamond/argyle checker in warm
    oranges and browns, with soft shading toward the bottom.
  - Rock or cliff faces on steep sides.
  - Each zone swaps the material set (castle stone, marble and lawn, neon
    grid).
- **Backgrounds:**
  - 4 parallax layers, full of detail: layered clouds, distant sea or
    mountains, hills with waterfalls, and palm trees in the foreground.
  - Animated touches where cheap: water sparkle, waterfall shimmer.
- **Sprites:**
  - Readable silhouettes at game size.
  - Sproto is about 40 px tall in a 64×64 cell.
  - Expressive key poses; spin balls with clear motion.
- **Feel:**
  - Dust puffs on skids, landings and spin dashes.
  - Sparkles on ticket pickup.
  - A short afterimage trail at very high speed.
  - Popping capsule halves when a pill robot is destroyed.

## Sproto (player)

A small, very fast creature, the mascot of the game.

- **Head:** round, with 2–3 soft upward spikes on top. The spikes grow
  ONLY from the blue half of the head, so the yellow face half has none
  (director's note). Never swept-back spikes.
- **Face:**
  - Split down the middle: blue on one side, yellow on the other.
  - Big round white eyes with black pupils and a white shine, and no heavy
    eyelids.
  - A round red clown nose.
  - A wide red grin drawn in a simple cartoon style.
- **Body:** blue with yellow accents, a red collar or scarf, and a small
  golden-ticket badge on the collar.
- **Feel:** cheeky and upbeat. Readable at 64×64 px game size.
- **Accessories:** a wizard hat in Wizard Academy and sunglasses in Capital
  Mansion, drawn as overlays (see CONTRACTS.md).
- **Off-limits:** a frog-like face (droopy eyelids, wide fleshy lips) and
  swept-back spiky quills, which belong to an existing game mascot.

## Golden tickets (collectible)

Shiny gold paper tickets with a punched edge and a small star. Never use a
real brand's ticket or wrapper design.

- Collected one at a time. 100 give an extra life.
- When Sproto is hit, the tickets he carries scatter in a fan, bounce, and
  can be grabbed back before they fade.
- In code and assets they are called `ticket` / `tickets`.

## Pill robots (standard enemies)

Small robots built from two-tone medicine capsules. They're the game's
basic enemies.

- **Body:**
  - A rounded capsule split across the middle into two colours. The
    basic version is mint green and white.
  - A bold dark outline (1 px at game size, like every sprite), a soft
    shadow on one side, and a white
    dashed shine on the coloured half.
- **Robot parts:**
  - A dark visor slit with one or two glowing eye dots.
  - A small antenna.
  - Bolts or rivets on the seam band.
  - Mechanical limbs suited to how each one moves.
- **Variants:**
  - **Walker:** a capsule lying sideways on two small wheels or stubby
    robot legs. It patrols.
  - **Hopper:** a capsule standing upright on a coiled spring foot. It
    bounces.
  - Every zone uses this one family, dressed for the zone:
    - **Retro Rush Hills and the test zone:** the basic mint/white walker
      and hopper.
    - **Wizard Academy:**
      - a **spellbook pill** riding a flapping enchanted book
      - an **armored pill** in a little knight helmet and breastplate,
        which takes a spin or roll to crack
      - colours: purple and cream
    - **Capital Mansion:**
      - a **drone pill** with a rotor on top and a searchlight eye
      - a **clerk pill** juggling paper stacks and tossing sheets
      - colours: navy and white
    - **Neon Rush Remix:** the Zone 1 pills redone in neon, with dark bodies
      and glowing magenta and cyan outlines.
- **Defeat:** the capsule pops open into two halves and a puff.
- **Off-limits:** printed text, logos or imprint codes on the pills, and
  any real medicine brand's colours or shape. Keep them cartoonish and
  clearly not real medicine.

## Zones (originality guardrails)

| Zone | Look | Never |
|---|---|---|
| Retro Rush Hills | Sunny tropical hills, palm trees, waterfalls, loops, diamond-checker dirt | A square brown-and-tan checker, or any existing game's landmarks |
| Wizard Academy | An original magic-school castle: shifting staircases, moving bookshelves, candle-lit halls, a flying-broom chase | Houses, crests, house-coloured scarves, lightning-bolt marks, or names from existing wizard stories |
| Capital Mansion | A grand white mansion of our own design, a lawn, rooftops, ballrooms, an underground bunker | A real building's replica, seals, flags, portraits or real people |
| Neon Rush Remix | Zone 1's ideas in synthwave neon: a dark sky and glowing outlines | Real brand logos or signage |

## Bosses (originality guardrails)

All bosses are clearly fictional cartoons; none depicts or resembles a real
person.

- **The Rug Pull:** a floating magic carpet with angry stitched eyes.
- **Library Demon:** an original horned smoke-and-ink creature rising from a
  cursed book. No real religious symbols.
- **Broccoli Head:** a fictional cartoon teen with a big green
  broccoli-style haircut, on a hoverboard.
- **The Executive:** a generic tall businessman in a grey suit with a
  briefcase and sunglasses.
