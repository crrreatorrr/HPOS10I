# Design notes

Visual and naming decisions from the director. Owned by the lead. The art
agent turns these into Higgsfield prompts; placeholders in code follow them
too. Everything here is original: never copy an existing character's
silhouette, face or signature features.

## Sproto (player)

A small, very fast creature, the mascot of the game.

- **Head:** round, with 2–3 soft upward tufts on top. Never swept-back
  spikes.
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
  - A thick dark outline, a soft shadow on one side, and a white
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
  - Later zones can recolour them and add zone props.
- **Defeat:** the capsule pops open into two halves and a puff.
- **Off-limits:** printed text, logos or imprint codes on the pills, and
  any real medicine brand's colours or shape. Keep them cartoonish and
  clearly not real medicine.
