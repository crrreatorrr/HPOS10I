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
- **Off-limits:** a frog-like face (droopy eyelids, wide fleshy lips) and the
  blue-hedgehog quill silhouette.

## Golden tickets (collectible)

Shiny gold paper tickets with a punched edge and a small star. Never use a
real brand's ticket or wrapper design.

- Collected one at a time. 100 give an extra life.
- When Sproto is hit, the tickets he carries scatter in a fan, bounce, and
  can be grabbed back before they fade.
- In code and assets they are called `ticket` / `tickets`.
