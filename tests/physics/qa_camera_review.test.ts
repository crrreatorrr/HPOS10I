// QA camera review probes (port of tests/qa/test_camera_review.gd,
// qa/checklists/03-camera.md).

import { afterEach, describe, it } from 'vitest';
import { GameCamera } from '../../src/camera/game_camera';
import { GameState } from '../../src/core/game_state';
import type { Player } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { qa } from '../helpers/qa';
import { press, release, releaseAll, step } from '../helpers/world';

let w: Node2D;
let p: Player;
let cam: GameCamera;

afterEach(() => {
  tree.paused = false;
  releaseAll();
  GameState.tickets = 0;
});

function setup(feet = Vec2.ZERO, bounds = new Rect2(), floorFrom = -20000, floorTo = 20000): void {
  w = qa.world();
  qa.floorAt(w, floorFrom, floorTo);
  p = qa.spawn(w, feet);
  cam = new GameCamera();
  w.addChild(cam);
  if (bounds.hasArea()) cam.setLevelBounds(bounds);
  step(2);
}

const cx = () => cam.globalPosition.x;
const screenX = () => p.globalPosition.x - (cam.globalPosition.x - 212);
const rectNear = (a: Rect2, b: Rect2, eps = 1e-4) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.w - b.w) < eps && Math.abs(a.h - b.h) < eps;

describe('QA camera review', () => {
  it(
    'B1: deadzone',
    checked((c) => {
      setup();
      const x0 = cx();
      p.groundSpeed = 0.5;
      let movedAt = -1;
      for (let i = 0; i < 60; i++) {
        step(1);
        if (movedAt < 0 && Math.abs(cx() - x0) > 0.01) movedAt = i;
      }
      c.true(movedAt !== 0, 'no camera move on the first frames of a slow walk');
    }),
  );

  it(
    'B2: look-ahead by speed',
    checked((c) => {
      for (const speed of [6, 8, 12]) {
        setup();
        press('move_right');
        p.groundSpeed = speed;
        step(240);
        release('move_right');
        const ahead = cx() - p.globalPosition.x;
        const expected = 112 * Math.min(Math.max((speed - 2) / 7, 0), 1);
        c.near(cam.lookAhead, expected, 0.5, `look-ahead at ${speed}`);
        c.true(Math.abs(ahead - expected) <= 8.5, `camera centre within the deadzone of the look-ahead target at ${speed}`);
      }
    }),
  );

  it(
    'B3 turnaround and B5 on screen',
    checked((c) => {
      setup();
      p.groundSpeed = 16;
      press('move_right');
      let worstStep = 0;
      let worstEdge = Infinity;
      let last = cx();
      const track = () => {
        step(1);
        worstStep = Math.max(worstStep, Math.abs(cx() - last));
        last = cx();
        const sx = screenX();
        worstEdge = Math.min(worstEdge, sx - 9, 424 - 9 - sx);
      };
      for (let i = 0; i < 120; i++) track();
      release('move_right');
      press('move_left');
      for (let i = 0; i < 240; i++) track();
      release('move_left');
      c.true(worstStep <= 21.01, `camera never moves more than 20 px/frame plus 1 px of rounding (${worstStep})`);
      c.true(worstEdge > 0, `Sproto stays fully on screen (${worstEdge})`);
    }),
  );

  it(
    'B4: wall flip, no oscillation',
    checked((c) => {
      setup();
      qa.rect(w, new Rect2(60, -200, 40, 200));
      press('move_right');
      step(60);
      const xs: number[] = [];
      for (let i = 0; i < 60; i++) {
        if (i % 2 === 0) {
          release('move_left');
          press('move_right');
        } else {
          release('move_right');
          press('move_left');
        }
        step(1);
        xs.push(cx());
      }
      releaseAll();
      const spread = Math.max(...xs) - Math.min(...xs);
      c.true(spread <= 1, `camera does not oscillate (${spread})`);
    }),
  );

  it(
    'C: vertical',
    checked((c) => {
      // Jump on flat ground: the camera moves less than the jump height.
      setup();
      const y0 = cam.globalPosition.y;
      let top = y0;
      press('jump');
      for (let i = 0; i < 70; i++) {
        step(1);
        top = Math.min(top, cam.globalPosition.y);
      }
      release('jump');
      c.true(y0 - top < 96, 'lag on jumps');
      // Spring at -16: stays on screen.
      setup();
      p.launch(new Vec2(0, -16));
      let worst = Infinity;
      for (let i = 0; i < 80; i++) {
        step(1);
        const sy = p.globalPosition.y - (cam.globalPosition.y - 120);
        worst = Math.min(worst, sy - 19, 240 - 19 - sy);
      }
      c.true(worst > 0, 'on screen during a -16 launch');
    }),
  );

  it(
    'C1: ground caps',
    checked((c) => {
      for (const speed of [4, 9]) {
        w = qa.world();
        qa.slope(w, -45, 3000);
        p = qa.spawn(w, new Vec2(-1000, -1000));
        cam = new GameCamera();
        w.addChild(cam);
        step(3);
        p.groundSpeed = speed;
        let maxDy = 0;
        let last = cam.globalPosition.y;
        for (let i = 0; i < 90; i++) {
          step(1);
          maxDy = Math.max(maxDy, Math.abs(cam.globalPosition.y - last));
          last = cam.globalPosition.y;
        }
        c.true(maxDy <= (speed >= 8 ? 16.01 : 6.01), `ground follow cap at ${speed} (${maxDy})`);
      }
    }),
  );

  it(
    'D1 bounds and D2 small level',
    checked((c) => {
      const bounds = new Rect2(-300, -400, 1200, 500);
      setup(Vec2.ZERO, bounds, -300, 900);
      qa.rect(w, new Rect2(-310, -400, 10, 500));
      let bad = 0;
      for (const spot of [new Vec2(-280, 0), new Vec2(880, 0), new Vec2(300, -380)]) {
        p.respawnAt(spot.sub(new Vec2(0, 19)));
        for (let i = 0; i < 60; i++) {
          step(1);
          const v = cam.viewRect();
          if (v.x < bounds.x - 0.01 || v.right > bounds.right + 0.01 || v.y < bounds.y - 0.01 || v.bottom > bounds.bottom + 0.01) bad += 1;
        }
      }
      c.eq(bad, 0, 'frames showing outside Bounds');
      const small = new Rect2(0, -200, 300, 200);
      setup(new Vec2(100, 0), small, -100, 400);
      step(10);
      c.near(cam.globalPosition.x, 150, 0.51, 'small level centred x');
      c.near(cam.globalPosition.y, -100, 0.51, 'small level centred y');
    }),
  );

  it(
    'D3 D4 D5: lock and unlock',
    checked((c) => {
      setup();
      const arena = new Rect2(400, -260, 424, 240);
      cam.lockTo(arena, 0.5);
      let settled = -1;
      let maxStep = 0;
      let last = cam.globalPosition;
      for (let i = 0; i < 60; i++) {
        step(1);
        maxStep = Math.max(maxStep, cam.globalPosition.distanceTo(last));
        last = cam.globalPosition;
        if (settled < 0 && rectNear(cam.viewRect(), arena)) settled = i + 1;
      }
      c.true(settled >= 29 && settled <= 32, `lock settles in about 30 frames (${settled})`);
      p.groundSpeed = 6;
      press('move_right');
      let moved = 0;
      const hold = cam.globalPosition;
      for (let i = 0; i < 60; i++) {
        step(1);
        moved = Math.max(moved, cam.globalPosition.distanceTo(hold));
      }
      release('move_right');
      c.true(moved < 0.01, `locked camera stays fixed (${moved})`);
      cam.unlock(0.5);
      maxStep = 0;
      last = cam.globalPosition;
      for (let i = 0; i < 45; i++) {
        step(1);
        maxStep = Math.max(maxStep, cam.globalPosition.distanceTo(last));
        last = cam.globalPosition;
      }
      c.true(maxStep <= 24, `no snap on unlock (${maxStep})`);
      // Lock again mid-transition, then unlock mid-lock.
      cam.lockTo(arena, 0.5);
      step(10);
      cam.lockTo(new Rect2(arena.x + 200, arena.y, arena.w, arena.h), 0.5);
      step(10);
      cam.unlock(0.5);
      maxStep = 0;
      last = cam.globalPosition;
      for (let i = 0; i < 60; i++) {
        step(1);
        maxStep = Math.max(maxStep, cam.globalPosition.distanceTo(last));
        last = cam.globalPosition;
      }
      c.true(maxStep <= 24, `nested lock/unlock: no snap (${maxStep})`);
    }),
  );

  it(
    'D6 / I: autoscroll',
    checked((c) => {
      setup();
      qa.rect(w, new Rect2(900, -300, 60, 300)); // wall ahead to crush against
      cam.startAutoscroll(new Vec2(120, 0)); // 2 px/frame
      const steps: number[] = [];
      let worstRect = 0;
      let worstOutside = 0;
      let last = cx();
      let killedAt = -1;
      for (let i = 0; i < 600; i++) {
        step(1);
        steps.push(cx() - last);
        last = cx();
        const v = cam.viewRect();
        const cr = p.clampRect;
        worstRect = Math.max(worstRect, cr.position.sub(v.position).length() + cr.size.sub(v.size).length());
        if (p.state !== 'dead') worstOutside = Math.max(worstOutside, v.x - (p.globalPosition.x - 9));
        if (killedAt < 0 && p.state === 'dead') killedAt = i;
      }
      const avg = steps.slice(5).reduce((a, b) => a + b, 0) / (steps.length - 5);
      c.near(avg, 2, 0.01, 'autoscroll speed');
      c.true(worstRect <= 1, `clamp_rect = visible rect (${worstRect})`);
      c.true(killedAt > 0, 'crushed against the wall by the left edge');
      c.true(worstOutside <= 2.01, `alive Sproto at most one frame of scroll outside the view (${worstOutside})`);
      cam.stopAutoscroll();
      c.true(!p.clampRect.hasArea() && p.clampRect.position.equals(Vec2.ZERO), 'stop clears clamp_rect at once');
    }),
  );

  it(
    'D7: shake',
    checked((c) => {
      setup();
      step(5);
      const base = cam.globalPosition;
      cam.shake(6, 0.5);
      let worst = 0;
      for (let i = 0; i < 40; i++) {
        step(1);
        worst = Math.max(worst, cam.offset.length());
      }
      c.true(worst <= 6 * Math.SQRT2 + 0.5, 'within strength');
      c.true(cam.offset.equals(Vec2.ZERO), 'decays to zero');
      c.true(cam.globalPosition.equals(base), 'returns to its exact target');
    }),
  );

  it(
    'D8: pause',
    checked((c) => {
      setup();
      p.groundSpeed = 6;
      press('move_right');
      step(30);
      cam.shake(5, 1);
      tree.paused = true;
      const pos = cam.globalPosition;
      const off = cam.offset;
      step(30);
      c.true(cam.globalPosition.equals(pos), 'no drift while paused');
      c.true(cam.offset.equals(off), 'shake paused');
      tree.paused = false;
      release('move_right');
    }),
  );

  it(
    'E: death and respawn',
    checked((c) => {
      for (const dist of [100, 1000]) {
        setup();
        p.groundSpeed = 4;
        step(30);
        p.kill();
        const pos = cam.globalPosition;
        let drift = 0;
        for (let i = 0; i < 120; i++) {
          step(1);
          drift = Math.max(drift, cam.globalPosition.distanceTo(pos));
        }
        p.respawnAt(new Vec2(pos.x + dist, -19));
        step(1);
        const off = cam.globalPosition.sub(p.globalPosition);
        c.true(drift < 0.01, 'camera holds still while dead');
        c.true(Math.abs(off.x) <= 8.5 && Math.abs(off.y - 16) <= 1, `on Sproto right after respawning ${dist} px away (${off})`);
      }
    }),
  );

  it(
    'G: spin dash hold',
    checked((c) => {
      for (const presses of [0, 6]) {
        setup();
        press('move_down');
        step(3);
        for (let k = 0; k < presses + 1; k++) {
          press('jump');
          step(1);
          release('jump');
          step(1);
        }
        release('move_down');
        step(1);
        const x0 = cx();
        let worstEdge = Infinity;
        let maxStep = 0;
        let last = x0;
        for (let i = 0; i < 120; i++) {
          step(1);
          maxStep = Math.max(maxStep, Math.abs(cx() - last));
          last = cx();
          const sx = screenX();
          worstEdge = Math.min(worstEdge, sx - 7, 424 - 7 - sx);
        }
        c.true(worstEdge > 0, `on screen during the hold (${presses} presses)`);
        c.true(maxStep <= 21.01, `catch-up capped (20 + 1 px rounding) (${maxStep})`);
      }
    }),
  );

  it(
    'H: look up and down',
    checked((c) => {
      for (const dir of [-1, 1]) {
        setup();
        step(10);
        const y0 = cam.globalPosition.y;
        const act = dir < 0 ? 'move_up' : 'move_down';
        press(act);
        let started = -1;
        let maxRate = 0;
        let last = y0;
        for (let i = 0; i < 240; i++) {
          step(1);
          maxRate = Math.max(maxRate, Math.abs(cam.globalPosition.y - last));
          last = cam.globalPosition.y;
          if (started < 0 && Math.abs(cam.globalPosition.y - y0) > 0.01) started = i + 1;
        }
        const dist = cam.globalPosition.y - y0;
        c.true(started >= 119 && started <= 123, `starts after about 120 frames (${started})`);
        c.near(Math.abs(dist), dir < 0 ? 104 : 88, 1, 'distance');
        c.true(maxRate <= 2.01, 'pan speed');
        release(act);
        step(70);
        c.near(cam.globalPosition.y, y0, 1, 'returns after release');
      }
    }),
  );

  it(
    'H3 spin dash during the look wait and H2 cancel',
    checked((c) => {
      setup();
      press('move_down');
      step(60);
      press('jump');
      step(1);
      release('jump');
      step(2);
      c.eq(p.state, 'spindash', 'spin dash from the look-down wait');
      release('move_down');
      step(10);
      // Look up then start running: cancels at once (returns at 2 px/frame).
      setup();
      press('move_up');
      step(170);
      const shifted = cam.lookShift;
      release('move_up');
      press('move_right');
      step(8);
      release('move_right');
      c.true(cam.lookShift > shifted, 'returning after moving');
    }),
  );
});
