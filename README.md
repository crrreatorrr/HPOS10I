# HPOS10I

A high-speed 2D momentum platformer starring **Sproto**, a tiny speed demon with a clown nose,
built in Godot 4 with classic 16-bit physics.

> **Free, non-commercial fan parody.** All characters, names, art, music, sound
> and levels are original and were made for this project. It is not affiliated
> with, endorsed by, or based on assets from any game company or franchise, and
> it does not depict any real person. The game is free to play, sells nothing,
> and is not financial advice.

## Play

- **In your browser:** https://crrreatorrr.github.io/HPOS10I/
  - Early build: click **Physics Playground** (or press **1**). Phones: hold
    the phone sideways; on-screen touch controls are coming.
  - Every push to `main` redeploys automatically.
- **From source:** install [Godot 4.7.2](https://godotengine.org/download), then
  open `project.godot` and press **F5**, or run:

  ```bash
  godot --path .
  ```

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrow keys / WASD | D-pad / left stick | On-screen pad (coming) |
| Jump | Z, X, C, Space or K | A / B / X / Y | Jump button (coming) |
| Roll | Down while running | Down | Pad down |
| Spin dash | Hold Down, tap Jump, release Down | Same | Same |
| Look up/down | Hold Up/Down while standing | Same | Same |
| Pause | P or Enter (Esc too, outside fullscreen) | Start | Pause button (coming) |
| Debug overlay | F1 | | |

Keys are bound by position, so on AZERTY or QWERTZ keyboards the movement keys
are the ones in the WASD spot.

## Zones

1. **Retro Rush Hills** – bright hills, loops and waterfalls
2. **Wizard Academy** – a magic school castle with a flying-broom chase
3. **Capital Mansion** – rooftops, ballrooms and an underground bunker
4. **Neon Rush Remix** – the hills again, in synthwave neon

Each zone has two acts and a boss.

## For developers

- **Physics tuning:** every movement constant lives in
  `core/physics_constants.tres`. Values use the classic pixels-per-frame units
  at 60 fps. Edit it in the Inspector while the game runs and it reloads live.
- **Debug overlay:** press **F1** in game for speeds, ground angle, collision
  mode, state and sensor lines.
- **Tests:**

  ```bash
  godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd
  ```

- **Dev menu:** `godot --path . -- --dev` lists every playground, stage and
  sandbox. Dev flags (`--scene`, `--zone`, `--inputs`, `--touch`, `--overlay`,
  and others) are listed in [docs/CONTRACTS.md](docs/CONTRACTS.md).
- **Record a clip with scripted input:** `tools/lead/record_clip.sh`.
- **Merge gate:** `tools/lead/gate.sh` runs import, the originality scan,
  tests and the scene smoke check on a clean checkout.
- **QA tools:** `tools/qa/` holds the scene smoke check, the originality
  scan, the web build check, the level lint and the playtest bot. See
  [qa/README.md](qa/README.md).
- **Design docs:** [docs/DESIGN.md](docs/DESIGN.md) (art direction and
  characters) and [docs/LEVELS.md](docs/LEVELS.md) (the difficulty curve).
- **Web build:** GitHub Actions exports a single-threaded web build on every
  push and deploys `main` to GitHub Pages.
- **Interfaces between systems:** [docs/CONTRACTS.md](docs/CONTRACTS.md).
- **Art prompts:** every Higgsfield prompt is logged in [prompts.md](prompts.md).
