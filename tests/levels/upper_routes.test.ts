// The upper routes added by the flow pass (docs/gameplay-improvement-plan.md,
// D4): every upper deck must be reachable the way the level means it to be
// (a running jump from the hill crest or ledge before it, or a spring), a run
// along it must stay on it up to its first gap, and it must end with floor
// underneath (it rejoins the lower route; no deck ends over a pit).

import { afterEach, describe, expect, it } from 'vitest';
import { Layers } from '../../src/core/layers';
import { GameState } from '../../src/core/game_state';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { AutoscrollSection } from '../../src/levels/objects/z2/autoscroll_section';
import { tree } from '../../src/runtime/tree';
import { Vec2 } from '../../src/runtime/vec2';
import { press, release, releaseAll, step } from '../helpers/world';
import { FEET, loadAct } from './level_world';

interface Entry {
  /** Where Sproto starts (his feet), on the crest or ledge before the deck. */
  from: [number, number];
  /** The deck's top (px) and its span. */
  deckY: number;
  deck: [number, number];
  /** Jump once his x passes this (default: at once). */
  jumpAt?: number;
  /** Ground speed when the run starts (default 3). */
  speed?: number;
  /** 'spring': no jump is pressed, the spring at `from` does the work. */
  via?: 'jump' | 'spring';
}

const ROUTES: Record<string, Entry[]> = {
  'src/levels/data/z1_retro_rush_hills/act1.json': [
    { from: [3824, -160], deckY: -240, deck: [3904, 5120] },
    { from: [8464, -48], deckY: -128, deck: [8544, 9568] },
    { from: [10592, -112], deckY: -192, deck: [10672, 11520] },
    { from: [14336, -112], deckY: -192, deck: [14416, 15600] },
    { from: [16512, -128], deckY: -208, deck: [16592, 17104] },
  ],
  'src/levels/data/z1_retro_rush_hills/act2.json': [
    { from: [1408, -48], deckY: -128, deck: [1504, 2880] },
    { from: [11488, -368], deckY: -448, deck: [11536, 12240] },
    { from: [12352, -368], deckY: -448, deck: [12400, 13296] },
    { from: [14160, -368], deckY: -448, deck: [14224, 15376] },
    { from: [25344, -48], deckY: -128, deck: [25392, 26352] },
  ],
  'src/levels/data/z2_wizard_academy/act1.json': [
    { from: [1984, -192], deckY: -272, deck: [2080, 3424] },
    // Staying on the upper level: a running jump over the 64 px gap where the ramp goes down.
    { from: [11560, -640], deckY: -640, deck: [11840, 13520], jumpAt: 11744, speed: 5 },
  ],
  'src/levels/data/z2_wizard_academy/act2.json': [
    { from: [2320, -144], deckY: -224, deck: [2368, 3808] },
    { from: [4656, -272], deckY: -352, deck: [4704, 5360] },
    // Level with the breakable-wall tunnel's roof: a running jump over the 64 px gap.
    { from: [14400, -576], deckY: -576, deck: [14656, 15968], jumpAt: 14560, speed: 5 },
    // Staying on the upper floor where the ramp goes down.
    { from: [19560, -832], deckY: -832, deck: [19856, 21264], jumpAt: 19760, speed: 5 },
  ],
};

const FLOOR = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;

afterEach(releaseAll);

for (const [file, entries] of Object.entries(ROUTES)) {
  describe(`upper routes: ${file.split('/data/')[1]}`, () => {
    it.each(entries)('the deck at y $deckY from x $deck.0 is reached from ($from.0, $from.1) and rejoins the floor', async (e) => {
      GameState.resetGame();
      const root = await loadAct(file);
      // Enemies are not part of the question; a chase section would grab a teleported Sproto.
      for (const node of root.findChildren((n) => n instanceof Enemy || n instanceof AutoscrollSection)) node.queueFree();
      step(1);
      const p = root.player!;
      p.respawnAt(new Vec2(e.from[0], e.from[1] - FEET));
      step(3);
      expect(p.grounded, `standing at (${e.from})`).toBe(true);
      p.groundSpeed = e.speed ?? 3;
      press('move_right');
      let onDeck = false;
      let jumped = false;
      for (let i = 0; i < 240 && !onDeck; i++) {
        if (e.via !== 'spring' && !jumped && p.grounded && p.globalPosition.x >= (e.jumpAt ?? e.from[0])) {
          press('jump');
          jumped = true;
        }
        step(1);
        const feet = p.globalPosition.y + p.getRadii().y;
        onDeck = p.grounded && Math.abs(feet - e.deckY) < 1.5 && p.globalPosition.x >= e.deck[0] - 4;
      }
      release('jump');
      expect(onDeck, `landed on the deck; ended at ${p.globalPosition} (${p.state})`).toBe(true);
      // The deck's last tile has floor somewhere under it: falling off its end rejoins the route.
      const end = new Vec2(e.deck[1] + 24, e.deckY + 8);
      const bounds = root.getBounds();
      expect(tree.physics.intersectRay(end, new Vec2(end.x, bounds.bottom), FLOOR), `floor under the deck's end at x ${end.x}`).not.toBeNull();
      expect(p.state).not.toBe('dead');
    });
  });
}
