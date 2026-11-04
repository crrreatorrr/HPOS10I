// Every act gets item boxes (a few per act), placed by the rules in content.ts.
import { describe, expect, it } from 'vitest';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { LevelHooks, LevelRoot } from '../../src/levels/common/level_root';
import { placeItemBoxes, registerNewContent } from '../../src/levels/content';
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
