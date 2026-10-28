# HPOS10I

A high-speed 2D momentum platformer starring **Sproto**, a tiny speed demon with a clown nose,
built in Godot 4 with classic 16-bit physics.

> **Free, non-commercial fan parody.** All characters, names, art, music, sound
> and levels are original and were made for this project. It is not affiliated
> with, endorsed by, or based on assets from any game company or franchise, and
> it does not depict any real person. The game is free to play, sells nothing,
> and is not financial advice.

## Play

- **In your browser:** https://crrreatorrr.github.io/HPOS10I/ (desktop or mobile)
- **From source:** install [Godot 4.7.2](https://godotengine.org/download), then
  open `project.godot` and press **F5**, or run:

  ```bash
  godot --path .
  ```

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrow keys / WASD | D-pad / left stick | On-screen pad |
| Jump | Z, X, C, Space or K | A / B / X / Y | Jump button |
| Roll | Down while running | Down | Pad down |
| Spin dash | Hold Down, tap Jump, release Down | Same | Same |
| Pause | Enter, Esc or P | Start | Pause button |
| Debug overlay | F1 | | |

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

- **Dev menu:** `godot --path . -- --dev` lists every built stage and sandbox.
- **Record a clip with scripted input:** see `core/dev.gd`.
- **Web build:** GitHub Actions exports a single-threaded web build on every
  push and deploys `main` to GitHub Pages.
- **Interfaces between systems:** [docs/CONTRACTS.md](docs/CONTRACTS.md).
- **Art prompts:** every Higgsfield prompt is logged in [prompts.md](prompts.md).
