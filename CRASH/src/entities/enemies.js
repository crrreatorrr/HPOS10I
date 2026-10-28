// Enemies. Broccoli Heads (normal / spiky / cone trooper) plus per-level critters:
// Squirrel (hopper), Cone Drone (flyer), Vacuum Bot (patroller), Bandit Mouse (patroller), Yarn Ball (roller).
import * as THREE from 'three';
import { Entity } from './entity.js';
import { toon } from '../player/nobuPrims.js';
import { makeShadow } from './fx.js';
import { audio } from '../audio/audio.js';
import { rand, canvasTex } from '../core/util.js';
import { TUNING } from '../player/player.js';
import { Assets } from '../art/assets.js';

const M = {};
function mats() {
  if (M.ready) return M;
  Object.assign(M, {
    ready: true,
    green: toon(0x4fbf3a), greenDark: toon(0x2f7d26), stalk: toon(0xa6d672), purple: toon(0x6a2fb0), purpleDark: toon(0x40206a),
    white: toon(0xffffff), black: toon(0x111111), steel: toon(0xd8dde8), red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    brown: toon(0x9a5a2a), brownLight: toon(0xd8a060), tan: toon(0xf2d3a0), orange: toon(0xff8a1a), grey: toon(0x9a9aaa),
    greyDark: toon(0x5a5a6a), pink: toon(0xf6a2b6), yellow: toon(0xffd23f),
    cone: new THREE.MeshLambertMaterial({ color: 0xe6e0ff, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
  });
  return M;
}
const G = {};
function geos() {
  if (G.ready) return G;
  Object.assign(G, {
    ready: true,
    s1: new THREE.SphereGeometry(1, 14, 10), s2: new THREE.SphereGeometry(1, 10, 8),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10), cone: new THREE.ConeGeometry(1, 1, 8), box: new THREE.BoxGeometry(1, 1, 1),
    torusTail: new THREE.TorusGeometry(0.3, 0.16, 8, 14, Math.PI * 1.4),
    vetCone: new THREE.CylinderGeometry(0.5, 0.16, 0.5, 16, 1, true),
  });
  return G;
}
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
const part = (geo, mat, x, y, z, sx, sy = sx, sz = sx) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

function angryEyes(group, y, z, spread, size, red = false) {
  const { s1, box } = geos();
  const mm = mats();
  for (const sx of [-1, 1]) {
    group.add(part(s1, red ? mm.red : mm.white, sx * spread, y, z, size, size * 1.1, size * 0.6));
    if (!red) group.add(part(s1, mm.black, sx * spread, y - size * 0.15, z + size * 0.45, size * 0.45));
    const brow = part(box, mm.black, sx * spread, y + size * 0.95, z + size * 0.3, size * 1.6, size * 0.35, size * 0.4);
    brow.rotation.z = sx * 0.45;
    group.add(brow);
  }
}

// ---------------- base ----------------
export class Enemy extends Entity {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z);
    this.opts = opts;
    this.spiky = false;
    this.model = new THREE.Group();
    this.obj.add(this.model);
    this.shadow = makeShadow(opts.shadow ?? 1.0);
    this.shadow.position.y = 0.02;
    this.obj.add(this.shadow);
    this.state = 'alive';
    this.t = rand(0, 10);
    this.facing = opts.facing ?? 0;
    this.knockV = new THREE.Vector3();
  }

  get alive() { return this.state === 'alive'; }

  // Swap the primitive body for a Higgsfield GLB (keeps primitive parts as hidden dummies so
  // existing animation code keeps working). `lift` raises/lowers the model inside the group.
  useModel(id, height, lift = 0) {
    const m = Assets.model(id, height);
    if (!m) return false;
    for (const c of [...this.model.children]) c.visible = false;
    this.glbWrap = new THREE.Group();
    this.glbWrap.position.y = lift;
    this.glbWrap.add(m);
    this.model.add(this.glbWrap);
    this.glb = m;
    this.mixer = Assets.animate(m, 0, this.animSpeed ?? 1);  // rigged walk cycle, if the model has one
    return true;
  }

  // Generic lively motion for GLB bodies: waddle while moving, breathe while idle.
  glbMotion(dt, moving = true, k = 1) {
    if (!this.glbWrap) return;
    const w = this.glbWrap;
    if (this.mixer) {
      // skeleton does the walking; just add a touch of sway
      this.mixer.update(dt * (moving ? 1 : 0.4));
      this._mixed = true;
      w.rotation.z = Math.sin(this.t * 3) * 0.03;
      return;
    }
    const ph = this.t * 10 * k;
    if (moving) {
      w.rotation.z = Math.sin(ph) * 0.09;
      w.rotation.x = 0.05;
      w.position.y = (w.userData.base ?? (w.userData.base = w.position.y)) + Math.abs(Math.sin(ph)) * 0.07;
      w.scale.set(1, 1 + Math.abs(Math.sin(ph)) * 0.04, 1);
    } else {
      const b = Math.sin(this.t * 2.5);
      w.rotation.z = b * 0.03;
      w.position.y = w.userData.base ?? w.position.y;
      w.scale.set(1 - b * 0.02, 1 + b * 0.03, 1 - b * 0.02);
    }
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'knocked') {
      this.stateT += dt;
      this.pos.addScaledVector(this.knockV, dt);
      this.knockV.y -= 14 * dt;
      this.model.rotation.x += dt * 14;
      this.model.rotation.z += dt * 9;
      this.obj.position.copy(this.pos);
      this.shadow.visible = false;
      if (this.stateT > 1.2) { this.dead = true; this.obj.visible = false; }
      return;
    }
    if (this.state === 'squashed') {
      this.stateT += dt;
      this.model.scale.set(1.5, 0.15, 1.5);
      if (this.stateT > 0.45) {
        this.fx.puff(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 5, size: 0.4, color: 0xeeeeee, speed: 2 });
        this.dead = true; this.obj.visible = false;
      }
      return;
    }
    this.behave(dt);
    if (this.mixer && !this._mixed) this.mixer.update(dt);
    this._mixed = false;
    this.obj.position.copy(this.pos);
    this.model.rotation.y = this.facing;
    this.updateBox();
  }

  behave() {}

  // Patrol back and forth between home ± range along a direction (track-relative via opts.dirV).
  patrol(dt, speed, axis = this.opts.axis || 'x', range = this.opts.range ?? 2.5) {
    this.dir ??= 1;
    this.off ??= 0;
    const v = this.opts.dirV || (axis === 'z' ? AXIS_Z : AXIS_X);
    this.off += this.dir * speed * dt;
    if (this.off > range) { this.off = range; this.dir = -1; } else if (this.off < -range) { this.off = -range; this.dir = 1; }
    this.pos.x = this.home.x + v.x * this.off;
    this.pos.z = this.home.z + v.z * this.off;
    this.facing = Math.atan2(v.x * this.dir, v.z * this.dir);
    this.followGround();
  }

  // Stick to sloped track ground while walking.
  followGround() {
    if (!this.stage.track) return;
    const gy = this.stage.world.groundBelow(this.pos.x, this.pos.y + 1.2, this.pos.z, 0.2);
    if (gy > -Infinity && Math.abs(gy - this.pos.y) < 1.4) this.pos.y = gy;
  }

  knock(from) {
    if (!this.alive) return;
    this.state = 'knocked';
    this.stateT = 0;
    this.interactive = false;
    const p = this.player.pos;
    const dx = this.pos.x - (from ? from.x : p.x), dz = this.pos.z - (from ? from.z : p.z);
    const d = Math.hypot(dx, dz) || 1;
    this.knockV.set((dx / d) * 14, 9, (dz / d) * 14);
    audio.play('knock');
    this.fx.sparkle(this.pos.x, this.pos.y + 0.8, this.pos.z, { count: 6, color: 0xffffff, size: 0.6, speed: 3 });
    this.game.session.onEnemyDefeated(this);
  }

  squash() {
    if (!this.alive) return;
    this.state = 'squashed';
    this.stateT = 0;
    this.interactive = false;
    audio.play('squash');
    this.game.session.onEnemyDefeated(this);
  }

  onBite(p) {
    if (!this.alive) return;
    if (this.spiky) { p.hurt('puff', this.pos.x, this.pos.z); return; }
    this.knock(p.pos);
  }
  onSlide(p) { this.onBite(p); }
  onStomp(p) {
    if (!this.alive) return;
    if (this.unstompable) { this.onTouch(p); return; }
    this.squash();
    p.bounce(TUNING.STOMP_BOUNCE);
  }
  onTouch(p) {
    if (!this.alive) return;
    if (p.invincible) { this.knock(p.pos); return; }
    p.hurt(this.touchDeath || 'angel', this.pos.x, this.pos.z);
  }
  onFlop() { if (this.alive) this.squash(); }
  onExplosion(src) { if (this.alive) this.knock(src ? src.pos : null); }

  reset() {
    this.pos.copy(this.home);
    this.state = 'alive';
    this.dead = false;
    this.interactive = true;
    this.obj.visible = true;
    this.shadow.visible = true;
    this.model.rotation.set(0, this.facing, 0);
    this.model.scale.set(1, 1, 1);
    this.dir = 1;
    this.off = 0;
    this.onReset?.();
    this.updateBox();
  }
}

// ---------------- Broccoli Heads ----------------
export class Broccoli extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    this.variant = opts.variant || 'normal';
    this.spiky = this.variant === 'spiky';
    const { s1, s2, cyl, cone, box, vetCone } = geos();
    const mm = mats();
    const m = this.model;
    // stalk body + legs
    m.add(part(cyl, mm.stalk, 0, 0.55, 0, 0.17, 0.6, 0.17));
    for (const sx of [-1, 1]) {
      m.add(part(cyl, mm.stalk, sx * 0.1, 0.18, 0, 0.06, 0.36, 0.06));
      m.add(part(s1, mm.purple, sx * 0.1, 0.06, 0.05, 0.1, 0.07, 0.15));
    }
    // floret head
    const head = new THREE.Group();
    head.position.y = 1.08;
    const hm = this.spiky ? mm.greenDark : mm.green;
    const blobs = [[0, 0.12, 0, 0.36], [-0.26, 0, 0.05, 0.26], [0.26, 0, 0.05, 0.26], [0, 0, -0.2, 0.28], [-0.16, 0.26, -0.05, 0.22], [0.16, 0.26, -0.05, 0.22], [0, -0.08, 0.16, 0.26]];
    for (const [bx, by, bz, r] of blobs) head.add(part(s2, hm, bx, by, bz, r));
    angryEyes(head, 0.0, 0.33, 0.12, 0.09, this.spiky);
    this.head = head;
    m.add(head);
    // arms
    this.arms = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(sx * 0.17, 0.75, 0);
      a.add(part(cyl, mm.stalk, 0, -0.17, 0, 0.045, 0.34, 0.045));
      a.rotation.z = sx * 0.4;
      m.add(a); this.arms.push(a);
    }
    if (this.variant === 'normal' || this.variant === 'cone') {
      const helmet = part(s1, mm.purple, 0, 0.32, 0, 0.3, 0.16, 0.3);
      head.add(helmet);
    }
    if (this.spiky) {
      // spikes all over the head + armor
      const spikes = [[0, 0.45, 0], [-0.3, 0.2, 0], [0.3, 0.2, 0], [0, 0.2, -0.32], [-0.2, 0.35, 0.18], [0.2, 0.35, 0.18], [-0.38, -0.05, 0], [0.38, -0.05, 0], [0, 0.3, 0.3], [-0.22, 0.38, -0.2], [0.22, 0.38, -0.2]];
      for (const [sx, sy, sz] of spikes) {
        const s = part(cone, mm.steel, sx, sy, sz, 0.07, 0.24, 0.07);
        const dir = new THREE.Vector3(sx, sy, sz).normalize();
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        head.add(s);
      }
      m.add(part(box, mm.purpleDark, 0, 0.62, 0.02, 0.42, 0.34, 0.32));
      for (const sx of [-1, 1]) m.add(part(s1, mm.purpleDark, sx * 0.25, 0.78, 0, 0.13));
    }
    if (this.variant === 'cone') {
      this.vetCone = new THREE.Mesh(vetCone, mm.cone);
      this.vetCone.position.set(0, 1.65, 0.1);
      m.add(this.vetCone);
      this.arms.forEach((a) => (a.rotation.z = 0));
    }
    this.setBox(0.8, 1.5, 0.8);
    this.speed = opts.speed ?? 1.8;
    this.attack = -1;
    const id = this.variant === 'spiky' ? 'model_broccoli_spiky' : this.variant === 'cone' ? 'model_broccoli_cone' : 'model_broccoli';
    this.useModel(id, this.variant === 'cone' ? 1.95 : this.variant === 'spiky' ? 1.6 : 1.5);
  }

  behave(dt) {
    const p = this.player;
    const toP = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (this.variant === 'cone') {
      // Cone trooper: walks slowly; near Nobu raises the cone (telegraph), then slams it down in front.
      if (this.attack < 0) {
        if (this.opts.range) this.patrol(dt, this.speed * 0.6);
        if (toP < 2.6 && !p.dead) {
          this.attack = 0;
          this.facing = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        }
        this.vetCone.position.y = 1.65 + Math.sin(this.t * 4) * 0.05;
        this.vetCone.rotation.x = 0;
      } else {
        this.attack += dt;
        const a = this.attack;
        if (a < 0.6) {
          this.vetCone.position.y = 1.65 + a * 0.8;
          this.vetCone.position.z = 0.1;
          this.arms.forEach((ar) => (ar.rotation.x = -2.4));
        } else if (a < 0.8) {
          const k = (a - 0.6) / 0.2;
          this.vetCone.position.set(0, 2.1 - k * 1.5, 0.1 + k * 0.9);
          this.vetCone.rotation.x = k * 1.6;
          this.arms.forEach((ar) => (ar.rotation.x = -2.4 + k * 1.8));
          if (k > 0.7 && !this.hitDone) {
            this.hitDone = true;
            const fx = this.pos.x + Math.sin(this.facing) * 1.1, fz = this.pos.z + Math.cos(this.facing) * 1.1;
            if (!p.dead && Math.hypot(p.pos.x - fx, p.pos.z - fz) < 1.05 && p.pos.y < this.pos.y + 1.4) p.hurt('cone', this.pos.x, this.pos.z);
            audio.play('stomp');
            this.fx.puff(fx, this.pos.y, fz, { count: 5, size: 0.35, color: 0xffffff, speed: 2 });
          }
        } else if (a > 1.6) {
          this.attack = -1; this.hitDone = false;
          this.vetCone.position.set(0, 1.65, 0.1); this.vetCone.rotation.x = 0;
          this.arms.forEach((ar) => (ar.rotation.x = 0));
        }
      }
    } else if (this.opts.chase) {
      // summoned minions march straight at Nobu
      this.facing = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (toP > 0.8 && !p.dead) { this.pos.x += Math.sin(this.facing) * this.speed * dt; this.pos.z += Math.cos(this.facing) * this.speed * dt; }
      const w = Math.sin(this.t * 9);
      this.arms[0].rotation.x = w * 0.6; this.arms[1].rotation.x = -w * 0.6;
    } else {
      if (this.opts.range !== 0) this.patrol(dt, this.speed);
      else if (toP < 8) this.facing = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      const w = Math.sin(this.t * 9);
      this.arms[0].rotation.x = w * 0.6; this.arms[1].rotation.x = -w * 0.6;
    }
    this.head.position.y = 1.08 + Math.abs(Math.sin(this.t * 9)) * 0.05;
    this.head.rotation.z = Math.sin(this.t * 4.5) * 0.08;
    if (this.glbWrap) {
      if (this.variant === 'cone' && this.attack >= 0) {
        // wind up (lean back), then slam (lunge forward)
        const a = this.attack;
        this.glbWrap.rotation.x = a < 0.6 ? -a * 0.5 : a < 0.8 ? -0.3 + ((a - 0.6) / 0.2) * 0.9 : 0.6 * Math.max(0, 1 - (a - 0.8) * 2);
        this.glbWrap.rotation.z = 0;
      } else this.glbMotion(dt, this.opts.range !== 0 || this.opts.chase, 0.9);
    }
  }
  onReset() { this.attack = -1; this.hitDone = false; if (this.vetCone) { this.vetCone.position.set(0, 1.65, 0.1); this.vetCone.rotation.x = 0; } }
}

// ---------------- Squirrel (hopper) ----------------
export class Squirrel extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    const { s1, torusTail, box } = geos();
    const mm = mats();
    const m = this.model;
    m.add(part(s1, mm.brown, 0, 0.45, 0, 0.3, 0.36, 0.28));
    m.add(part(s1, mm.tan, 0, 0.42, 0.14, 0.2, 0.26, 0.16));
    const head = new THREE.Group(); head.position.y = 0.92; m.add(head);
    head.add(part(s1, mm.brown, 0, 0, 0, 0.24));
    head.add(part(s1, mm.purple, 0, 0.14, -0.02, 0.22, 0.12, 0.22));
    for (const sx of [-1, 1]) {
      head.add(part(s1, mm.white, sx * 0.09, 0.03, 0.2, 0.08, 0.1, 0.05));
      head.add(part(s1, mm.black, sx * 0.09 + sx * 0.02, 0.0, 0.24, 0.035));
      head.add(part(s1, mm.brown, sx * 0.15, 0.22, -0.04, 0.06, 0.1, 0.04));
    }
    head.add(part(box, mm.white, 0, -0.13, 0.21, 0.08, 0.08, 0.03));
    const tail = new THREE.Mesh(torusTail, mm.brownLight);
    tail.position.set(0, 0.75, -0.3); tail.rotation.set(0, Math.PI / 2, 0.4);
    m.add(tail);
    this.tail = tail;
    this.setBox(0.7, 1.1, 0.7);
    this.vy = 0;
    this.hopTimer = rand(0.2, 1.0);
    this.yOff = 0;
    this.useModel('model_squirrel', 1.2);
  }
  behave(dt) {
    this.hopTimer -= dt;
    if (this.yOff <= 0 && this.hopTimer <= 0) { this.vy = this.opts.hop ?? 8.5; this.hopTimer = this.opts.hopEvery ?? 1.1; }
    if (this.yOff > 0 || this.vy > 0) {
      this.vy -= 26 * dt;
      this.yOff = Math.max(0, this.yOff + this.vy * dt);
      if (this.yOff === 0) this.vy = 0;
    }
    if (this.opts.range) this.patrol(dt, 1.4);
    const p = this.player.pos;
    if (!this.opts.range) this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.pos.y = (this.baseY ?? this.home.y) + this.yOff;
    this.model.scale.y = this.yOff > 0 ? 1.12 : 1 - Math.max(0, 0.15 - this.hopTimer) * 1.5;
    this.tail.rotation.z = 0.4 + Math.sin(this.t * 12) * 0.25;
    this.shadow.position.y = 0.02 - this.yOff;
    const k = Math.max(0.4, 1 - this.yOff * 0.2);
    this.shadow.scale.set(k, 1, k);
    if (this.glbWrap) { this.glbWrap.rotation.x = this.vy > 0 ? -0.25 : this.yOff > 0 ? 0.2 : 0; this.glbWrap.rotation.z = Math.sin(this.t * 12) * 0.05; }
  }
}

// ---------------- Cone Drone (flyer) ----------------
export class ConeDrone extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    const { cone, cyl, s1, box } = geos();
    const mm = mats();
    const m = this.model;
    const body = part(cone, mm.orange, 0, 0, 0, 0.38, 0.75, 0.38);
    body.rotation.x = Math.PI;
    m.add(body);
    m.add(part(cyl, mm.purple, 0, 0.12, 0, 0.3, 0.12, 0.3));
    m.add(part(cyl, mm.purple, 0, -0.15, 0, 0.2, 0.1, 0.2));
    m.add(part(s1, mm.red, 0, 0.05, 0.27, 0.11));
    m.add(part(cyl, mm.greyDark, 0, 0.42, 0, 0.04, 0.3, 0.04));
    this.prop = new THREE.Group();
    this.prop.position.y = 0.58;
    this.prop.add(part(box, mm.grey, 0, 0, 0, 1.1, 0.03, 0.12));
    this.prop.add(part(box, mm.grey, 0, 0, 0, 0.12, 0.03, 1.1));
    m.add(this.prop);
    this.hoverY = opts.hover ?? 1.5;
    this.setBox(0.9, 1.0, 0.9, -0.45);
    if (this.useModel('model_cone_drone', 1.25, -0.65)) {
      // keep a spinning prop blur on top of the model
      const blur = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      blur.rotation.x = -Math.PI / 2; blur.position.y = 0.62; blur.userData.noShadow = true;
      this.model.add(blur);
      this.blur = blur;
    }
    this.shadow.scale.set(0.7, 1, 0.7);
    this.ground = y;
  }
  behave(dt) {
    if (this.opts.range !== 0) {
      const v = this.opts.dirV || (this.opts.axis === 'z' ? AXIS_Z : AXIS_X);
      const o = Math.sin(this.t * (this.opts.speed ?? 1.1)) * (this.opts.range ?? 3);
      this.pos.x = this.home.x + v.x * o;
      this.pos.z = this.home.z + v.z * o;
    }
    this.pos.y = this.home.y + this.hoverY + Math.sin(this.t * 3) * 0.35;
    this.prop.rotation.y += dt * 30;
    const p = this.player.pos;
    this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    if (this.glbWrap) { this.glbWrap.rotation.z = Math.sin(this.t * 2.2) * 0.12; this.glbWrap.rotation.x = Math.sin(this.t * 1.7) * 0.08; }
    if (this.blur) this.blur.scale.setScalar(0.9 + Math.sin(this.t * 40) * 0.1);
    this.shadow.position.y = this.ground - this.pos.y + 0.02;
  }
}

// ---------------- Vacuum Bot (fast patroller) ----------------
export class Vacuum extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    const { cyl, s1, box } = geos();
    const mm = mats();
    const m = this.model;
    m.add(part(cyl, mm.purple, 0, 0.3, 0, 0.55, 0.4, 0.55));
    m.add(part(cyl, mm.greyDark, 0, 0.53, 0, 0.42, 0.08, 0.42));
    m.add(part(cyl, mm.grey, 0, 0.12, 0, 0.58, 0.14, 0.58));
    for (const sx of [-1, 1]) {
      const e = part(s1, mm.red, sx * 0.18, 0.38, 0.47, 0.09, 0.06, 0.05); m.add(e);
      const b = part(box, mm.black, sx * 0.18, 0.47, 0.47, 0.17, 0.04, 0.04); b.rotation.z = sx * 0.4; m.add(b);
    }
    this.brush = new THREE.Group(); this.brush.position.set(0, 0.08, 0.5);
    for (let i = 0; i < 6; i++) { const r = part(box, mm.yellow, 0, 0, 0, 0.04, 0.04, 0.3); r.rotation.y = i * Math.PI / 6; this.brush.add(r); }
    m.add(this.brush);
    this.setBox(1.1, 0.7, 1.1);
    this.speed = opts.speed ?? 4.2;
    this.shadow.scale.set(1.3, 1, 1.3);
    this.useModel('model_vacuum', 0.85);
  }
  behave(dt) {
    this.patrol(dt, this.speed);
    this.brush.rotation.y += dt * 20;
    this.model.position.y = Math.abs(Math.sin(this.t * 20)) * 0.03;
    if (this.glbWrap) { this.glbWrap.rotation.z = Math.sin(this.t * 30) * 0.03; this.glbWrap.rotation.x = 0.06; }
  }
}

// ---------------- Bandit Mouse (scurrying patroller) ----------------
export class Mouse extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    const { s1, cyl, torusTail } = geos();
    const mm = mats();
    const m = this.model;
    m.add(part(s1, mm.grey, 0, 0.42, 0, 0.26, 0.34, 0.24));
    const head = new THREE.Group(); head.position.set(0, 0.82, 0.05); m.add(head);
    head.add(part(s1, mm.grey, 0, 0, 0, 0.2));
    head.add(part(s1, mm.pink, 0, -0.04, 0.2, 0.06));
    head.add(part(cyl, mm.purple, 0, 0.04, 0.08, 0.21, 0.07, 0.18));
    for (const sx of [-1, 1]) {
      head.add(part(s1, mm.grey, sx * 0.17, 0.2, -0.02, 0.13, 0.13, 0.04));
      head.add(part(s1, mm.pink, sx * 0.17, 0.2, 0.01, 0.08, 0.08, 0.02));
      head.add(part(s1, mm.white, sx * 0.08, 0.05, 0.17, 0.045));
    }
    const tail = new THREE.Mesh(torusTail, mm.pink); tail.scale.set(1, 0.3, 0.3); tail.position.set(0, 0.35, -0.35); tail.rotation.y = Math.PI / 2;
    m.add(tail);
    this.legs = [];
    for (const sx of [-1, 1]) { const l = part(cyl, mm.grey, sx * 0.1, 0.12, 0, 0.05, 0.24, 0.05); m.add(l); this.legs.push(l); }
    this.setBox(0.7, 1.0, 0.7);
    this.speed = opts.speed ?? 3.6;
    this.useModel('model_mouse', 1.15);
  }
  behave(dt) {
    this.patrol(dt, this.speed);
    const w = Math.sin(this.t * 22);
    this.legs[0].rotation.x = w * 0.8; this.legs[1].rotation.x = -w * 0.8;
    this.model.position.y = Math.abs(w) * 0.05;
    this.glbMotion(dt, true, 2.2);
  }
}

// ---------------- Yarn Ball (rolling hazard) ----------------
let yarnTex;
export class YarnBall extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    yarnTex ||= canvasTex(128, 128, (g) => {
      g.fillStyle = '#e8467a'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#ff8ab0'; g.lineWidth = 5;
      for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(0, i * 8 + Math.random() * 6); g.bezierCurveTo(40, Math.random() * 128, 90, Math.random() * 128, 128, i * 8); g.stroke(); }
    });
    this.r = opts.r ?? 0.6;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(this.r, 16, 12), new THREE.MeshLambertMaterial({ map: yarnTex }));
    this.ball.position.y = this.r;
    this.model.add(this.ball);
    this.setBox(this.r * 1.7, this.r * 1.9, this.r * 1.7);
    this.speed = opts.speed ?? 4;
    this.shadow.scale.set(this.r * 1.8, 1, this.r * 1.8);
    this.unstompable = false;
    this.touchDeath = 'flat';
  }
  behave(dt) {
    const before = this.off ?? 0;
    this.patrol(dt, this.speed);
    const moved = this.off - before;
    this.ball.rotation.x += Math.abs(moved) / this.r;
  }
}

// ---------------- Pill Bot (patrol + tumble charge) ----------------
// A green-and-white capsule robot. Patrols, then tips over and tumbles end-over-end at Nobu.
// Biting it splits the capsule in two.
let pillParts;
function pillGeo() {
  if (pillParts) return pillParts;
  const g = new THREE.CapsuleGeometry(0.34, 0.62, 8, 16);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const green = new THREE.Color(0x5fcb88), white = new THREE.Color(0xf6fbf8), shade = new THREE.Color(0x5fb38a);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i);
    const c = y < 0 ? (x > 0.18 ? shade : green) : (x > 0.2 ? new THREE.Color(0xc2d6d3) : white);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const half = (bottom) => {
    const h = new THREE.CapsuleGeometry(0.34, 0.31, 8, 16);
    h.translate(0, bottom ? -0.155 : 0.155, 0);
    return h;
  };
  pillParts = {
    body: g, halfG: half(true), halfW: half(false),
    mat: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: mats().white.gradientMap }),
    band: new THREE.TorusGeometry(0.345, 0.04, 6, 20),
    ink: toon(0x1f3a33), green: toon(0x5fcb88), whiteM: toon(0xf6fbf8),
  };
  return pillParts;
}

export class PillBot extends Enemy {
  constructor(stage, x, y, z, opts = {}) {
    super(stage, x, y, z, opts);
    const P = pillGeo();
    const { s1, cyl, box } = geos();
    const mm = mats();
    const m = this.model;
    this.pill = new THREE.Group();
    this.pill.position.y = 0.95;
    m.add(this.pill);
    this.pill.add(new THREE.Mesh(P.body, P.mat));
    const band = new THREE.Mesh(P.band, P.ink); band.rotation.x = Math.PI / 2; this.pill.add(band);
    // face on the white half
    for (const sx of [-1, 1]) {
      this.pill.add(part(s1, mm.white, sx * 0.12, 0.3, 0.29, 0.085, 0.1, 0.05));
      this.pill.add(part(s1, mm.black, sx * 0.12 + sx * 0.015, 0.29, 0.33, 0.04));
      const b = part(box, P.ink, sx * 0.12, 0.42, 0.3, 0.13, 0.03, 0.03); b.rotation.z = sx * 0.45; this.pill.add(b);
    }
    const mouth = part(box, P.ink, 0.02, 0.15, 0.32, 0.14, 0.025, 0.03); mouth.rotation.z = -0.25; this.pill.add(mouth);
    // shine dashes on the green half
    for (let i = 0; i < 3; i++) this.pill.add(part(box, mm.white, -0.24, -0.32 + i * 0.1, 0.2, 0.025, 0.06, 0.02));
    this.pill.add(part(cyl, mm.greyDark, 0, 0.75, 0, 0.02, 0.2, 0.02));
    this.pill.add(part(s1, mm.red, 0, 0.86, 0, 0.05));
    // stubby limbs
    this.legs = [];
    for (const sx of [-1, 1]) {
      const l = part(cyl, mm.greyDark, sx * 0.14, 0.2, 0, 0.05, 0.4, 0.05); m.add(l); this.legs.push(l);
      m.add(part(s1, P.ink, sx * 0.14, 0.03, 0.05, 0.09, 0.05, 0.12));
      const a = part(cyl, mm.greyDark, sx * 0.4, 0.95, 0, 0.035, 0.3, 0.035); a.rotation.z = sx * 0.7; m.add(a);
    }
    this.setBox(0.8, 1.5, 0.8);
    this.speed = opts.speed ?? 1.6;
    this.useModel('model_pill_bot', 1.55);
    this.mode = 'walk';
    this.modeT = rand(0, 1);
    this.cool = rand(0.5, 1.5);
    this.tumbleDir = new THREE.Vector3();
    this.halves = null;
  }

  behave(dt) {
    const p = this.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.modeT += dt;
    this.cool -= dt;
    if (this.mode === 'walk') {
      if (this.opts.range !== 0) this.patrol(dt, this.speed);
      const w = Math.sin(this.t * 10);
      this.legs[0].rotation.x = w * 0.6; this.legs[1].rotation.x = -w * 0.6;
      this.pill.rotation.set(0, 0, Math.sin(this.t * 5) * 0.06);
      this.pill.position.y = 0.95 + Math.abs(w) * 0.04;
      if (d < 6.5 && this.cool <= 0 && !p.dead && Math.abs(p.pos.y - this.pos.y) < 2) {
        this.mode = 'windup'; this.modeT = 0;
        this.facing = Math.atan2(dx, dz);
        this.tumbleDir.set(dx / d, 0, dz / d);
      }
    } else if (this.mode === 'windup') {
      // telegraph: wobble and lean back
      this.pill.rotation.set(-0.35 + Math.sin(this.modeT * 40) * 0.08, 0, 0);
      if (this.modeT > 0.5) { this.mode = 'tumble'; this.modeT = 0; audio.play('roll'); }
    } else if (this.mode === 'tumble') {
      const sp = 6.5;
      this.pos.x += this.tumbleDir.x * sp * dt;
      this.pos.z += this.tumbleDir.z * sp * dt;
      // keep within patrol leash so it doesn't tumble off the level
      const leash = (this.opts.range ?? 2.5) + 3;
      this.pos.x = Math.max(this.home.x - leash, Math.min(this.home.x + leash, this.pos.x));
      this.pos.z = Math.max(this.home.z - leash, Math.min(this.home.z + leash, this.pos.z));
      this.pill.rotation.set(this.modeT * 14, 0, 0);
      this.pill.position.y = 0.6;
      if (this.modeT > 1.1) { this.mode = 'dizzy'; this.modeT = 0; }
    } else if (this.mode === 'dizzy') {
      this.pill.rotation.set(0, 0, Math.sin(this.modeT * 18) * 0.25 * (1 - this.modeT / 0.8));
      this.pill.position.y = 0.95;
      if (this.modeT > 0.8) { this.mode = 'walk'; this.cool = 1.6; }
    }
    if (this.glbWrap) {
      // the whole capsule body wobbles / tumbles like the primitive one
      const w = this.glbWrap;
      w.rotation.copy(this.pill.rotation);
      w.position.y = this.mode === 'tumble' ? 0.75 + Math.abs(Math.sin(this.modeT * 7)) * 0.1 : 0;
      if (this.mode === 'tumble') { w.position.y = 0.78; }
      w.children[0].position.y = this.mode === 'tumble' ? -0.78 : 0;
    }
  }

  onBite(p) {
    if (!this.alive) return;
    this.split(p.pos);
  }

  split(from) {
    // pop the capsule into its two halves
    const P = pillGeo();
    const g = new THREE.Mesh(P.halfG, P.green), w = new THREE.Mesh(P.halfW, P.whiteM);
    const base = this.obj.position.clone(); base.y += 0.95;
    g.position.copy(base); w.position.copy(base);
    this.stage.scene.add(g, w);
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    this.halves = [
      { m: g, v: new THREE.Vector3(dx / d * 6 - dz / d * 3, 7, dz / d * 6 + dx / d * 3) },
      { m: w, v: new THREE.Vector3(dx / d * 6 + dz / d * 3, 9, dz / d * 6 - dx / d * 3) },
    ];
    this.halfT = 0;
    this.knock(from);
    this.obj.visible = false;
    this.fx.burst(base.x, base.y, base.z, { count: 10, colors: [0xffffff, 0xd8f0e8], size: 0.08, speed: 4, floor: this.pos.y });
  }

  update(dt) {
    if (this.halves) {
      this.halfT += dt;
      for (const h of this.halves) {
        h.v.y -= 20 * dt;
        h.m.position.addScaledVector(h.v, dt);
        h.m.rotation.x += dt * 10; h.m.rotation.z += dt * 7;
      }
      if (this.halfT > 1.4) { for (const h of this.halves) this.stage.scene.remove(h.m); this.halves = null; }
    }
    super.update(dt);
    if (this.state === 'knocked' && this.halves) this.obj.visible = false;
  }

  onReset() { this.mode = 'walk'; this.cool = 1; this.pill.rotation.set(0, 0, 0); }
}
