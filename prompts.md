# Art prompt log

Every Higgsfield generation for this project, in order. Owned by the art agent.

Rules for every prompt: no copyrighted characters, franchise names, real
people, logos or brand names. Sprites use the template
`2D side-view pixel art game sprite, [subject], transparent background,
consistent palette, 16-bit style` (Zone 4: `neon synthwave style`).
Backgrounds use `2D side-scrolling game background layer, [zone theme],
[far/mid/near], wide horizontal, seamless tiling left to right, 16-bit pixel
art` (Zone 4: `neon synthwave`).

| # | Date | Asset | Model | Prompt | Reference | Job ID | Status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-28 | `assets/backgrounds/z1_retro_rush_hills/1_far.png` (Zone 1 far layer: sky, clouds, sea, mountains) | `nano_banana_pro` (21:9, 2k, 1 image, 2 credits; the job record names it `nano_banana_2`) | 2D side-scrolling game background layer, bright sunny tropical sky with fluffy layered cumulus clouds above a distant sparkling turquoise sea and faraway hazy green mountains on a low horizon, highly detailed, rich vibrant 16-bit console palette, horizontal color bands in the sky gradient, crisp hand-placed pixel clusters, empty scenery with no characters or text, far, wide horizontal, seamless tiling left to right, 16-bit pixel art | none (first layer of the zone) | 15b5b8fa-79f6-44a8-bab3-fb8b8376c274 | approved |
| 2 | 2026-10-28 | `assets/backgrounds/z1_retro_rush_hills/2_distant.png` (Zone 1 distant layer: hills, waterfalls, palms, argyle cliffs) | `nano_banana_pro` (21:9, 2k, 1 image, 2 credits; the job record names it `nano_banana_2`) | 2D side-scrolling game background layer, rolling green tropical hills in the middle distance filling the lower two thirds of the image, several white waterfalls cascading down cliff faces into small turquoise pools, scattered palm trees on the ridges, exposed cliff faces showing warm orange and brown diamond-shaped argyle checker dirt, slightly lighter and bluer than the foreground for atmospheric depth, solid flat magenta background above the hill line, same color palette and pixel style as the reference image, vibrant saturated colors, crisp detailed pixel art in the style of classic early-1990s 16-bit console platformers, small fine pixels, dense detail, lit from the top-left, no characters or text, distant, wide horizontal, seamless tiling left to right, 16-bit pixel art | job 15b5b8fa-79f6-44a8-bab3-fb8b8376c274 (approved far layer raw) | 96684e34-e3d9-4a60-845e-43b66949a1ee | pending |
| 3 | 2026-10-28 | `assets/sprites/common/emerald/emerald.png` (48 px) and `emerald_small.png` (16 px): act-clear emerald icon | none: no generation, no credits | source: director-supplied image, no generation; crop + pixelize (circle centred at 800,800, radius 800 px; box average to 48 px, the image's own 31 colours plus a 1 px dark outline; the 16 px version hand-cleaned with tools/art/sources/emerald_small_edits.txt) | `tools/art/sources/emerald_source.webp` (director-supplied) | none | approved |
| 4 | 2026-11-11 | Sproto movement pose source | Nano Banana 2 (2K, 1:1, Unlimited, 0 credits) | Original right-facing split blue-and-yellow mascot in an isolated 4×4 set of 16-bit movement and reaction poses, with a red clown nose, upward blue tufts and a gold ticket scarf clasp. | Design notes | Failed before output | Failed |
| 5 | 2026-11-11 | Pill robot source sheet | Nano Banana 2 (2K, 1:1, Unlimited, 0 credits) | Original 4×4 game sprite source of mint/white rovers, spring hoppers, spiked and telescoping robots, purple academy capsules with books, armor and lanterns, navy mansion drones and armored guards, and dark neon variants, on solid magenta. | Design notes | 8fa24077-2d7c-4cd3-b709-2ff8ae8d6a40 | Processed |
| 6 | 2026-11-11 | Four boss pose sources | Nano Banana 2 (2K, 1:1, Unlimited, 0 credits) | Original 4×4 side-view sprite sheet. Each row has neutral, wind-up, attack and hurt poses for one boss. Flying carpet with embroidered turquoise eyes, violet horned ink demon rising from a book, green-haired teen on a teal hoverboard and a charcoal-suited cartoon executive with sunglasses and a briefcase. Pure magenta behind the sprites. | Design notes | abd0b100-1a83-4b29-b3fc-752b2ba71eae | Processed |
| 7 | 2026-11-11 | Sproto base, Golden, Nobu and Tidebreaker sheet sources | Seedream 5.0 Lite (2K, 1:1, Unlimited, 0 credits) | Original Sproto movement sheet with a round split blue-and-yellow head, upward blue tufts, red clown nose, dot pupils, small blue body, yellow gloves and a red scarf. A 4×4 grid covering idle, crouch, look, walk, run, spin, skid, spring, hurt, defeat and victory. Side view, solid magenta, deliberate hard-edged pixel clusters. | Design notes | d562920a-1c2b-49ae-808e-7441f028e517 | Processed |
| 8 | 2026-11-11 | Props, pickups and accessories source | Seedream 5.0 Lite (2K, 1:1, Unlimited, 0 credits) | Isolated 4×4 true pixel sprites for ticket flips, sparkle, wizard hat, sunglasses, spring, checkpoint, item box, speed shoe, shield, rainbow star, finish sign, bumper, spikes and capsule bolt on solid magenta. | Design notes | 204eb5ca-2e16-4cf0-9756-3052f4f604de | Processed |

## Unlimited production pass, 2026-11-11

All nineteen jobs below used **Seedream 5.0 Lite** through the signed-in Higgsfield website at **2K (2048 × 2048), 1:1, Unlimited**. The submit button read **Unlimited** for each job. The exact balance was **142.6 credits** before and after the background, terrain, animation and fixture batches. Each completed job cost **0 credits**. Poses were keyed, scaled with nearest-neighbor, aligned and assembled on the existing atlas grid. Several poses serve as sources for multiple in-game frames.

| # | Generation job ID | Integrated asset path | Prompt |
|---|---|---|---|
| 9 | `a482a7c5-81fa-4ac6-8d3c-2d1429453a7e` | `assets/backgrounds/z1_retro_rush_hills/{1_far,2_distant,3_mid,4_near}.png` | Four horizontally repeatable parallax bands for Retro Rush Hills. Sunny cyan sky, cumulus, hazy teal islands and turquoise ocean. Distant emerald ridges with palms and waterfalls. Nearer bright grassy hills and orange-brown argyle cliffs. Dark tropical leaves and clumps. Flat magenta above the lower three silhouettes. Crisp original 16-bit clusters. |
| 10 | `ca5d01c4-eec7-4d11-994d-b60c1c1ed45c` | `assets/backgrounds/z2_wizard_academy/{1_far,2_distant,3_mid,4_near}.png` | Four repeatable bands. Indigo twilight and lavender mountains. Dark violet academy with staggered copper roofs and amber windows. Buttressed wings, observatory, lantern bridges and slate. Parapet and hedge silhouettes. Pure magenta above the lower silhouettes. No lettering or borrowed designs. |
| 11 | `4156b0e0-3035-4233-9ffc-d263161c883b` | `assets/backgrounds/z3_capital_mansion/{1_far,2_distant,3_mid,4_near}.png` | Four repeatable bands for an original estate. Peach sunset and lavender hills, formal gardens, asymmetrical white marble palace wings with circular windows, and topiary, lamps and balustrades. Flat magenta behind the lower silhouettes. No signs, flags or seals. |
| 12 | `ddef1eac-43d9-4830-a850-2cfbf5d1f0a5` | `assets/backgrounds/z4_neon_rush_remix/{1_far,2_distant,3_mid,4_near}.png` | Four seamless synthwave bands. Near-black navy night with scattered stars, low purple skyline, cyan-outlined angular ridges and waterfalls, low dark palms and grasses. Flat magenta behind the lower silhouettes. Small palettes and crisp square clusters. |
| 13 | `31856a14-4d13-4f34-a118-a2fabb4a8dd4` | `assets/terrain/*/{fill,top,side}.png`, `assets/tiles/*_tiles.png` | Four-zone 4 × 3 terrain atlas. Each row has a seamless opaque fill, a straight highlighted walking strip, and an edge facing. Warm diagonal dirt and turf, purple brick and stone coping, pearl marble and lawn, dark circuitry and a neon rim. Orthographic 16-bit texture for flat ground and the inside of vertical loops. |
| 14 | `78a84e66-9533-498b-8eea-6ffedaeff936` | `assets/sprites/common/props/props_sheet.png` | Side-view 4 × 4 fixtures on magenta. Red spring at rest, compressed and extended, gold spring, boost arrows and a neon bumper. Spikes, breakable argyle rock, moving bookshelf, neon platform, grass ledge, marble ledge, conveyor and checkpoint. Clean silhouettes at gameplay size. |
| 15 | `1cab5532-d110-4954-abf6-b5a8382012e7` | `assets/backgrounds/*/boss_arena.png` | Four original 16-bit boss arena backdrops in a 2 × 2 grid. Teal tropical ruins, violet arched library, slate-window ballroom and dark neon skyline. Side-on and subdued where the player and projectiles appear. |
| 16 | `e56e563e-c82d-451a-bdeb-07f4ba568fd4` | `assets/sprites/common/sproto/sproto_sheet.png` | Sproto pose prompt below. Base skin with rich blue and warm yellow halves, blue body, yellow gloves and boots, red scarf. |
| 17 | `5ab3cb94-e1f4-42af-a035-fbd52fd1aa99` | `assets/sprites/common/sproto/nobu_sproto_sheet.png` | Sproto pose prompt below. Nobu skin with cream animal suit, two upright rounded ears and warm tan trim. |
| 18 | `8fef84de-9057-4ed8-ad65-31400da127d9` | `assets/sprites/common/bosses/{bosses,boss_moves}_sheet.png` | Boss pose prompt below. The Rug Pull has angry aqua embroidered eyes and gold fringe. Sweep folds then stretches, drop coils then dives, dust gathers corners then snaps the hem. |
| 19 | `6c6efe94-2404-4a3e-8c5b-9f89202cb1db` | `assets/sprites/common/bosses/{bosses,boss_moves}_sheet.png` | Boss pose prompt below. Broccoli Head wears a violet jacket and rides a teal hoverboard. Include low and high zips, fakeout, can toss, tornado tuck and spin, and overhead spark warning. |
| 20 | `d951f41a-f732-4f2a-84bb-5ba539befc73` | `assets/sprites/common/sproto/golden_sproto_sheet.png` | Sproto pose prompt below. Golden skin in antique and cream gold, red nose and dark red scarf accent. |
| 21 | `c2a7837e-ddc2-4f3d-b24e-f91ead84b09b` | `assets/sprites/common/sproto/tidebreaker_sproto_sheet.png` | Sproto pose prompt below. Tidebreaker in sea green and yellow, gold wave belt and sea-green ball with gold stripe. |
| 22 | `2208fabf-d335-428e-917b-01a47b11c9f1` | `assets/sprites/common/bosses/{bosses,boss_moves}_sheet.png` | Boss pose prompt below. Library Demon is violet smoke and ink over an enchanted brown book. Raise a claw for rain, thrust forward for a wave and gather then scatter pages. |
| 23 | `9b8ad98f-3b28-4119-9d23-363c6707ec6d` | `assets/sprites/common/bosses/{bosses,boss_moves}_sheet.png` | Boss pose prompt below. The Executive has a charcoal suit, red tie, sunglasses and black case. Raise and throw the case, double throw, paper storm, point up and down for crash, sprint, and slide on a red arrow. |
| 24 | `2f75a05c-1ea5-4018-b3f9-e47f7cdad52b` | `assets/sprites/common/bosses/attacks_sheet.png` | 4 × 4 isolated effects. Gold dust crest, falling ink, book page, ink wave, mint can, amber spark, briefcase, tall red arrow, four burst phases, and four swirling mint tornado poses. |
| 25 | `d99b426c-f55f-40dc-b928-813bac3a5100` | `assets/sprites/common/{pills/pills,props/props}_sheet.png`, `assets/sprites/z2_wizard_academy/wizard_hat/wizard_hat_sheet.png`, `assets/sprites/z3_capital_mansion/sunglasses/sunglasses_sheet.png` | 4 × 4 isolated capsules and props. Mint rover, hopper, chaser and retracting spike pill, academy spellbook and knight, drone and clerk, four neon variants, wizard hat, sunglasses, candle flame and ticket sparkle. |
| 26 | `6b6482f3-47fb-4666-abce-5ce4f6036008` | `assets/sprites/common/props/props_sheet.png`, `assets/sprites/z1_retro_rush_hills/waterfall/water.png` | Original 4 × 4 fixtures. Raised and depressed brass switches, stone tread and masonry, amber and cyan roll tube brackets, glass and rail, waterfall phases, skid and landing dust, gold bumper, spring plate, shield flare and pickup sparkle. |
| 27 | `ab75b28f-4c41-41a8-ae25-ef83508e2726` | `assets/sprites/common/props/props_sheet.png` | Four isolated 16-bit props in a square grid on magenta. Violet closed falling book with brass clasp, tall rosewood mansion door with two panels, fluttering ivory page with three ink dashes, navy security emitter with cyan lens. |

**Sproto pose prompt.** Original crisp 16-bit pixel art, exactly 4 × 4 cells,
isolated on solid pure magenta with wide gutters, facing right at a consistent
scale. Small mascot with a split round head, soft upward tufts only on the left
half, white eyes with black pupils, red clown nose, grin, scarf and ticket badge.
The four rows show idle, walk and two run strides; two spin ball views and two
skids; crouch, look up and two spring poses; hurt, falling defeat and two
victory poses. Deep indigo one-pixel outline, 3–5 colors per surface, no text,
floor, existing mascot or trails outside the cells.

**Boss pose prompt.** Original 16-bit side-view atlas in a 4 × 4 grid with wide
magenta gutters. Same right-facing camera, proportions and base anchor across
poses. Start with idle, travel, recovery and hurt. Follow with the listed
anticipation and strike pairs for each boss. Use spare cells for recovery,
stagger, hit and defeat. Keep effects tight to the body and silhouettes readable.

## Floor hazards, 2026-11-11

Both sheets used **Seedream 5.0 Lite** through the signed-in Higgsfield
website at **2K (2048 × 2048), 1:1, Unlimited**. The balance stayed at
**142.6 credits**. The four frames in each row were keyed and aligned
into a 64 px cell atlas.

| # | Generation ID | Integrated asset path | Prompt |
|---|---|---|---|
| 28 | `76c84176-7ecd-4ae5-870e-620a9e01d9c3` | `assets/sprites/common/props/floor_hazards.png`, rows 1–4 | Original 4 × 4 side-view pixel sprites on chroma magenta: four looping volcanic lava surfaces, four lime and teal poison surfaces with bubbles, four rooted lava jets, and four poses of a violet-armored chartreuse burrowing pill. |
| 29 | `b4151aff-d82d-4df0-9b60-35a1690fb4f7` | `assets/sprites/common/props/floor_hazards.png`, rows 5–8 | Original 4 × 4 side-view pixel sprites on chroma magenta: four lamp states on a warning-striped steel crusher, four ceiling mounts, four glowing vent hatches, and four telescoping piston lengths. |

## Neon Rush enemies, 2026-11-11

Both generations used **Seedream 5.0 Lite** at **2K, 1:1, Unlimited**
on Higgsfield. The account balance stayed at **142.6 credits**.
The source sprites were keyed, cropped and aligned into four frames
per row of 48 px cells.

| # | Generation ID | Integrated asset path | Prompt |
|---|---|---|---|
| 30 | `cd1838ba-6283-44b0-beec-c518745c34f3` | `assets/sprites/common/pills/remix_enemies.png`, rows 1–4 | 4 × 4 sheet on chroma magenta: a teal and copper capsule idle, compressed, cracked and separating; four poses of its spring-foot mini; an indigo orbit core with a pulsing cyan iris; a low orange shockwave emitter with quiet, charging and cooling poses. |
| 31 | `6f6a674e-2e9c-439b-98f7-688fcbf9d841` | `assets/sprites/common/pills/remix_enemies.png`, rows 5–8 | 4 × 4 sheet on chroma magenta: compact cyan and indigo orbit satellites, warm ground lightning, teal and copper shell fragments, and animated warning chevrons. |
