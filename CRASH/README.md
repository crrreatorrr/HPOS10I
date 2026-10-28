# NOBU: Saviour Dog

A PS1-era-style 3D platformer in Three.js (no engine) with $Bitcoin meme lore. Nobu, a white Akita, sets out to
un-cone every dog on the island and take down the Evil Cone.

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). `npm run build` makes a static build in `dist/`.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | Arrows / WASD | Left stick / D-pad |
| Jump (press again in the air: double jump) | Space | A |
| Bite | J or Shift | X / Y / RB |
| Slide (on the ground) · Belly flop (in the air) | K or Ctrl | B / LB / triggers |
| Pause | Esc / P | Start |

Movement is camera-relative. In the level 2 chase, the camera faces Nobu, so hold **Down / S** to run away
from the cat. `Ctrl` works for slide, but `Ctrl` + `W` is a browser shortcut, so `K` is safer.

## What's in it

- **Three levels + three bosses.** Each level runs along a winding, rolling spline track with forks, side
  alcoves and secrets:
  - Bark Jungle, then the Mecha Bird.
  - Scratchpost Canyon, the Big Cat chase, then the Big Cat.
  - The Cone Factory, then the Evil Cone.
- **Bosses:** each boss model is rigged in code (`src/bosses/autorig.js`): the bird's wings flap and its cage swings,
  the cat's paws, spine, head and tail move, and the cone's claws and cape move. Each has a **SPECIAL** gauge that
  recharges during the fight and unleashes an ultimate when full.
  - Mecha Bird: dives, wing gust, visor laser, homing rockets, egg bombs, cone drops. Ultimate: **Sky Fall**.
  - Big Cat: 3-2-1 pounce, swipes, hairballs, yarn ball, claw slashes, tail-whip spin, zoomies.
    Ultimate: **Nine Lives Frenzy**.
  - Evil Cone: cone spirals, eye lasers, shame vortex, cup grab, ghost clones, sweeps, shockwaves, and
    **pump.fun minions** every phase (they pump with each hop, then dump). Ultimate: **Shame Supernova**.
- **Interactions:**
  - Bone Switches that build bridges, a rope drawbridge you bite to lower, bounce mushrooms.
  - Sinking lily pads, flipping planks, crumbling platforms.
  - Cracked floors you belly-flop through, updraft fans, conveyor belts.
  - Swinging cone hammers, crushers, rolling coconuts.
- **Breakables** (Crash's crates, reimagined): Black Backpack (the real Harry Potter / OBAMA backpack print),
  Blue Sphere (Sproto Mask), 1UP Nobu head, Trampoline, Snacks (checkpoint), Cat (TNT: 3-2-1 hiss), Rug (Nitro:
  rug pull) and a Lint Roller switch that rolls up every rug.
- **Sproto Mask:** behaves like a tiki-mask guardian.
  - 1 mask absorbs a hit.
  - 2 masks give a gold aura.
  - 3 masks give ~20s of invincibility, with faster music and the mask covering Nobu's face.
- **Rewards:** break everything and free every dog in a level to earn a Golden Bone.
- **Progress:** lives start at 4, with game over and continue. Progress is saved in localStorage.

## Code map

```
src/
  main.js              boot (+ dev-only test helpers in dev.js)
  game/game.js         renderer, main loop, title/map/cutscene/pause/complete/game-over/ending states
  game/session.js      one level + its boss: checkpoints (Crash-style rollback), lives, masks, stats
  world/track.js       spline track: (d, lateral) coordinates, ground spans, ramps, walls, water, meshes
  world/physics.js     AABB solids + track collision for bodies
  world/stage.js       scene, lights + shadows, sky, merged decor (with wind sway), steam/bubble emitters
  world/decor.js       procedural scenery: palms, bushes, ferns, grass, flowers, rocks, yarn, pipes, vats, vents
  levels/              kit.js (authoring helpers) + level1-3 and boss arenas
  player/              player controller, procedural animator, GLB rig + primitive "classic" Nobu
  camera/camera.js     rail cameras (behind / facing for the chase), arena framing, cinematics, shake
  entities/            breakables, tickets, enemies, dogs, mask, props/interactions,
                       particles (fx.js: cartoon smoke, explosions, dust, splashes, shockwaves)
  bosses/              Mecha Bird, Big Cat (+ chase), Evil Cone, shared projectiles
  ui/                  HUD, text boxes, pop-ups, menus (DOM)
  audio/               Web Audio synth: every sound effect and all music
  story/script.js      all dialogue, cutscene text, tutorials, death captions
```

## Art pipeline (Higgsfield)

All art comes from Higgsfield generations. The style was locked with concept art, and a saved **Nobu** Element
was reused for every Nobu image.

- `public/assets/manifest.json` lists every asset: file, what it's used for, model, job id and full prompt.
- `tools/build_asset_list.py` (+ `tools/asset_list_extra.json`) is the source of truth.
  `python3 tools/process_assets.py [ids]` downloads generations and cuts out backgrounds, then resizes and
  converts them.
- **3D models:**
  - Nobu: Meshy image-to-3D, rigged. Bones are driven procedurally; the Pause/Title menu can switch to the
    primitive "Classic" Nobu.
  - Items, dogs, enemies, bosses and the mask: Tripo image-to-3D from the 2D art.
  - Two-legged enemies and the freed dogs: Meshy rigging with walk/dance clips.
- `tools/fix_nobu_eyes.py` retouches the GLB texture (the generator painted a third pupil).
- **Your files:** `backpack.webp` (the backpack print) and `mask.avif` (the Sproto face, cut out down to the
  collar) are your source images.
