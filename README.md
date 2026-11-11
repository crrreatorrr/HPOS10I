# HPOS10I

A high-speed 2D momentum platformer starring **Sproto**, a tiny speed demon with a clown nose,
with classic 16-bit physics. It runs in any modern browser and is written in TypeScript with no
game engine.

> **Free, non-commercial fan parody.** All characters, names, art, music, sound
> and levels are original and were made for this project. It is not affiliated
> with, endorsed by, or based on assets from any game company or franchise, and
> it does not depict any real person. The game is free to play, sells nothing,
> and is not financial advice.

## Play

- **In your browser:** https://crrreatorrr.github.io/HPOS10I/
  - Phones: hold the phone sideways; on-screen touch controls appear on touch.
  - Every push to `main` redeploys automatically once every check passes
    (typecheck, tests, originality scan, web build check, browser smoke test).
- **From source:** install [Node 22](https://nodejs.org/), then:

  ```bash
  npm ci
  npm run dev
  ```

  and open http://127.0.0.1:5180/.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrow keys / WASD | D-pad / left stick | On-screen pad |
| Jump | Z, X, C, Space or K | A / B / X / Y | Jump button |
| Roll | Down while running | Down | Pad down |
| Spin dash | Hold Down, tap Jump, release Down | Same | Same |
| Charge run | Hold Up, tap Jump, keep Up, release Up | Same | Same |
| Drop dash | Jump, then press and hold Jump again; land | Same | Same |
| Shield bounce | Jump, then Jump again with a shield | Same | Same |
| Look up/down | Hold Up/Down while standing | Same | Same |
| Time Focus (Duelist cape) | F | LB or RB | |
| Pause / resume | P or Enter (Esc too, outside fullscreen) | Start | Pause button |
| Menus: move | Arrow keys / WASD | D-pad / left stick (held: repeats) | Tap |
| Menus: choose | Enter, Space or Jump | A (also X / Y, and Start on the zone select) | Tap |
| Menus: back | Esc (P on the zone select) | B (on the pause list: resume) | BACK button |
| Return to hub | Zone select HUB, pause EXIT TO HUB | Same | Same |
| Send feedback | N twice (or pause, SEND FEEDBACK) | Pause, SEND FEEDBACK | Pause, SEND FEEDBACK |
| Debug overlay | F1 | | |

Any standard controller works with no setup: plug it in (or bring it from the
hub) and press a button. Jump is on all four face buttons, as on the pads this
genre grew up on, so the right thumb never hunts for one mid-run; spin dash
and charge run are Down/Up plus any face button. Time Focus is used once per
act, so it sits on either bumper. The stick reads as 8-way digital input:
it has a 0.2 radial deadzone, counts left/right from 0.45 and up/down only
from 0.75, so a 45-degree push runs instead of rolling or looking up. A button
already held when the controller appears (the press that chose the hub
portal) is ignored until it is released. View and the stick clicks are unused.

On a keyboard, WASD and the arrow keys both move and steer every menu,
Space (or Z, X, C, K) jumps, and there is no run key: speed comes from slopes,
the roll and the spin dash. In menus Enter or Space chooses and Esc goes back;
Esc never moves forward, so it does nothing on the title. P (or Enter, or Esc
outside fullscreen) pauses. Time Focus stays on F, a key of its own beside the
WASD block, because it is an ability rather than an interaction.

Keys are bound by position, so on AZERTY or QWERTZ keyboards the movement keys
are the ones in the WASD spot. The charge run, drop dash and shield bounce can
be turned off in **Pause → Options**, and are always off in Ranked.

## Zones

1. **Retro Rush Hills**: bright hills, loops and waterfalls
2. **Wizard Academy**: a magic school castle with a flying-broom chase
3. **Capital Mansion**: rooftops, ballrooms and an underground bunker
4. **Neon Rush Remix**: the hills again, in synthwave neon

Each zone has two acts and a boss. Item boxes along the routes hold a shield,
speed shoes, invincibility or an extra life (never tickets). Each act has a
10:00 time limit.

## The hub

HPOS10I is one of the games in the metaverse hub. Opened from a hub portal
(`#t=<ticket>`), it redeems the ticket, reads your Relics (skins and effects,
off in Ranked) and banks the tickets you collect in each act as hub Tickets,
each act once, with retries that can never pay twice. The top-right corner
shows your hub Ticket balance (`--` when there is no hub session) and a RETURN
TO HUB button on every screen: from the menus it leaves at once, during a run
it asks first. The zone select's HUB button and the pause menu's EXIT TO HUB do
the same. Opened directly, it plays standalone.

## For developers

- **Layout:** `src/runtime` (node tree, fixed 60 Hz loop, collision, input,
  drawing, fonts), `src/core` (game state, scene router, zones, difficulty,
  audio, settings), `src/player`, `src/terrain`, `src/camera`, `src/levels`
  (level data, objects, enemies, Zone 4), `src/bosses`, `src/ui`, `src/hub`
  (hub client on the vendored SDK in `vendor/hub-sdk`).
- **Physics tuning:** the feel-relevant constants are in
  `src/core/physics_constants.json` (classic pixels-per-frame units at
  60 fps). The dev server reloads them live.
- **Checks:**

  ```bash
  npm run typecheck
  npm test
  tools/qa/originality_scan.sh .
  npm run build && node tools/qa/web_check.mjs && npm run smoke
  ```

  `tools/lead/gate.sh` runs all of them on a clean checkout of a commit.
- **Dev options** (URL query): `?dev` (dev menu of every playground and
  stage), `?scene=level:z1_retro_rush_hills/act1`, `?zone=<id>&stage=<n>`,
  `?inputs=<timeline>`, `?touch`, `?overlay`, `?mute`. See
  [docs/CONTRACTS.md](docs/CONTRACTS.md).
- **Web build:** GitHub Actions builds on every push, keeps it as the
  `web-build` artifact and deploys `main` to GitHub Pages. Build settings:
  `HPOS_BASE_PATH`, `HPOS_HUB_URL`, `HPOS_NAKAMA_SERVER_KEY`.
- **Docs:** [docs/DESIGN.md](docs/DESIGN.md) (art direction and characters),
  [docs/LEVELS.md](docs/LEVELS.md) (the difficulty curve),
  [docs/PHYSICS.md](docs/PHYSICS.md) (the physics audit),
  [docs/CONTRACTS.md](docs/CONTRACTS.md) (interfaces between systems).
- **Art prompts:** every Higgsfield prompt is logged in [prompts.md](prompts.md).
