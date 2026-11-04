// Builds act levels from reusable sections, left to right, in code (the
// TypeScript counterpart of levels/common/level_builder.gd). An act script
// (e.g. src/levels/z4/act1.ts) creates a builder, calls sections in route
// order and calls build(), which returns the LevelData node list that
// buildLevel() (src/levels/common/level_loader.ts) turns into a scene.
//
// Coordinates: px, y down; the ground line of the start is y = 0. `x` and
// `ground` are the current end of the route; every section starts there and
// moves them on. Terrain is CurveTerrain pieces only (no tile map): BLOCK
// pieces for flat ground, cliffs and slabs (touching blocks of the same
// height are merged), straight CURVE pieces for slopes, QUARTER_PIPE
// pieces and loops. Objects, set pieces and enemies are placed by their
// registered level-type keys.
//
// Bookkeeping:
// - `route`: every step of the intended way from PlayerStart to the goal
//   (walks along floors, jumps over gaps, launches by springs, boosters and
//   loops, hops over platforms, drops), for the geometric route check
//   (route_check.ts) and the input-only playtest pilot (route_pilot.ts),
//   which follows it for the direction to hold.
// - `warnings` (docs/LEVELS.md fairness): an enemy within a screen of a
//   checkpoint, a spring landing or a loop exit; a steep up-slope within
//   160 px after a checkpoint; a jump wider or higher than a running jump.
// - `stats()`: length, enemies by tier and by section, tickets, checkpoints.

import { Color } from '../../runtime/color';
import { Vec2 } from '../../runtime/vec2';
import type { LevelData, LevelNodeData } from '../common/level_loader';
import type { RawProps, RawValue } from '../common/props';

export const SCREEN = 424;
/** Sproto's centre stands this far above the floor. */
export const STAND = 19;
/** Tickets float this far above the floor. */
export const TICKET_UP = 16;
/** Fairness margins (px). */
export const SAFE_AFTER = SCREEN;
/** Running-jump limits used by the warnings and the route check. */
export const MAX_JUMP_GAP = 176;
export const MAX_JUMP_RISE = 72;

export const KEYS = {
  LEVEL_ROOT: 'res://levels/common/level_root.gd',
  CURVE_TERRAIN: 'res://terrain/curve_terrain.gd',
  LOOP: 'res://terrain/loop.tscn',
  TICKET: 'res://levels/objects/ticket.tscn',
  SPRING_UP: 'res://levels/objects/spring_up.tscn',
  SPRING_DIAGONAL: 'res://levels/objects/spring_diagonal.tscn',
  SPRING_SIDE: 'res://levels/objects/spring_side.tscn',
  BOOSTER: 'res://levels/objects/speed_booster.tscn',
  BREAKABLE_WALL: 'res://levels/objects/breakable_wall.tscn',
  CHECKPOINT: 'res://levels/objects/checkpoint.tscn',
  GOAL_SIGN: 'res://levels/objects/goal_sign.tscn',
  SPIKES: 'res://levels/objects/spikes.tscn',
  BUMPER: 'hpos://setpieces/bumper',
  CRUMBLE_LEDGE: 'hpos://setpieces/crumble_ledge',
  ROLL_TUBE: 'hpos://setpieces/roll_tube',
  VANISHING_PLATFORM: 'hpos://setpieces/vanishing_platform',
  TIMED_PLATFORM: 'hpos://setpieces/timed_platform',
  VOID_ZONE: 'hpos://setpieces/void_zone',
} as const;

export type EnemyKind = 'walker' | 'hopper' | 'chaser' | 'floater' | 'pellet' | 'armored' | 'spike' | 'diver' | 'sniper' | 'dropper';

/** Tier of each base enemy (docs/LEVELS.md roster). */
export const ENEMY_TIER: Record<EnemyKind, number> = {
  walker: 1,
  hopper: 1,
  chaser: 2,
  floater: 2,
  pellet: 2,
  armored: 3,
  spike: 3,
  diver: 3,
  sniper: 4,
  dropper: 4,
};

const E = 'res://levels/enemies/';
export const ENEMY_KEYS: Record<EnemyKind, string> = {
  walker: `${E}walker.tscn`,
  hopper: `${E}hopper.tscn`,
  chaser: `${E}chaser.tscn`,
  floater: `${E}floater.tscn`,
  pellet: `${E}pellet_pill.tscn`,
  armored: `${E}armored.tscn`,
  spike: `${E}spike_pill.tscn`,
  diver: `${E}diver.tscn`,
  sniper: `${E}sniper.tscn`,
  dropper: `${E}dropper.tscn`,
};

/** CurveTerrain shapes (src/terrain/curve_terrain.ts CurveShape). */
const SHAPE = { LOOP: 0, QUARTER_PIPE: 1, RAMP: 2, CURVE: 3, BLOCK: 4 } as const;

export type RouteKind = 'walk' | 'jump' | 'drop' | 'spring' | 'booster' | 'loop' | 'pipe' | 'platforms';

/** One step of the intended route. Positions are feet on the floor. */
export interface RouteStep {
  kind: RouteKind;
  from: Vec2;
  to: Vec2;
  /** platforms: the top-left corner and width of each platform hopped, in order. */
  hops?: { at: Vec2; width: number }[];
  note?: string;
}

export interface BuilderOptions {
  name: string;
  zoneId: string;
  artZoneId: string;
  /** Bounds top and bottom (camera limits; below the bottom is a pit). */
  top?: number;
  bottom?: number;
  /** Ground fill reaches down to this y. */
  fillBottom?: number;
  /** Level-type keys of the terrain pieces and loops (zone looks). */
  terrainKey?: string;
  loopKey?: string;
  fill?: Color;
  edge?: Color;
  accent?: Color;
  /** Zone costumes for enemy kinds (same behaviour and tier). */
  enemyKeys?: Partial<Record<EnemyKind, string>>;
  music?: string;
  /** Art zone passed to set pieces (default: artZoneId). */
  setPieceArtZone?: string;
}

interface Block {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  topOnly: boolean;
}

export interface SectionStats {
  screens: number;
  enemies: number;
  tiers: Record<number, number>;
  tierMax: number;
  density: number;
}

export interface BuilderStats {
  /** Width of the columns with a floor (stacked floors once), in screens. */
  screens: number;
  /** Length of the route (sum of |dx| of every step), in screens. */
  routeScreens: number;
  enemies: number;
  tiers: Record<number, number>;
  tierPct: Record<number, number>;
  tickets: number;
  checkpoints: number;
  checkpointXs: number[];
  ticketDensity: number;
  enemyDensity: number;
  sections: { opening: SectionStats; middle: SectionStats; finale: SectionStats };
  leftwardScreens: number;
  startX: number;
  goalX: number;
}

/** A floor span recorded for the length measure (moving platforms excluded). */
interface FloorSpan {
  x0: number;
  x1: number;
}

export function enc(v: unknown): RawValue {
  if (v instanceof Vec2) return { v2: [v.x, v.y] };
  if (v instanceof Color) return { color: [v.r, v.g, v.b, v.a] };
  if (Array.isArray(v) && v.length > 0 && v.every((p) => p instanceof Vec2)) return { v2s: (v as Vec2[]).flatMap((p) => [p.x, p.y]) };
  return v as RawValue;
}

function encProps(props: Record<string, unknown>): RawProps {
  const out: RawProps = {};
  for (const [k, v] of Object.entries(props)) out[k] = enc(v);
  return out;
}

export class LevelBuilder {
  readonly opts: Required<Omit<BuilderOptions, 'enemyKeys' | 'music' | 'accent'>> & BuilderOptions;
  x = 0;
  ground = 0;
  readonly route: RouteStep[] = [];
  readonly warnings: string[] = [];
  /** [x, what, floor y] of every spring landing, loop exit and checkpoint so far. */
  readonly safeMarks: [number, string, number][] = [];

  private nodes: LevelNodeData[] = [];
  private blocks: Block[] = [];
  private floors: FloorSpan[] = [];
  private counts = new Map<string, number>();
  private enemyList: { name: string; kind: EnemyKind; at: Vec2 }[] = [];
  private ticketCount = 0;
  private checkpointXs: number[] = [];
  private startX = 0;
  private goalX = NaN;
  private minGround = 0;
  private leftwardPx = 0;
  /** While set, sections record no route steps (a section that records its own). */
  private quiet = false;

  constructor(options: BuilderOptions) {
    this.opts = {
      top: -480,
      bottom: 64,
      fillBottom: 80,
      terrainKey: KEYS.CURVE_TERRAIN,
      loopKey: KEYS.LOOP,
      fill: new Color(0.75, 0.44, 0.2),
      edge: new Color(0.36, 0.82, 0.24),
      setPieceArtZone: options.artZoneId,
      ...options,
    };
    const rootProps: Record<string, unknown> = {
      zone_id: options.zoneId,
      art_zone_id: options.artZoneId,
      horizon_height: this.opts.bottom,
      background_y_offsets: [0, 12, 20, 28],
    };
    if (options.music) rootProps.music = options.music;
    this.nodes.push({ name: options.name, parent: null, type: 'Node2D', script: KEYS.LEVEL_ROOT, props: encProps(rootProps) });
    for (const [name, parent] of [
      ['Terrain', '.'],
      ['Decor', 'Terrain'],
      ['Objects', '.'],
      ['Pickups', 'Objects'],
      ['SetPieces', 'Objects'],
      ['Enemies', '.'],
    ] as const) {
      this.nodes.push({ name, parent, type: 'Node2D', props: name === 'Decor' ? { z_index: -10 } : {} });
    }
  }

  // --- Sections -----------------------------------------------------------------

  /** Flat start with PlayerStart 96 px in and a wall behind it. */
  start(width: number): void {
    this.startX = this.x + 96;
    this.nodes.push({ name: 'PlayerStart', parent: '.', type: 'Marker2D', props: encProps({ position: new Vec2(this.x + 96, this.ground - STAND) }) });
    this.addBlock(this.x - 48, this.x, this.opts.top, this.opts.fillBottom);
    this.flat(width, 160);
  }

  /** Flat ground with an optional row of tickets every `ticketStep` px from `ticketFrom`. */
  flat(width: number, ticketFrom = -1, ticketStep = 48): void {
    const x0 = this.x;
    this.addBlock(x0, x0 + width, this.ground);
    this.walk(new Vec2(x0, this.ground), new Vec2(x0 + width, this.ground));
    this.x = x0 + width;
    if (ticketFrom >= 0) this.row(x0 + ticketFrom, this.ground, Math.max(0, Math.floor((width - ticketFrom - 48) / ticketStep) + 1), ticketStep);
  }

  /** A straight slope by `dy` (negative = up): gentle 1:2, or steep 1:1. */
  slope(dy: number, steep = false): void {
    const run = Math.abs(dy) * (steep ? 1 : 2);
    const x0 = this.x;
    const y0 = this.ground;
    if (dy < 0) this.checkClimbAfterCheckpoint(x0, steep);
    this.addSlope(x0, y0, x0 + run, y0 + dy);
    this.ground = y0 + dy;
    this.walk(new Vec2(x0, y0), new Vec2(x0 + run, this.ground));
    this.x = x0 + run;
  }

  /** A 45 degree slope down `height` with three tickets on it. */
  descent(height: number): void {
    const x0 = this.x;
    const y0 = this.ground;
    this.slope(height, true);
    for (let i = 0; i < 3; i++) this.ticket(x0 + 24 + i * 32, y0 + 24 + i * 32);
  }

  /**
   * A hill: gentle (1:2) or steep (1:1) up `rise`, a plateau and down again,
   * tickets over it and an optional enemy `enemyGap` px past its foot (a
   * knockback from it lands on the slope behind). A gap over 60 px adds a
   * low ticket trail to the enemy: a cue to roll through it.
   */
  hill(rise: number, plateau: number, o: { steep?: boolean; enemy?: EnemyKind; props?: Record<string, unknown>; runAfter?: number; enemyUp?: number; enemyGap?: number } = {}): void {
    const steep = o.steep ?? false;
    const base = this.ground;
    const x0 = this.x;
    this.slope(-rise, steep);
    const upEnd = this.x;
    this.flat(plateau);
    this.row(upEnd + 16, base - rise, Math.max(1, Math.floor(plateau / 48)), 48);
    this.slope(rise, steep);
    const foot = this.x;
    if (o.enemy) {
      const gap = o.enemyGap ?? 30;
      const props = { ...(o.props ?? {}) };
      if (['walker', 'chaser', 'spike', 'armored'].includes(o.enemy) && !('patrol_distance' in props)) props.patrol_distance = 40;
      this.enemy(o.enemy, new Vec2(foot + gap, base - (o.enemyUp ?? 0)), props);
      if (gap > 60) this.row(foot + 8, base, Math.max(1, Math.floor((gap - 40) / 32)), 32);
    }
    this.flat(o.runAfter ?? 160);
    if (!o.enemy) this.arc(x0 + Math.floor((foot - x0) / 2), base - rise, 3, 64, 24);
  }

  /** A loop (radius 112) with a run-up, an optional booster and room after it. */
  loop(booster = true, runup = 320): void {
    this.flat(runup);
    if (booster) this.place(KEYS.BOOSTER, 'SpeedBooster', new Vec2(this.x - 72, this.ground), { facing: 1 });
    this.row(this.x - runup + 48, this.ground, 2, 32);
    const x0 = this.x;
    const centre = x0 + 240;
    if (this.opts.fillBottom > this.ground + 64) this.addBlock(x0, x0 + 480, this.ground + 64, this.opts.fillBottom, false, false);
    const name = this.next('Loop');
    const props: Record<string, unknown> = { position: new Vec2(centre, this.ground) };
    if (this.opts.loopKey !== KEYS.LOOP) Object.assign(props, { fill_color: this.opts.fill, edge_color: this.opts.edge, ...(this.opts.accent ? { accent_color: this.opts.accent } : {}) });
    this.nodes.push({ name, parent: 'Terrain', type: null, scene: this.opts.loopKey, props: encProps(props) });
    if (this.opts.loopKey === KEYS.LOOP) {
      for (const piece of ['Floor', 'LowerRight', 'Upper', 'LowerLeft', 'RightFoot', 'LeftFoot']) {
        this.nodes.push({ name: piece, parent: `Terrain/${name}`, type: null, script: KEYS.CURVE_TERRAIN, props: encProps({ fill_color: this.opts.fill, edge_color: this.opts.edge }) });
      }
    }
    for (const a of [90, 180, 270]) {
      const r = 112 - STAND;
      const rad = (a * Math.PI) / 180;
      this.ticketAt(new Vec2(centre + Math.sin(rad) * r, this.ground - 112 + Math.cos(rad) * r));
    }
    this.floors.push({ x0, x1: x0 + 480 });
    this.step('loop', new Vec2(x0, this.ground), new Vec2(x0 + 480, this.ground), booster ? 'boosted' : 'needs speed');
    this.x = x0 + 480;
    this.mark(this.x, 'loop exit');
    this.flat(64);
  }

  /** An up spring against a cliff of `height` (<= 160) onto higher ground. */
  upSpring(height: number, runup = 192): void {
    this.flat(runup);
    const sx = this.x - 16;
    this.place(KEYS.SPRING_UP, 'SpringUp', new Vec2(sx, this.ground));
    for (const y of [-64, -112, -160]) this.ticketAt(new Vec2(sx, this.ground + y));
    const from = new Vec2(sx, this.ground);
    this.ground -= height;
    this.step('spring', from, new Vec2(this.x, this.ground), 'up spring');
    this.mark(this.x + 160, 'spring landing');
    this.flat(48);
  }

  /** A vertical drop of `height` onto lower ground (visible: keep it under ~140 px). */
  drop(height: number, landing = 96): void {
    const from = new Vec2(this.x, this.ground);
    this.ground += height;
    this.step('drop', from, new Vec2(this.x + 32, this.ground));
    this.addBlock(this.x, this.x + landing, this.ground);
    this.walk(new Vec2(this.x + 32, this.ground), new Vec2(this.x + landing, this.ground));
    this.x += landing;
  }

  /** A quarter pipe up onto ground `radius` px higher, after a flat run-up. */
  quarterPipe(radius = 64, runup = 320): void {
    this.flat(runup, 48, 48);
    const x0 = this.x;
    this.nodes.push({
      name: this.next('QuarterPipe'),
      parent: 'Terrain',
      type: null,
      script: this.opts.terrainKey,
      ...(this.opts.terrainKey !== KEYS.CURVE_TERRAIN ? { scene: this.opts.terrainKey } : {}),
      props: encProps({
        position: new Vec2(x0, this.ground),
        shape: SHAPE.QUARTER_PIPE,
        radius,
        thickness: 16,
        depth: this.opts.fillBottom - this.ground,
        ...this.colors(),
      }),
    });
    for (const y of [-100, -150, -200]) this.ticketAt(new Vec2(x0 + radius - STAND, this.ground + y));
    this.floors.push({ x0, x1: x0 + radius + 16 });
    const from = new Vec2(x0, this.ground);
    this.ground -= radius;
    this.x = x0 + radius + 16;
    this.step('pipe', from, new Vec2(this.x, this.ground), 'quarter pipe');
    this.mark(this.x + 160, 'quarter pipe landing');
    this.flat(96);
  }

  /** A pit `width` px wide (jump it), with an arc of tickets over it; a void zone under a high pit. */
  pit(width: number, tickets = 3): void {
    const x0 = this.x;
    this.voidUnder(x0, width);
    this.x = x0 + width;
    this.step('jump', new Vec2(x0, this.ground), new Vec2(this.x, this.ground));
    this.checkJump(x0, width, 0);
    if (tickets > 0) this.arc(x0 + Math.floor(width / 2), this.ground, tickets, Math.max(32, width - 16), 48);
  }

  /**
   * The spring gate: a column with a 44 px passage (too low to jump in), a
   * diagonal spring just past it that throws Sproto onto a jump-through bridge
   * 160 px up, over two pits (a fall from the bridge jumps them). The spring
   * can't be avoided, so the route is the bridge.
   */
  springGate(bridgeLen = 576): void {
    this.flat(256);
    const g = this.x;
    this.flat(96);
    const groundY = this.ground;
    const springFrom = new Vec2(g + 96 + 32, groundY);
    this.step('walk', new Vec2(g + 96, groundY), springFrom);
    this.quiet = true;
    this.addBlock(g, g + 96, this.opts.top, this.ground - 44, false, false);
    this.row(g - 160, this.ground, 3, 32);
    const springAt = new Vec2(g + 96 + 32, this.ground);
    this.place(KEYS.SPRING_DIAGONAL, 'SpringDiagonal', springAt, { facing: 1 });
    for (const [dx, dy] of [
      [192, -112],
      [256, -168],
      [320, -208],
    ]) {
      this.ticketAt(new Vec2(g + 96 + dx!, this.ground + dy!));
    }
    this.flat(160);
    const pitsFrom = this.x;
    this.pit(96, 0);
    this.flat(160, 48, 32);
    this.pit(96, 0);
    this.flat(352);
    for (const base of [pitsFrom, pitsFrom + 256]) this.ticket(base + 48, this.ground - 48);
    const bridgeY = this.ground - 160;
    const b0 = g + 96 + 288;
    this.addBlock(b0, b0 + bridgeLen, bridgeY, bridgeY + 12, true);
    this.row(b0 + 288, bridgeY, 4, 48);
    this.mark(b0 + 160, 'spring landing', bridgeY);
    this.quiet = false;
    // The route: the spring is unavoidable (no jumping in the passage); off the bridge's end.
    const land = new Vec2(Math.min(springFrom.x + 560, b0 + bridgeLen - 64), bridgeY);
    this.step('spring', springFrom, land, 'spring gate');
    this.step('walk', land, new Vec2(b0 + bridgeLen, bridgeY));
    this.step('drop', new Vec2(b0 + bridgeLen, bridgeY), new Vec2(Math.max(this.x, b0 + bridgeLen + 32), groundY));
    if (this.x < b0 + bridgeLen + 32) this.flat(b0 + bridgeLen + 32 - this.x);
  }

  /**
   * A forced-roll tunnel: a terrace `length` px long whose top is 64 px up
   * (the high way: hop onto it) with a 32 px roll-only tunnel through it on
   * the ground, and a roll tube that curls Sproto up 48 px before the mouth
   * and keeps him at 6 px/frame or more through it.
   */
  rollTunnel(length = 384, o: { tickets?: boolean; direction?: number } = {}): void {
    this.flat(192);
    const t0 = this.x;
    const base = this.ground;
    this.addBlock(t0, t0 + length, base - 64, base - 32, false, false);
    this.setPiece(KEYS.ROLL_TUBE, new Vec2(t0 - 48, base), { length: length + 96, height: 32, direction: o.direction ?? 0 });
    this.flat(length);
    this.floors.push({ x0: t0, x1: t0 + length });
    if (o.tickets ?? true) {
      this.row(t0 + 48, base, Math.max(1, Math.floor(length / 128)), 128);
      this.row(t0 + 64, base - 64, 2, 64);
    }
  }

  /**
   * Bumpers hovering over a flat: their bottoms clear a runner's head, so
   * only a jump meets them (+10 each, a bounce away). `count` across
   * `width` px, alternating 60 and 92 px up.
   */
  bumperRow(width: number, count: number, tickets = true): void {
    const x0 = this.x;
    this.flat(width);
    for (let i = 0; i < count; i++) {
      const bx = x0 + Math.round(((i + 1) * width) / (count + 1));
      this.setPiece(KEYS.BUMPER, new Vec2(bx, this.ground - (i % 2 === 0 ? 72 : 104)), {});
    }
    if (tickets) this.row(x0 + 32, this.ground, Math.max(1, Math.floor((width - 64) / 96)), 96);
  }

  /**
   * Vanishing platforms across a pit (`overPit`) or over the ground. `count`
   * platforms `width` px wide with `gap` px between, their tops at the
   * ground level (+ `up`); the cycle ripples by `ripple` frames per
   * platform, so a runner following the wave meets each one solid.
   */
  vanishingRun(count: number, o: { width?: number; gap?: number; up?: number; overPit?: boolean; onFrames?: number; offFrames?: number; ripple?: number; lead?: number } = {}): void {
    const width = o.width ?? 96;
    const gap = o.gap ?? 48;
    const up = o.up ?? 0;
    const overPit = o.overPit ?? true;
    this.flat(o.lead ?? (o.overPit ?? true ? 224 : 128));
    const x0 = this.x;
    const top = this.ground - up;
    const span = count * width + (count - 1) * gap + 2 * gap;
    if (overPit) this.voidUnder(x0, span);
    else this.addBlock(x0, x0 + span, this.ground);
    const hops: { at: Vec2; width: number }[] = [];
    for (let i = 0; i < count; i++) {
      const px = x0 + gap + i * (width + gap);
      this.setPiece(KEYS.VANISHING_PLATFORM, new Vec2(px, top), {
        size: new Vec2(width, 12),
        on_frames: o.onFrames ?? 150,
        off_frames: o.offFrames ?? 90,
        offset: -i * (o.ripple ?? 24),
      });
      hops.push({ at: new Vec2(px, top), width });
      this.ticket(px + width / 2, top);
    }
    this.x = x0 + span;
    if (overPit) {
      this.pushRoute({ kind: 'platforms', from: new Vec2(x0, this.ground), to: new Vec2(this.x, this.ground), hops, note: 'vanishing' });
      this.flat(96); // a landing before whatever comes next
    } else {
      this.walk(new Vec2(x0, this.ground), new Vec2(this.x, this.ground));
    }
  }

  /**
   * Timed platforms over pits: `count` pits of `pit` px, each spanned by a
   * timed platform at ground level (a countdown once stood on), with `land`
   * px of ground between them. With `shuttle`, a wider pit is crossed by a
   * platform shuttling over it.
   */
  timedPits(count: number, o: { pit?: number; width?: number; land?: number; countdown?: number; shuttle?: number; overGround?: number } = {}): void {
    const pit = o.pit ?? 224;
    const width = o.width ?? 96;
    const land = o.land ?? 128;
    if (o.overGround) {
      // Teaching: the platforms hover `overGround` px over solid ground (a miss lands on the floor).
      this.flat(128);
      const x0 = this.x;
      for (let i = 0; i < count; i++) {
        const px = x0 + 64 + i * (width + 96);
        this.setPiece(KEYS.TIMED_PLATFORM, new Vec2(px, this.ground - o.overGround), { size: new Vec2(width, 12), countdown_frames: o.countdown ?? 120, off_frames: 120 });
        this.ticket(px + width / 2, this.ground - o.overGround);
      }
      this.flat(64 + count * (width + 96));
      return;
    }
    for (let i = 0; i < count; i++) {
      this.flat(i === 0 ? 128 : land);
      const x0 = this.x;
      this.voidUnder(x0, pit);
      const px = x0 + Math.round((pit - width) / 2);
      const props: Record<string, unknown> = { size: new Vec2(width, 12), countdown_frames: o.countdown ?? 90, off_frames: 150 };
      const hops = [{ at: new Vec2(px, this.ground), width }];
      if (o.shuttle && i % 2 === 1) {
        const travel = Math.max(0, pit - width - 32);
        props.travel = new Vec2(travel, 0);
        props.period_frames = 240;
        props.countdown_frames = 240;
        this.setPiece(KEYS.TIMED_PLATFORM, new Vec2(x0 + 16, this.ground), props);
        hops[0] = { at: new Vec2(x0 + 16, this.ground), width: width + travel };
      } else {
        this.setPiece(KEYS.TIMED_PLATFORM, new Vec2(px, this.ground), props);
      }
      this.ticket(px + width / 2, this.ground);
      this.x = x0 + pit;
      this.pushRoute({ kind: 'platforms', from: new Vec2(x0, this.ground), to: new Vec2(this.x, this.ground), hops, note: 'timed' });
    }
    this.flat(land);
  }

  /** Crumble ledges across a pit: `count` ledges with `gap` px between; run, don't stop. */
  crumbleRun(count: number, o: { width?: number; gap?: number; overGround?: number } = {}): void {
    const width = o.width ?? 80;
    const gap = o.gap ?? 32;
    if (o.overGround) {
      // Teaching: ledges hovering over solid ground.
      this.flat(128);
      const x0 = this.x;
      for (let i = 0; i < count; i++) {
        const px = x0 + gap + i * (width + gap);
        this.setPiece(KEYS.CRUMBLE_LEDGE, new Vec2(px, this.ground - o.overGround), { size: new Vec2(width, 16) });
        this.ticket(px + width / 2, this.ground - o.overGround);
      }
      this.flat(count * (width + gap) + gap + 64);
      return;
    }
    this.flat(128);
    const x0 = this.x;
    const span = count * width + (count + 1) * gap;
    this.voidUnder(x0, span);
    const hops: { at: Vec2; width: number }[] = [];
    for (let i = 0; i < count; i++) {
      const px = x0 + gap + i * (width + gap);
      this.setPiece(KEYS.CRUMBLE_LEDGE, new Vec2(px, this.ground), { size: new Vec2(width, 16) });
      hops.push({ at: new Vec2(px, this.ground), width });
      if (i % 2 === 0) this.ticket(px + width / 2, this.ground);
    }
    this.x = x0 + span;
    this.pushRoute({ kind: 'platforms', from: new Vec2(x0, this.ground), to: new Vec2(this.x, this.ground), hops, note: 'crumble' });
    this.flat(96);
  }

  /**
   * Three stacked routes over `length` px (R5: several routes with very
   * different risk): the low ground, a jump-through mid deck 80 px up and a
   * high deck 160 px up (each reachable by a jump from the one below; a
   * diagonal spring at the start throws a runner straight onto the high
   * deck - hop over it to stay low; the route recorded is the low one).
   * The decks have drop gaps; `highGaps` of them on the high deck are
   * bridged by vanishing platforms. Returns the floor heights and x span so
   * the act script can place enemies and pieces on each route.
   */
  decks(length: number, o: { highGaps?: number; midGaps?: number; vanishing?: boolean; spring?: boolean } = {}): { x0: number; x1: number; low: number; mid: number; high: number } {
    const x0 = this.x;
    const low = this.ground;
    const mid = low - 80;
    const high = low - 160;
    if (o.spring ?? true) {
      this.place(KEYS.SPRING_DIAGONAL, 'SpringDiagonal', new Vec2(x0 + 48, low), { facing: 1 });
      this.mark(x0 + 400, 'spring landing', low - 160);
    }
    this.flat(length);
    const spans = (from: number, to: number, gaps: number, gapW: number): [number, number][] => {
      const out: [number, number][] = [];
      const total = to - from;
      const piece = (total - gaps * gapW) / (gaps + 1);
      let at = from;
      for (let i = 0; i <= gaps; i++) {
        out.push([Math.round(at), Math.round(at + piece)]);
        at += piece + gapW;
      }
      return out;
    };
    const midSpans = spans(x0 + 160, x0 + length - 160, o.midGaps ?? 1, 128);
    for (const [a, b] of midSpans) this.addBlock(a, b, mid, mid + 12, true);
    const highSpans = spans(x0 + 288, x0 + length - 288, o.highGaps ?? 2, 160);
    for (const [a, b] of highSpans) this.addBlock(a, b, high, high + 12, true);
    if (o.vanishing ?? true) {
      for (let i = 0; i + 1 < highSpans.length; i++) {
        const gx = highSpans[i]![1];
        this.setPiece(KEYS.VANISHING_PLATFORM, new Vec2(gx + 40, high), { size: new Vec2(80, 12), on_frames: 120, off_frames: 90, offset: -i * 40 });
      }
    }
    for (const [a, b] of highSpans) this.row(a + 32, high, Math.max(1, Math.floor((b - a - 64) / 192)), 192);
    for (const [a, b] of midSpans) this.row(a + 64, mid, Math.max(1, Math.floor((b - a - 128) / 320)), 320);
    return { x0, x1: x0 + length, low, mid, high };
  }

  /**
   * A zigzag up `floors` stacked floors `spacing` px apart inside a
   * `width` px hall (R5 reverse runs; with several floors, a spiral
   * ascent). Floor 0 is the ground, entered from the left under a lintel;
   * odd floors run LEFT (marked "ReverseRun" for the lint: leftward and
   * forced), even floors right. At the end of each floor a diagonal spring
   * throws Sproto up through the opening at that end onto the next floor,
   * landing well inside it. Left-facing boosters push him along each reverse
   * floor. `floors` must be even: the last floor leaves the hall to the
   * right as the new ground. Returns each floor's y and span.
   */
  zigzag(floors: number, width: number, o: { spacing?: number; open?: number; boosters?: boolean; tickets?: boolean } = {}): { y: number; x0: number; x1: number; dir: number }[] {
    if (floors < 2 || floors % 2 !== 0) throw new Error('zigzag: floors must be even and >= 2');
    const H = o.spacing ?? 176;
    const OPEN = o.open ?? 320;
    const T = 16;
    const x0 = this.x;
    const x1 = x0 + width;
    const g = this.ground;
    const out: { y: number; x0: number; x1: number; dir: number }[] = [];
    // The left wall (a lintel 64 px over floor 0) and floor 0.
    const topY = g - floors * H;
    this.addBlock(x0 - 32, x0, Math.min(this.opts.top, topY - 240), g - 64, false, false);
    this.addBlock(x0, x1, g);
    out.push({ y: g, x0, x1, dir: 1 });
    this.walk(new Vec2(x0, g), new Vec2(x1 - 24, g));
    if (o.tickets ?? true) this.row(x0 + 96, g, Math.floor((width - 192) / 192), 192);
    for (let k = 1; k <= floors; k++) {
      const y = g - k * H;
      const left = k % 2 === 1;
      const prevY = y + H;
      // The spring at the end of the floor below (it faces the way the new floor runs).
      const springX = left ? x1 - 24 : x0 + 24;
      this.place(KEYS.SPRING_DIAGONAL, left ? 'ZigzagSpringLeft' : 'ZigzagSpringRight', new Vec2(springX, prevY), { facing: left ? -1 : 1 });
      for (const [dx, dy] of [
        [-100, -110],
        [-250, -200],
      ]) {
        this.ticketAt(new Vec2(springX + (left ? dx! : -dx!), prevY + dy!));
      }
      const land = left ? x1 - 24 - 560 : x0 + 24 + 560;
      let a: number;
      let b: number;
      if (k === floors) {
        a = x0 + OPEN;
        b = x1;
        this.addBlock(a, b, y, y + T);
      } else if (left) {
        a = x0;
        b = x1 - OPEN;
        this.addBlock(a, b, y, y + T);
      } else {
        a = x0 + OPEN;
        b = x1;
        this.addBlock(a, b, y, y + T);
      }
      this.step('spring', new Vec2(springX, prevY), new Vec2(land, y), 'zigzag spring');
      if (!left) this.mark(land, 'spring landing', y);
      else this.mark(land - SAFE_AFTER, 'spring landing (leftward)', y);
      const end = left ? x0 + 24 : x1 - 24;
      if (k < floors) this.walk(new Vec2(land, y), new Vec2(end, y));
      out.push({ y, x0: a, x1: b, dir: left ? -1 : 1 });
      if (left) {
        if (o.boosters ?? true) this.place(KEYS.BOOSTER, 'SpeedBooster', new Vec2(land - 160, y), { facing: -1 });
        this.marker(this.next('ReverseRun'), a, y - 120, b - a, 120);
        this.leftwardPx += b - a;
      }
      if (o.tickets ?? true) this.row(a + 64, y, Math.max(1, Math.floor((b - a - 128) / 192)), 192);
    }
    // Leave the hall to the right as the new ground (its first block is the hall's right wall).
    this.walk(new Vec2(x0 + 24 + 560, topY), new Vec2(x1, topY));
    this.ground = topY;
    this.x = x1;
    this.flat(32);
    return out;
  }

  /** A calm stretch with a few tickets (before an arena gate). */
  corridor(length = 848, tickets = 5): void {
    const x0 = this.x;
    this.flat(length);
    this.row(x0 + 64, this.ground, tickets, Math.floor((length - 128) / Math.max(tickets, 1)));
  }

  /**
   * A flat of `width` px with an enemy `at` px in (feet on the floor, or `up`
   * px above it for flyers), two tickets right past it and one before.
   */
  guard(kind: EnemyKind, width = 320, at = 192, up = 0, props: Record<string, unknown> = {}, tickets = 3): void {
    const x0 = this.x;
    width = Math.max(width, at + 104);
    this.flat(width);
    if (tickets >= 3 && at >= 96) this.ticket(x0 + 32, this.ground);
    if (tickets >= 1) this.ticket(x0 + at + 40, this.ground);
    if (tickets >= 2) this.ticket(x0 + at + 88, this.ground);
    this.enemy(kind, new Vec2(x0 + at, this.ground - up), props);
  }

  /** A checkpoint post at x (Sproto's centre height above the floor there). */
  checkpoint(atX = -1, floorY = this.ground): void {
    const cx = atX < 0 ? this.x : atX;
    for (const e of this.enemyList) {
      const dx = cx - e.at.x;
      if (dx >= 0 && dx < SCREEN && Math.abs(e.at.y - floorY) < 200) this.warnings.push(`${e.name} at x ${e.at.x.toFixed(0)} is ${dx.toFixed(0)} px before a checkpoint (respawns next to it)`);
    }
    if (this.checkpointXs.length && cx <= this.checkpointXs[this.checkpointXs.length - 1]!) {
      this.warnings.push(`checkpoint at x ${cx} is left of the one before it (it would never move the respawn point)`);
    }
    this.place(KEYS.CHECKPOINT, 'Checkpoint', new Vec2(cx, floorY - STAND));
    this.checkpointXs.push(cx);
    this.mark(cx, 'checkpoint', floorY);
  }

  /** The goal sign `leadIn` px ahead, a runout and the end wall; finishes the route. */
  goal(leadIn = 256, runout = 320): void {
    this.flat(leadIn, 32, 48);
    this.place(KEYS.GOAL_SIGN, 'GoalSign', new Vec2(this.x, this.ground));
    this.goalX = this.x;
    this.flat(runout);
    this.addBlock(this.x, this.x + 48, this.opts.top, this.opts.fillBottom, false, false);
  }

  // --- Placement ----------------------------------------------------------------

  enemy(kind: EnemyKind, at: Vec2, props: Record<string, unknown> = {}): string {
    for (const [mx, what, my] of this.safeMarks) {
      const dx = at.x - mx;
      if (dx >= 0 && dx < SAFE_AFTER && at.y <= my + 4 && my - at.y < 160) this.warnings.push(`${kind} at x ${at.x.toFixed(0)} is ${dx.toFixed(0)} px after a ${what}`);
    }
    const key = this.opts.enemyKeys?.[kind] ?? ENEMY_KEYS[kind];
    const base = kind.charAt(0).toUpperCase() + kind.slice(1);
    const name = this.next(base);
    this.nodes.push({ name, parent: 'Enemies', type: 'Area2D', scene: key, props: encProps({ position: at, ...props }) });
    this.enemyList.push({ name, kind, at });
    return name;
  }

  /** A set piece (or any registered object) under Objects/SetPieces, with the zone's art_zone. */
  setPiece(key: string, at: Vec2, props: Record<string, unknown> = {}): string {
    const base = key.split('/').pop()!.replace(/\.tscn$/, '');
    const name = this.next(base.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(''));
    const all: Record<string, unknown> = { position: at, ...props };
    if (key.startsWith('hpos://setpieces/') && !('art_zone' in all)) all.art_zone = this.opts.setPieceArtZone;
    this.nodes.push({ name, parent: 'Objects/SetPieces', type: null, scene: key, props: encProps(all) });
    return name;
  }

  /** An object by key under Objects. */
  place(key: string, base: string, at: Vec2, props: Record<string, unknown> = {}): string {
    const name = this.next(base);
    this.nodes.push({ name, parent: 'Objects', type: null, scene: key, props: encProps({ position: at, ...props }) });
    return name;
  }

  ticket(x: number, floorY: number): void {
    this.ticketAt(new Vec2(x, floorY - TICKET_UP));
  }

  ticketAt(at: Vec2): void {
    this.ticketCount += 1;
    this.nodes.push({ name: this.next('Ticket'), parent: 'Objects/Pickups', type: 'Area2D', scene: KEYS.TICKET, props: encProps({ position: at.round() }) });
  }

  row(x0: number, floorY: number, count: number, step: number): void {
    for (let i = 0; i < count; i++) this.ticket(x0 + i * step, floorY);
  }

  /** `count` tickets in an arc `width` px wide and `height` px high, centred on cx. */
  arc(cx: number, floorY: number, count: number, width: number, height: number): void {
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(count - 1, 1);
      this.ticket(cx - width / 2 + t * width, floorY - Math.sin(t * Math.PI) * height);
    }
  }

  /** A jump-through or solid slab (decks, ledges) from x0 to x1 with its top at `top`. */
  slab(x0: number, x1: number, top: number, thickness = 12, topOnly = true): void {
    this.addBlock(x0, x1, top, top + thickness, topOnly);
  }

  /** A solid block (walls, columns, terraces); `floor` false keeps it out of the length measure. */
  solid(x0: number, x1: number, top: number, bottom: number, floor = true): void {
    this.addBlock(x0, x1, top, bottom, false, floor);
  }

  /** A route step added by hand (custom sections). */
  step(kind: RouteKind, from: Vec2, to: Vec2, note?: string): void {
    if (this.quiet) return;
    this.route.push(note === undefined ? { kind, from, to } : { kind, from, to, note });
  }

  mark(atX: number, what: string, floorY = this.ground): void {
    this.safeMarks.push([atX, what, floorY]);
  }

  /** A rectangle marker the lint reads by name ("ReverseRun", "Leftward..."). */
  marker(name: string, x: number, y: number, w: number, h: number): void {
    this.nodes.push({ name, parent: '.', type: 'ReferenceRect', props: { offset_left: x, offset_top: y, offset_right: x + w, offset_bottom: y + h } });
  }

  // --- Finish -------------------------------------------------------------------

  /** The level's node list (adds the terrain and the Bounds). */
  build(): LevelData {
    const nodes = [...this.nodes];
    const insertAt = nodes.findIndex((n) => n.name === 'Objects' && n.parent === '.');
    const terrain = this.terrainNodes();
    nodes.splice(insertAt, 0, ...terrain);
    const top = Math.min(this.opts.top, this.minGround - 480);
    nodes.push({ name: 'Bounds', parent: '.', type: 'ReferenceRect', props: { offset_left: 0, offset_top: top, offset_right: this.x, offset_bottom: this.opts.bottom } });
    return { source: `builder:${this.opts.name}`, nodes };
  }

  stats(): BuilderStats {
    const startX = this.startX;
    const goalX = Number.isNaN(this.goalX) ? this.x : this.goalX;
    const covered = mergeSpans(this.floors);
    const walk = covered.reduce((s, [a, b]) => s + (b - a), 0);
    const screens = walk / SCREEN;
    let routePx = 0;
    for (const s of this.route) routePx += Math.abs(s.to.x - s.from.x);
    const tiers: Record<number, number> = {};
    for (const e of this.enemyList) tiers[ENEMY_TIER[e.kind]] = (tiers[ENEMY_TIER[e.kind]] ?? 0) + 1;
    const tierPct: Record<number, number> = {};
    for (const [t, n] of Object.entries(tiers)) tierPct[Number(t)] = (100 * n) / Math.max(this.enemyList.length, 1);
    const progress = (x: number): number => Math.min(Math.max((x - startX) / Math.max(goalX - startX, 1), 0), 1);
    const section = (p: number): 'opening' | 'middle' | 'finale' => (p < 0.25 ? 'opening' : p <= 0.75 ? 'middle' : 'finale');
    const sec = (): SectionStats => ({ screens: 0, enemies: 0, tiers: {}, tierMax: 0, density: 0 });
    const sections = { opening: sec(), middle: sec(), finale: sec() };
    for (const [a, b] of covered) {
      for (let x = a; x < b; x += 4) sections[section(progress(x))].screens += 4 / SCREEN;
    }
    for (const e of this.enemyList) {
      const s = sections[section(progress(e.at.x))];
      const t = ENEMY_TIER[e.kind];
      s.enemies += 1;
      s.tiers[t] = (s.tiers[t] ?? 0) + 1;
      s.tierMax = Math.max(s.tierMax, t);
    }
    for (const s of Object.values(sections)) s.density = s.enemies / Math.max(s.screens, 0.01);
    return {
      screens,
      routeScreens: routePx / SCREEN,
      enemies: this.enemyList.length,
      tiers,
      tierPct,
      tickets: this.ticketCount,
      checkpoints: this.checkpointXs.length,
      checkpointXs: [...this.checkpointXs],
      ticketDensity: this.ticketCount / Math.max(screens, 0.01),
      enemyDensity: this.enemyList.length / Math.max(screens, 0.01),
      sections,
      leftwardScreens: this.leftwardPx / SCREEN,
      startX,
      goalX,
    };
  }

  /** Progress (0..1) of x along the act, as LevelRoot.progressAt measures it. */
  progressAt(x: number): number {
    const goalX = Number.isNaN(this.goalX) ? this.x : this.goalX;
    return Math.min(Math.max((x - this.startX) / Math.max(goalX - this.startX, 1), 0), 1);
  }

  // --- Internals ----------------------------------------------------------------

  private colors(): Record<string, unknown> {
    const c: Record<string, unknown> = { fill_color: this.opts.fill, edge_color: this.opts.edge };
    if (this.opts.accent) c.accent_color = this.opts.accent;
    return c;
  }

  private addBlock(x0: number, x1: number, top: number, bottom = this.opts.fillBottom, topOnly = false, floor = true): void {
    if (x1 <= x0 || bottom <= top) return;
    this.blocks.push({ x0, x1, top, bottom, topOnly });
    if (floor) this.floors.push({ x0, x1 });
    this.minGround = Math.min(this.minGround, top);
  }

  private addSlope(x0: number, y0: number, x1: number, y1: number): void {
    const lowest = Math.max(y0, y1);
    this.nodes.push(this.terrainNode(this.next('Slope'), {
      position: new Vec2(x0, y0),
      shape: SHAPE.CURVE,
      depth: this.opts.fillBottom - lowest,
      ...this.colors(),
    }, [new Vec2(0, 0), new Vec2(x1 - x0, y1 - y0)]));
    this.floors.push({ x0, x1 });
    this.minGround = Math.min(this.minGround, y0, y1);
  }

  private terrainNode(name: string, props: Record<string, unknown>, curve?: Vec2[]): LevelNodeData {
    const raw = encProps(props);
    if (curve) {
      const flat: number[] = [];
      for (const p of curve) flat.push(0, 0, 0, 0, p.x, p.y);
      raw.curve = { sub: 'Curve2D', props: { _data: { points: { v2s: flat } } } };
    }
    const key = this.opts.terrainKey;
    return key === KEYS.CURVE_TERRAIN ? { name, parent: 'Terrain', type: null, script: key, props: raw } : { name, parent: 'Terrain', type: null, scene: key, props: raw };
  }

  /** Merged blocks as BLOCK pieces (touching blocks with the same top, bottom and kind become one). */
  private terrainNodes(): LevelNodeData[] {
    const sorted = [...this.blocks].sort((a, b) => a.top - b.top || a.bottom - b.bottom || Number(a.topOnly) - Number(b.topOnly) || a.x0 - b.x0);
    const merged: Block[] = [];
    for (const b of sorted) {
      const last = merged[merged.length - 1];
      if (last && last.top === b.top && last.bottom === b.bottom && last.topOnly === b.topOnly && b.x0 <= last.x1) last.x1 = Math.max(last.x1, b.x1);
      else merged.push({ ...b });
    }
    merged.sort((a, b) => a.x0 - b.x0 || a.top - b.top);
    // Pieces already emitted (slopes, pipes) stay in this.nodes; blocks go first.
    return merged.map((b) =>
      this.terrainNode(this.next(b.topOnly ? 'Deck' : 'Block'), {
        position: new Vec2(b.x0, b.top),
        shape: SHAPE.BLOCK,
        size: new Vec2(b.x1 - b.x0, b.bottom - b.top),
        top_only: b.topOnly,
        ...this.colors(),
      }),
    );
  }

  /** A void zone under a pit whose lips are high above the level's bottom. */
  private voidUnder(x0: number, width: number): void {
    if (this.opts.bottom - this.ground > 240) this.setPiece(KEYS.VOID_ZONE, new Vec2(x0 - 8, this.ground + 160), { size: new Vec2(width + 16, 64) });
  }

  /** A walk step from `from` to `to` (merged into the last one when it continues it on the same flat). */
  private walk(from: Vec2, to: Vec2): void {
    if (this.quiet || from.equals(to)) return;
    const last = this.route[this.route.length - 1];
    if (last && last.kind === 'walk' && last.to.equals(from) && last.from.y === last.to.y && from.y === to.y && Math.sign(to.x - from.x) === Math.sign(last.to.x - last.from.x)) {
      last.to = to;
    } else {
      this.route.push({ kind: 'walk', from, to });
    }
  }

  private pushRoute(step: RouteStep): void {
    if (!this.quiet) this.route.push(step);
  }

  private checkJump(x0: number, gap: number, rise: number): void {
    if (gap > MAX_JUMP_GAP || rise > MAX_JUMP_RISE) this.warnings.push(`jump at x ${x0}: ${gap} px wide, ${rise} px up (running jump: ${MAX_JUMP_GAP} x ${MAX_JUMP_RISE})`);
  }

  private checkClimbAfterCheckpoint(x0: number, steep: boolean): void {
    const last = this.checkpointXs[this.checkpointXs.length - 1];
    if (last !== undefined && x0 - last >= 0 && x0 - last < 160) this.warnings.push(`${steep ? 'steep' : 'gentle'} up-slope at x ${x0} only ${x0 - last} px after a checkpoint`);
  }

  private next(base: string): string {
    const n = (this.counts.get(base) ?? 0) + 1;
    this.counts.set(base, n);
    return `${base}${n}`;
  }
}

function mergeSpans(spans: FloorSpan[]): [number, number][] {
  const sorted = spans.map((s) => [s.x0, s.x1] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
