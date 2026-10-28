// Level 1: Bark Jungle — a winding, rolling jungle path. Teaches everything, then mixes it up:
// high-road ledge, lily pads, rope drawbridge, Bone Switch stairs, flipping planks, coconut hill,
// a belly-flop secret, and a fork before the boss gate.
import * as THREE from 'three';
import { makeKit, makeTrack, turtle } from './kit.js';
import { rand, pick } from '../core/util.js';

export function buildLevel1(game, stage, tickets) {
  const track = makeTrack(stage, turtle([0, 0, 10], [
    [20, 0, 0], [24, 32, 0], [22, -8, 0.8], [26, -52, 0], [20, 8, -1.2], [25, 42, 0], [20, 0, 0],
    [25, -28, 1.5], [22, 22, 0], [25, 35, 3.2], [20, -18, -0.5], [25, -34, 0.4], [30, 26, 0], [24, 0, 0],
  ]));
  const k = makeKit(game, stage, tickets, track);
  const END = 322;

  // walls: [d, left, right, height]
  k.walls([[-8, 4.3, 4.3, 2.6], [163, 4.3, 4.3, 2.6], [166, 7.7, 4.3, 2.6], [178, 7.7, 4.3, 2.6], [181, 4.3, 4.3, 2.6],
    [END + 2, 4.3, 4.3, 2.6]]);
  k.backstop(-8);
  k.backstop(END);

  // --- start: bite + jump ---
  k.floor(-8, 26);
  k.sign(-3.0, 0, 3, ['BITE', 'J / SHIFT'], { rot: -0.3 });
  k.sign(3.0, 0, 3, ['JUMP', 'SPACE x2'], { rot: 0.3 });
  k.tut(5, 'bite');
  k.pack(0, 0, 8); k.pack(-1.6, 0, 10); k.pack(1.6, 0, 10);
  k.tix(0, 0, 3.5, 0, 0, 6.5, 3);
  k.tut(13, 'dog');
  k.dog(3, 0, 17, 'shiba');
  k.tut(19, 'broccoli');
  k.broc(0, 0, 22.5, { range: 2.5 });
  k.tix(-2.4, 0, 12, -2.4, 0, 24, 6);

  // --- first gap, then a raised ledge on the right (high road) ---
  k.tixArc(0, 0, 25, 0, 31, 2.0, 6);
  k.floor(30, 58);
  k.floor(40, 46, { x: 2.9, w: 2.8, y: [0, 1.5] });
  k.floor(46, 56, { x: 2.9, w: 2.8, y: 1.5 });
  k.tut(31, 'sphere');
  k.sphere(-1, 0, 35);
  k.stack(-2.8, 0, 41, 2); k.pack(-1.6, 0, 41);
  k.broc(-1.5, 0, 46, { range: 1.5 });
  k.broc(-1.0, 0, 52, { axis: 'z', range: 2.5 });
  k.tix(2.9, 1.5, 46.5, 2.9, 1.5, 55.5, 6);
  k.pack(2.9, 1.5, 51);

  // --- double jump gap ---
  k.tut(53.5, 'doubleJump');
  k.tixArc(0, 0, 57, 0, 66, 3.4, 9);
  k.floor(65, 92);
  k.tut(68, 'spiky');
  k.spiky(0, 0, 74, { range: 2 });
  k.packs([[-3, 70], [3, 70], [-3, 78], [3, 78]]);
  k.tut(80, 'slide');
  k.tix(-2.4, 0, 82, 2.4, 0, 82, 5);
  k.tut(84.5, 'snacks');
  k.snacks(0, 0, 87);

  // --- cat + trampoline to a hidden ledge ---
  k.floor(92, 112);
  k.tut(91.5, 'cat');
  k.cat(1.1, 0, 96);
  k.pack(2.7, 0, 95); k.pack(2.7, 0, 97); k.pack(2.7, 1, 96);
  k.tix(-2.2, 0, 93, -2.2, 0, 100, 4);
  k.tut(101, 'trampoline');
  k.tramp(-2.5, 0, 105);
  k.platform(-2.5, 4.4, 110.5, 3, 5.5);
  k.oneUp(-2.5, 4.4, 112.3);
  k.dog(-2.0, 4.4, 109.0, 'pug');
  k.pack(-3.4, 4.4, 110.6, 5);

  // --- lily pad pond ---
  k.water(112, 128, { y: -1.0 });
  k.lily(-1.4, 0, 115.2);
  k.lily(1.5, 0, 118.6);
  k.lily(-1.0, 0, 122.0);
  k.lily(1.4, 0, 125.3);
  for (const [x, d] of [[-1.4, 115.2], [1.5, 118.6], [-1.0, 122.0], [1.4, 125.3]]) k.tix(x, 0.2, d, x, 0.2, d, 1);
  k.floor(128, 152);

  // --- rugs + squirrel ---
  k.tut(129.5, 'rug');
  k.rug(-1.9, 0, 133);
  k.rug(1.9, 0, 141, Math.PI / 2);
  k.tix(0, 0, 130, 0, 0, 144, 7);
  k.tut(145, 'squirrel');
  k.squirrel(0, 0, 148);
  k.pack(-3, 0, 150); k.pack(3, 0, 150);

  // --- rope drawbridge (bite the rope!) ---
  k.ropeBridge(152, 160, { w: 3.4, postX: 3.1 });
  k.tix(0, 0.3, 153.5, 0, 0.3, 158.5, 4);
  k.floor(160, 199.5 - 13.5);
  k.tut(163, 'drone');
  k.drone(0, 0, 167, { range: 2.8 });

  // --- Bone Switch alcove: builds stairs to a floating treasure platform ---
  k.floor(163, 181, { x: -6, w: 3.4 });
  k.boneSwitch(-6.1, 0, 170.5, [[-3.4, 1.5, 172.5, 2.2, 2.2], [-0.9, 3.0, 174.5, 2.2, 2.2], [1.8, 4.5, 176.5, 2.6, 3.2]]);
  k.sphere(1.8, 4.5, 177.2);
  k.pack(2.9, 4.5, 175.8, 5); k.pack(0.9, 4.5, 177.6, 5);
  k.dog(-6.3, 0, 175.5, 'dalmatian');
  k.drone(0, 0, 179, { range: 2.5, speed: 1.4 });
  k.tut(180.5, 'pill');
  k.pill(1.5, 0, 182, { range: 1.6 });
  k.snacks(-2.2, 0, 184.5);

  // --- plank bridge with flipping planks ---
  k.floor(186, 190.5, { w: 2.8, style: 'platform', depth: 0.6 });
  k.flip(0, 0, 192.2, { w: 2.8, d: 2.2, period: 3.4 });
  k.flip(0, 0, 195.0, { w: 2.8, d: 2.2, period: 3.4, phase: 1.7 });
  k.floor(196.5, 201, { w: 2.8, style: 'platform', depth: 0.6 });
  k.tix(0, 0, 187, 0, 0, 190, 2);
  k.tixArc(0, 0, 191, 0, 196, 1.6, 4);

  // --- coconut hill (climb while coconuts roll down) + belly flop secret ---
  k.floor(201, 224);
  k.floor(224, 228, { x: 1.8, w: 5 });
  k.floor(228, 240);
  k.cracked(-2.5, 0, 226, { w: 3.6, d: 4 });
  k.floor(224, 228, { x: -2.5, w: 3.6, y: -4.5, depth: 2 });
  k.dog(-2.5, -4.5, 225.2, 'shiba');
  k.oneUp(-3.3, -4.5, 227.2);
  k.mushroom(-1.6, -4.5, 227.2, { power: 17 });
  k.tut(222, 'flop');
  k.coconuts(239, { until: 203, every: 2.2, speed: 6.5, lanes: [-0.2, 1.3, 2.8] });
  k.trooper(0, 0, 210);
  k.pack(-2.8, 0, 208); k.pack(2.8, 0, 208);
  k.spiky(-1.5, 0, 217, { range: 1.4 });
  k.broc(1.6, 0, 233, { range: 2 });
  k.cat(-2.6, 0, 236);
  k.rug(2.5, 0, 237.5);
  k.sphere(2.7, 0, 230);
  k.tix(2.6, 0, 212, 2.6, 0, 222, 5);

  // --- last gap + lint roller ---
  k.tixArc(0, 0, 239, 0, 247, 2.4, 6);
  k.floor(246, 287);
  k.packs([[2.2, 252], [3.2, 253.6], [2.2, 255.2]]);
  k.dog(3.3, 0, 257.5, 'corgi');
  k.tut(259.5, 'lint');
  k.lint(0, 0, 263);
  k.pill(-2, 0, 268, { range: 1.5 });
  k.mushroom(2.5, 0, 274);
  k.tixRing(2.5, 5.5, 274.5, 1.0, 8);
  k.tix(-1, 0, 266, -1, 0, 282, 6);

  // --- the fork: low road (left) vs high road (right) ---
  k.floor(287, 307, { x: -2.7, w: 3.2 });
  k.floor(287, 292, { x: 2.7, w: 3.2, y: [0, 1.6] });
  k.floor(292, 302, { x: 2.7, w: 3.2, y: 1.6 });
  k.floor(302, 307, { x: 2.7, w: 3.2, y: [1.6, 0] });
  k.floor(307, END);
  k.broc(-2.7, 0, 293, { axis: 'z', range: 2 });
  k.broc(-2.7, 0, 300, { range: 0.6 });
  k.tix(-2.7, 0, 289, -2.7, 0, 305, 7);
  k.rug(2.7, 1.6, 295);
  k.sphere(2.7, 1.6, 299);
  k.pack(2.7, 1.6, 302.5, 5);
  k.gate(313, 'MECHA BIRD');
  k.trigger(315, () => game.session.reachBossGate());

  // --- decor ---
  k.banks(-6, END, (x, y, d) => {
    const r = Math.random();
    if (r < 0.42) k.palm(x, y, d, rand(4.5, 7));
    else if (r < 0.75) k.bush(x, y, d, rand(0.9, 1.5));
    else if (r < 0.88) k.fern(x, y, d, rand(1.1, 1.5));
    else k.rock(x, y, d, rand(0.6, 1.1), 0x8a8a7a, { moss: true });
  }, { every: 3.6 });
  k.edges(-4, END, (x, y, d) => (Math.random() < 0.6 ? k.fern(x, y, d, rand(0.8, 1.2)) : k.flowers(x, y, d)), { every: 3 });
  k.grass(-4, END, { every: 1.1 });
  for (let d = 12; d < END; d += 26) k.bgDog(pick([-1, 1]) * rand(5.4, 6.4), 2.6, d + rand(-4, 4), { height: 1.1 });

  return {
    spawn: k.W(0, 0, 1),
    facing: track.yaw(1),
    camera: { mode: 'track', track, height: 4.3, dist: 8.6, ahead: 5.5 },
  };
}

export function buildBoss1Arena(game, stage, tickets) {
  const k = makeKit(game, stage, tickets);
  stage.block(-12, -6, -12, 12, 0, 12, 'ground');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = rand(17, 22);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 6) continue; // keep the camera side clear
    stage.block(x - 2, -10, z - 2, x + 2, rand(-3, 0), z + 2, 'ground', { solid: false });
    k.palm(x, -1, -z, rand(6, 9));
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const x = Math.cos(a) * 11.2, z = Math.sin(a) * 11.2;
    if (Math.abs(x) > 11.5 || Math.abs(z) > 11.5) continue;
    if (i % 3 === 0) k.bush(x, 0, -z, 1.0); else if (i % 3 === 1) k.flowers(x, 0, -z); else k.fern(x, 0, -z, 1.1);
  }
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) k.rock(x, 0, -z, 1.2, 0x8a8a7a, { moss: true });
  for (let i = 0; i < 48; i++) {
    const a = rand(0, Math.PI * 2), r = rand(9.8, 11.6);
    k.tuft(Math.cos(a) * r, 0, -Math.sin(a) * r, rand(0.8, 1.2));
  }
  k.sphere(-9, 0, -9);
  k.sphere(9, 0, -9);
  k.tix(-6, 0, -6, 6, 0, -6, 7);
  return {
    spawn: new THREE.Vector3(0, 0, 8),
    facing: Math.PI,
    camera: { mode: 'arena', center: new THREE.Vector3(0, 0, 0), offset: { x: 0, y: 11.5, z: 16 }, follow: 0.45 },
    spheres: [new THREE.Vector3(-9, 0, 9), new THREE.Vector3(9, 0, 9), new THREE.Vector3(0, 0, -9)],
  };
}
