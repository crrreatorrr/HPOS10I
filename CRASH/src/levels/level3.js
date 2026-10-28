// Level 3: the Cone Factory — a short, hard, twisting route through the factory. Every enemy and breakable type,
// conveyors, crushers, swinging cone hammers, an updraft fan, a Bone Switch bridge and a belly-flop secret.
import * as THREE from 'three';
import { makeKit, makeTrack, turtle } from './kit.js';
import { rand, pick } from '../core/util.js';

export function buildLevel3(game, stage, tickets) {
  const track = makeTrack(stage, turtle([0, 0, 10], [
    [22, 0, 0], [22, 38, 0], [24, 0, 0], [22, -48, 0], [22, 0, 1.2], [24, 40, 0], [20, 0, 0], [22, -42, -1.2],
    [22, 0, 0], [22, 34, 1], [22, 0, 0], [24, -30, 0], [24, 0, 0],
  ]));
  const k = makeKit(game, stage, tickets, track);
  const END = 252;
  const H = 3.4;
  k.walls([[-8, 4.3, 4.3, H], [47, 4.3, 4.3, H], [48.5, 2.1, 2.1, H], [65.5, 2.1, 2.1, H], [67, 4.3, 4.3, H],
    [171, 4.3, 4.3, H], [172.5, 2.1, 2.1, H], [181.5, 2.1, 2.1, H], [183, 4.3, 4.3, H], [END + 2, 4.3, 4.3, H]]);
  k.backstop(-8);
  k.backstop(END);
  const F = (a, b, o = {}) => k.floor(a, b, { style: 'ground', ...o });

  // --- intake hall ---
  F(-8, 22);
  k.packs([[-2.6, 6], [2.6, 6]]);
  k.tut(8, 'vacuum');
  k.vacuum(0, 0, 12, { range: 3, speed: 4 });
  k.pill(2, 0, 18, { range: 1.5 });
  k.tix(-2.5, 0, 9, -2.5, 0, 19, 5);

  // --- conveyor pushing backwards ---
  k.tut(20.5, 'conveyor');
  k.belt(22, 36, { x: 0, z: 3.2 });
  k.tix(0, 0, 24, 0, 0, 34, 6);
  k.pack(-2.8, 0, 29); k.pack(2.8, 0, 29);
  F(36, 40);
  k.spiky(0, 0, 38.5, { range: 0 });
  k.mover(0, 0, 43, { axis: 'z', range: 1.6, speed: 1.4, w: 3, d: 2.4 });
  F(46, 70);

  // --- crusher alley ---
  k.tut(46.5, 'crusher');
  k.crusher(0, 0, 51, { w: 4, d: 2.4, phase: 0 });
  k.crusher(0, 0, 56, { w: 4, d: 2.4, phase: 0.9 });
  k.crusher(0, 0, 61, { w: 4, d: 2.4, phase: 1.8 });
  k.tix(0, 0, 49.5, 0, 0, 63, 7);
  k.dog(-3.2, 0, 68, 'pug');
  k.snacks(1.5, 0, 69.5);

  // --- troopers, drones and the rug/cat puzzle ---
  F(70, 98);
  k.trooper(-1.5, 0, 75);
  k.drone(0, 0, 78.5, { range: 3 });
  k.trooper(1.6, 0, 81);
  k.rug(0, 0, 86.5);
  k.cat(-2.7, 0, 86.5);
  k.stack(2.7, 0, 88, 2);
  k.rug(-1.9, 0, 91.5, Math.PI / 2);
  k.packs([[0.4, 92.6], [1.9, 93.5]]);
  k.sphere(-2.9, 0, 95.5);
  k.dog(2.9, 0, 96.5, 'dalmatian');
  k.tix(2.8, 0, 72, 2.8, 0, 84, 5);

  // --- crumbling catwalk ---
  k.crumble(0, 0, 100.5, { w: 2.2, d: 2.2 });
  k.crumble(-1.6, 0, 104, { w: 2.2, d: 2.2 });
  k.crumble(1.2, 0, 107.5, { w: 2.2, d: 2.2 });
  k.crumble(-0.5, 0, 111, { w: 2.2, d: 2.2 });
  k.mover(0, 0, 115, { axis: 'x', range: 2.2, speed: 1.6, w: 2.4, d: 2.4 });
  for (const [x, d] of [[0, 100.5], [-1.6, 104], [1.2, 107.5], [-0.5, 111]]) k.tix(x, 0.3, d, x, 0.3, d, 1);

  // --- hammer hall ---
  F(118, 136);
  k.snacks(0, 0, 120.5);
  k.hammer(0, 0, 125, { period: 2.6 });
  k.mouse(0, 0, 128, { range: 3, speed: 4.5 });
  k.hammer(0, 0, 131, { period: 2.6, phase: 1.3 });
  k.yarn(0, 0, 134, { range: 3, speed: 4 });
  k.squirrel(-2.8, 0, 122.5);
  k.tix(0, 0, 123, 0, 0, 133, 6);

  // --- sideways conveyor with a drop on the right ---
  k.belt(136, 146, { x: 3.0, z: 0 }, { x: -1.15, w: 6.3 });
  k.tix(-2.6, 0, 137, -2.6, 0, 145, 4);
  F(146, 172);
  // updraft fan up to a high catwalk with goodies
  k.fan(-2.6, 0, 150, { height: 7 });
  k.platform(-2.6, 5.4, 155.5, 3, 5.5);
  k.oneUp(-2.6, 5.4, 157.4);
  k.dog(-2.1, 5.4, 154.2, 'corgi');
  k.pack(-3.5, 5.4, 155.8, 5);
  k.vacuum(0.8, 0, 160, { range: 2.6, speed: 5 });
  k.spiky(1.8, 0, 163.5, { range: 0 });
  k.vacuum(0.8, 0, 166.5, { range: 2.6, speed: 5 });
  k.dog(3.3, 0, 169.5, 'shiba');

  // --- second crusher pair + lint roller ---
  F(172, 188);
  k.crusher(0, 0, 175, { w: 4, d: 2.4, phase: 0.3, period: 2.2 });
  k.crusher(0, 0, 179, { w: 4, d: 2.4, phase: 1.3, period: 2.2 });
  k.tut(183, 'lint');
  k.lint(-1.5, 0, 185.5);
  // Bone Switch builds a safe bridge across the vat pit (or brave the moving platforms)
  k.boneSwitch(2.2, 0, 186, [[2.4, 0, 190, 2.4, 2.6], [2.4, 0, 193.2, 2.4, 2.6], [2.4, 0, 196.4, 2.4, 2.6], [2.4, 0, 199.6, 2.4, 2.6], [2.4, 0, 202.8, 2.4, 2.6]]);

  // --- moving platforms over the vat pit ---
  k.mover(-1.4, 0, 192, { axis: 'x', range: 1.6, speed: 1.6 });
  k.mover(-1.4, 0, 199, { axis: 'x', range: 1.6, speed: 1.6, phase: Math.PI });
  k.drone(0, 0, 195.5, { range: 2.5, hover: 2.2 });
  k.tixArc(-1.4, 0, 188, -1.4, 206, 3, 9);

  // --- final stretch + belly flop secret ---
  F(206, 218);
  F(218, 222, { x: 1.8, w: 5 });
  F(222, END);
  k.cracked(-2.5, 0, 220, { w: 3.6, d: 4 });
  k.floor(218, 222, { x: -2.5, w: 3.6, y: -4.5, depth: 2 });
  k.oneUp(-3.1, -4.5, 219);
  k.mushroom(-1.9, -4.5, 221.2, { power: 17 });
  k.tixRing(-2.5, -4.5, 220, 1.0, 6);
  k.dog(-3, 0, 212, 'dalmatian');
  k.snacks(1.5, 0, 214.5);
  k.pill(0, 0, 226, { range: 2 });
  k.broc(-1.5, 0, 230, { range: 1.5 });
  k.packs([[2.6, 224], [2.6, 228], [-2.6, 233]]);
  k.hammer(0, 0, 237, { period: 2.2 });
  k.gate(243, 'THE EVIL CONE', 0x8a1a3a);
  k.trigger(245, () => game.session.reachBossGate());

  // --- decor ---
  k.banks(-6, END, (x, y, d) => {
    const r = Math.random();
    if (r < 0.35) k.pipe(x, y, d, rand(4, 9));
    else if (r < 0.6) k.vat(x, y, d, rand(1.2, 1.8));
    else k.cones(x, y, d, Math.floor(rand(2, 5)));
  }, { every: 4.5 });
  k.edges(-4, END, (x, y, d) => k.cones(x, y, d, Math.floor(rand(1, 3))), { every: 6 });
  for (let d = 4; d < END; d += 12) k.bgDog(pick([-1, 1]) * rand(5.6, 6.6), H, d, { height: 1.0, cage: true });

  return {
    spawn: k.W(0, 0, 1),
    facing: track.yaw(1),
    camera: { mode: 'track', track, height: 4.5, dist: 8.4, ahead: 5.5 },
  };
}

export function buildBoss3Arena(game, stage, tickets) {
  const k = makeKit(game, stage, tickets);
  stage.block(-13, -6, -13, 13, 0, 13, 'ground');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 20;
    k.cones(Math.cos(a) * r, -2, Math.sin(a) * r, 6);
    k.pipe(Math.cos(a + 0.2) * (r + 4), -6, Math.sin(a + 0.2) * (r + 4), rand(10, 16));
  }
  for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) stage.block(x - 1, -6, z - 1, x + 1, 9, z + 1, 'wall', { solid: false });
  k.tix(-6, 0, -9, 6, 0, -9, 7);
  return {
    spawn: new THREE.Vector3(0, 0, 9),
    facing: Math.PI,
    camera: { mode: 'arena', center: new THREE.Vector3(0, 0, 0), offset: { x: 0, y: 12.5, z: 16.5 }, follow: 0.45 },
    spheres: [new THREE.Vector3(-9, 0, 9), new THREE.Vector3(9, 0, 9), new THREE.Vector3(0, 0, 10)],
  };
}
