// Level 2: Scratchpost Canyon — the Big Cat chase along a winding canyon. Camera faces Nobu.
// Pits, logs, backpack walls, rugs, yarn, a crumbling bridge, a curving plank bridge and a mushroom launch.
import * as THREE from 'three';
import { makeKit, makeTrack, turtle } from './kit.js';
import { ChaseCat } from '../bosses/bigCat.js';
import { rand, pick } from '../core/util.js';

export function buildLevel2(game, stage, tickets) {
  const track = makeTrack(stage, turtle([0, 0, 30], [
    [50, 0, 0], [30, 18, 0], [30, -22, -1], [30, 14, 0], [30, -18, 0.8], [30, 22, 0], [30, -14, -0.8], [30, 10, 0], [30, -18, 0], [30, 0, 0], [24, 0, 0],
  ]));
  const k = makeKit(game, stage, tickets, track);
  // track d=0 is 30m into the curve; content below is authored from d=30 onward
  const O = 30;
  const D = (d) => d + O;
  const END = D(316);
  const HALF = 4.6;
  const W = HALF * 2;
  k.walls([[0, HALF, HALF, 3.2], [END + 2, HALF, HALF, 3.2]]);
  k.backstop(0);
  k.backstop(END);
  const log = (d) => k.log(D(d), { w: W });
  const packWall = (d, gap = false) => { for (const x of [-3.6, -1.8, 0, 1.8, 3.6]) if (!(gap && x === 0)) k.pack(x, 0, D(d)); };
  const F = (a, b, o = {}) => k.floor(D(a), D(b), { w: W, ...o });

  F(-30, 36);
  k.tix(0, 0, D(4), 0, 0, D(14), 5);
  log(18);
  k.tix(-2.5, 0, D(21), -2.5, 0, D(26), 3);
  packWall(29);
  k.tixArc(0, 0, D(34.5), 0, D(41.5), 2.2, 5);
  F(40, 64);
  k.tut(D(44), 'mouse');
  k.mouse(0, 0, D(48), { range: 3.4, speed: 4 });
  k.rug(-2.9, 0, D(56)); k.rug(2.9, 0, D(56));
  k.tix(0, 0, D(51), 0, 0, D(60), 5);
  k.dog(-3.6, 0, D(60.5), 'corgi');
  k.tixArc(0, 0, D(62.5), 0, D(70.5), 2.6, 6);
  F(69, 120);
  k.tut(D(76), 'yarn');
  k.yarn(0, 0, D(80), { range: 3.2, speed: 4.4 });
  log(88);
  k.tix(2.5, 0, D(90), 2.5, 0, D(94), 3);
  k.snacks(0, 0, D(97));
  k.cat(2.9, 0, D(108));
  k.tix(-2.6, 0, D(103), -2.6, 0, D(112), 5);
  packWall(114, true);
  k.pill(0, 0, D(118), { range: 2.8 });
  k.tixArc(0, 0, D(119), 0, D(127), 3.6, 7);
  F(126, 160);
  k.sphere(0, 0, D(130));
  k.mouse(0, 0, D(138), { range: 3.4, speed: 5 });
  k.dog(3.6, 0, D(146), 'pug');
  k.rug(0, 0, D(152)); k.rug(-3, 0, D(152));
  k.tix(2.8, 0, D(148), 2.8, 0, D(156), 5);

  // crumbling bridge: don't stop running!
  k.crumble(-1.5, 0, D(161.6), { w: 3.2, d: 2.8 });
  k.crumble(1.0, 0, D(164.6), { w: 3.2, d: 2.8 });
  k.crumble(-0.5, 0, D(167.6), { w: 3.2, d: 2.8 });
  for (const [x, d] of [[-1.5, 161.6], [1, 164.6], [-0.5, 167.6]]) k.tix(x, 0.2, D(d), x, 0.2, D(d), 1);
  F(169.5, 200);
  k.snacks(0, 0, D(173));
  k.yarn(-2.5, 0, D(181), { range: 3.2, speed: 5 });
  k.yarn(2.5, 0, D(189), { range: 3.2, speed: 5 });
  k.tix(0, 0, D(176), 0, 0, D(192), 7);
  log(195);

  // curving plank bridge, then a mushroom launch over the big pit
  k.floor(D(200), D(222), { w: 3, style: 'platform', depth: 1 });
  k.tix(0, 0, D(202), 0, 0, D(218), 7);
  k.mushroom(0, 0, D(220.6), { power: 16 });
  k.tixArc(0, 2, D(221), 0, D(229), 3.5, 7);
  F(228, 262);
  k.dog(-3.6, 0, D(236), 'shiba');
  k.pill(0, 0, D(242), { range: 3 });
  k.stack(-3.6, 0, D(246), 2);
  packWall(250);
  log(256);
  k.tixArc(0, 0, D(261), 0, D(268), 2.6, 6);
  F(267, 316);
  k.mouse(0, 0, D(275), { range: 3.4, speed: 5.5 });
  k.tix(0, 0, D(279), 0, 0, D(296), 8);
  k.packs([[-2.8, D(284)], [2.8, D(288)]]);
  k.trigger(D(302), () => game.session.reachBossGate());

  // decor
  k.banks(4, END, (x, y, d) => {
    const r = Math.random();
    if (r < 0.3) k.post(x, y, d, rand(4, 8));
    else if (r < 0.55) k.yarnPile(x, y, d);
    else k.rock(x, y, d, rand(0.8, 1.6), 0xc0643a, { strata: true });
  }, { every: 5 });
  k.edges(4, END, (x, y, d) => k.rock(x, y, d, rand(0.3, 0.6), 0xb05a30, { strata: true }), { every: 4 });
  k.grass(4, END, { color: 0xc8a050, every: 1.8, size: 0.85 });
  for (let d = D(15); d < END; d += 34) k.bgDog(pick([-1, 1]) * rand(6, 7), 3.2, d, { height: 1.1 });

  const cat = new ChaseCat(stage, track, D(-13));
  stage.add(cat);
  stage.chaseCat = cat;

  return {
    spawn: k.W(0, 0, D(2)),
    facing: track.yaw(D(2)),
    camera: { mode: 'trackFront', track, height: 6.6, dist: 12.5, behind: 0.5 },
    fov: 64,
    chase: cat,
  };
}

export function buildBoss2Arena(game, stage, tickets) {
  const k = makeKit(game, stage, tickets);
  stage.block(-12.5, -6, -12.5, 12.5, 0, 12.5, 'ground');
  stage.block(-17, -6, -17, -12.5, 4, 17, 'ground');
  stage.block(12.5, -6, -17, 17, 4, 17, 'ground');
  stage.block(-12.5, -6, -17, 12.5, 4, -12.5, 'ground');
  stage.block(-12.5, -6, 12.5, 12.5, 4, 17, 'ground');
  for (const [x, z] of [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, -15], [-15, 0], [15, 0]]) k.post(x, 4, -z, rand(5, 9));
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 8], [11, 8]]) k.yarnPile(x, 0, -z);
  for (const [x, z] of [[-11.5, 0], [11.5, -4], [5, -11.5], [-6, -11.5]]) k.rock(x, 0, -z, 0.9, 0xc0643a, { strata: true });
  for (let i = 0; i < 36; i++) {
    const a = rand(0, Math.PI * 2), r = rand(10.5, 12.2);
    k.tuft(Math.cos(a) * r, 0, -Math.sin(a) * r, rand(0.7, 1.0), 0xd8b060);
  }
  k.sphere(-9, 0, -9);
  k.tix(-6, 0, -9, 6, 0, -9, 7);
  return {
    spawn: new THREE.Vector3(0, 0, 8),
    facing: Math.PI,
    camera: { mode: 'arena', center: new THREE.Vector3(0, 0, 0), offset: { x: 0, y: 12, z: 15.5 }, follow: 0.45 },
    spheres: [new THREE.Vector3(9, 0, 9), new THREE.Vector3(-9, 0, -9)],
  };
}
