// Scenery: palms, bushes, ferns, grass, flowers, rocks, scratch posts, yarn, pipes, vats, cone piles.
// Every piece is merged into the stage's single decor mesh (stage.decor). Geometries carry baked per-vertex
// colour multipliers (`color`) and wind weights (`sway`, 0 = rooted); the decor material bends vertices by
// sway so palms, grass and flowers move in the breeze.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, pick } from '../core/util.js';

// ---------- tiny mesh builder ----------
class MB {
  constructor() { this.p = []; this.c = []; this.s = []; this.i = []; }
  v(x, y, z, c = [1, 1, 1], s = 0) { this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]); this.s.push(s); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i);
    g.computeVertexNormals();
    return g;
  }
}

// bake colour multipliers / sway weights onto an existing geometry
function bake(g, colorFn, swayFn = () => 0) {
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), sw = new Float32Array(n);
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const c = colorFn(x, y, z, nrm ? nrm.getY(i) : 0);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    sw[i] = swayFn(x, y, z);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
  return g;
}

let seed = 12345;
const srand = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
const lumpNoise = (x, y, z, s) => Math.sin(x * 2.1 + s) * Math.sin(y * 2.7 + s * 1.7) * Math.sin(z * 2.3 + s * 0.6) + 0.5 * Math.sin(x * 4.3 - s) * Math.sin(z * 3.9 + y * 2.2 + s);

// ---------- geometry generators ----------
// Curved, segmented palm trunk: unit height, bends toward +x by `bend`, bulging rings at each segment top.
function trunkGeo(bend) {
  const mb = new MB();
  const R = 9, SEG = 8, ks = [0, 0.68, 0.9, 1];
  const rings = [];
  for (let sgi = 0; sgi < SEG; sgi++) {
    for (let k = 0; k < ks.length; k++) {
      if (sgi > 0 && k === 0) continue;
      const t = (sgi + ks[k]) / SEG;
      const bulge = [1, 1.02, 1.14, 0.97][k];
      const shade = [0.74, 0.9, 1.06, 0.82][k] * (sgi % 2 ? 0.95 : 1);
      rings.push({ t, r: (0.25 - 0.1 * t + 0.16 * Math.pow(1 - t, 8)) * bulge, shade, warm: sgi % 2 });
    }
  }
  rings.forEach((rg, ri) => {
    const cx = bend * rg.t * rg.t + Math.sin(rg.t * Math.PI) * bend * 0.12;
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const c = rg.warm ? [rg.shade, rg.shade * 0.95, rg.shade * 0.88] : [rg.shade, rg.shade, rg.shade];
      mb.v(cx + Math.cos(a) * rg.r, rg.t, Math.sin(a) * rg.r, c, rg.t * rg.t * 0.35);
      if (ri > 0 && j > 0) {
        const b = ri * (R + 1) + j, p = b - (R + 1);
        mb.quad(p - 1, b - 1, b, p);
      }
    }
  });
  return mb.build();
}

// Leaf with a rib and serrated leaflets (palm fronds and fern fronds), along +x, length 1.
function leafGeo({ N = 16, arch = 0.2, droop = 0.45, width = 0.2, base = 0.08, back = 0.35, fold = 0.35, tipColor = [1.08, 1.1, 0.8], sway = 1.5 }) {
  const mb = new MB();
  const rib = (t) => [t, arch * Math.sin(t * Math.PI * 0.85) - droop * t * t];
  const ribW = 0.012;
  let prevL = -1, prevR = -1;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y] = rib(t);
    const sw = Math.pow(t, 1.5) * sway;
    const c = [0.95, 0.9, 0.55];
    const l = mb.v(x, y + 0.006, -ribW, c, sw), r = mb.v(x, y + 0.006, ribW, c, sw);
    if (prevL >= 0) mb.quad(prevL, l, r, prevR);
    prevL = l; prevR = r;
    if (i === 0 || i === N) continue;
    const w = base + width * Math.pow(Math.sin(t * Math.PI), 0.8);
    const [x2, y2] = rib(Math.min(1, t + 0.7 / N));
    const k = 0.72 + 0.3 * t;
    const cb = [k * 0.8, k * 0.85, k * 0.8];
    const ct = [k * (1 + (tipColor[0] - 1) * t), k * (1 + (tipColor[1] - 1) * t), k * (1 + (tipColor[2] - 1) * t)];
    for (const side of [-1, 1]) {
      const a = mb.v(x, y, side * ribW, cb, sw);
      const b = mb.v(x2, y2, side * ribW, cb, sw);
      const tip = mb.v(x - back * w, y - fold * w, side * w, ct, sw + 0.25 * t);
      if (side > 0) mb.tri(a, b, tip); else mb.tri(a, tip, b);
    }
  }
  return mb.build();
}

// Clump of grass blades (unit height).
function tuftGeo(blades = 8) {
  const mb = new MB();
  for (let b = 0; b < blades; b++) {
    const a = srand(0, Math.PI * 2), lean = srand(0.15, 0.55), h = srand(0.55, 1), w = srand(0.035, 0.055);
    const ox = Math.cos(a) * srand(0, 0.12), oz = Math.sin(a) * srand(0, 0.12);
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    let prev = null;
    const S = 3;
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      const x = ox + dx * lean * t * t * h, z = oz + dz * lean * t * t * h, y = h * t;
      const ww = w * (1 - t);
      const k = 0.62 + 0.5 * t;
      const c = [k * 0.95, k, k * 0.9];
      const sw = Math.pow(t, 1.4) * 1.1 * h;
      if (i === S) { mb.tri(prev[0], prev[1], mb.v(x, y, z, c, sw)); break; }
      const l = mb.v(x - px * ww, y, z - pz * ww, c, sw), r = mb.v(x + px * ww, y, z + pz * ww, c, sw);
      if (prev) mb.quad(prev[0], l, r, prev[1]);
      prev = [l, r];
    }
  }
  return mb.build();
}

// Five-petal flower head (white, tinted by decor colour) on the origin.
function petalsGeo() {
  const mb = new MB();
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const c0 = mb.v(dx * 0.03, 0, dz * 0.03, [0.85, 0.85, 0.85], 0.8);
    const l = mb.v(dx * 0.1 + px * 0.06, 0.02, dz * 0.1 + pz * 0.06, [1, 1, 1], 0.8);
    const t = mb.v(dx * 0.18, 0.05, dz * 0.18, [1.05, 1.05, 1.05], 0.85);
    const r = mb.v(dx * 0.1 - px * 0.06, 0.02, dz * 0.1 - pz * 0.06, [1, 1, 1], 0.8);
    mb.quad(c0, l, t, r);
  }
  return mb.build();
}

// Lumpy rounded blob (bush lobes). Smooth normals, flattened underside.
function lumpGeo(s) {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.16 * lumpNoise(x, y, z, s);
    p.setXYZ(i, x * k, Math.max(-0.4, y * k), z * k);
  }
  g.computeVertexNormals();
  return bake(g, (x, y) => { const k = 0.55 + 0.5 * Math.min(1, (y + 0.4) / 1.4); return [k, k, k * 0.95]; }, (x, y) => Math.max(0, y + 0.4) * 0.12);
}

// Faceted rock: displaced icosahedron, flat-shaded, sits on y = 0.
function rockGeo(s) {
  let g = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const sx = srand(0.85, 1.2), sz = srand(0.85, 1.2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * lumpNoise(x * 1.3, y * 1.3, z * 1.3, s);
    p.setXYZ(i, x * k * sx, Math.max(-0.25, y * k * 0.8) + 0.25, z * k * sz);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return bake(g, (x, y) => { const k = 0.72 + 0.3 * Math.min(1, y / 1.2); return [k, k, k]; });
}

// Elizabethan dog cone (the "cone of shame"): open frustum + rolled rim.
function dogConeGeo() {
  const body = new THREE.CylinderGeometry(0.6, 0.24, 0.5, 16, 1, true);
  const rim = new THREE.TorusGeometry(0.6, 0.04, 5, 20);
  rim.rotateX(Math.PI / 2); rim.translate(0, 0.25, 0);
  const lip = new THREE.TorusGeometry(0.24, 0.035, 5, 14);
  lip.rotateX(Math.PI / 2); lip.translate(0, -0.25, 0);
  const parts = [body, rim, lip].map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); });
  const g = mergeGeoms(parts);
  return bake(g, (x, y) => { const k = 0.82 + 0.3 * (y + 0.25); return [k, k, k]; });
}

function mergeGeoms(list) {
  const pos = [], nrm = [];
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

const G = {};
function geos() {
  if (G.ready) return G;
  seed = 12345;
  Object.assign(G, {
    ready: true,
    trunks: [0.3, 0.55, 0.8, 1.05].map(trunkGeo),
    frond: leafGeo({ N: 16, arch: 0.2, droop: 0.45, width: 0.2, base: 0.06, back: 0.35, fold: 0.32 }),
    fernFrond: leafGeo({ N: 12, arch: 0.42, droop: 0.42, width: 0.13, base: 0.04, back: 0.12, fold: 0.18, tipColor: [1.02, 1.1, 0.9], sway: 0.6 }),
    tufts: [tuftGeo(7), tuftGeo(9), tuftGeo(6)],
    petals: petalsGeo(),
    lumps: [1.3, 4.2, 7.7, 9.1].map(lumpGeo),
    rocks: [0.4, 2.2, 3.9, 5.5, 8.8].map(rockGeo),
    leafCard: leafGeo({ N: 3, arch: 0.05, droop: 0.1, width: 0.28, base: 0.1, back: 0.05, fold: 0.1, sway: 0.2 }),
    sphere: new THREE.SphereGeometry(1, 10, 7),
    ball: new THREE.SphereGeometry(1, 16, 11),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    cylLo: new THREE.CylinderGeometry(1, 1, 1, 8),
    stem: new THREE.CylinderGeometry(0.018, 0.026, 1, 4, 1, true),
    box: new THREE.BoxGeometry(1, 1, 1),
    torus: new THREE.TorusGeometry(1, 0.25, 6, 18),
    wrap: new THREE.TorusGeometry(1.0, 0.055, 4, 28),
    flange: new THREE.CylinderGeometry(1, 1, 1, 14),
    elbow: new THREE.TorusGeometry(0.55, 0.4, 10, 10, Math.PI / 2).rotateZ(Math.PI / 2),
    dogCone: dogConeGeo(),
  });
  // stems sway more toward the top (the flower head shares the top weight)
  bake(G.stem, () => [0.8, 1, 0.75], (x, y) => (y + 0.5) * 0.8);
  return G;
}

// Rotate a local (x, z) offset by yaw and add to the origin.
function place(ox, oy, oz, yaw, lx, ly, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return new THREE.Vector3(ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c);
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- jungle ----------
export function palm(stage, x, y, z, h = 5) {
  const g = geos();
  const yaw = rand(0, Math.PI * 2);
  const ti = Math.floor(rand(0, g.trunks.length));
  const bend = [0.3, 0.55, 0.8, 1.05][ti];
  stage.decor(g.trunks[ti], pick([0x9a6a36, 0x8a5c2e, 0xa47240]), V(x, y, z), { y: yaw }, V(1, h, 1));
  const top = place(x, y + h, z, yaw, bend, 0, 0);
  // crown: lower drooping fronds, then an upper layer reaching out and up
  const n = 9;
  const tint = pick([0x3fae3c, 0x46b842, 0x38a040]);
  for (let i = 0; i < n; i++) {
    const upper = i >= 5;
    const a = (i / (upper ? 4 : 5)) * Math.PI * 2 + (upper ? 0.6 : 0) + rand(-0.2, 0.2);
    const pitch = upper ? rand(0.25, 0.5) : rand(-0.25, 0.05);
    const len = (upper ? rand(2.2, 2.6) : rand(2.7, 3.2)) * (h / 6 * 0.35 + 0.75);
    const c = new THREE.Color(tint).offsetHSL(rand(-0.015, 0.015), 0, upper ? 0.04 : -0.03);
    stage.decor(g.frond, c.getHex(), top, new THREE.Euler(rand(-0.25, 0.25), a, pitch, 'YXZ'), len);
  }
  // coconut cluster tucked under the crown
  for (let i = 0; i < 3; i++) {
    const a = rand(0, Math.PI * 2);
    stage.decor(g.sphere, 0x6a4418, V(top.x + Math.cos(a) * 0.2, top.y - 0.22 - rand(0, 0.1), top.z + Math.sin(a) * 0.2), null, 0.17);
  }
  stage.decor(g.sphere, 0x7a5a28, V(top.x, top.y - 0.05, top.z), null, V(0.24, 0.16, 0.24));
}

export function bush(stage, x, y, z, s = 1, color = 0x3fa03a) {
  const g = geos();
  const c = new THREE.Color(color);
  const n = 4 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const cc = c.clone().offsetHSL(rand(-0.025, 0.025), rand(-0.05, 0.05), rand(-0.07, 0.05));
    const r = big ? 0.75 : rand(0.45, 0.65);
    const a = rand(0, Math.PI * 2), d = big ? 0 : rand(0.35, 0.7);
    stage.decor(pick(g.lumps), cc.getHex(), V(x + Math.cos(a) * d * s, y + (big ? 0.3 : 0.2) * s, z + Math.sin(a) * d * s), { y: rand(0, 6) }, V(r * s * rand(0.9, 1.1), r * s * rand(0.8, 1.0), r * s * rand(0.9, 1.1)));
  }
  // leaf cards poking out of the canopy for texture
  const leafC = c.clone().offsetHSL(0.02, 0.05, 0.08).getHex();
  for (let i = 0; i < 7; i++) {
    const a = rand(0, Math.PI * 2);
    stage.decor(g.leafCard, leafC, V(x + Math.cos(a) * 0.55 * s, y + rand(0.5, 0.95) * s, z + Math.sin(a) * 0.55 * s), new THREE.Euler(0, -a, rand(-0.2, 0.5), 'YXZ'), 0.55 * s);
  }
  if (Math.random() < 0.6) {
    const berry = pick([0xff5a8a, 0xffd23f, 0xffffff, 0xff8a3a, 0xc06aff]);
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      stage.decor(g.petals, berry, V(x + Math.cos(a) * 0.5 * s, y + rand(0.75, 1.0) * s, z + Math.sin(a) * 0.5 * s), { x: rand(-0.4, 0.4), y: rand(0, 6) }, 1.1, { sway: 0.15 });
    }
  }
}

export function fern(stage, x, y, z, s = 1, color = 0x46b84a) {
  const g = geos();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
    const c = new THREE.Color(color).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05));
    stage.decor(g.fernFrond, c.getHex(), V(x, y + 0.05, z), new THREE.Euler(0, a, rand(0.1, 0.45), 'YXZ'), s * rand(0.85, 1.15));
  }
}

export function tuft(stage, x, y, z, s = 1, color = 0x52b844) {
  const c = new THREE.Color(color).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.06, 0.04));
  stage.decor(pick(geos().tufts), c.getHex(), V(x, y, z), { y: rand(0, 6) }, V(s, s * rand(0.8, 1.2), s));
}

export function flowers(stage, x, y, z) {
  const g = geos();
  const col = pick([0xff5a8a, 0xffd23f, 0xffffff, 0xb07aff, 0xff8a3a]);
  tuft(stage, x, y, z, 0.45);
  for (let i = 0; i < 4; i++) {
    const fx = x + rand(-0.5, 0.5), fz = z + rand(-0.5, 0.5), h = rand(0.35, 0.6);
    stage.decor(g.stem, 0x3aa83a, V(fx, y + h / 2, fz), null, V(1, h, 1), { sway: h });
    stage.decor(g.petals, Math.random() < 0.7 ? col : pick([0xff5a8a, 0xffd23f, 0xffffff]), V(fx, y + h, fz), { x: rand(-0.25, 0.25), y: rand(0, 6) }, 1.25, { sway: h });
    stage.decor(g.sphere, 0xffc020, V(fx, y + h + 0.03, fz), null, V(0.045, 0.03, 0.045), { sway: h * 0.85 });
  }
}

// paint: optional per-vertex recolour (moss on top for jungle, strata bands for the canyon)
const MOSS = new THREE.Color(0x5aa83a);
export function rock(stage, x, y, z, s = 1, color = 0x8a8a7a, { moss = false, strata = false } = {}) {
  const c = new THREE.Color(color).offsetHSL(0, 0, rand(-0.05, 0.05));
  const band = new THREE.Color(color).offsetHSL(0.01, 0.05, 0.1);
  const paint = moss ? (px, py, pz, ny, out) => { if (ny > 0.55) out.lerp(MOSS, 0.75); }
    : strata ? (px, py, pz, ny, out) => { if (Math.sin(py * 7) > 0.35) out.lerp(band, 0.6); } : null;
  stage.decor(pick(geos().rocks), c.getHex(), V(x, y - 0.08 * s, z), { y: rand(0, 6) }, V(s, s * rand(0.65, 0.9), s), { paint });
}

export function fencePost(stage, x, y, z) {
  stage.decor(geos().box, 0xc89058, V(x, y + 0.55, z), null, V(0.14, 1.1, 0.14));
}

// ---------- cat canyon ----------
export function scratchPost(stage, x, y, z, h = 6) {
  const g = geos();
  stage.decor(g.box, 0xd8b890, V(x, y + 0.1, z), null, V(1.6, 0.2, 1.6));
  stage.decor(g.cyl, 0xc9a26b, V(x, y + h / 2, z), null, V(0.6, h, 0.6));
  for (let i = 0; i < h / 0.32; i++) {
    stage.decor(g.torus, i % 2 ? 0xb08a50 : 0xc49a5c, V(x, y + 0.35 + i * 0.32, z), { x: Math.PI / 2, z: rand(-0.04, 0.04) }, V(0.64, 0.64, 0.5));
  }
  const top = pick([0xe8467a, 0x46a8e8, 0x8a5ae8]);
  stage.decor(g.box, top, V(x, y + h + 0.12, z), null, V(2, 0.26, 2));
  stage.decor(g.sphere, new THREE.Color(top).offsetHSL(0, 0, 0.1).getHex(), V(x, y + h + 0.32, z), null, V(0.9, 0.22, 0.9));
  // dangling toy on a string
  const yaw = rand(0, Math.PI * 2);
  const p = place(x, y + h, z, yaw, 0.95, 0, 0);
  stage.decor(g.box, 0xf0f0f0, V(p.x, p.y - 0.55, p.z), null, V(0.025, 1.1, 0.025), { sway: 0.3 });
  stage.decor(g.ball, pick([0xffd23f, 0xff5a8a, 0x7ad04a]), V(p.x, p.y - 1.2, p.z), null, 0.16, { sway: 0.35 });
}

export function yarnPile(stage, x, y, z) {
  const g = geos();
  const cols = [0xe8467a, 0x46a8e8, 0xffd23f, 0x7ad04a, 0xb07aff];
  for (let i = 0; i < 3; i++) {
    const r = rand(0.38, 0.52);
    const col = pick(cols);
    const p = V(x + rand(-0.7, 0.7), y + r * 0.92, z + rand(-0.7, 0.7));
    stage.decor(g.ball, col, p, null, r);
    const dark = new THREE.Color(col).offsetHSL(0, 0, -0.1).getHex();
    for (let w = 0; w < 4; w++) stage.decor(g.wrap, dark, p, { x: rand(0, Math.PI), y: rand(0, Math.PI), z: rand(0, Math.PI) }, r * 1.01);
  }
}

// ---------- cone factory ----------
export function coneStack(stage, x, y, z, n = 3) {
  const g = geos();
  const yaw = rand(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    stage.decor(g.dogCone, i % 2 ? 0xe6e0ff : 0xcfc2fa, V(x + rand(-0.03, 0.03), y + 0.25 + i * 0.15, z + rand(-0.03, 0.03)), { x: rand(-0.06, 0.06), y: yaw, z: rand(-0.06, 0.06) });
  }
  // one that rolled off the pile
  if (n > 1 && Math.random() < 0.6) {
    const p = place(x, y, z, yaw, 0.95, 0, 0.2);
    stage.decor(g.dogCone, 0xdcd4ff, V(p.x, y + 0.42, p.z), new THREE.Euler(0, yaw + rand(-0.6, 0.6), Math.PI / 2 - 0.35, 'YXZ'));
  }
}

// Factory pipe: flanged riser, elbow, and a vent that puffs steam now and then.
export function pipe(stage, x, y, z, h, color = 0x7a5aa0) {
  const g = geos();
  const yaw = rand(0, Math.PI * 2);
  const dark = new THREE.Color(color).offsetHSL(0, -0.05, -0.12).getHex();
  stage.decor(g.cyl, color, V(x, y + h / 2, z), { y: yaw }, V(0.4, h, 0.4));
  for (let fy = 0.3; fy < h; fy += 2.2) stage.decor(g.flange, dark, V(x, y + fy, z), null, V(0.52, 0.16, 0.52));
  stage.decor(g.cyl, 0xffd23f, V(x, y + h * 0.62, z), null, V(0.45, 0.28, 0.45));
  // elbow and horizontal outlet
  stage.decor(g.elbow, color, place(x, y + h, z, yaw, 0.55, 0, 0), { y: yaw });
  const out = place(x, y + h + 0.55, z, yaw, 0.9, 0, 0);
  stage.decor(g.cyl, color, out, new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'), V(0.4, 0.7, 0.4));
  const mouth = place(x, y + h + 0.55, z, yaw, 1.27, 0, 0);
  stage.decor(g.flange, dark, mouth, new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'), V(0.5, 0.12, 0.5));
  if (Math.random() < 0.45) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const m2 = place(x, y + h + 0.55, z, yaw, 1.4, 0, 0);
    stage.emitter(m2.x, m2.y, m2.z, 'steam', { every: rand(0.18, 0.3), windX: c * 1.6, windZ: -s * 1.6, burst: rand(2.5, 4.5) });
  }
}

export function vat(stage, x, y, z, s = 1.6) {
  const g = geos();
  const body = 0x5a4a70;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    stage.decor(g.cylLo, 0x3a2e4a, V(x + Math.cos(a) * s * 0.75, y + 0.2, z + Math.sin(a) * s * 0.75), null, V(0.14, 0.4, 0.14));
  }
  stage.decor(g.cyl, body, V(x, y + 0.4 + s * 0.55, z), null, V(s, s * 1.1, s));
  for (const k of [0.15, 0.85]) stage.decor(g.torus, 0x8a7aa8, V(x, y + 0.4 + s * 1.1 * k, z), { x: Math.PI / 2 }, V(s * 1.02, s * 1.02, s * 0.3));
  stage.decor(g.torus, 0x9a8ab8, V(x, y + 0.4 + s * 1.1, z), { x: Math.PI / 2 }, V(s, s, s * 0.35));
  stage.decor(g.cyl, 0x7aff6a, V(x, y + 0.35 + s * 1.08, z), null, V(s * 0.94, 0.05, s * 0.94));
  stage.emitter(x, y + 0.45 + s * 1.1, z, 'bubble', { every: 0.22, r: s * 0.75 });
  if (Math.random() < 0.5) stage.emitter(x, y + 0.5 + s * 1.1, z, 'steam', { every: 0.5, color: 0xd8ffd0, alpha: 0.35, size: 0.45 });
}

// Floor vent grate that breathes steam (factory banks).
export function vent(stage, x, y, z) {
  const g = geos();
  stage.decor(g.box, 0x3a2e4a, V(x, y + 0.04, z), null, V(1.1, 0.08, 1.1));
  for (let i = -2; i <= 2; i++) stage.decor(g.box, 0x8a7aa8, V(x + i * 0.2, y + 0.1, z), null, V(0.06, 0.06, 0.95));
  stage.emitter(x, y + 0.15, z, 'steam', { every: 0.16, burst: rand(2, 3.5), up: 3.2, size: 0.4 });
}
