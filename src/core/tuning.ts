// Holds the live PhysicsConstants. Read Tuning.physics every tick instead of
// caching it, so edits to physics_constants.json show up while the game runs
// (the dev server hot-reloads the file).

import { Signal } from '../runtime/signal';
import { defaultPhysics, type PhysicsConstants } from './physics_constants';

class TuningStore {
  physics: PhysicsConstants = defaultPhysics();
  readonly physicsReloaded = new Signal();

  /** Restores the shipped values (tests call this between cases). */
  reset(): void {
    this.physics = defaultPhysics();
  }
}

export const Tuning = new TuningStore();

if (import.meta.hot) {
  import.meta.hot.accept('./physics_constants.json', (mod) => {
    if (mod?.default) {
      Tuning.physics = { ...(mod.default as PhysicsConstants) };
      Tuning.physicsReloaded.emit();
      console.info('[Tuning] physics constants reloaded');
    }
  });
}
