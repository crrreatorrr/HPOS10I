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
