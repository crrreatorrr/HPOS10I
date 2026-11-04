// Cost of a physics tick in the heaviest acts (thousands of tickets, tens of
// thousands of tiles), with Sproto running. A budget guards against
// regressions; the measured numbers are printed.
import { describe, expect, it } from 'vitest';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { LevelRoot } from '../../src/levels/common/level_root';
import { registerNewContent } from '../../src/levels/content';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { installPlayerVisuals } from '../../src/player/visuals_setup';
import { tree } from '../../src/runtime/tree';
import { press, release } from '../helpers/world';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();
installPlayerVisuals();

const ACTS = import.meta.glob('../../src/levels/data/z*/*.json', { import: 'default' }) as Record<string, () => Promise<LevelData>>;

describe('tick cost', () => {
  for (const [path, load] of Object.entries(ACTS)) {
    it(`${path.split('/data/')[1]} runs under 4 ms per tick (budget for slow CI machines)`, async () => {
      const t0 = performance.now();
      const root = (await buildLevel(await load())) as LevelRoot;
      root.useSceneRouter = false;
      tree.changeSceneNow(() => root);
      const built = performance.now() - t0;
      tree.physicsStep();
      press('move_right');
      const t1 = performance.now();
      const ticks = 600;
      for (let i = 0; i < ticks; i++) tree.physicsStep();
      const per = (performance.now() - t1) / ticks;
      release('move_right');
      console.log(`${path.split('/data/')[1]}: build ${built.toFixed(0)} ms, ${per.toFixed(3)} ms/tick`);
      expect(per).toBeLessThan(4);
    }, 60000);
  }
});
