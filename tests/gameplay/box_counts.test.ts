// Every act gets item boxes (a few per act), placed by the rules in content.ts.
import { describe, expect, it } from 'vitest';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { LevelHooks, LevelRoot } from '../../src/levels/common/level_root';
import { boxContentsFor, placeItemBoxes, registerNewContent } from '../../src/levels/content';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { tree } from '../../src/runtime/tree';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

const ACTS = import.meta.glob(['../../src/levels/data/z*/*.json', '../../src/levels/data/test_zone/*.json'], { import: 'default' }) as Record<
  string,
  () => Promise<LevelData>
>;

describe('item box counts', () => {
  for (const [path, load] of Object.entries(ACTS)) {
    it(`${path.split('/data/')[1]} gets at least 2 boxes`, async () => {
      const saved = LevelHooks.afterReady.slice();
      LevelHooks.afterReady.length = 0;
      const root = (await buildLevel(await load())) as LevelRoot;
      root.useSceneRouter = false;
      tree.changeSceneNow(() => root);
      LevelHooks.afterReady.push(...saved);
      tree.physicsStep();
      const n = placeItemBoxes(root);
      console.log(`${path.split('/data/')[1]}: ${n} boxes`);
      expect(n).toBeGreaterThanOrEqual(2);
    }, 60000);
  }
});

describe('item box contents by zone', () => {
  const count = (zone: string, what: string): number => boxContentsFor(zone).filter((c) => c === what).length;

  it('shields are 3 spots in 7 in Zones 1 and 2 and 2 in 7 from Zone 3', () => {
    for (const zone of ['test_zone', 'z1_retro_rush_hills', 'z2_wizard_academy']) {
      expect(boxContentsFor(zone).length).toBe(7);
      expect(count(zone, 'shield'), zone).toBe(3);
    }
    for (const zone of ['z3_capital_mansion', 'z4_neon_rush_remix']) {
      expect(boxContentsFor(zone).length).toBe(7);
      expect(count(zone, 'shield'), zone).toBe(2);
    }
  });

  it('Zone 4 has no speed shoes; every zone keeps an extra life and an invincibility', () => {
    expect(count('z4_neon_rush_remix', 'speed_shoes')).toBe(0);
    expect(count('z3_capital_mansion', 'speed_shoes')).toBe(2);
    for (const zone of ['z1_retro_rush_hills', 'z2_wizard_academy', 'z3_capital_mansion', 'z4_neon_rush_remix']) {
      expect(count(zone, 'life'), zone).toBe(1);
      expect(count(zone, 'invincibility'), zone).toBe(1);
    }
  });
});
