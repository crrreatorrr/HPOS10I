# 04 – Zones (4 zones × 2 acts)

Branch: `levels` · Owner: level agent · Scenes: `res://levels/<zone_id>/act1.tscn`, `act2.tscn`.
Zone ids: `z1_retro_rush_hills`, `z2_wizard_academy`, `z3_capital_mansion`, `z4_neon_rush_remix`.
Run one act with `godot --path . -- --zone=<zone_id> --stage=<1|2>`.

Tags: **[auto]** script/test/timeline · **[manual]** human judgement.
Every act gets section A and B; then the zone-specific section.

## A. Every act: structure and smoke

- [ ] ZN-A1 [auto] `tests/qa/test_contracts.gd`: `LevelRoot` root with `PlayerStart` and `Bounds`.
- [ ] ZN-A2 [auto] The file path matches `ZoneRegistry.stage_path(zone, stage)`.
- [ ] ZN-A3 [auto] `tools/qa/scene_smoke.sh`: 120 frames, no `ERROR`/`WARNING`.
- [ ] ZN-A4 [auto] `tools/qa/originality_scan.sh`: no hits in level files, node names or file names.
- [ ] ZN-A5 [auto] Parallax: at runtime 4 `Parallax2D` layers with scroll scales 0.1 / 0.3 / 0.6 / 0.9 from `assets/backgrounds/<zone_id>/` (when the art exists).
- [ ] ZN-A6 [auto] Music: `Audio` plays the zone track (`z1`…`z4`) when the act starts via `SceneRouter`.
- [ ] ZN-A7 [auto] Accessory: `SceneRouter.current_zone().accessory` is `wizard_hat` in Zone 2, `sunglasses` in Zone 3, empty in Zones 1 and 4; the player draws it.

## B. Every act: playability

- [ ] ZN-B1 [auto] Bot `--zone=<id> --stage=<n> --frames=18000`: record max x progress, deaths and stuck periods (> 5 s). Every stuck spot is listed in the report and checked by hand.
- [ ] ZN-B2 [manual] A human finishes the act start to goal, with no frame-perfect input required on the main route.
- [ ] ZN-B3 [manual] No softlocks: there is no place the player can get stuck without being able to leave or die (check every bot stuck period, pits, closed rooms, one-way drops).
- [ ] ZN-B4 [auto] Death pits only below `Bounds`; `Bounds` covers all terrain (camera never shows the void).
- [ ] ZN-B5 [auto] At least one checkpoint per act; respawn spot is safe (not over a pit, not on an enemy, not under a crusher).
- [ ] ZN-B6 [auto] Goal sign at the end -> tally -> next stage (act 1 -> act 2 -> boss arena).
- [ ] ZN-B7 [auto] Enemies extend `Enemy`, detect the player with mask bit 5, and follow the hurt/kill rules (see 02 TL-G).
- [ ] ZN-B8 [auto] Bot `--policy=fuzz` 18 000 frames: no errors, no NaN, no softlock.
- [ ] ZN-B9 [manual] Every loop is traversable both ways; path switchers put the player on the right path.
- [ ] ZN-B10 [manual] Act length about 1.5–4 minutes for a first-time player; routes branch high/low.
- [ ] ZN-B11 [manual] Web performance: 60 fps in the browser on a mid laptop through the busiest part.

## C. Moving solids (any zone that has them)

- [ ] ZN-C1 [auto] Player standing on a moving platform is carried exactly (no slide, no jitter, stays grounded going down).
- [ ] ZN-C2 [auto] Jumping off a moving platform: documented velocity inheritance.
- [ ] ZN-C3 [auto] Platform pushes the player into a wall or ceiling: `kill()` (crush), never pushes the player inside terrain.
- [ ] ZN-C4 [auto] Platform moving into the player from the side pushes the player out, does not trap.
- [ ] ZN-C5 [auto] Pause and respawn: moving solids pause, and reset or continue consistently after a respawn.

## D. Zone 1 – Retro Rush Hills (`z1_retro_rush_hills`)

- [ ] Z1-1 [manual] Bright checkered dirt, palm trees, loops, waterfalls; original art, no recognisable copies of existing games' levels.
- [ ] Z1-2 [auto] Every loop completes clockwise and counter-clockwise at speed (bot or timeline).
- [ ] Z1-3 [manual] Waterfalls are decoration (no collision) or behave as documented.
- [ ] Z1-4 [manual] Teaches the mechanics: first spring, first loop and first enemy are safe and readable.

## E. Zone 2 – Wizard Academy (`z2_wizard_academy`)

- [ ] Z2-1 [manual] Magic-school castle, candle-lit halls; enchanted books and living armor enemies; original names and designs.
- [ ] Z2-2 [auto] Shifting staircases: rideable, crush rule (C3) holds, never leave the player inside a step.
- [ ] Z2-3 [auto] Moving bookshelves: push the player out or crush, never trap without death.
- [ ] Z2-4 [auto] Flying-broom section: `GameCamera.start_autoscroll()` starts, player `clamp_rect` is set; the player cannot get ahead of or behind the screen; caught by the left edge against a wall = death.
- [ ] Z2-5 [auto] Broom section: dying mid-section respawns before it and restarts the autoscroll; the section ends with `stop_autoscroll()` and an empty `clamp_rect`.
- [ ] Z2-6 [auto] Pause during the broom section pauses the autoscroll.
- [ ] Z2-7 [manual] Wizard hat drawn on every frame of every animation.

## F. Zone 3 – Capital Mansion (`z3_capital_mansion`)

- [ ] Z3-1 [manual] Grand white mansion and lawn, rooftops, ballrooms, underground bunker.
- [ ] Z3-2 [manual] No real people, real seals, flags, logos, signage or recognisable real buildings' insignia.
- [ ] Z3-3 [manual] Security drones and paperwork robots: original designs, readable as enemies.
- [ ] Z3-4 [auto] Rooftop gaps: falling below `Bounds` kills; no ledges that look solid but are not.
- [ ] Z3-5 [manual] Sunglasses drawn on every frame of every animation.

## G. Zone 4 – Neon Rush Remix (`z4_neon_rush_remix`)

- [ ] Z4-1 [manual] Zone 1 ideas re-dressed in synthwave neon; layout not a 1:1 copy of Zone 1.
- [ ] Z4-2 [auto] Music track `z4` is faster than `z1` (tempo noted in the UI/audio report).
- [ ] Z4-3 [auto] No effects unsupported by the Compatibility renderer (no errors in a web build console, smoke clean).
- [ ] Z4-4 [manual] Neon glow does not hide hazards or the player; no full-screen flashing faster than 3 Hz.

## H. Title screen and zone select

See `07-ui.md` (owned by the UI/audio agent). Zone-side checks:

- [ ] ZN-H1 [auto] Every zone in `ZoneRegistry.ZONES` starts from the zone select once its act 1 exists.
- [ ] ZN-H2 [auto] Unbuilt stages fall back to the dev menu with a warning, never a crash.
