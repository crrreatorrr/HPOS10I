// Authoring helpers. Levels are written in track coordinates:
//   d = distance along the winding path, x = lateral offset (+ = right), y = height above the path.
import * as THREE from 'three';
import { Backpack, BlueSphere, OneUp, Trampoline, Snacks, Cat, Rug, LintRoller } from '../entities/breakables.js';
import { Broccoli, Squirrel, ConeDrone, Vacuum, Mouse, YarnBall, PillBot } from '../entities/enemies.js';
import { ConedDog, backgroundDog } from '../entities/dogs.js';
import {
  StaticPlatform, MovingPlatform, CrumblePlatform, LilyPad, FlipPlank, CrackedFloor, BouncePad, BoneSwitch, RopeBridge,
  UpdraftFan, SwingHammer, Crusher, CoconutRoller, conveyorStrip, sign, bossGate, logMesh,
} from '../entities/props.js';
import { palm, bush, fern, flowers, tuft, rock, fencePost, scratchPost, yarnPile, pipe, vat, vent, coneStack } from '../world/decor.js';
import { Track, turtle } from '../world/track.js';
import { rand, pick } from '../core/util.js';

export { turtle };

export function makeKit(game, stage, tickets, track = null) {
  const add = (e) => stage.add(e);
  const popup = (id) => () => game.ui.tutorial(id);
  const v = new THREE.Vector3();
  // world position for (x, y, d); y is relative to the path height
  const W = (x, y, d) => (track ? track.toWorld(d, x, y, new THREE.Vector3()) : new THREE.Vector3(x, y, -d));
  const yawAt = (d) => (track ? track.yaw(d) : Math.PI);
  const rightAt = (d) => (track ? track.right(d, new THREE.Vector3()) : new THREE.Vector3(1, 0, 0));
  const fwdAt = (d) => (track ? track.tangent(d, new THREE.Vector3()) : new THREE.Vector3(0, 0, -1));
  // translate authoring options (axis: 'x' lateral / 'z' along the path) into world vectors
  const dirOpts = (d, o = {}) => ({ ...o, dirV: o.axis === 'z' ? fwdAt(d) : rightAt(d) });
  const at = (Cls, x, y, d, o) => { const p = W(x, y, d); const e = new Cls(stage, p.x, p.y, p.z, o); return add(e); };
  const faced = (e, d) => { if (e.obj) e.obj.rotation.y = yawAt(d) + Math.PI; return e; };

  const k = {
    W, yawAt, rightAt, fwdAt, track,
    // ---- path geometry ----
    floor(d0, d1, { x = 0, w = 8.6, y = 0, style = 'ground', depth = 7, conveyor, visible = true, slippery } = {}) {
      return track.ground(d0, d1, { u: x, w, dy: y, style, depth, conveyor, visible, slippery });
    },
    // wall profile keyframes: k.walls([[d, left, right, h], ...])
    walls(keys) { for (const [d, l, r = l, h = 2.6] of keys) track.wall(d, l, r, h); },
    log(d, { h = 0.8, w = 8.6, x = 0 } = {}) {
      track.ground(d, d + 0.9, { u: x, w, dy: h, visible: false });
      logMesh(stage, W(x, 0, d + 0.45), yawAt(d), w);
      tickets && k.tix(x, h + 0.3, d - 0.6, x, h + 0.3, d + 1.5, 2);
    },
    backstop(d) { track.ground(d, d + 1.2, { w: 20, dy: 8, style: 'ground', depth: 9 }); },
    platform(x, y, d, w = 2.4, dd = 2.4, h = 0.5) { return add(new StaticPlatform(stage, ...W(x, y, d).toArray(), { w, d: dd, h, yaw: yawAt(d) })); },
    // ---- breakables ----
    pack(x, y, d, n) { const p = W(x, y, d); return faced(add(new Backpack(stage, p.x, p.y, p.z, { tickets: n })), d); },
    packs(list, y = 0) { list.forEach(([x, d]) => k.pack(x, y, d)); },
    stack(x, y, d, h) { for (let i = 0; i < h; i++) k.pack(x, y + i, d); },
    sphere: (x, y, d) => at(BlueSphere, x, y, d),
    oneUp: (x, y, d) => faced(at(OneUp, x, y, d), d),
    tramp: (x, y, d, o) => at(Trampoline, x, y, d, o),
    snacks: (x, y, d) => faced(at(Snacks, x, y, d), d),
    cat: (x, y, d) => faced(at(Cat, x, y, d), d),
    rug(x, y, d, rot = 0) { const p = W(x, y, d); return add(new Rug(stage, p.x, p.y, p.z, { rot: rot + yawAt(d) })); },
    lint: (x, y, d) => faced(at(LintRoller, x, y, d), d),
    // ---- enemies ----
    broc: (x, y, d, o = {}) => at(Broccoli, x, y, d, dirOpts(d, o)),
    spiky: (x, y, d, o = {}) => at(Broccoli, x, y, d, dirOpts(d, { variant: 'spiky', speed: 1.4, ...o })),
    trooper: (x, y, d, o = {}) => at(Broccoli, x, y, d, dirOpts(d, { variant: 'cone', range: 0, ...o })),
    squirrel: (x, y, d, o = {}) => at(Squirrel, x, y, d, dirOpts(d, o)),
    drone: (x, y, d, o = {}) => at(ConeDrone, x, y, d, dirOpts(d, o)),
    vacuum: (x, y, d, o = {}) => at(Vacuum, x, y, d, dirOpts(d, o)),
    mouse: (x, y, d, o = {}) => at(Mouse, x, y, d, dirOpts(d, o)),
    yarn: (x, y, d, o = {}) => at(YarnBall, x, y, d, dirOpts(d, o)),
    pill: (x, y, d, o = {}) => at(PillBot, x, y, d, dirOpts(d, o)),
    // ---- dogs ----
    dog: (x, y, d, breed) => faced(at(ConedDog, x, y, d, { breed }), d),
    bgDog(x, y, d, o) { const p = W(x, y, d); return backgroundDog(stage, p.x, p.y, p.z, { ...o, yaw: yawAt(d) + Math.PI + rand(-0.4, 0.4) }); },
    // ---- tickets ----
    tix(x0, y0, d0, x1, y1, d1, n) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const p = W(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 0.9, d0 + (d1 - d0) * t);
        tickets.add(p.x, p.y, p.z);
      }
    },
    tixArc(x0, y0, d0, x1, d1, h, n) {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const p = W(x0 + (x1 - x0) * t, y0 + 0.9 + Math.sin(t * Math.PI) * h, d0 + (d1 - d0) * t);
        tickets.add(p.x, p.y, p.z);
      }
    },
    tixRing(x, y, d, r = 1.2, n = 8) {
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const p = W(x + Math.cos(a) * r, y + 0.9 + Math.sin(a) * r, d); tickets.add(p.x, p.y, p.z); }
    },
    // ---- props / interactions ----
    mover(x, y, d, o = {}) { const p = W(x, y, d); const dir = o.axis === 'z' ? fwdAt(d) : o.axis === 'y' ? new THREE.Vector3(0, 1, 0) : rightAt(d); return add(new MovingPlatform(stage, p.x, p.y, p.z, { ...o, dir, yaw: yawAt(d) })); },
    crumble(x, y, d, o = {}) { const p = W(x, y, d); return add(new CrumblePlatform(stage, p.x, p.y, p.z, { ...o, yaw: yawAt(d) })); },
    lily(x, y, d, o) { const p = W(x, y, d); return add(new LilyPad(stage, p.x, p.y, p.z, o)); },
    flip(x, y, d, o = {}) { const p = W(x, y, d); return add(new FlipPlank(stage, p.x, p.y, p.z, { ...o, yaw: yawAt(d) })); },
    cracked(x, y, d, o = {}) { const p = W(x, y, d); return add(new CrackedFloor(stage, p.x, p.y, p.z, { ...o, yaw: yawAt(d) })); },
    mushroom: (x, y, d, o) => at(BouncePad, x, y, d, o),
    fan: (x, y, d, o) => at(UpdraftFan, x, y, d, o),
    hammer(x, y, d, o = {}) { const p = W(x, y, d); return add(new SwingHammer(stage, p.x, p.y, p.z, { ...o, yaw: yawAt(d) + Math.PI / 2 })); },
    crusher(x, y, d, o = {}) { const p = W(x, y, d); return add(new Crusher(stage, p.x, p.y, p.z, { ...o, yaw: yawAt(d) })); },
    coconuts(d, o) { return add(new CoconutRoller(stage, track, d, o)); },
    belt(d0, d1, push, { w = 8.6, x = 0 } = {}) {
      const sp = track.ground(d0, d1, { u: x, w, conveyor: push, style: 'platform' });
      conveyorStrip(stage, track, sp);
      return sp;
    },
    // Bone Switch at (x,y,d) that builds platforms [[x, y, d, w, dd], ...]
    boneSwitch(x, y, d, plats) {
      const list = plats.map(([px, py, pd, w = 2.4, dd = 2.4]) => { const p = W(px, py, pd); return { x: p.x, y: p.y, z: p.z, w, d: dd, yaw: yawAt(pd) }; });
      const p = W(x, y, d);
      return faced(add(new BoneSwitch(stage, p.x, p.y, p.z, list)), d);
    },
    // Drawbridge over [d0, d1]; the rope post stands at (postX, d0 - 1.5)
    ropeBridge(d0, d1, { w = 3.2, x = 0, postX = 3 } = {}) {
      const span = track.ground(d0, d1, { u: x, w, visible: false });
      const p = W(postX, 0, d0 - 1.5);
      return add(new RopeBridge(stage, p.x, p.y, p.z, { span, track, d0, d1, yaw: yawAt(d0) }));
    },
    trigger(d, fn) { track.trigger(d, fn); },
    tut(d, id) { track.trigger(d, popup(id)); },
    sign(x, y, d, lines, o = {}) { const p = W(x, y, d); return sign(stage, p.x, p.y, p.z, lines, { ...o, yaw: yawAt(d) + Math.PI + (o.rot || 0) }); },
    gate(d, label, color) { const p = W(0, 0, d); return bossGate(stage, p.x, p.y, p.z, label, color, yawAt(d) + Math.PI); },
    water(d0, d1, { w = 8.6, y = -1.2, color = 0x3aa8d8 } = {}) {
      track.waterZone(d0, d1, y);
      const pos = [], uv = [], idx = [];
      const segs = Math.ceil((d1 - d0) / 0.5), cols = 12;
      for (let i = 0; i <= segs; i++) {
        const s = d0 + ((d1 - d0) * i) / segs;
        for (let j = 0; j <= cols; j++) {
          const p = W(-w / 2 + (w * j) / cols, y, s);
          pos.push(p.x, p.y, p.z);
          uv.push(j / cols, s);
          if (i && j) { const b = i * (cols + 1) + j, a = b - (cols + 1); idx.push(a - 1, b - 1, b, a - 1, b, a); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, waterMaterial(color, w));
      m.receiveShadow = true;
      stage.scene.add(m);
      stage.add({ pos: m.position, alwaysActive: true, interactive: false, update(dt) { m.material.uniforms.uTime.value += dt; } });
      // dark depths under the surface so the pond reads as deep
      const deep = m.clone();
      deep.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.25), side: THREE.DoubleSide });
      deep.position.y = -2.5;
      stage.scene.add(deep);
    },
    // ---- decor ----
    palm: (x, y, d, h) => { const p = W(x, y, d); palm(stage, p.x, p.y, p.z, h); },
    bush: (x, y, d, s, c) => { const p = W(x, y, d); bush(stage, p.x, p.y, p.z, s, c); },
    fern: (x, y, d, s, c) => { const p = W(x, y, d); fern(stage, p.x, p.y, p.z, s, c); },
    flowers: (x, y, d) => { const p = W(x, y, d); flowers(stage, p.x, p.y, p.z); },
    rock: (x, y, d, s, c, o) => { const p = W(x, y, d); rock(stage, p.x, p.y, p.z, s, c, o); },
    tuft: (x, y, d, s, c) => { const p = W(x, y, d); tuft(stage, p.x, p.y, p.z, s, c); },
    vent: (x, y, d) => { const p = W(x, y, d); vent(stage, p.x, p.y, p.z); },
    // grass along both wall feet and scattered over the banks
    grass(d0, d1, { color = 0x52b844, every = 1.3, bank = true, size = 1 } = {}) {
      for (let d = d0; d < d1; d += every * rand(0.6, 1.4)) {
        const w = track.wallAt(d);
        const g = track.groundAt(d, 0);
        if (!w) continue;
        if (g) {
          const sx = Math.random() < 0.5 ? -1 : 1;
          const half = sx < 0 ? w.left : w.right;
          k.tuft(sx * (half - rand(0.15, 0.5)), g.y - track.heightAt(d), d, size * rand(0.7, 1.1), color);
        }
        if (bank) for (const sx of [-1, 1]) {
          const half = sx < 0 ? w.left : w.right;
          if (Math.random() < 0.7) k.tuft(sx * (half + rand(0.3, 6)), w.h, d + rand(-0.6, 0.6), size * rand(0.8, 1.3), color);
        }
      }
    },
    fence(x, d0, d1, y = 0) { for (let d = d0; d <= d1; d += 1.4) { const p = W(x, y, d); fencePost(stage, p.x, p.y, p.z); } },
    post: (x, y, d, h) => { const p = W(x, y, d); scratchPost(stage, p.x, p.y, p.z, h); },
    yarnPile: (x, y, d) => { const p = W(x, y, d); yarnPile(stage, p.x, p.y, p.z); },
    pipe: (x, y, d, h, c) => { const p = W(x, y, d); pipe(stage, p.x, p.y, p.z, h, c); },
    vat: (x, y, d, s) => { const p = W(x, y, d); vat(stage, p.x, p.y, p.z, s); },
    cones: (x, y, d, n) => { const p = W(x, y, d); coneStack(stage, p.x, p.y, p.z, n); },
    // scatter decor on the banks above the walls
    banks(d0, d1, fn, { every = 5, out = [1.2, 3, 5.5] } = {}) {
      for (let d = d0; d < d1; d += every * rand(0.7, 1.3)) {
        const w = track.wallAt(d);
        if (!w) continue;
        for (const sx of [-1, 1]) {
          const half = sx < 0 ? w.left : w.right;
          fn(sx * (half + pick(out) + rand(-0.4, 0.4)), w.h, d + rand(-1.5, 1.5), sx);
        }
      }
    },
    // path-side foliage at the foot of the walls
    edges(d0, d1, fn, { every = 3.5 } = {}) {
      for (let d = d0; d < d1; d += every * rand(0.6, 1.4)) {
        const w = track.wallAt(d);
        const g = track.groundAt(d, 0);
        if (!w || !g) continue;
        const sx = Math.random() < 0.5 ? -1 : 1;
        const half = sx < 0 ? w.left : w.right;
        fn(sx * (half - 0.35), g.y - track.heightAt(d), d);
      }
    },
  };
  return k;
}

export function makeTrack(stage, points) {
  const t = new Track(points);
  stage.setTrack(t);
  return t;
}

// Cartoon water: deep-to-shallow gradient, drifting caustic contour lines, foam along the banks, gentle swell.
const WATER_VS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec3 p = position;
  p.y += sin(p.x * 0.9 + uTime * 1.4) * 0.035 + sin(p.z * 0.7 - uTime * 1.1) * 0.035;
  vWorld = p;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uWidth;
varying vec2 vUv;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 q = vWorld.xz;
  float edge = min(vUv.x, 1.0 - vUv.x) * uWidth; // metres from the bank
  vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 2.6, edge));
  // caustic contour lines drifting across the surface
  float n = vnoise(q * 0.55 + vec2(uTime * 0.25, uTime * 0.18)) * 0.6 + vnoise(q * 1.3 - vec2(uTime * 0.2, -uTime * 0.31)) * 0.4;
  float lines = smoothstep(0.4, 0.47, abs(fract(n * 3.0) - 0.5));
  col = mix(col, vec3(0.8, 0.96, 1.0), lines * 0.55);
  // sparkles
  float sp = step(0.985, vnoise(q * 6.0 + uTime * 0.7)) * step(0.6, n);
  col += sp * 0.5;
  // foam hugging the banks, wobbling
  float foamEdge = 0.35 + 0.25 * vnoise(q * 2.2 + uTime * 0.6);
  float foam = smoothstep(foamEdge, foamEdge - 0.12, edge);
  col = mix(col, vec3(0.95, 1.0, 1.0), foam * 0.9);
  gl_FragColor = vec4(col, 0.94);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function waterMaterial(color, width) {
  const base = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uDeep: { value: base.clone().multiplyScalar(0.55) },
      uShallow: { value: base.clone().lerp(new THREE.Color(0x9af0e8), 0.55) },
      uWidth: { value: width },
    }]),
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
    transparent: true,
    fog: true,
    side: THREE.DoubleSide,
  });
}
