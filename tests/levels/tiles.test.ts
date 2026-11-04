// Terrain tiles through TileLayer (port of tests/levels/test_tiles.gd): the
// tile catalogue's collision shapes in the zone tileset, exact slope seams
// once neighbouring tiles' edges are merged (no 1 px steps), runs across the
// seams at several speeds that never leave the ground, and top-only planks.

import { beforeAll, describe, expect, it } from 'vitest';
import { Tuning } from '../../src/core/tuning';
import { loadTileset, TileLayer, type TilesetData } from '../../src/levels/common/level_nodes';
import type { Player } from '../../src/player/player';
import { angleFromNormal } from '../../src/player/sensors';
import type { Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Vec2 } from '../../src/runtime/vec2';
import { addFloor, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

const TILE = 16;
const PHASES = 8;
const LIP_LEVELS = 3;
const BLOCK_COLUMNS = 6;
const PLANK_THICKNESS = 6;

// --- The tile catalogue (levels/common/tiles/terrain_tiles.gd) ------------------------

enum Kind {
  FLOOR,
  FILL,
  CEILING,
  TOP_ONLY,
}

/** name: [kind, surface left y, surface right y] (tile-local, -8 top .. 8 bottom). */
const TILES: [string, Kind, number, number][] = [
  ['full', Kind.FLOOR, -8, -8],
  ['half', Kind.FLOOR, 0, 0],
  ['up_gentle_low', Kind.FLOOR, 8, 0],
  ['up_gentle_high', Kind.FLOOR, 0, -8],
  ['down_gentle_high', Kind.FLOOR, -8, 0],
  ['down_gentle_low', Kind.FLOOR, 0, 8],
  ['up_steep', Kind.FLOOR, 8, -8],
  ['down_steep', Kind.FLOOR, -8, 8],
  ['fill', Kind.FILL, -8, -8],
  ['ceil_half', Kind.CEILING, 0, 0],
  ['ceil_gentle_low_a', Kind.CEILING, -8, 0],
  ['ceil_gentle_high_a', Kind.CEILING, 0, 8],
  ['ceil_gentle_high_b', Kind.CEILING, 8, 0],
  ['ceil_gentle_low_b', Kind.CEILING, 0, -8],
  ['ceil_steep_a', Kind.CEILING, -8, 8],
  ['ceil_steep_b', Kind.CEILING, 8, -8],
  ['plank_left', Kind.TOP_ONLY, -8, -8],
  ['plank', Kind.TOP_ONLY, -8, -8],
  ['plank_right', Kind.TOP_ONLY, -8, -8],
];

const info = (name: string): [string, Kind, number, number] => TILES.find((t) => t[0] === name)!;

function blocks(): [string, number][] {
  const out: [string, number][] = [];
  for (const [name, kind] of TILES) {
    const levels = kind === Kind.FLOOR ? LIP_LEVELS : 1;
    for (let l = 0; l < levels; l++) out.push([name, l]);
  }
  return out;
}

function blockOf(name: string, lip = 0): number {
  const all = blocks();
  let fallback = -1;
  for (let i = 0; i < all.length; i++) {
    if (all[i]![0] !== name) continue;
    if (all[i]![1] === lip) return i;
    if (all[i]![1] === 0) fallback = i;
  }
  return fallback;
}

const posmod = (a: number, b: number): number => ((a % b) + b) % b;

function coords(name: string, cell: [number, number], lip = 0): [number, number] {
  const i = blockOf(name, lip);
  return [(i % BLOCK_COLUMNS) * PHASES + posmod(cell[0], PHASES), Math.trunc(i / BLOCK_COLUMNS) * PHASES + posmod(cell[1], PHASES)];
}

function polygon(name: string, lip = 0): number[][] {
  const [, kind, l, r] = info(name);
  const left = lip > 0 ? -8 : l;
  const right = lip > 0 ? -8 : r;
  let pts: number[][];
  switch (kind) {
    case Kind.CEILING:
      pts = [
        [-8, -8],
        [8, -8],
        [8, right],
        [-8, left],
      ];
      break;
    case Kind.TOP_ONLY:
      return [
        [-8, -8],
        [8, -8],
        [8, -8 + PLANK_THICKNESS],
        [-8, -8 + PLANK_THICKNESS],
      ];
    default:
      pts = [
        [-8, left],
        [8, right],
        [8, 8],
        [-8, 8],
      ];
  }
  const out: number[][] = [];
  for (const p of pts) if (out.length === 0 || out[out.length - 1]![0] !== p[0] || out[out.length - 1]![1] !== p[1]) out.push(p);
  if (out.length > 1 && out[0]![0] === out[out.length - 1]![0] && out[0]![1] === out[out.length - 1]![1]) out.pop();
  return out;
}

// --- A painter (levels/common/tile_painter.gd) ----------------------------------------

class Painter {
  readonly cells: [number, number, number, number][] = [];

  constructor(
    private x = 0,
    private level = 0,
    private readonly bottom = 80,
  ) {}

  paint(cell: [number, number], name: string, lip = 0): void {
    const [ax, ay] = coords(name, cell, lip);
    this.cells.push([cell[0], cell[1], ax, ay]);
  }

  private column(cx: number, row: number, name: string): void {
    this.paint([cx, row], name, 0);
    const lastRow = Math.ceil(this.bottom / TILE) - 1;
    for (let cy = row + 1; cy <= lastRow; cy++) {
      const depth = cy - row;
      this.paint([cx, cy], depth < LIP_LEVELS ? name : 'fill', depth < LIP_LEVELS ? depth : 0);
    }
  }

  private cellX(): number {
    return Math.floor(this.x / TILE);
  }

  flat(width: number): this {
    for (let i = 0; i < width / TILE; i++) {
      const name = posmod(this.level, TILE) === 0 ? 'full' : 'half';
      const row = name === 'full' ? Math.floor(this.level / TILE) : Math.floor((this.level - 8) / TILE);
      this.column(this.cellX(), row, name);
      this.x += TILE;
    }
    return this;
  }

  gentleUp(rise: number): this {
    for (let i = 0; i < rise / 8; i++) {
      const top = this.level - 8;
      const row = Math.floor(top / TILE);
      const left = this.level - (row * TILE + 8);
      this.column(this.cellX(), row, left === 8 ? 'up_gentle_low' : 'up_gentle_high');
      this.level = top;
      this.x += TILE;
    }
    return this;
  }

  gentleDown(drop: number): this {
    for (let i = 0; i < drop / 8; i++) {
      const row = Math.floor(this.level / TILE);
      const left = this.level - (row * TILE + 8);
      this.column(this.cellX(), row, left === -8 ? 'down_gentle_high' : 'down_gentle_low');
      this.level += 8;
      this.x += TILE;
    }
    return this;
  }

  steepUp(rise: number): this {
    for (let i = 0; i < rise / TILE; i++) {
      this.column(this.cellX(), this.level / TILE - 1, 'up_steep');
      this.level -= TILE;
      this.x += TILE;
    }
    return this;
  }

  steepDown(drop: number): this {
    for (let i = 0; i < drop / TILE; i++) {
      this.column(this.cellX(), this.level / TILE, 'down_steep');
      this.level += TILE;
      this.x += TILE;
    }
    return this;
  }

  planks(x0: number, x1: number, top: number): this {
    const row = Math.trunc(top / TILE);
    const first = Math.trunc(x0 / TILE);
    const last = Math.trunc(x1 / TILE) - 1;
    for (let cx = first; cx <= last; cx++) this.paint([cx, row], cx === first ? 'plank_left' : cx === last ? 'plank_right' : 'plank');
    return this;
  }
}

// --- Tests ---------------------------------------------------------------------------

const ZONE = 'z1_retro_rush_hills';
/** Ground angles the hill below can produce (Physics Guide degrees). */
const HILL_ANGLES = [0, 26.565, 45, 315, 333.435, 360];

let tileset: TilesetData;
let world: Node2D;

beforeAll(async () => {
  tileset = (await loadTileset(ZONE))!;
});

function layer(cells: [number, number, number, number][]): TileLayer {
  const tiles = new TileLayer();
  tiles.build(tileset, cells);
  world.addChild(tiles);
  return tiles;
}

/**
 * A hill from tiles: flat, gentle up 64, flat, steep up 64, flat, steep down
 * 64, flat, gentle down 64, flat. Returns the analytic surface height at x.
 */
function hill(): (x: number) => number {
  world = newWorld();
  const p = new Painter(-256, 0, 160);
  p.flat(256).gentleUp(64).flat(64).steepUp(64).flat(96).steepDown(64).flat(64).gentleDown(64).flat(512);
  layer(p.cells);
  step(3);
  return (x) => {
    if (x < 0) return 0;
    if (x < 128) return -x / 2;
    if (x < 192) return -64;
    if (x < 256) return -64 - (x - 192);
    if (x < 352) return -128;
    if (x < 416) return -128 + (x - 352);
    if (x < 480) return -64;
    if (x < 608) return -64 + (x - 480) / 2;
    return 0;
  };
}

describe('terrain tiles', () => {
  it('the tileset has every tile of the catalogue with its shape and layer (planks top-only)', () => {
    const problems: string[] = [];
    for (const [name, kind] of TILES) {
      const [ax, ay] = coords(name, [3, 5]);
      const cell = tileset.cells[`${ax},${ay}`];
      if (!cell) {
        problems.push(`${name}: no tile at ${ax},${ay}`);
        continue;
      }
      const polys = kind === Kind.TOP_ONLY ? cell.top : cell.solid;
      const other = kind === Kind.TOP_ONLY ? cell.solid : cell.top;
      if (!polys || polys.length !== 1) problems.push(`${name}: ${polys?.length ?? 0} polygons on its layer`);
      else {
        const flat = polygon(name).flat();
        if (JSON.stringify(polys[0]) !== JSON.stringify(flat)) problems.push(`${name}: shape ${JSON.stringify(polys[0])}, catalogue ${JSON.stringify(flat)}`);
      }
      if (other && other.length > 0) problems.push(`${name}: also on the other layer`);
    }
    expect(problems).toEqual([]);
  });

  it('slope seams have no steps: the ground follows the slopes exactly', () => {
    const surface = hill();
    let worst = 0;
    for (let x = -64; x < 700; x += 0.5) {
      const hit = tree.physics.intersectRay(new Vec2(x, -300), new Vec2(x, 100), 1);
      expect(hit, `ground at x ${x}`).not.toBeNull();
      worst = Math.max(worst, Math.abs(hit!.position.y - surface(x)));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it('slope angles are exact on every tile', () => {
    hill();
    for (let x = 1.25; x < 600; x += 4) {
      const hit = tree.physics.intersectRay(new Vec2(x, -300), new Vec2(x, 100), 1)!;
      const angle = angleFromNormal(hit.normal);
      expect(
        HILL_ANGLES.some((a) => Math.abs(angle - a) < 0.01),
        `surface angle ${angle.toFixed(3)} at x ${x} is one of the slope angles`,
      ).toBe(true);
    }
  });

  /** Straight stretches of the hill: [x0, x1, dy/dx]. */
  const STRETCHES: [number, number, number][] = [
    [-250, 0, 0],
    [0, 128, -0.5],
    [128, 192, 0],
    [192, 256, -1],
    [256, 352, 0],
    [352, 416, 1],
    [416, 480, 0],
    [480, 608, 0.5],
    [608, 1100, 0],
  ];
  const CORNER_MARGIN = 12;
  const stretchSlope = (x0: number, x1: number): number => {
    for (const [lo, hi, slope] of STRETCHES) if (Math.min(x0, x1) >= lo + CORNER_MARGIN && Math.max(x0, x1) <= hi - CORNER_MARGIN) return slope;
    return NaN;
  };

  for (const dir of [1, -1]) {
    for (const speed of [4, 6, 8, 10, 12]) {
      it(`a run ${dir > 0 ? 'right' : 'left'} at ${speed} px/f across the seams never leaves the ground or the slope`, () => {
        hill();
        const start = new Vec2(dir > 0 ? -150 : 750, 0);
        const player: Player = spawnPlayer(world, start);
        settle(player, start);
        player.groundSpeed = speed * dir;
        const action = dir > 0 ? 'move_right' : 'move_left';
        press(action);
        let last = player.globalPosition;
        const failures: string[] = [];
        for (let frame = 0; frame < 600 && failures.length === 0; frame++) {
          step(1);
          const at = player.globalPosition;
          const label = `x ${at.x.toFixed(1)}`;
          if (!player.grounded) failures.push(`left the ground: ${label}`);
          else if (!HILL_ANGLES.some((a) => Math.abs(player.groundAngle - a) < 0.5)) failures.push(`odd ground angle ${player.groundAngle.toFixed(2)}: ${label}`);
          else {
            const slope = stretchSlope(last.x, at.x);
            if (!Number.isNaN(slope) && Math.abs(at.y - last.y - slope * (at.x - last.x)) > 0.05) {
              failures.push(`off the slope by ${(at.y - last.y - slope * (at.x - last.x)).toFixed(3)} px: ${label}`);
            }
          }
          last = at;
          if ((dir > 0 && at.x > 700) || (dir < 0 && at.x < -100)) break;
        }
        release(action);
        expect(failures).toEqual([]);
        const x = player.globalPosition.x;
        expect(dir > 0 ? x > 700 : x < -100, `crossed the hill (x ${x.toFixed(0)})`).toBe(true);
      });
    }
  }

  it('jumps up through top-only planks and lands on top', () => {
    releaseAll();
    world = newWorld();
    addFloor(world);
    layer(new Painter().planks(-64, 64, -64).cells);
    const player = spawnPlayer(world, Vec2.ZERO);
    settle(player, Vec2.ZERO);
    press('jump');
    let landed = false;
    for (let i = 0; i < 90 && !landed; i++) {
      step(1);
      landed = player.grounded && Math.abs(player.globalPosition.y + 64 + Tuning.physics.height_radius) < 0.5;
    }
    release('jump');
    expect(landed).toBe(true);
  });
});
