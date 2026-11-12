// GameCamera: deadzone, look-ahead, catch-up caps, vertical follow, air window,
// clamping, locks, autoscroll, shake, pixel snapping, spin dash hold and
// look up / down.

import { afterEach, describe, it } from 'vitest';
import { Tuning } from '../../src/core/tuning';
import { GameCamera } from '../../src/camera/game_camera';
import type { Player } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { tree, VIEW_H, VIEW_W } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { addFloor, addRect, addSlope, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

const VIEW = new Vec2(VIEW_W, VIEW_H);
const tan = (d: number) => Math.tan((d * Math.PI) / 180);

let world: Node2D;
let player: Player;
let camera: GameCamera;

afterEach(() => releaseAll());

function setup(feet = Vec2.ZERO, floorFrom = -4000, floorTo = 8000): void {
  world = newWorld();
  addFloor(world, floorFrom, floorTo);
  player = spawnPlayer(world, feet);
  camera = new GameCamera();
  world.addChild(camera);
  settle(player, feet);
  step(2);
}

describe('camera', () => {
  it(
    'camera contract',
    checked((c) => {
      setup();
      c.eq(GameCamera.current(), camera, 'current()');
      c.true(camera.isInGroup('game_camera'), 'group game_camera');
      c.eq(tree.camera, camera, 'made current');
      c.true(tree.viewSize.equals(new Vec2(424, 240)), 'viewport size');
      // Centred on Sproto, who is held verticalOffset above the centre.
      const expected = player.globalPosition.add(new Vec2(0, camera.verticalOffset));
      c.true(camera.globalPosition.distanceTo(expected) < 0.01, `starts on the player (${camera.globalPosition} vs ${expected})`);
    }),
  );

  it(
    'deadzone holds for small moves',
    checked((c) => {
      setup();
      const start = camera.globalPosition;
      player.respawnAt(player.globalPosition.add(new Vec2(camera.deadzoneWidth / 2 - 1, 0)));
      step(10);
      c.true(camera.globalPosition.equals(start), 'inside the deadzone the camera holds still');
      player.respawnAt(player.globalPosition.add(new Vec2(12, 0)));
      step(10);
      c.true(camera.globalPosition.x > start.x, 'outside it the camera follows');
    }),
  );

  it(
    'look-ahead direction and size',
    checked((c) => {
      for (const dir of [1, -1]) {
        setup();
        player.groundSpeed = 10 * dir;
        const action = dir > 0 ? 'move_right' : 'move_left';
        press(action);
        step(150);
        release(action);
        const expected = camera.lookAheadMax * Math.min(Math.max((10 - camera.lookAheadStartSpeed) / (camera.lookAheadFullSpeed - camera.lookAheadStartSpeed), 0), 1);
        c.near(camera.lookAhead, expected * dir, 0.5, `dir ${dir}: look-ahead at 10 px/frame`);
        const lead = (camera.globalPosition.x - player.globalPosition.x) * dir;
        c.near(lead, expected - camera.deadzoneWidth / 2, 1.5, `dir ${dir}: view ahead of Sproto`);
      }
    }),
  );

  it(
    'look-ahead eases without jumps',
    checked((c) => {
      setup();
      player.groundSpeed = 12;
      press('move_right');
      let last = camera.lookAhead;
      let biggest = 0;
      for (let i = 0; i < 90; i++) {
        step(1);
        biggest = Math.max(biggest, Math.abs(camera.lookAhead - last));
        last = camera.lookAhead;
      }
      release('move_right');
      // Reverse hard: the shift swings back smoothly, never faster than its cap.
      press('move_left');
      for (let i = 0; i < 200; i++) {
        step(1);
        biggest = Math.max(biggest, Math.abs(camera.lookAhead - last));
        last = camera.lookAhead;
      }
      release('move_left');
      c.true(biggest <= camera.lookAheadMaxRate + 0.001, `largest shift change ${biggest} px/frame`);
      c.true(camera.lookAhead < 0, 'now looking left');
    }),
  );

  it(
    'horizontal catch-up is capped',
    checked((c) => {
      setup();
      const startX = camera.globalPosition.x;
      player.respawnAt(player.globalPosition.add(new Vec2(200, 0)));
      let last = camera.globalPosition.x;
      const steps: number[] = [];
      for (let i = 0; i < 20; i++) {
        step(1);
        steps.push(camera.globalPosition.x - last);
        last = camera.globalPosition.x;
      }
      c.eq(steps[0], camera.maxSpeedX, 'first frame moves the cap');
      for (const s of steps) c.true(s <= camera.maxSpeedX, `never faster than ${camera.maxSpeedX} px/frame (${s})`);
      c.near(camera.globalPosition.x - startX, 200 - camera.deadzoneWidth / 2, 1, 'caught up');
    }),
  );

  it(
    'vertical ground follow caps',
    checked((c) => {
      for (const fast of [false, true]) {
        world = newWorld();
        addFloor(world, -4000, 8000, 0);
        player = spawnPlayer(world, new Vec2(0, -150));
        addRect(world, new Rect2(-50, -150, 100, 20)); // a ledge to start on
        camera = new GameCamera();
        world.addChild(camera);
        settle(player, new Vec2(0, -150));
        step(2);
        // Drop to the floor 150 px below and run along it.
        player.respawnAt(new Vec2(120, -19));
        const speed = fast ? 9 : 3;
        player.velocity = new Vec2(speed, 0); // lands at this ground speed
        player.groundSpeed = speed;
        press('move_right');
        step(1);
        const steps: number[] = [];
        let last = camera.globalPosition.y;
        for (let i = 0; i < 12; i++) {
          step(1);
          steps.push(camera.globalPosition.y - last);
          last = camera.globalPosition.y;
        }
        release('move_right');
        const cap = fast ? camera.groundFollowFast : camera.groundFollowSlow;
        c.eq(steps[3], cap, `${fast ? 'fast' : 'slow'}: catches up at ${cap} px/frame`);
        for (const s of steps) c.true(s <= cap + 1, `never faster than the cap (${s})`);
      }
    }),
  );

  it(
    'air window',
    checked((c) => {
      setup();
      const startY = camera.globalPosition.y;
      // A short hop stays inside the window: the camera holds still.
      player.launch(new Vec2(0, -3));
      for (let i = 0; i < 30; i++) {
        step(1);
        c.eq(camera.globalPosition.y, startY, `frame ${i}: inside the air window`);
        if (player.grounded) break;
      }
      // A full spring leaves it: the camera follows, keeping him within the window.
      player.launch(new Vec2(0, -10));
      let moved = false;
      for (let i = 0; i < 40; i++) {
        step(1);
        const focusY = player.globalPosition.y + camera.verticalOffset;
        c.true(Math.abs(focusY - camera.globalPosition.y) <= camera.airWindow + 1, `frame ${i}: within the window`);
        moved = moved || camera.globalPosition.y < startY;
      }
      c.true(moved, 'followed the high jump');
    }),
  );

  it(
    'bounds clamp and small levels',
    checked((c) => {
      setup(new Vec2(30, 0));
      camera.setLevelBounds(new Rect2(0, -400, 2000, 464));
      step(2);
      c.eq(camera.globalPosition.x, VIEW.x / 2, 'left edge: shows from x 0');
      c.eq(camera.globalPosition.y, 64 - VIEW.y / 2, 'bottom edge: shows down to y 64');
      // A level smaller than the screen is centred.
      camera.setLevelBounds(new Rect2(-100, -150, 200, 150));
      step(2);
      c.true(camera.globalPosition.equals(new Vec2(0, -75)), `small level centred (${camera.globalPosition})`);
      player.respawnAt(new Vec2(90, -19));
      step(20);
      c.true(camera.globalPosition.equals(new Vec2(0, -75)), `and stays centred (${camera.globalPosition})`);
    }),
  );

  it(
    'lockTo and unlock',
    checked((c) => {
      setup();
      const arena = new Rect2(300, -200, VIEW.x, VIEW.y); // exactly one screen
      const distance = camera.globalPosition.distanceTo(arena.center);
      camera.lockTo(arena, 0.5);
      let last = camera.globalPosition;
      let biggest = 0;
      for (let i = 0; i < 30; i++) {
        step(1);
        biggest = Math.max(biggest, camera.globalPosition.distanceTo(last));
        last = camera.globalPosition;
      }
      c.true(camera.globalPosition.equals(arena.center), `ends exactly on the arena (${camera.globalPosition})`);
      // Eased (smoothstep): the fastest frame is 1.5x the average, no jump.
      c.true(biggest <= (distance / 30) * 1.5 + 2, `slides in smoothly (largest step ${biggest} px)`);
      step(10);
      c.true(camera.globalPosition.equals(arena.center), 'held there');
      camera.unlock(0.5);
      step(90);
      c.near(camera.globalPosition.x, player.globalPosition.x, camera.deadzoneWidth, 'back on Sproto');
    }),
  );

  it(
    'autoscroll pushes and crushes',
    checked((c) => {
      setup();
      addRect(world, new Rect2(400, -200, 40, 200)); // wall ahead
      const startX = camera.globalPosition.x;
      camera.startAutoscroll(new Vec2(120, 0));
      step(60);
      c.near(camera.globalPosition.x - startX, 120, 1, 'scrolls 120 px in a second');
      const vr = camera.viewRect();
      c.true(player.clampRect.position.equals(vr.position) && player.clampRect.size.equals(vr.size), 'player kept inside the view');
      c.true(player.globalPosition.x >= vr.x + Tuning.physics.width_radius - 0.01, 'pushed by the left edge');
      let dead = false;
      for (let i = 0; i < 300; i++) {
        step(1);
        if (player.state === 'dead') {
          dead = true;
          break;
        }
      }
      c.true(dead, 'crushed against the wall');
      camera.stopAutoscroll();
      c.true(!player.clampRect.hasArea() && player.clampRect.position.equals(Vec2.ZERO), 'clamp cleared');
    }),
  );

  it(
    'shake returns to rest',
    checked((c) => {
      setup();
      const at = camera.globalPosition;
      camera.shake(6, 0.5);
      let shook = false;
      for (let i = 0; i < 20; i++) {
        step(1);
        shook = shook || !camera.offset.equals(Vec2.ZERO);
        c.true(Math.abs(camera.offset.x) <= 6 && Math.abs(camera.offset.y) <= 6, 'within the strength');
      }
      step(20);
      c.true(shook, 'shook');
      c.true(camera.offset.equals(Vec2.ZERO), 'back at rest');
      c.true(camera.globalPosition.equals(at), 'position unaffected');
    }),
  );

  it(
    'no pixel jitter at constant speed',
    checked((c) => {
      for (const speed of [3, 6, 7.3]) {
        setup();
        player.groundSpeed = speed;
        press('move_right');
        step(200); // look-ahead settled
        let last = camera.globalPosition.x;
        const offsets = new Set<number>();
        for (let i = 0; i < 120; i++) {
          step(1);
          c.true(camera.globalPosition.x >= last, `speed ${speed}: snapped x never steps back`);
          last = camera.globalPosition.x;
          // Sproto's screen pixel, as the renderer snaps it.
          offsets.add(Math.round(player.globalPosition.x - camera.globalPosition.x));
          // Whole pixels; doubles leave ~1e-13 of noise at x ~ 1000 (a + 13 - a).
          const d = camera.globalPosition.x - player.globalPosition.x;
          c.near(d, Math.round(d), 1e-9, 'whole-pixel offset');
        }
        release('move_right');
        c.eq(offsets.size, 1, `speed ${speed}: Sproto keeps the same screen pixel ${[...offsets]}`);
      }
    }),
  );

  it(
    'no pixel jitter on a slope',
    checked((c) => {
      world = newWorld();
      addSlope(world, 22, 3000);
      player = spawnPlayer(world, new Vec2(-600, 600 * tan(22)));
      camera = new GameCamera();
      world.addChild(camera);
      settle(player, new Vec2(-600, 600 * tan(22) - 2));
      player.groundSpeed = 4;
      press('move_right');
      step(200);
      let last = camera.globalPosition;
      const screen = new Set<string>();
      for (let i = 0; i < 120; i++) {
        step(1);
        c.true(camera.globalPosition.x >= last.x && camera.globalPosition.y <= last.y, `moves only right and up (${last} -> ${camera.globalPosition})`);
        last = camera.globalPosition;
        screen.add(String(player.globalPosition.sub(camera.globalPosition).round()));
      }
      release('move_right');
      c.eq(screen.size, 1, `Sproto keeps the same screen pixel on the slope ${[...screen]}`);
    }),
  );

  it(
    'spin dash hold',
    checked((c) => {
      setup();
      press('move_down');
      step(2);
      // Presses on the second tick of each pair (the Godot harness saw a press
      // one tick late), the last one right before down is released.
      for (let i = 0; i < 6; i++) {
        step(1);
        press('jump');
        step(1);
        release('jump');
      }
      const x = camera.globalPosition.x;
      release('move_down');
      step(1);
      c.near(player.groundSpeed, 12, 1e-6, 'full spin dash');
      // 16 frames minus half the charge (4): 12 frames, the release frame included.
      c.eq(camera.holdFrames, camera.spindashHoldFrames - 4 - 1, 'hold started');
      step(10);
      c.eq(camera.globalPosition.x, x, 'held while Sproto shoots off');
      step(3);
      c.true(camera.globalPosition.x > x, 'then follows');
    }),
  );

  it(
    'look up and down after the delay',
    checked((c) => {
      setup();
      const y = camera.globalPosition.y;
      press('move_up');
      step(camera.lookDelayFrames - 1);
      c.eq(camera.globalPosition.y, y, 'no pan before the delay');
      step(80);
      c.eq(camera.lookShift, -camera.lookUpDistance, 'panned up');
      c.near(camera.globalPosition.y, y - camera.lookUpDistance, 1, 'view moved up');
      release('move_up');
      step(80);
      c.eq(camera.lookShift, 0, 'returns when released');
      press('move_down');
      step(camera.lookDelayFrames + 60);
      c.true(player.crouching, 'crouching');
      c.eq(camera.lookShift, camera.lookDownDistance, 'panned down while crouching');
      // Crouch -> spin dash still works, and the view comes back.
      press('jump');
      step(2);
      release('jump');
      c.eq(player.state, 'spindash', 'spin dash from the crouch');
      release('move_down');
      step(60);
      c.eq(camera.lookShift, 0, 'view back after the spin dash');
    }),
  );

  it(
    'respawn snaps instead of scrolling',
    checked((c) => {
      setup();
      player.respawnAt(new Vec2(3000, -19));
      step(1);
      c.eq(camera.globalPosition.x, 3000, 'snapped to the new spot');
    }),
  );

  // The runtime always interpolates between physics ticks.
  it(
    'respawn snap is a clean cut with interpolation',
    checked((c) => {
      setup();
      // The snap must place the camera itself, before it resets interpolation,
      // so the renderer cuts straight to the new view (no sweep from the old one).
      player.globalPosition = new Vec2(2400, -19);
      camera.snapToTarget();
      const placed = new Vec2(2400, -19 + camera.verticalOffset);
      c.true(camera.globalPosition.equals(placed), `placed inside the snap (${camera.globalPosition})`);
      c.true(camera.viewTopLeft(0.5).equals(placed.sub(VIEW.div(2))), 'drawn there between ticks, no sweep');
      // And the whole respawn flow.
      player.respawnAt(new Vec2(-1500, -19));
      step(1);
      c.eq(camera.globalPosition.x, -1500, 'snapped to the respawn spot');
      c.eq(camera.viewTopLeft(0.5).x, -1500 - VIEW.x / 2, 'drawn there between ticks');
      step(5);
      c.eq(camera.globalPosition.x, -1500, 'and stays there');
    }),
  );
});
