import { it } from 'vitest';
import { registerNewContent } from '../../src/levels/content';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { SceneRouter } from '../../src/core/scene_router';
import { Difficulty } from '../../src/core/difficulty';
import * as L from '../../tools/qa/level_lint';

registerCoreTypes(); registerObjects(); registerEnemies(); registerNewContent();
const log = (s: string) => process.stderr.write(s + '\n');
it('probe', async () => {
  for (const act of L.zoneActs()) {
    SceneRouter.zoneId = act.zone; SceneRouter.stage = act.stage;
    const t0 = performance.now();
    const root = await L.prepare(L.loadLevelData(act.file));
    const t1 = performance.now();
    const findings = L.lint(root);
    const t2 = performance.now();
    const m = L.measure(root);
    const t3 = performance.now();
    log(`PROBE ${act.label} D${act.d} prep ${(t1-t0).toFixed(0)} lint ${(t2-t1).toFixed(0)} measure ${(t3-t2).toFixed(0)} ms`);
    log('  ' + L.summary(m));
    for (const f of findings) if (f.severity !== 'info') log('  ' + L.formatFinding(act.label, f));
    for (const f of L.check(m, act.d, Difficulty.targets(act.d), act.preBoss)) log('  ' + L.formatFinding(act.label, f));
  }
}, 600000);
