// A full loop that works out of the box. Place the origin on the floor line
// at the loop's bottom centre and set `radius`. The ring is split by path, as
// in the classic games: lower-right quarter path A, lower-left quarter path
// B, upper half solid on both. Path switchers at the entry, the exit and the
// top swap paths for a lap either way; the guard keeps a turn-back from
// trapping him. Outside each side a hill foot curves from the equator down to
// the floor, so running off the top takes him down the outside.

import { Node2D } from '../runtime/node';
import { Vec2 } from '../runtime/vec2';
import type { Configurable, Props } from '../levels/common/props';
import { CurveShape, CurveTerrain, PathLayer } from './curve_terrain';
import { LoopGuard } from './loop_guard';
import { PathSwitcher, SwitchPath } from './path_switcher';

const MIN_RADIUS = 48.0;
const TOP_SWITCHER_REACH = 40.0;

export class TerrainLoop extends Node2D implements Configurable {
  radius = 112;
  thickness = 16;
  footRadius = 48;
  floorMargin = 112;
  floorDepth = 64;
  readonly floor = new CurveTerrain('Floor');
  readonly lowerRight = new CurveTerrain('LowerRight');
  readonly upper = new CurveTerrain('Upper');
  readonly lowerLeft = new CurveTerrain('LowerLeft');
  readonly rightFoot = new CurveTerrain('RightFoot');
  readonly leftFoot = new CurveTerrain('LeftFoot');
  readonly entry = new PathSwitcher('EntrySwitcher');
  readonly top = new PathSwitcher('TopSwitcher');
  readonly exit = new PathSwitcher('ExitSwitcher');
  readonly guard = new LoopGuard('Guard');

  constructor(name = 'Loop') {
    super(name);
    for (const n of [this.floor, this.lowerRight, this.upper, this.lowerLeft, this.rightFoot, this.leftFoot, this.entry, this.top, this.exit, this.guard]) {
      this.addChild(n);
    }
    this.layout();
  }

  applyProps(p: Props): void {
    this.radius = Math.max(p.num('radius', this.radius), MIN_RADIUS);
    this.thickness = Math.max(p.num('thickness', this.thickness), 4);
    this.footRadius = Math.max(p.num('foot_radius', this.footRadius), 8);
    this.floorMargin = Math.max(p.num('floor_margin', this.floorMargin), 24);
    this.floorDepth = Math.max(p.num('floor_depth', this.floorDepth), 8);
    this.layout();
  }

  layout(): void {
    const outer = this.radius + this.thickness;
    const foot = Math.min(this.footRadius, this.radius);
    const margin = Math.max(this.floorMargin, foot + 64);
    const halfWidth = outer + margin;
    const arcs: [CurveTerrain, number, number, PathLayer][] = [
      [this.lowerRight, 0, 90, PathLayer.A],
      [this.upper, 90, 270, PathLayer.BOTH],
      [this.lowerLeft, 270, 360, PathLayer.B],
    ];
    for (const [piece, a0, a1, path] of arcs) {
      piece.shape = CurveShape.LOOP;
      piece.radius = this.radius;
      piece.thickness = this.thickness;
      piece.arcStart = a0;
      piece.arcEnd = a1;
      piece.pathLayer = path;
    }
    for (const side of [1, -1]) {
      const piece = side > 0 ? this.rightFoot : this.leftFoot;
      piece.shape = CurveShape.QUARTER_PIPE;
      piece.pathLayer = side > 0 ? PathLayer.A : PathLayer.B;
      piece.risesToRight = side < 0;
      piece.radius = foot;
      piece.wallHeight = this.radius - foot;
      piece.thickness = this.thickness;
      piece.depth = this.floorDepth;
      piece.position = new Vec2((outer + foot) * side, 0);
    }
    this.floor.shape = CurveShape.BLOCK;
    this.floor.pathLayer = PathLayer.BOTH;
    this.floor.position = new Vec2(-halfWidth, 0);
    this.floor.size = new Vec2(halfWidth * 2, this.floorDepth);
    const sideSize = new Vec2(16, outer * 2);
    this.entry.position = new Vec2(-(halfWidth - 24), -outer);
    this.entry.setSize(sideSize);
    this.entry.pathMovingRight = SwitchPath.A;
    this.entry.pathMovingLeft = SwitchPath.A;
    this.exit.position = new Vec2(halfWidth - 24, -outer);
    this.exit.setSize(sideSize);
    this.exit.pathMovingRight = SwitchPath.A;
    this.exit.pathMovingLeft = SwitchPath.B;
    const spanTop = -this.radius * 2 - 4;
    const spanBottom = -this.radius * 2 + TOP_SWITCHER_REACH;
    this.top.position = new Vec2(0, (spanTop + spanBottom) / 2);
    this.top.setSize(new Vec2(16, spanBottom - spanTop));
    this.top.pathMovingRight = SwitchPath.A;
    this.top.pathMovingLeft = SwitchPath.B;
    this.top.groundedOnly = true;
    this.guard.configure(this.radius, outer, foot);
    if (this.isInsideTree()) {
      for (const piece of [this.floor, this.lowerRight, this.upper, this.lowerLeft, this.rightFoot, this.leftFoot]) piece.rebuild();
    }
  }

  setArtZone(zone: string): void {
    for (const piece of [this.floor, this.lowerRight, this.upper, this.lowerLeft, this.rightFoot, this.leftFoot]) piece.setArtZone(zone);
  }
}
