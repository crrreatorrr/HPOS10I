// Boss arenas, built in code around a LevelRoot (docs/CONTRACTS.md "Levels"
// and "Bosses"). Every arena has the same frame:
//
//   PlayerStart -- calm corridor (tickets) -- checkpoint -- entry gate |
//   | arena: one screen (424 px) between two walls, flat floor | exit gate -- exit
//
// - The corridor is short and calm: a few tickets and a checkpoint right
//   outside the gate, so a failed attempt restarts the boss, not the act.
// - When Sproto is 40 px inside, the entry gate shuts, the camera locks to
//   the arena (GameCamera.lockTo) and the boss starts (Boss.engage()).
// - Ticket refills drop on the side away from the boss after the hits the
//   design names (Difficulty.boss().ticket_refills: 3 = hits 2, 4, 6;
//   2 = hits 4, 6; 1 = hit 4 only).
// - After the defeat explosions the exit gate opens and the level completes
//   (LevelRoot.completeLevel(): tally, then the next stage).
// - Music 'boss' (LevelRoot.music).
// Terrain is CurveTerrain BLOCK pieces in the zone's art (placeholder colours
// until the zone's terrain art exists).

import { Layers } from '../core/layers';
import { GameCamera } from '../camera/game_camera';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { moveToward } from '../runtime/math';
import { Node2D } from '../runtime/node';
import { rectShape, StaticBody2D } from '../runtime/physics';
import { Rect2, Vec2 } from '../runtime/vec2';
import { CurveShape, CurveTerrain } from '../terrain/curve_terrain';
import { LevelFx } from '../levels/common/level_fx';
import { BoundsRect, DecorRect, Marker } from '../levels/common/level_nodes';
import { LevelRoot } from '../levels/common/level_root';
import { Checkpoint } from '../levels/objects/checkpoint';
import { LevelTicket } from '../levels/objects/ticket';
import type { ArenaHost, ArenaInfo, Boss } from './boss_base';
import { OUTLINE } from './boss_fx';

/** Fixed arena geometry (world space; the floor's top is y = 0). */
export const ArenaLayout = {
  FLOOR_Y: 0,
  VIEW_TOP: -192,
  VIEW_H: 240,
  DEPTH: 64,
  START_X: 64,
  CHECKPOINT_X: 432,
  /** Left face of the entry wall; the arena (camera lock) starts here. */
  GATE_X: 480,
  WALL: 16,
  WIDTH: 424,
  DOOR_H: 80,
  EXIT_LENGTH: 224,
  /** How far inside the inner wall Sproto must be before the gate shuts. */
  ENTER_DEPTH: 40,
  CORRIDOR_TICKETS: [176, 200, 224, 248, 272],
  REFILL_TICKETS: 5,
} as const;

const L = ArenaLayout;
const WALL_TOP = -480;

/** Ticket refills: the hits after which tickets drop, by refill count. */
export function refillHits(count: number): number[] {
  if (count >= 3) return [2, 4, 6];
  if (count === 2) return [4, 6];
  if (count === 1) return [4];
  return [];
}

export interface ArenaSpec {
  /** Root node name. */
  name: string;
  zoneId: string;
  makeBoss: () => Boss;
  /** Placeholder terrain colours. */
  fill: Color;
  edge: Color;
  /** The arena's back wall (behind everything). */
  back: Color;
  /** Gate bars. */
  gate: Color;
}

/** A barred gate filling a doorway; closed = solid. Origin: top-left. */
export class ArenaGate extends Node2D {
  closed = false;
  private amount = 0;
  private body: StaticBody2D | null = null;

  constructor(
    name: string,
    readonly size: Vec2,
    readonly color: Color,
  ) {
    super(name);
    this.zIndex = 2;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const body = new StaticBody2D('GateBody');
    body.collisionLayer = Layers.TERRAIN_SOLID;
    body.addShape(rectShape(this.size, this.size.div(2)));
    this.body = body;
    this.addChild(body);
  }

  open(): void {
    if (!this.closed) return;
    this.closed = false;
    this.body?.queueFree();
    this.body = null;
  }

  override physicsProcess(): void {
    this.amount = moveToward(this.amount, this.closed ? 1 : 0, 0.08);
  }

  cullRect(): Rect2 {
    return new Rect2(0, 0, this.size.x, this.size.y);
  }

  override draw(g: Gfx): void {
    if (this.amount <= 0) return;
    const h = this.size.y * this.amount;
    g.rect(0, 0, this.size.x, h, OUTLINE);
    for (let x = 2; x < this.size.x - 1; x += 5) g.rect(x, 0, 3, h - 2, this.color);
    for (let y = 10; y < h - 4; y += 22) g.rect(1, y, this.size.x - 2, 3, this.color.darkened(0.3));
    g.rect(0, h - 4, this.size.x, 4, this.color.darkened(0.45));
  }
}

/** Runs the arena: entry, camera lock, refills and the exit. */
export class ArenaController extends Node2D implements ArenaHost {
  engaged = false;
  private root: LevelRoot | null = null;
  private completeIn = -1;
  private readonly refills: number[];

  constructor(
    readonly spec: ArenaSpec,
    readonly info: ArenaInfo,
    readonly boss: Boss,
    readonly terrain: Node2D,
    readonly floor: CurveTerrain,
    readonly objects: Node2D,
    readonly entryGate: ArenaGate,
    readonly exitGate: ArenaGate,
  ) {
    super('Arena');
    this.refills = refillHits(boss.tuning.ticket_refills);
  }

  static find(root: LevelRoot): ArenaController | null {
    return root.findChildOfType(ArenaController);
  }

  artZone(): string {
    return this.root ? this.root.currentArtZoneId() : this.spec.zoneId;
  }

  override ready(): void {
    this.root = LevelRoot.find(this);
    this.boss.hitTaken.connect(() => this.onHit(), { owner: this });
    this.boss.exploded.connect(() => this.onExploded(), { owner: this });
  }

  override physicsProcess(): void {
    const player = this.root?.player ?? null;
    if (!this.engaged && player && player.state !== 'dead' && player.globalPosition.x > this.info.left + L.ENTER_DEPTH) this.engage();
    if (this.completeIn > 0) {
      this.completeIn -= 1;
      if (this.completeIn === 0) this.root?.completeLevel();
    }
  }

  engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.entryGate.close();
    GameCamera.current()?.lockTo(this.info.view, 0.6);
    this.boss.engage();
  }

  private onHit(): void {
    if (this.refills.includes(this.boss.hitsTaken)) this.dropRefill();
  }

  /** A small arc of tickets just above the floor on the side away from the boss. */
  dropRefill(): LevelTicket[] {
    const side = this.boss.position.x > (this.info.left + this.info.right) / 2 ? -1 : 1;
    const out: LevelTicket[] = [];
    for (let i = 0; i < L.REFILL_TICKETS; i++) {
      const x = side < 0 ? this.info.left + 10 + i * 10 : this.info.right - 10 - i * 10;
      const y = this.info.floorY - 22 - Math.sin((i / (L.REFILL_TICKETS - 1)) * Math.PI) * 12;
      const t = new LevelTicket(`Refill${i}`);
      t.position = new Vec2(x, y);
      this.objects.addChild(t);
      LevelFx.ticketSparkle(this.objects, t.position);
      out.push(t);
    }
    return out;
  }

  private onExploded(): void {
    this.exitGate.open();
    this.entryGate.open();
    this.completeIn = 45;
  }
}

function block(name: string, x: number, y: number, w: number, h: number, spec: ArenaSpec): CurveTerrain {
  const t = new CurveTerrain(name);
  t.shape = CurveShape.BLOCK;
  t.position = new Vec2(x, y);
  t.size = new Vec2(w, h);
  t.fillColor = spec.fill;
  t.edgeColor = spec.edge;
  return t;
}

/** Builds the arena level around the spec's boss. */
export function buildArena(spec: ArenaSpec): LevelRoot {
  const root = new LevelRoot(spec.name);
  root.zoneId = spec.zoneId;
  root.music = 'boss';
  const floorY = L.FLOOR_Y;
  const inLeft = L.GATE_X + L.WALL;
  const inRight = L.GATE_X + L.WIDTH - L.WALL;
  const exitEnd = L.GATE_X + L.WIDTH + L.EXIT_LENGTH;
  const bottom = L.VIEW_TOP + L.VIEW_H;

  const bounds = new BoundsRect('Bounds');
  bounds.rect = new Rect2(-L.WALL, L.VIEW_TOP, exitEnd + 2 * L.WALL, L.VIEW_H);
  root.addChild(bounds);
  const start = new Marker('PlayerStart');
  start.position = new Vec2(L.START_X, floorY - 19);
  root.addChild(start);

  const back = new DecorRect('ArenaBack');
  back.rect = new Rect2(inLeft, L.VIEW_TOP, inRight - inLeft, floorY - L.VIEW_TOP);
  back.color = spec.back;
  back.zIndex = -10;
  root.addChild(back);

  const terrain = root.addChild(new Node2D('Terrain'));
  terrain.addChild(block('StartWall', -L.WALL, WALL_TOP, L.WALL, floorY - WALL_TOP + L.DEPTH, spec));
  terrain.addChild(block('CorridorFloor', 0, floorY, inLeft, L.DEPTH, spec));
  const floor = terrain.addChild(block('ArenaFloor', inLeft, floorY, inRight - inLeft, L.DEPTH, spec));
  terrain.addChild(block('ExitFloor', inRight, floorY, exitEnd - inRight, L.DEPTH, spec));
  terrain.addChild(block('EndWall', exitEnd, WALL_TOP, L.WALL, floorY - WALL_TOP + L.DEPTH, spec));
  terrain.addChild(block('EntryWall', L.GATE_X, WALL_TOP, L.WALL, floorY - L.DOOR_H - WALL_TOP, spec));
  terrain.addChild(block('ExitWall', inRight, WALL_TOP, L.WALL, floorY - L.DOOR_H - WALL_TOP, spec));

  const objects = root.addChild(new Node2D('Objects'));
  L.CORRIDOR_TICKETS.forEach((x, i) => {
    const t = new LevelTicket(`Ticket${i + 1}`);
    t.position = new Vec2(x, floorY - 24);
    objects.addChild(t);
  });
  const checkpoint = new Checkpoint('Checkpoint');
  checkpoint.position = new Vec2(L.CHECKPOINT_X, floorY - Checkpoint.FEET);
  objects.addChild(checkpoint);
  const entryGate = new ArenaGate('EntryGate', new Vec2(L.WALL, L.DOOR_H), spec.gate);
  entryGate.position = new Vec2(L.GATE_X, floorY - L.DOOR_H);
  objects.addChild(entryGate);
  const exitGate = new ArenaGate('ExitGate', new Vec2(L.WALL, L.DOOR_H), spec.gate);
  exitGate.position = new Vec2(inRight, floorY - L.DOOR_H);
  objects.addChild(exitGate);
  exitGate.close();

  const info: ArenaInfo = {
    view: new Rect2(L.GATE_X, L.VIEW_TOP, L.WIDTH, Math.min(L.VIEW_H, bottom - L.VIEW_TOP)),
    left: inLeft,
    right: inRight,
    floorY,
    host: null,
  };
  const boss = spec.makeBoss();
  const controller = new ArenaController(spec, info, boss, terrain, floor, objects, entryGate, exitGate);
  info.host = controller;
  boss.setArena(info);
  root.addChild(controller);
  root.addChild(boss);
  return root;
}
