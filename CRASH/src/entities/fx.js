// Visual effects: pooled instanced particles, blob shadows, text sprites.
//   smoke   camera-facing cartoon cloud cards that pop out, drift, and dissolve (puffs, dust, steam, fire)
//   glow    additive flashes (billboards) and shockwave/ripple rings (flat on the ground)
//   debris  tumbling chunks; confetti; sparks
import * as THREE from 'three';
import { rand, pick, canvasTex } from '../core/util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _dir = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// frame-rate independent drag (values were tuned per 60 fps frame)
const dragK = (d, dt) => Math.pow(d, dt * 60);

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
  step(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.vy -= (p.g ?? 18) * dt;
      if (p.drag) { const k = dragK(p.drag, dt); p.vx *= k; p.vz *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += p.sx * dt; p.ry += p.sy * dt;
    }
  }
  update(dt, camera, mode) {
    this.step(dt);
    let n = 0;
    for (const p of this.items) {
      if (p.delay > 0) continue;
      const t = p.life / p.max;
      let sc = p.size;
      if (mode === 'spark') sc = p.size * t;
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

// ---------- cartoon smoke ----------
const SMOKE_VS = /* glsl */ `
attribute vec3 aData; // x: dissolve threshold, y: atlas cell, z: opacity
varying vec2 vUv;
varying vec3 vData;
varying vec3 vTint;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vData = aData;
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#else
  vTint = vec3(1.0);
#endif
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SMOKE_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 shadeLow;
varying vec2 vUv;
varying vec3 vData;
varying vec3 vTint;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 cell = vec2(mod(vData.y, 2.0), floor(vData.y / 2.0));
  vec4 t = texture2D(map, (vUv + cell) * 0.5);
  // the green channel holds dissolve noise: the puff erodes from its edges as the threshold rises
  float a = t.a * smoothstep(vData.x, vData.x + 0.12, t.g) * vData.z;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vTint * mix(shadeLow, vec3(1.0), t.r), a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

class SmokePool {
  constructor(scene, size) {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.data = new Float32Array(size * 3);
    this.attr = new THREE.InstancedBufferAttribute(this.data, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aData', this.attr);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, shadeLow: { value: new THREE.Color(0x9c95b8) } }]),
      vertexShader: SMOKE_VS,
      fragmentShader: SMOKE_FS,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.map.value = smokeTexture();
    this.mesh = new THREE.InstancedMesh(geo, mat, size);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < size; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    scene.add(this.mesh);
    this.size = size;
    this.items = [];
    this.live = [];
  }
  spawn(p) {
    if (this.items.length >= this.size) this.items.shift();
    this.items.push(p);
  }
  update(dt, camera) {
    const live = this.live;
    live.length = 0;
    camera.getWorldDirection(_dir);
    const cp = camera.position;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      const k = dragK(p.drag, dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      p.depth = (p.x - cp.x) * _dir.x + (p.y - cp.y) * _dir.y + (p.z - cp.z) * _dir.z;
      live.push(p);
    }
    // back to front so the soft edges blend correctly
    live.sort((a, b) => b.depth - a.depth);
    let n = 0;
    for (const p of live) {
      const a = 1 - p.life / p.max; // age 0..1
      const pop = 1 - Math.pow(1 - Math.min(1, a / 0.16), 3);
      const sc = p.size * (0.3 + 0.7 * pop) * (1 + a * p.grow);
      _qz.setFromAxisAngle(Z_AXIS, p.rot);
      _q.copy(camera.quaternion).multiply(_qz);
      _p.set(p.x, p.y, p.z);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      colorAt(p.colors, a, _c);
      this.mesh.setColorAt(n, _c);
      this.data[n * 3] = a < p.fadeAt ? -0.15 : -0.15 + ((a - p.fadeAt) / (1 - p.fadeAt)) * 1.2;
      this.data[n * 3 + 1] = p.cell;
      this.data[n * 3 + 2] = p.alpha;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.attr.needsUpdate = true;
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}

// colour over life: a list of hex stops spread evenly over the first ~70% of the particle's life
function colorAt(stops, a, out) {
  if (stops.length === 1) return out.set(stops[0]);
  const f = Math.min(1, a / 0.7) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  return out.set(stops[i]).lerp(_c2.set(stops[i + 1]), f - i);
}

// ---------- additive glow: flashes (billboards) and rings (flat) ----------
class GlowPool {
  constructor(scene, texture, size, flat) {
    this.flat = flat;
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), mat, size);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    for (let i = 0; i < size; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    scene.add(this.mesh);
    this.size = size;
    this.items = [];
  }
  spawn(p) {
    if (this.items.length >= this.size) this.items.shift();
    this.items.push(p);
  }
  update(dt, camera) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      const a = 1 - p.life / p.max;
      const e = 1 - Math.pow(1 - a, 3);
      const sc = p.s0 + (p.s1 - p.s0) * e;
      p.rot += (p.spin || 0) * dt;
      if (this.flat) _q.copy(FLAT);
      else { _qz.setFromAxisAngle(Z_AXIS, p.rot); _q.copy(camera.quaternion).multiply(_qz); }
      _p.set(p.x, p.y, p.z);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      // additive blending: fading the colour to black fades the glow
      this.mesh.setColorAt(n, _c.set(p.color).multiplyScalar(Math.pow(1 - a, p.pow ?? 1.5) * (p.k ?? 1)));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.debris = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 260);
    this.smoke = new SmokePool(scene, 260);
    this.confetti = new Pool(scene, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 320);
    this.sparks = new Pool(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), 220);
    this.flashes = new GlowPool(scene, flashTexture(), 24, false);
    this.rings = new GlowPool(scene, ringTexture(), 32, true);
  }

  update(dt) {
    this.debris.update(dt, this.camera, 'solid');
    this.smoke.update(dt, this.camera);
    this.confetti.update(dt, this.camera, 'solid');
    this.sparks.update(dt, this.camera, 'spark');
    this.flashes.update(dt, this.camera);
    this.rings.update(dt, this.camera);
  }

  clear() {
    this.debris.clear(); this.smoke.clear(); this.confetti.clear(); this.sparks.clear(); this.flashes.clear(); this.rings.clear();
  }

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

  // One smoke card. `colors` is a list of hex stops over its life (fire -> soot, etc).
  smokeCard(x, y, z, { vx = 0, vy = 0, vz = 0, size = 0.5, life = 1, colors = [0xffffff], grow = 0.7, g = -0.5, drag = 0.94, alpha = 1, fadeAt = 0.4, delay = 0, spin } = {}) {
    this.smoke.spawn({
      x, y, z, vx, vy, vz, size, life, max: life, colors, grow, g, drag, alpha, fadeAt, delay,
      rot: rand(0, Math.PI * 2), spin: spin ?? rand(-1.6, 1.6), cell: Math.floor(Math.random() * 4),
    });
  }

  // Soft cartoon smoke puffs (the general-purpose "poof").
  puff(x, y, z, { count = 8, color = 0xffffff, color2, size = 0.5, speed = 2, life = 0.7, up = 1.5, alpha = 1, grow = 0.7, g = -0.5, delay = 0 } = {}) {
    const colors = color2 !== undefined ? [color, color2] : [color];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = speed * rand(0.4, 1);
      const r = rand(0, 0.3);
      this.smokeCard(x + Math.cos(a) * r, y + rand(0, 0.45), z + Math.sin(a) * r, {
        vx: Math.cos(a) * sp, vy: up * rand(0.5, 1.2), vz: Math.sin(a) * sp,
        size: size * rand(0.75, 1.3), life: life * rand(0.8, 1.2) + 0.2, colors, grow, g, alpha, delay: delay ? delay * rand(0.5, 1.5) : 0,
      });
    }
  }

  // Low dust kicked up from the ground (footsteps, skids, landings).
  dust(x, y, z, { count = 2, color = 0xf0e8d8, size = 0.26, speed = 1.4, life = 0.45, dirX = 0, dirZ = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = speed * rand(0.3, 1);
      this.smokeCard(x + rand(-0.15, 0.15), y + rand(0.02, 0.15), z + rand(-0.15, 0.15), {
        vx: Math.cos(a) * sp + dirX, vy: rand(0.3, 0.9), vz: Math.sin(a) * sp + dirZ,
        size: size * rand(0.7, 1.25), life: life * rand(0.8, 1.2), colors: [color], grow: 1.3, g: 0.4, drag: 0.9, alpha: 0.9, fadeAt: 0.25,
      });
    }
  }

  // Rising steam / vapour (vents, vats, the updraft fan).
  steam(x, y, z, { color = 0xf4f0ff, size = 0.42, up = 2.2, life = 1.6, alpha = 0.72, windX = 0.3, windZ = 0 } = {}) {
    this.smokeCard(x + rand(-0.15, 0.15), y, z + rand(-0.15, 0.15), {
      vx: windX + rand(-0.2, 0.2), vy: up * rand(0.8, 1.2), vz: windZ + rand(-0.2, 0.2),
      size: size * rand(0.8, 1.2), life: life * rand(0.8, 1.2), colors: [color], grow: 2.2, g: -0.4, drag: 0.97, alpha, fadeAt: 0.2,
    });
  }

  // Bright additive flash (hit sparks, explosions, pickups).
  flash(x, y, z, { size = 1.5, color = 0xfff4c0, life = 0.22, k = 1 } = {}) {
    this.flashes.spawn({ x, y, z, s0: size * 0.4, s1: size, life, max: life, color, k, rot: rand(0, Math.PI), spin: rand(-3, 3), pow: 2 });
  }

  // Flat expanding ring on the ground (shockwave) or water (ripple).
  shock(x, y, z, { radius = 2.5, color = 0xfff2c0, life = 0.45, k = 1, delay = 0, start = 0.25 } = {}) {
    this.rings.spawn({ x, y: y + 0.06, z, s0: radius * start, s1: radius, life, max: life, color, k, delay, pow: 1.4 });
  }

  ripple(x, y, z, { radius = 1.6, life = 0.9, k = 0.3 } = {}) {
    this.shock(x, y, z, { radius, life, k, color: 0xe8f8ff, start: 0.15 });
  }

  // Shockwave ring plus a ring of dust rolling outward (stomps, landings, boss slams).
  ring(x, y, z, { color = 0xffffff, radius = 2.5, count = 14, size = 0.45 } = {}) {
    this.shock(x, y, z, { radius: radius * 1.1, color, life: 0.4, k: 0.9 });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.1, 0.1);
      const sp = radius * rand(2.2, 3);
      this.smokeCard(x + Math.cos(a) * 0.4, y + 0.15, z + Math.sin(a) * 0.4, {
        vx: Math.cos(a) * sp, vy: rand(0.4, 1.2), vz: Math.sin(a) * sp,
        size: size * rand(0.8, 1.2), life: rand(0.45, 0.65), colors: [color], grow: 1.1, g: 0, drag: 0.88, fadeAt: 0.3,
      });
    }
  }

  // Cartoon explosion: flash, shockwave, fireball that cools to soot, rising smoke, embers.
  explosion(x, y, z, { radius = 2.5, color = 0xffd27a } = {}) {
    const r = radius / 2.5;
    this.flash(x, y + 0.6, z, { size: 3.4 * r, color: 0xfff6d0, life: 0.26 });
    this.flash(x, y + 0.6, z, { size: 2.2 * r, color, life: 0.4, k: 0.8 });
    this.shock(x, y, z, { radius: radius * 1.35, color: 0xffd8a0, life: 0.5 });
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), el = rand(0.1, 1.2), sp = rand(2.5, 5.5) * r;
      this.smokeCard(x + Math.cos(a) * 0.3, y + 0.5, z + Math.sin(a) * 0.3, {
        vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp + 1.5, vz: Math.sin(a) * Math.cos(el) * sp,
        size: rand(0.65, 1.0) * r, life: rand(0.75, 1.05), colors: [0xfff4c0, 0xffa030, 0xd8402a, 0x3a3038], grow: 0.9, g: -2, drag: 0.88, fadeAt: 0.5,
      });
    }
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2);
      this.smokeCard(x + Math.cos(a) * rand(0.2, 0.9) * r, y + rand(0.6, 1.4) * r, z + Math.sin(a) * rand(0.2, 0.9) * r, {
        vx: Math.cos(a) * 0.8, vy: rand(1.8, 3), vz: Math.sin(a) * 0.8,
        size: rand(0.8, 1.15) * r, life: rand(1.3, 1.8), colors: [0x6a5a68, 0x9a90a8], grow: 1.2, g: -0.6, drag: 0.95, alpha: 0.9, delay: rand(0.12, 0.3), fadeAt: 0.35,
      });
    }
    this.sparkle(x, y + 0.6, z, { count: 16, color: 0xffb040, size: 0.7, speed: 7, up: 4, life: 0.7 });
  }

  // Something fell in the water.
  splash(x, y, z, { size = 1 } = {}) {
    this.ripple(x, y, z, { radius: 2.4 * size, life: 1.1, k: 0.8 });
    this.ripple(x, y, z, { radius: 1.4 * size, life: 0.8, k: 0.6 });
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.8, 2.2) * size;
      this.smokeCard(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, {
        vx: Math.cos(a) * sp, vy: rand(4, 7.5) * size, vz: Math.sin(a) * sp,
        size: rand(0.3, 0.5) * size, life: rand(0.55, 0.8), colors: [0xffffff, 0xbfe8ff], grow: 0.5, g: 14, drag: 0.97, fadeAt: 0.45,
      });
    }
    this.sparkle(x, y + 0.3, z, { count: 12, color: 0xbfeaff, size: 0.45, speed: 3, up: 7, life: 0.7 });
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
}

// ---------- procedural textures ----------
// Smoke atlas (2x2 cells). Each cell is a cluster of overlapping spheres, toon-lit from above.
// R = shading, G = dissolve noise (high in the middle so puffs erode from the outside in), A = shape.
let _smoke;
function smokeTexture() {
  if (_smoke) return _smoke;
  const S = 256, C = 128;
  const data = new Uint8Array(S * S * 4);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const L = new THREE.Vector3(-0.35, 0.6, 0.72).normalize();
  const vnoise = valueNoise(rnd);
  for (let cell = 0; cell < 4; cell++) {
    const lobes = [{ x: rnd() * 0.1 - 0.05, y: -0.05 + rnd() * 0.08, z: 0, r: 0.42 + rnd() * 0.06 }];
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const r = 0.2 + rnd() * 0.12;
      const d = Math.min(0.9 - r, 0.26 + rnd() * 0.16);
      lobes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85 + 0.04, z: rnd() * 0.25 - (Math.sin(a) < 0 ? 0.15 : 0), r });
    }
    const ox = (cell % 2) * C, oy = Math.floor(cell / 2) * C;
    for (let py = 0; py < C; py++) {
      for (let px = 0; px < C; px++) {
        const u = ((px + 0.5) / C) * 2 - 1, v = ((py + 0.5) / C) * 2 - 1; // v points up (DataTexture row 0 = bottom)
        let best = -9, second = -9, nx = 0, ny = 0, nz = 1, edge = -9;
        for (const l of lobes) {
          const dx = u - l.x, dy = v - l.y, d2 = dx * dx + dy * dy;
          edge = Math.max(edge, l.r - Math.sqrt(d2));
          if (d2 >= l.r * l.r) continue;
          const h = Math.sqrt(l.r * l.r - d2);
          const z = l.z + h;
          if (z > best) { second = best; best = z; nx = dx / l.r; ny = dy / l.r; nz = h / l.r; } else if (z > second) second = z;
        }
        const i = ((oy + py) * S + ox + px) * 4;
        if (edge <= 0) { data[i] = 255; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; continue; }
        const lam = nx * L.x + ny * L.y + nz * L.z;
        let s = 0.18 + 0.82 * smoothstep(0.02, 0.32, lam);
        if (second > -9) s *= 0.8 + 0.2 * smoothstep(0, 0.07, best - second); // creases between lobes
        s *= 0.86 + 0.14 * smoothstep(0, 0.05, edge); // darker rim
        const noise = vnoise(u * 3.2 + cell * 9.1, v * 3.2) * 0.65 + vnoise(u * 7 + 3, v * 7 - cell) * 0.35;
        const radial = 1 - Math.min(1, Math.hypot(u, v) / 0.95);
        const g = 0.16 + 0.84 * (0.55 * noise + 0.45 * radial);
        data[i] = Math.round(Math.min(1, s) * 255);
        data[i + 1] = Math.round(g * 255);
        data[i + 2] = 0;
        data[i + 3] = Math.round(smoothstep(0, 0.022, edge) * 255);
      }
    }
  }
  _smoke = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  _smoke.magFilter = THREE.LinearFilter;
  _smoke.minFilter = THREE.LinearMipmapLinearFilter;
  _smoke.generateMipmaps = true;
  _smoke.needsUpdate = true;
  return _smoke;
}

function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function valueNoise(rnd) {
  const P = 64, g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
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

let _flash;
function flashTexture() {
  if (_flash) return _flash;
  _flash = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    // comic starburst spikes
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 62;
      const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  });
  return _flash;
}

let _ring;
function ringTexture() {
  if (_ring) return _ring;
  _ring = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.08)');
    grd.addColorStop(0.84, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.9, 'rgba(255,255,255,1)');
    grd.addColorStop(0.97, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
  return _ring;
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
