import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const dampAngle = (a, b, lambda, dt) => angleLerp(a, b, 1 - Math.exp(-lambda * dt));

// Axis-aligned box helpers. Boxes are { min: {x,y,z}, max: {x,y,z} }.
export function boxFromCenter(x, y, z, w, h, d) {
  return { min: { x: x - w / 2, y: y, z: z - d / 2 }, max: { x: x + w / 2, y: y + h, z: z + d / 2 } };
}
export function overlaps(a, b) {
  return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z;
}
export function sphereBox(cx, cy, cz, r, b) {
  const x = clamp(cx, b.min.x, b.max.x), y = clamp(cy, b.min.y, b.max.y), z = clamp(cz, b.min.z, b.max.z);
  const dx = cx - x, dy = cy - y, dz = cz - z;
  return dx * dx + dy * dy + dz * dz < r * r;
}

// Shared materials cache so primitives reuse GPU state.
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = new THREE.MeshLambertMaterial({ color, ...opts });
    matCache.set(key, m);
  }
  return matCache.get(key);
}
export function basic(color, opts = {}) {
  const key = 'b' + color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
  return matCache.get(key);
}

// Shared geometry cache.
const geoCache = new Map();
export function geo(kind, ...args) {
  const key = kind + args.join(',');
  if (!geoCache.has(key)) {
    const G = {
      box: THREE.BoxGeometry, sphere: THREE.SphereGeometry, cyl: THREE.CylinderGeometry, cone: THREE.ConeGeometry,
      torus: THREE.TorusGeometry, plane: THREE.PlaneGeometry, circle: THREE.CircleGeometry, ring: THREE.RingGeometry,
      ico: THREE.IcosahedronGeometry, capsule: THREE.CapsuleGeometry, dodeca: THREE.DodecahedronGeometry,
    }[kind];
    geoCache.set(key, new G(...args));
  }
  return geoCache.get(key);
}

export function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

// Simple canvas texture helper
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export class Timer {
  constructor() { this.list = []; }
  after(sec, fn) { this.list.push({ t: sec, fn }); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t -= dt;
      if (it.t <= 0) { this.list.splice(i, 1); it.fn(); }
    }
  }
  clear() { this.list.length = 0; }
}
