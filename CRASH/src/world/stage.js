// A Stage is one playable space (a level path or a boss arena): scene, collision world, entities.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Assets } from '../art/assets.js';
import { World, Solid } from './physics.js';

export const THEMES = {
  1: {
    name: 'Bark Jungle', ground: 'tex_l1_ground', wall: 'tex_l1_wall', platform: 'tex_l1_platform',
    sky: 'bg_level1', fog: 0xa8dcff, fogNear: 45, fogFar: 120, hemiSky: 0xd8f0ff, hemiGround: 0x5a7a3a, sun: 0xfff1d0, sunI: 1.5, hemiI: 1.25,
    dust: 0xf2ecd8, music: 'level1',
  },
  boss1: {
    name: 'Clifftop Nest', ground: 'tex_l1_ground', wall: 'tex_l1_wall', platform: 'tex_l1_platform',
    sky: 'bg_boss1', fog: 0xc98a8a, fogNear: 40, fogFar: 110, hemiSky: 0xffd0b0, hemiGround: 0x4a3a5a, sun: 0xffc090, sunI: 1.4, hemiI: 1.1,
    dust: 0xf0e0cc, music: 'boss',
  },
  2: {
    name: 'Scratchpost Canyon', ground: 'tex_l2_ground', wall: 'tex_l2_wall', platform: 'tex_l2_platform',
    sky: 'bg_level2', fog: 0xf5b98a, fogNear: 40, fogFar: 115, hemiSky: 0xffe0c0, hemiGround: 0x8a4a2a, sun: 0xffd8a0, sunI: 1.5, hemiI: 1.2,
    dust: 0xf6d2a8, music: 'level2',
  },
  boss2: {
    name: 'Moonlit Litterbox', ground: 'tex_l2_ground', wall: 'tex_l2_wall', platform: 'tex_l2_platform',
    sky: 'bg_boss2', fog: 0x3a2a6a, fogNear: 40, fogFar: 120, hemiSky: 0xa0a0ff, hemiGround: 0x3a2040, sun: 0xd8d8ff, sunI: 1.3, hemiI: 1.15,
    dust: 0xd8d2f0, music: 'boss',
  },
  3: {
    name: 'Cone Factory', ground: 'tex_l3_ground', wall: 'tex_l3_wall', platform: 'tex_l3_platform',
    sky: 'bg_level3', fog: 0x2a1440, fogNear: 30, fogFar: 95, hemiSky: 0xc8a0ff, hemiGround: 0x2a1030, sun: 0xffe0f0, sunI: 1.35, hemiI: 1.25,
    dust: 0xd4cce8, music: 'level3',
  },
  boss3: {
    name: 'Throne of Shame', ground: 'tex_l3_ground', wall: 'tex_l3_wall', platform: 'tex_l3_platform',
    sky: 'bg_boss3', fog: 0x2a0a30, fogNear: 40, fogFar: 120, hemiSky: 0xffa0d0, hemiGround: 0x200820, sun: 0xffd0e0, sunI: 1.3, hemiI: 1.2,
    dust: 0xe8d0e4, music: 'finalBoss',
  },
};

export class Stage {
  constructor(game, themeKey) {
    this.game = game;
    this.theme = THEMES[themeKey];
    this.themeKey = themeKey;
    this.scene = new THREE.Scene();
    this.world = new World();
    this.entities = [];
    this.blocks = [];
    this.decorParts = [];
    this.emitters = [];
    this.wind = { value: 0 };
    this.killY = -14;
    this.spawn = new THREE.Vector3(0, 0, 0);
    this.cameraMode = 'behind';
    this.time = 0;
    this.activeRange = 75;
    this.track = null;
    this._setupScene();
  }

  setTrack(track) {
    this.track = track;
    this.world.track = track;
  }

  // Falling this far below the path (or the arena floor) is a pit death.
  killYAt(pos, body) {
    if (this.track) {
      const s = body?.s ?? 0;
      const wy = this.track.waterAt(s);
      return wy !== null ? wy - 0.5 : this.track.heightAt(s) - 12;
    }
    return this.killY;
  }

  _setupScene() {
    const t = this.theme;
    this.scene.background = new THREE.Color(t.fog);
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
    const hemi = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiI);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(t.sun, t.sunI);
    sun.position.set(-0.5, 1, 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    // soft rim light from behind so characters pop off the background
    const rim = new THREE.DirectionalLight(0xbfd8ff, 0.45);
    rim.position.set(0.4, 0.6, -1);
    this.scene.add(rim);

    // Panoramic sky: cylinder with the generated backdrop mirrored twice around.
    const skyTex = Assets.tex(t.sky).clone();
    skyTex.wrapS = THREE.MirroredRepeatWrapping;
    skyTex.repeat.set(2, 1);
    skyTex.needsUpdate = true;
    const skyGeo = new THREE.CylinderGeometry(260, 260, 260, 48, 1, true);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -10;
    this.sky.position.y = 60;
    // Rotate so the cameras (looking along -Z or +Z) see the middle of the backdrop, not the mirror seam.
    this.sky.rotation.y = Math.PI / 2;
    this.scene.add(this.sky);
    // floor of the sky (below the horizon) so pits read as deep
    const under = new THREE.Mesh(new THREE.CircleGeometry(260, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(t.fog).multiplyScalar(0.55), fog: false, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -128; // sky sits at y=60, so the floor disc is at y=-68 in world space
    under.renderOrder = -9;
    this.sky.add(under);
  }

  // ---------- geometry authoring ----------
  // style: 'ground' (top uses ground tex, sides wall tex), 'platform', 'wall', 'invisible'
  block(x0, y0, z0, x1, y1, z1, style = 'ground', opts = {}) {
    const b = {
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      style,
    };
    if (style !== 'invisible') this.blocks.push(b);
    if (opts.solid !== false) {
      b.solid = this.world.add(new Solid({ x: b.x0, y: b.y0, z: b.z0 }, { x: b.x1, y: b.y1, z: b.z1 }, opts));
    }
    return b;
  }

  // Ground slab whose top is at y, spanning z from zStart to zEnd (zEnd < zStart), centered on x.
  slab(zStart, zEnd, { x = 0, width = 8, y = 0, depth = 8, style = 'ground' } = {}) {
    return this.block(x - width / 2, y - depth, zEnd, x + width / 2, y, zStart, style);
  }

  add(entity) {
    this.entities.push(entity);
    if (entity.obj) {
      this.scene.add(entity.obj);
      entity.obj.traverse((o) => { if (o.isMesh && !o.userData.noShadow && !(o.material && o.material.transparent && o.material.depthWrite === false)) o.castShadow = true; });
    }
    return entity;
  }

  // Decor geometry is merged into one vertex-colored mesh.
  // A geometry may carry baked `color` multipliers and `sway` wind weights (see world/decor.js).
  // opts: sway (scales the baked weights, or a constant weight), grad (vertical shading), paint(x, y, z, ny, color)
  decor(geometry, color, position, rotation = null, scale = null, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color' && name !== 'sway') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rotation) q.setFromEuler(rotation instanceof THREE.Euler ? rotation : new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0));
    const s = scale ? (typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale) : new THREE.Vector3(1, 1, 1);
    m.compose(position, q, s);
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const n = pos.count;
    const base = g.attributes.color, baseSway = g.attributes.sway;
    const cols = new Float32Array(n * 3);
    const sway = new Float32Array(n);
    // subtle vertical shading for depth (geometry with baked colours already has its own)
    const grad = opts.grad ?? !base;
    let minY = Infinity, maxY = -Infinity;
    if (grad) for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const swayK = opts.sway ?? (baseSway ? 1 : 0);
    for (let i = 0; i < n; i++) {
      let k = grad ? 0.72 + 0.28 * ((pos.getY(i) - minY) / Math.max(0.001, maxY - minY)) : 1;
      _pc.setRGB(c.r * k, c.g * k, c.b * k);
      if (base) { _pc.r *= base.getX(i); _pc.g *= base.getY(i); _pc.b *= base.getZ(i); }
      if (opts.paint) opts.paint(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), _pc);
      cols[i * 3] = _pc.r; cols[i * 3 + 1] = _pc.g; cols[i * 3 + 2] = _pc.b;
      sway[i] = (baseSway ? baseSway.getX(i) : 1) * swayK;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    this.decorParts.push(g);
  }

  // Ambient particle source (steam vents, bubbling vats). Only runs near the player.
  emitter(x, y, z, kind, opts = {}) {
    this.emitters.push({ x, y, z, kind, opts, t: Math.random() * 2, cycle: Math.random() * (opts.burst || 1) });
  }

  // Build merged meshes for all authored blocks + decor. Call once after authoring.
  finalize() {
    const t = this.theme;
    const buckets = {};
    const bucket = (key) => (buckets[key] ||= { pos: [], nrm: [], uv: [], col: [], idx: [] });
    const tile = { ground: 3, wall: 3, platform: 2 };

    for (const b of this.blocks) {
      const topKey = b.style === 'ground' ? 'ground' : b.style === 'platform' ? 'platform' : 'wall';
      const sideKey = b.style === 'platform' ? 'platform' : 'wall';
      const faces = [
        { n: [0, 1, 0], key: topKey },
        { n: [0, -1, 0], key: sideKey },
        { n: [1, 0, 0], key: sideKey }, { n: [-1, 0, 0], key: sideKey },
        { n: [0, 0, 1], key: sideKey }, { n: [0, 0, -1], key: sideKey },
      ];
      for (const f of faces) {
        if (f.n[1] < 0 && b.style === 'ground') continue; // bottoms of ground slabs are never seen
        const B = bucket(f.key);
        const ts = tile[f.key];
        const base = B.pos.length / 3;
        const verts = faceVerts(b, f.n);
        for (const v of verts) {
          B.pos.push(v[0], v[1], v[2]);
          B.nrm.push(f.n[0], f.n[1], f.n[2]);
          let u, w;
          if (f.n[1] !== 0) { u = v[0] / ts; w = v[2] / ts; }
          else if (f.n[0] !== 0) { u = v[2] / ts; w = v[1] / ts; }
          else { u = v[0] / ts; w = v[1] / ts; }
          B.uv.push(u, w);
          let shade = 1;
          if (f.n[1] === 0) shade = v[1] >= b.y1 - 0.001 ? 0.95 : Math.max(0.42, 0.95 - (b.y1 - v[1]) * 0.12);
          if (f.n[1] < 0) shade = 0.5;
          B.col.push(shade, shade, shade);
        }
        B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    const texFor = { ground: t.ground, wall: t.wall, platform: t.platform };
    if (this.track) {
      const mk = (id) => new THREE.MeshLambertMaterial({ map: Assets.tiled(id), vertexColors: true, side: THREE.DoubleSide });
      this.track.buildMeshes(this, { ground: mk(t.ground), wall: mk(t.wall), platform: mk(t.platform) });
    }
    for (const [key, B] of Object.entries(buckets)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      g.setIndex(B.idx);
      g.computeBoundingSphere();
      const mtl = new THREE.MeshLambertMaterial({ map: Assets.tiled(texFor[key]), vertexColors: true });
      const m = new THREE.Mesh(g, mtl);
      m.receiveShadow = true;
      m.castShadow = true;
      this.scene.add(m);
    }

    if (this.decorParts.length) {
      const merged = mergeGeometries(this.decorParts, false);
      const dm = new THREE.Mesh(merged, windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), this.wind));
      dm.customDepthMaterial = windy(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.wind);
      dm.castShadow = true;
      dm.receiveShadow = true;
      this.scene.add(dm);
      this.decorParts.length = 0;
    }
  }

  // Entities near the player get updated every frame; far ones sleep.
  update(dt, player) {
    this.time += dt;
    this.wind.value = this.time;
    this.world.beginFrame();
    if (player) {
      // keep the shadow frustum centred on Nobu
      const p = player.pos;
      this.sun.target.position.set(p.x, p.y, p.z);
      this.sun.position.set(p.x - 8, p.y + 22, p.z + 10);
    }
    this._ambient(dt, player);
    this._emit(dt, player);
    const pz = player ? player.pos.z : 0;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.dead) continue;
      const near = e.alwaysActive || Math.abs(e.pos.z - pz) < this.activeRange;
      if (e.obj) e.obj.visible = near && e.visible !== false;
      if (near) e.update(dt);
    }
  }

  // Ambient particles per theme: pollen/butterflies, dust motes, factory embers.
  _ambient(dt, player) {
    const fx = this.game.fx;
    if (!fx || !player) return;
    this._amb = (this._amb || 0) + dt;
    if (this._amb < 0.06) return;
    this._amb = 0;
    const k = String(this.themeKey);
    const p = player.pos;
    const x = p.x + (Math.random() - 0.5) * 22, z = p.z + (Math.random() - 0.5) * 22, y = p.y + 0.5 + Math.random() * 4;
    if (k === '1' || k === 'boss1') fx.sparkle(x, y, z, { count: 1, color: Math.random() < 0.5 ? 0xfff6a0 : 0xffb0e0, size: 0.18, speed: 0.4, up: 0.3, life: 2.5 });
    else if (k === '2' || k === 'boss2') fx.sparkle(x, y, z, { count: 1, color: 0xffd8a0, size: 0.14, speed: 0.8, up: 0.1, life: 2 });
    else fx.sparkle(x, p.y + Math.random() * 1.5, z, { count: 1, color: Math.random() < 0.5 ? 0xff9a4a : 0xb070ff, size: 0.16, speed: 0.3, up: 1.5, life: 1.6 });
  }

  _emit(dt, player) {
    const fx = this.game.fx;
    if (!fx || !player || !this.emitters.length) return;
    const p = player.pos;
    for (const e of this.emitters) {
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz > 48 * 48) continue;
      const o = e.opts;
      // bursty emitters puff for a moment, then rest
      if (o.burst) { e.cycle = (e.cycle + dt) % (o.burst + 1.1); if (e.cycle > 1.1) continue; }
      e.t -= dt;
      if (e.t > 0) continue;
      e.t = (o.every ?? 0.25) * (0.6 + Math.random() * 0.8);
      if (e.kind === 'steam') {
        fx.steam(e.x, e.y, e.z, { windX: o.windX ?? 0.3, windZ: o.windZ ?? 0, color: o.color, alpha: o.alpha ?? 0.72, size: o.size ?? 0.42, up: o.up ?? 2.2 });
      } else if (e.kind === 'bubble') {
        const a = Math.random() * Math.PI * 2, r = Math.random() * (o.r ?? 0.8);
        fx.smokeCard(e.x + Math.cos(a) * r, e.y, e.z + Math.sin(a) * r, {
          vy: 0.5 + Math.random() * 0.6, size: 0.1 + Math.random() * 0.1, life: 0.55, colors: [0xc8ff9a, 0x9aff7a], grow: 0.6, g: 0, drag: 0.98, alpha: 0.95, fadeAt: 0.7, spin: 0,
        });
      }
    }
  }

  followSky(camera) {
    this.sky.position.x = camera.position.x;
    this.sky.position.z = camera.position.z;
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
  }
}

function faceVerts(b, n) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  if (n[1] > 0) return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
  if (n[1] < 0) return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  if (n[0] > 0) return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
  if (n[0] < 0) return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
  if (n[2] > 0) return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
}

const _pc = new THREE.Color();

// Bend vertices with a `sway` weight in the breeze (decor mesh and its shadow-depth material).
function windy(mat, uTime) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (sway > 0.0) {
          float ph = uWind * 1.6 + position.x * 0.31 + position.z * 0.23;
          float gust = 0.75 + 0.25 * sin(uWind * 0.37 + position.x * 0.05);
          transformed.x += sway * gust * (sin(ph) * 0.1 + sin(ph * 2.7 + 1.3) * 0.035);
          transformed.z += sway * gust * (cos(ph * 0.83) * 0.07 + sin(ph * 3.1) * 0.025);
          transformed.y += sway * sin(ph * 1.9) * 0.02;
        }`);
  };
  mat.customProgramCacheKey = () => 'decor-wind';
  return mat;
}
