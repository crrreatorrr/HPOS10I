// Registers every level object type under the path the level files use: the
// .tscn path for instanced scenes, the .gd path for script-only nodes (the
// physics playground). The spring variants differ only in their scene
// defaults (kind), which the factory applies before the level's own props.

import { LevelTypes } from './common/level_loader';
import { BreakableWall } from './objects/breakable_wall';
import { Checkpoint } from './objects/checkpoint';
import { GoalSign } from './objects/goal_sign';
import { CeilingRam } from './objects/hazards/ceiling_ram';
import { Burrower, LavaVent } from './objects/hazards/floor_hazards';
import { FluidWell } from './objects/hazards/fluid_well';
import { DemoConveyor } from './objects/playground/demo_conveyor';
import { DemoMovingPlatform } from './objects/playground/demo_moving_platform';
import { DummyEnemy } from './objects/playground/dummy_enemy';
import { PlaygroundTicket } from './objects/playground/playground_ticket';
import { PromptZone } from './objects/prompt_zone';
import { SpeedBooster } from './objects/speed_booster';
import { Spikes } from './objects/spikes';
import { LevelSpring, SpringKind } from './objects/spring';
import { LevelTicket } from './objects/ticket';
import { Waterfall } from './objects/z1/waterfall';
import { AutoscrollSection } from './objects/z2/autoscroll_section';
import { Candle } from './objects/z2/candle';
import { FallingBook } from './objects/z2/falling_book';
import { MovingBookshelf } from './objects/z2/moving_bookshelf';
import { ShiftingStaircase } from './objects/z2/shifting_staircase';
import { Conveyor } from './objects/z3/conveyor';
import { Door } from './objects/z3/door';
import { FloorSwitch } from './objects/z3/floor_switch';
import { SecurityBeam } from './objects/z3/security_beam';

export function registerObjects(): void {
  const O = 'res://levels/objects/';
  LevelTypes.register(`${O}ticket.tscn`, () => new LevelTicket());
  LevelTypes.register(`${O}spring_up.tscn`, () => new LevelSpring(SpringKind.UP, 'SpringUp'));
  LevelTypes.register(`${O}spring_diagonal.tscn`, () => new LevelSpring(SpringKind.DIAGONAL, 'SpringDiagonal'));
  LevelTypes.register(`${O}spring_side.tscn`, () => new LevelSpring(SpringKind.SIDE, 'SpringSide'));
  LevelTypes.register(`${O}speed_booster.tscn`, () => new SpeedBooster());
  LevelTypes.register(`${O}breakable_wall.tscn`, () => new BreakableWall());
  LevelTypes.register(`${O}checkpoint.tscn`, () => new Checkpoint());
  LevelTypes.register(`${O}goal_sign.tscn`, () => new GoalSign());
  LevelTypes.register(`${O}spikes.tscn`, () => new Spikes());
  LevelTypes.register('hpos://objects/prompt_zone', () => new PromptZone());
  LevelTypes.register('hpos://hazards/fluid_well', () => new FluidWell());
  LevelTypes.register('hpos://hazards/lava_vent', () => new LavaVent());
  LevelTypes.register('hpos://hazards/ceiling_ram', () => new CeilingRam());
  LevelTypes.register('hpos://hazards/burrower', () => new Burrower());

  LevelTypes.register(`${O}z1/waterfall.tscn`, () => new Waterfall());

  LevelTypes.register(`${O}z2/autoscroll_section.tscn`, () => new AutoscrollSection());
  LevelTypes.register(`${O}z2/candle.tscn`, () => new Candle());
  LevelTypes.register(`${O}z2/falling_book.tscn`, () => new FallingBook());
  LevelTypes.register(`${O}z2/moving_bookshelf.tscn`, () => new MovingBookshelf());
  LevelTypes.register(`${O}z2/shifting_staircase.tscn`, () => new ShiftingStaircase());

  LevelTypes.register(`${O}z3/conveyor.tscn`, () => new Conveyor());
  LevelTypes.register(`${O}z3/door.tscn`, () => new Door());
  LevelTypes.register(`${O}z3/floor_switch.tscn`, () => new FloorSwitch());
  LevelTypes.register(`${O}z3/security_beam.tscn`, () => new SecurityBeam());

  LevelTypes.register('res://playground/demo_conveyor.gd', () => new DemoConveyor());
  LevelTypes.register('res://playground/demo_moving_platform.gd', () => new DemoMovingPlatform());
  LevelTypes.register('res://playground/dummy_enemy.gd', () => new DummyEnemy());
  LevelTypes.register('res://playground/playground_ticket.gd', () => new PlaygroundTicket());
}
