// Level types for every enemy scene (and the projectiles they fire), keyed by
// the original .tscn path the level files instance. Each constructor sets its
// scene's defaults (tier, speed and the hurtbox shape from the .tscn), so
// they are in place before the level loader calls applyProps.

import type { Node } from '../runtime/node';
import { LevelTypes } from './common/level_loader';
import { Armored } from './enemies/armored';
import { Chaser } from './enemies/chaser';
import { Diver } from './enemies/diver';
import { Dropper } from './enemies/dropper';
import { Floater } from './enemies/floater';
import { Hopper } from './enemies/hopper';
import { OrbitGuard } from './enemies/neon/orbit_guard';
import { ShockwavePill } from './enemies/neon/shockwave_pill';
import { Splitter } from './enemies/neon/splitter';
import { PaperSheet } from './enemies/paper_sheet';
import { Pellet } from './enemies/pellet';
import { PelletPill } from './enemies/pellet_pill';
import { Shot } from './enemies/shot';
import { Sniper } from './enemies/sniper';
import { SpikePill } from './enemies/spike_pill';
import { Walker } from './enemies/walker';
import { KnightPill } from './enemies/z2/knight_pill';
import { LanternPill } from './enemies/z2/lantern_pill';
import { SpellbookDiver } from './enemies/z2/spellbook_diver';
import { SpellbookPill } from './enemies/z2/spellbook_pill';
import { BouncerPill } from './enemies/z3/bouncer_pill';
import { CameraPill } from './enemies/z3/camera_pill';
import { ChandelierPill } from './enemies/z3/chandelier_pill';
import { ClerkPill } from './enemies/z3/clerk_pill';
import { DroneDiver } from './enemies/z3/drone_diver';
import { DronePill } from './enemies/z3/drone_pill';
import { SecurityPill } from './enemies/z3/security_pill';

const E = 'res://levels/enemies/';

/** Original scene path -> factory (a fresh node with the scene's defaults). */
export const ENEMY_SCENES: Readonly<Record<string, () => Node>> = {
  'hpos://enemies/splitter': () => new Splitter(),
  'hpos://enemies/orbit_guard': () => new OrbitGuard(),
  'hpos://enemies/shockwave_pill': () => new ShockwavePill(),
  [`${E}walker.tscn`]: () => new Walker(),
  [`${E}hopper.tscn`]: () => new Hopper(),
  [`${E}chaser.tscn`]: () => new Chaser(),
  [`${E}floater.tscn`]: () => new Floater(),
  [`${E}pellet_pill.tscn`]: () => new PelletPill(),
  [`${E}pellet.tscn`]: () => new Pellet(),
  [`${E}spike_pill.tscn`]: () => new SpikePill(),
  [`${E}armored.tscn`]: () => new Armored(),
  [`${E}diver.tscn`]: () => new Diver(),
  [`${E}dropper.tscn`]: () => new Dropper(),
  [`${E}sniper.tscn`]: () => new Sniper(),
  [`${E}shot.tscn`]: () => new Shot(),
  [`${E}paper_sheet.tscn`]: () => new PaperSheet(),
  [`${E}z2/spellbook_pill.tscn`]: () => new SpellbookPill(),
  [`${E}z2/spellbook_diver.tscn`]: () => new SpellbookDiver(),
  [`${E}z2/knight_pill.tscn`]: () => new KnightPill(),
  [`${E}z2/lantern_pill.tscn`]: () => new LanternPill(),
  [`${E}z3/bouncer_pill.tscn`]: () => new BouncerPill(),
  [`${E}z3/camera_pill.tscn`]: () => new CameraPill(),
  [`${E}z3/chandelier_pill.tscn`]: () => new ChandelierPill(),
  [`${E}z3/clerk_pill.tscn`]: () => new ClerkPill(),
  [`${E}z3/drone_diver.tscn`]: () => new DroneDiver(),
  [`${E}z3/drone_pill.tscn`]: () => new DronePill(),
  [`${E}z3/security_pill.tscn`]: () => new SecurityPill(),
};

export function registerEnemies(): void {
  for (const [path, factory] of Object.entries(ENEMY_SCENES)) LevelTypes.register(path, factory);
}
