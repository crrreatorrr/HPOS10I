// The QA physics helpers (tests/qa/qa_physics_lib.gd): a bigger default floor
// and slope than tests/helpers/world.ts, loops of any radius and curve pieces
// from a property bag.

import { Layers } from '../../src/core/layers';
import type { Player } from '../../src/player/player';
import { degToRad } from '../../src/runtime/math';
import type { Node2D } from '../../src/runtime/node';
import type { StaticBody2D } from '../../src/runtime/physics';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { Props, type RawProps } from '../../src/levels/common/props';
import { CurveTerrain } from '../../src/terrain/curve_terrain';
import type { TerrainLoop } from '../../src/terrain/loop';
import { addLoop, addPolygon, newWorld, settle, spawnPlayer } from './world';

export const SOLID = Layers.TERRAIN_SOLID;
export const PATH_A = Layers.TERRAIN_PATH_A;
export const PATH_B = Layers.TERRAIN_PATH_B;
export const TOP_ONLY = Layers.TERRAIN_TOP_ONLY;

export const qa = {
  world(): Node2D {
    return newWorld();
  },

  poly(w: Node2D, points: Vec2[], layer: number = SOLID): StaticBody2D {
    return addPolygon(w, points, layer);
  },

  rect(w: Node2D, r: Rect2, layer: number = SOLID): StaticBody2D {
    return addPolygon(w, [r.position, new Vec2(r.right, r.y), r.end, new Vec2(r.x, r.bottom)], layer);
  },

  floorAt(w: Node2D, fromX = -6000, toX = 6000, y = 0): StaticBody2D {
    return qa.rect(w, new Rect2(fromX, y, toX - fromX, 300));
  },

  /** Straight slope through (0, 0); positive angle rises to the right. */
  slope(w: Node2D, angleDeg: number, halfLength = 800): StaticBody2D {
    const d = new Vec2(Math.cos(degToRad(angleDeg)), -Math.sin(degToRad(angleDeg))).mul(halfLength);
    const bottom = Math.abs(d.y) + 300;
    return addPolygon(w, [d.neg(), d, new Vec2(d.x, bottom), new Vec2(-d.x, bottom)]);
  },

  loop(w: Node2D, at: Vec2, radius = 112): TerrainLoop {
    const l = addLoop(w, at);
    l.radius = radius;
    l.layout();
    return l;
  },

  /** A curve piece from the original exported properties (snake_case), as the level loader sets them. */
  curveTerrain(w: Node2D, at: Vec2, props: RawProps): CurveTerrain {
    const body = new CurveTerrain();
    body.applyProps(new Props(props));
    body.position = at;
    w.addChild(body);
    return body;
  },

  spawn(w: Node2D, feet: Vec2): Player {
    const p = spawnPlayer(w, feet);
    settle(p, feet);
    return p;
  },
};
