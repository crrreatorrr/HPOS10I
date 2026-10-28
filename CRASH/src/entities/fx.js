// Visual effects: pooled instanced particles, blob shadows, text sprites.
import * as THREE from 'three';
import { rand, pick, canvasTex } from '../core/util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

class Pool {
  constructor(scene, geometry, material, size) {
    this.mesh = new THREE.InstancedMesh(geometry, material, size);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.size = size;
    this.items = [];
    // ensure instanceColor exists
    for (let i = 0; i < size; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    scene.add(this.mesh);
  }
  spawn(p) {
    if (this.items.length >= this.size) this.items.shift();
    this.items.push(p);
  }
  update(dt, camera, mode) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.vy -= (p.g ?? 18) * dt;
      p.vx *= p.drag ?? 1; p.vz *= p.drag ?? 1;
      if (p.drag) p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += p.sx * dt; p.ry += p.sy * dt;
    }
    for (const p of this.items) {
      const t = p.life / p.max;
      let sc = p.size;
      if (mode === 'puff') sc = p.size * (1.4 - t * 0.6) * Math.min(1, t * 3);
      else if (mode === 'spark') sc = p.size * t;
      else sc = p.size * Math.min(1, t * 4);
      _p.set(p.x, p.y, p.z);
      if (mode === 'spark') _q.copy(camera.quaternion);
      else _q.setFromEuler(_e.set(p.rx, p.ry, 0));
      _s.set(sc, sc * (p.flat ? 0.15 : 1), sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.set(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.debris = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 260);
    this.puffs = new Pool(scene, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, flatShading: true }), 160);
    this.confetti = new Pool(scene, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 320);
    this.sparks = new Pool(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), 220);
  }

  update(dt) {
    this.debris.update(dt, this.camera, 'solid');
    this.puffs.update(dt, this.camera, 'puff');
    this.confetti.update(dt, this.camera, 'solid');
    this.sparks.update(dt, this.camera, 'spark');
  }

  clear() { this.debris.clear(); this.puffs.clear(); this.confetti.clear(); this.sparks.clear(); }

  burst(x, y, z, { count = 12, colors = [0x222222], speed = 6, size = 0.18, up = 6, life = 1.0, floor } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * speed;
      this.debris.spawn({
        x: x + rand(-0.2, 0.2), y: y + rand(0, 0.4), z: z + rand(-0.2, 0.2),
        vx: Math.cos(a) * s, vy: rand(0.4, 1) * up + 2, vz: Math.sin(a) * s,
        rx: rand(0, 6), ry: rand(0, 6), sx: rand(-12, 12), sy: rand(-12, 12),
        size: size * rand(0.6, 1.4), color: pick(colors), life: life * rand(0.7, 1.2), max: life * 1.2,
        g: 22, floor: floor ?? y - 0.05,
      });
    }
  }

  puff(x, y, z, { count = 8, color = 0xffffff, size = 0.5, speed = 2, life = 0.7, up = 1.5 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      this.puffs.spawn({
        x: x + rand(-0.3, 0.3), y: y + rand(0, 0.5), z: z + rand(-0.3, 0.3),
        vx: Math.cos(a) * speed * rand(0.4, 1), vy: up * rand(0.5, 1.2), vz: Math.sin(a) * speed * rand(0.4, 1),
        rx: rand(0, 6), ry: rand(0, 6), sx: rand(-2, 2), sy: rand(-2, 2),
        size: size * rand(0.7, 1.3), color, life: life * rand(0.7, 1.1), max: life * 1.1, g: -0.5, drag: 0.96,
      });
    }
  }

  confettiBurst(x, y, z, count = 40) {
    const colors = [0xff4f6d, 0xffd23f, 0x4fd1ff, 0x7dff8a, 0xc77dff, 0xff9f40];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(1.5, 5);
      this.confetti.spawn({
        x, y, z, vx: Math.cos(a) * s, vy: rand(6, 11), vz: Math.sin(a) * s,
        rx: rand(0, 6), ry: rand(0, 6), sx: rand(-14, 14), sy: rand(-14, 14),
        size: rand(0.12, 0.2), color: pick(colors), life: rand(1.6, 2.6), max: 2.6, g: 9, drag: 0.985,
      });
    }
  }

  sparkle(x, y, z, { count = 10, color = 0xffe680, size = 0.5, speed = 3, life = 0.6, up = 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      this.sparks.spawn({
        x, y, z, vx: Math.cos(a) * speed * rand(0.3, 1), vy: up * rand(0.2, 1.4), vz: Math.sin(a) * speed * rand(0.3, 1),
        rx: 0, ry: 0, sx: 0, sy: 0, size: size * rand(0.6, 1.2), color, life: life * rand(0.6, 1.1), max: life, g: 2, drag: 0.95,
      });
    }
  }

  ring(x, y, z, { color = 0xffffff, radius = 2.5, count = 18, size = 0.45 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.puffs.spawn({
        x: x + Math.cos(a) * 0.4, y: y + 0.15, z: z + Math.sin(a) * 0.4,
        vx: Math.cos(a) * radius * 2.6, vy: 0.5, vz: Math.sin(a) * radius * 2.6,
        rx: 0, ry: 0, sx: 0, sy: 0, size, color, life: 0.45, max: 0.45, g: 0, drag: 0.9,
      });
    }
  }
}

let _spark;
function sparkTexture() {
  if (_spark) return _spark;
  _spark = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(30, 2, 4, 60); g.fillRect(2, 30, 60, 4);
  });
  return _spark;
}

// ---------- Blob shadow ----------
let _shadowTex;
function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  _shadowTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.65)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.45)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  return _shadowTex;
}
const shadowGeo = new THREE.PlaneGeometry(1, 1);
shadowGeo.rotateX(-Math.PI / 2);
shadowGeo.userData.shared = true;

export function makeShadow(size = 1) {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.scale.set(size, 1, size);
  m.renderOrder = 1;
  m.userData.base = size;
  return m;
}

// Place a shadow on the ground under (x, y, z).
export function placeShadow(shadow, world, x, y, z) {
  const gy = world.groundBelow(x, y + 0.1, z);
  if (gy === -Infinity) { shadow.visible = false; return; }
  shadow.visible = true;
  shadow.position.set(x, gy + 0.03, z);
  const h = Math.max(0, y - gy);
  const k = Math.max(0.35, 1 - h * 0.08);
  const b = shadow.userData.base;
  shadow.scale.set(b * k, 1, b * k);
  shadow.material.opacity = Math.max(0.3, 1 - h * 0.06);
}

// ---------- Text sprite (countdowns, labels) ----------
const textCache = new Map();
export function textTexture(text, { color = '#ffd23f', stroke = '#1a0a24', size = 128, font = 'Luckiest Guy, Arial Black, sans-serif', w = 128, h = 128 } = {}) {
  const key = [text, color, stroke, size, w, h].join('|');
  if (textCache.has(key)) return textCache.get(key);
  const t = canvasTex(w, h, (g) => {
    g.font = `${size * 0.8}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = size * 0.12;
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.strokeText(text, w / 2, h / 2 + size * 0.04);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + size * 0.04);
  });
  textCache.set(key, t);
  return t;
}

export function textSprite(text, opts = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(text, opts), depthTest: false, transparent: true }));
  s.renderOrder = 20;
  return s;
}
