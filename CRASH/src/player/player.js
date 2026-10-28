// Nobu the player: movement, jumping, bite, slide, belly flop, damage, deaths.
import * as THREE from 'three';
import { moveBody, rideGround } from '../world/physics.js';
import { clamp, damp, dampAngle, overlaps, sphereBox, canvasTex } from '../core/util.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { save } from '../core/save.js';
import { Assets } from '../art/assets.js';
import { NobuAnimator } from './nobuAnim.js';
import { NobuPrims } from './nobuPrims.js';
import { NobuGlb } from './nobuGlb.js';
import { makeShadow, placeShadow } from '../entities/fx.js';

export const TUNING = {
  RUN: 8.0,
  ACCEL: 95,
  DECEL: 75,
  AIR_ACCEL: 42,
  GRAVITY: 36,
  FALL_MULT: 1.4,
  MAX_FALL: 28,
  JUMP: 12.6,
  DOUBLE_JUMP: 11.2,
  COYOTE: 0.11,
  BUFFER: 0.13,
  SLIDE_SPEED: 12.5,
  SLIDE_TIME: 0.5,
  SLIDE_JUMP_SPEED: 10.5,
  BITE_TIME: 0.34,
  BITE_RANGE: 0.95,
  FLOP_SPEED: 30,
  STOMP_BOUNCE: 10.5,
};

const _fwd = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export function createNobuModel(kind) {
  if (kind !== 'classic' && Assets.glb) {
    const m = new NobuGlb(Assets.glb);
    if (m.ok) return m;
  }
  return new NobuPrims();
}

export class Player {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.anim = new NobuAnimator();
    this.setModel(save.data.nobuModel);
    this.shadow = makeShadow(1.2);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.body = {
      pos: this.pos, vel: this.vel, hw: 0.3, hd: 0.3, h: 1.3, grounded: false, ground: null,
      onLand: (s, impact, was) => this._onLand(s, impact, was),
      onHead: (s) => { if (s.ref && s.ref.onHeadHit) s.ref.onHeadHit(this); },
    };
    this._makeDeathProps();
    this.reset();
  }

  setModel(kind) {
    if (this.model) this.root.remove(this.model.root);
    this.model = createNobuModel(kind);
    this.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root.add(this.model.root);
    this.modelKind = this.model instanceof NobuGlb ? 'glb' : 'classic';
  }

  attach(scene) {
    scene.add(this.root);
    scene.add(this.shadow);
  }

  reset() {
    this.mode = 'normal';
    this.vel.set(0, 0, 0);
    this.facing = Math.PI;
    this.targetFacing = Math.PI;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.canDouble = false;
    this.jumpCut = false;
    this.biteT = -1;
    this.biteCooldown = 0;
    this.bitten = new Set();
    this.airBiteUsed = false;
    this.slideT = 0;
    this.flopPhase = null;
    this.flopT = 0;
    this.invulnT = 0;
    this.deathType = null;
    this.deathT = 0;
    this.landT = 1;
    this.landImpact = 1;
    this.jumpT = 1;
    this.flipT = -1;
    this.idleTime = 0;
    this.prevY = this.pos.y;
    this.frozen = false;
    this.body.h = 1.3;
    this.body.grounded = false;
    this.body.ground = null;
    this.root.visible = true;
    this.model.setOpacity?.(1);
    this.model.setTint?.(0x000000, 0);
    this.wings.visible = false;
    this.halo.visible = false;
    this.deathCone.visible = false;
    this.stars.visible = false;
    this.speedMul = 1;
    this.lockForward = null;     // chase level: optional auto-run hint
  }

  spawnAt(p, facing = Math.PI) {
    this.reset();
    this.pos.copy(p);
    this.prevY = p.y;
    this.facing = this.targetFacing = facing;
    this.root.position.copy(p);
    this.root.rotation.y = facing;
  }

  get dead() { return this.mode === 'dead'; }
  get invincible() { return this.game.session?.invincibleT > 0; }
  get forward() { return _fwd.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  get grounded() { return this.body.grounded; }

  // ---------- main update ----------
  update(dt, stage, camBasis) {
    if (this.frozen) { this._animate(dt); return; }
    if (this.mode === 'dead') { this._updateDeath(dt, stage); this._animate(dt); return; }
    if (this.mode === 'victory') { this._animate(dt); this._updateShadow(stage); return; }

    const T = TUNING;
    const st = input.state;
    // camera-relative intent
    let dx = camBasis.right.x * st.x + camBasis.forward.x * st.y;
    let dz = camBasis.right.z * st.x + camBasis.forward.z * st.y;
    const len = Math.hypot(dx, dz);
    const mag = Math.min(1, len);
    if (len > 0.001) { dx /= len; dz /= len; }

    this.biteCooldown -= dt;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (input.pressed('jump')) this.jumpBuffer = T.BUFFER;
    this.coyote = this.body.grounded ? T.COYOTE : Math.max(0, this.coyote - dt);
    this.landT += dt; this.jumpT += dt;
    if (this.flipT >= 0) { this.flipT += dt / 0.42; if (this.flipT >= 1) this.flipT = -1; }

    const grounded = this.body.grounded;

    // ---- actions ----
    if (this.mode === 'normal') {
      if (input.pressed('bite') && this.biteCooldown <= 0 && this.biteT < 0) this._startBite();
      if (input.pressed('slide')) {
        if (grounded) this._startSlide(mag > 0.2 ? Math.atan2(dx, dz) : this.facing);
        else this._startFlop();
      }
    }

    // ---- horizontal movement ----
    if (this.mode === 'normal') {
      const speed = T.RUN * this.speedMul;
      const tx = dx * mag * speed, tz = dz * mag * speed;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      // skid when slamming the stick the other way at speed
      if (grounded && mag > 0.5 && hs > 4.5 && (this.vel.x * dx + this.vel.z * dz) / hs < -0.45 && this.skidT <= 0) {
        this.skidT = 0.16;
        audio.play('slide');
      }
      this.skidT = Math.max(0, (this.skidT || 0) - dt);
      let accel = grounded ? (mag > 0.05 ? T.ACCEL : T.DECEL) : T.AIR_ACCEL;
      if (this.skidT > 0) {
        accel = T.DECEL * 1.6;
        if (Math.random() < 0.6) this.game.fx?.puff(this.pos.x, this.pos.y + 0.05, this.pos.z, { count: 1, size: 0.3, color: 0xf0e6d6, up: 0.6, speed: 1.2 });
      }
      this._approach(tx, tz, accel * dt);
      if (mag > 0.1) this.targetFacing = Math.atan2(dx, dz);
      const prevFacing = this.facing;
      this.facing = dampAngle(this.facing, this.targetFacing, grounded ? 30 : 12, dt);
      // bank into turns
      let dYaw = this.facing - prevFacing;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      const bankTarget = Math.max(-0.32, Math.min(0.32, -(dYaw / Math.max(dt, 1e-4)) * 0.05 * Math.min(1, hs / T.RUN)));
      this.bank = damp(this.bank || 0, grounded ? bankTarget : bankTarget * 0.4, 10, dt);
    } else if (this.mode === 'slide') {
      this.slideT += dt;
      const f = this.forward;
      const k = this.slideT < 0.28 ? 1 : Math.max(0, 1 - (this.slideT - 0.28) / 0.22);
      const sp = T.SLIDE_SPEED * k + (mag > 0.1 ? 3 : 0) * (1 - k);
      // gentle steering
      if (mag > 0.1) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 3, dt);
      this.vel.x = f.x * sp; this.vel.z = f.z * sp;
      if (this.slideT % 0.06 < dt) this.game.fx?.puff(this.pos.x, this.pos.y + 0.1, this.pos.z, { count: 1, size: 0.3, color: 0xe8dcc8, up: 0.5, speed: 1 });
      if (this.slideT >= T.SLIDE_TIME || !grounded) this._endSlide();
    } else if (this.mode === 'flop') {
      this.flopT += dt;
      this.vel.x = 0; this.vel.z = 0;
      if (this.flopPhase === 'wind') {
        this.vel.y = 1.2;
        if (this.flopT > 0.2) { this.flopPhase = 'fall'; this.flopT = 0; this.vel.y = -T.FLOP_SPEED; }
      } else if (this.flopPhase === 'fall') {
        this.vel.y = -T.FLOP_SPEED;
      } else if (this.flopPhase === 'land') {
        if (this.flopT > 0.32) { this.mode = 'normal'; this.flopPhase = null; }
      }
    }

    // ---- jumping ----
    if (this.jumpBuffer > 0 && (this.mode === 'normal' || this.mode === 'slide')) {
      if (grounded || this.coyote > 0) {
        const fromSlide = this.mode === 'slide';
        if (fromSlide) this._endSlide(true);
        this._jump(T.JUMP);
        if (fromSlide) {
          const f = this.forward;
          this.vel.x = f.x * T.SLIDE_JUMP_SPEED; this.vel.z = f.z * T.SLIDE_JUMP_SPEED;
        }
      } else if (this.canDouble && this.mode === 'normal') {
        this.canDouble = false;
        this.jumpBuffer = 0;
        this.vel.y = T.DOUBLE_JUMP;
        this.jumpCut = false;
        this.flipT = 0;
        this.jumpT = 0;
        audio.play('doubleJump');
        this.game.fx?.puff(this.pos.x, this.pos.y, this.pos.z, { count: 5, size: 0.35, color: 0xffffff, up: -1, speed: 2 });
      }
    }
    // variable jump height
    if (!input.held('jump') && this.vel.y > 0 && !this.jumpCut && this.mode === 'normal') {
      this.vel.y *= 0.55;
      this.jumpCut = true;
    }

    // ---- gravity (with a little hang time at the apex while jump is held) ----
    if (this.mode !== 'flop') {
      let g = T.GRAVITY * (this.vel.y < 0 ? T.FALL_MULT : 1);
      if (!grounded && input.held('jump') && Math.abs(this.vel.y) < 2.2 && !this.jumpCut) g *= 0.55;
      this.vel.y = Math.max(-T.MAX_FALL, this.vel.y - g * dt);
    }

    // ---- bite timing ----
    if (this.biteT >= 0) {
      this.biteT += dt / T.BITE_TIME;
      if (this.biteT >= 1) { this.biteT = -1; this.biteCooldown = 0.08; }
    }

    // ---- physics (substeps keep thin platforms solid at fall speed) ----
    this.prevY = this.pos.y;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const wasGrounded = this.body.grounded;
    rideGround(this.body);
    for (let i = 0; i < steps; i++) moveBody(stage.world, this.body, h);
    if (wasGrounded && !this.body.grounded && this.vel.y <= 0) this.canDouble = true; // walked off a ledge
    if (this.body.grounded) { this.airBiteUsed = false; this.canDouble = false; }

    // ---- idle timer ----
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.mode === 'normal' && this.body.grounded && hs < 0.3 && this.biteT < 0) this.idleTime += dt;
    else this.idleTime = 0;
    // after a while, turn to look at the camera like a proper 90s mascot
    if (this.idleTime > 3.0 && camBasis.toCamera !== undefined) this.targetFacing = camBasis.toCamera;

    // ---- interactions + hazards ----
    this._interact(stage);
    if (this.pos.y < stage.killYAt(this.pos, this.body) && this.mode !== 'dead') this.die('fall');

    this._animate(dt);
    this._updateShadow(stage);
  }

  _approach(tx, tz, maxDelta) {
    const ex = tx - this.vel.x, ez = tz - this.vel.z;
    const d = Math.hypot(ex, ez);
    if (d <= maxDelta || d < 1e-5) { this.vel.x = tx; this.vel.z = tz; }
    else { this.vel.x += (ex / d) * maxDelta; this.vel.z += (ez / d) * maxDelta; }
  }

  _jump(v) {
    this.vel.y = v;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.jumpCut = false;
    this.canDouble = true;
    this.jumpT = 0;
    this.body.grounded = false;
    audio.play('jump');
  }

  // External bounce (enemy stomp, backpack, trampoline). Holding jump bounces higher.
  bounce(v, { allowCut = true } = {}) {
    if (this.mode === 'dead') return;
    if (this.mode === 'flop') { this.mode = 'normal'; this.flopPhase = null; }
    this.vel.y = input.held('jump') ? v * 1.15 : v;
    this.jumpCut = !allowCut || !input.held('jump') ? true : false;
    this.canDouble = true;
    this.jumpT = 0;
    this.body.grounded = false;
    this.body.ground = null;
  }

  _startBite() {
    this.biteT = 0;
    this.bitten = new Set();
    audio.play('bite');
    const f = this.forward;
    this.vel.x += f.x * 3; this.vel.z += f.z * 3;
    if (!this.body.grounded && !this.airBiteUsed) {
      this.vel.y = Math.max(this.vel.y, 3.2);
      this.airBiteUsed = true;
    }
    this.idleTime = 0;
  }

  _startSlide(dir) {
    this.mode = 'slide';
    this.slideT = 0;
    this.facing = this.targetFacing = dir;
    this.body.h = 0.75;
    this.bitten = new Set();
    audio.play('slide');
  }

  _endSlide(intoJump = false) {
    // stand back up only if there is headroom
    const w = this.game.stage.world;
    const hits = w.query(this.pos.x - 0.3, this.pos.y + 0.76, this.pos.z - 0.3, this.pos.x + 0.3, this.pos.y + 1.3, this.pos.z + 0.3, []);
    if (hits.length && !intoJump) { this.slideT = 0.3; return; }
    this.mode = 'normal';
    this.body.h = 1.3;
  }

  _startFlop() {
    this.mode = 'flop';
    this.flopPhase = 'wind';
    this.flopT = 0;
    this.biteT = -1;
    audio.play('flopStart');
  }

  _onLand(solid, impact, wasGrounded) {
    if (solid.ref && solid.ref.onLand) {
      const handled = solid.ref.onLand(this, impact);
      if (handled) return;
    }
    if (wasGrounded) return;
    this.landT = 0;
    this.landImpact = clamp(-impact / 14, 0.3, 1.2);
    if (this.mode === 'flop' && this.flopPhase === 'fall') {
      this.flopPhase = 'land';
      this.flopT = 0;
      this.vel.y = 0;
      audio.play('flop');
      this.game.onFlop(this.pos.clone());
      return;
    }
    if (impact < -6) {
      audio.play('land');
      this.game.fx?.puff(this.pos.x, this.pos.y + 0.05, this.pos.z, { count: 4, size: 0.3, color: 0xf2ead8, up: 0.4, speed: 2.2 });
    }
  }

  // ---------- interactions ----------
  _interact(stage) {
    const p = this.pos;
    const pbox = {
      min: { x: p.x - 0.36, y: p.y, z: p.z - 0.36 },
      max: { x: p.x + 0.36, y: p.y + this.body.h, z: p.z + 0.36 },
    };
    const biting = this.biteT >= 0.1 && this.biteT <= 0.75;
    const f = this.forward;
    const bx = p.x + f.x * 0.75, by = p.y + 0.75, bz = p.z + f.z * 0.75;
    const sliding = this.mode === 'slide';
    for (const e of stage.entities) {
      if (e.dead || !e.interactive || !e.box) continue;
      if (Math.abs(e.pos.z - p.z) > 8) continue;
      const eb = e.box;
      if (biting && !this.bitten.has(e) && (sphereBox(bx, by, bz, TUNING.BITE_RANGE, eb) || sphereBox(p.x, p.y + 0.7, p.z, 0.75, eb))) {
        this.bitten.add(e);
        e.onBite?.(this);
        if (this.mode === 'dead') return;
        continue;
      }
      if (!overlaps(pbox, eb)) continue;
      if (sliding && !this.bitten.has(e) && e.onSlide) {
        this.bitten.add(e);
        e.onSlide(this);
        continue;
      }
      if (this.vel.y < 0 && this.prevY >= eb.max.y - 0.4 && e.onStomp) {
        e.onStomp(this);
      } else if (e.onTouch) {
        e.onTouch(this);
      }
      if (this.mode === 'dead') return;
    }
  }

  // ---------- damage ----------
  // Returns true if the hit landed (mask absorbed it or Nobu died).
  hurt(type = 'angel', fromX, fromZ) {
    if (this.mode === 'dead' || this.invulnT > 0 || this.invincible) return false;
    const s = this.game.session;
    if (s && s.mask > 0) {
      s.setMask(s.mask - 1);
      this.invulnT = 1.7;
      audio.play('maskLost');
      this.game.camera.shake(0.35, 0.3);
      if (fromX !== undefined) {
        const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
        const d = Math.hypot(dx, dz) || 1;
        this.vel.x = (dx / d) * 6; this.vel.z = (dz / d) * 6;
      }
      if (this.body.grounded) this.vel.y = 6;
      return true;
    }
    this.die(type);
    return true;
  }

  die(type = 'angel') {
    if (this.mode === 'dead') return;
    if (this.mode === 'slide') this.body.h = 1.3;
    this.mode = 'dead';
    this.deathType = type;
    this.deathT = 0;
    this.biteT = -1;
    this.vel.x = 0; this.vel.z = 0;
    if (type !== 'fall') this.vel.y = 0;
    this.game.camera.shake(type === 'fall' ? 0.1 : 0.45, 0.35);
    if (type === 'rug') audio.play('rugDeath'); else audio.play('death');
    if (type === 'puff') {
      this.game.fx?.puff(this.pos.x, this.pos.y + 0.5, this.pos.z, { count: 16, size: 0.7, color: 0xdddddd, up: 2, speed: 3, life: 1.1 });
    }
    if (type === 'angel' || type === 'puff') {
      this.wings.visible = true; this.halo.visible = true;
    }
    if (type === 'cone') this.deathCone.visible = true;
    if (type === 'flat') this.stars.visible = true;
    if (type === 'rug') this._rugFly = 0;
    this.game.onPlayerDeath(type);
  }

  _updateDeath(dt, stage) {
    this.deathT += dt;
    const t = this.deathT;
    if (this.deathType === 'fall') {
      this.vel.y = Math.max(-TUNING.MAX_FALL, this.vel.y - TUNING.GRAVITY * dt);
      this.pos.y += this.vel.y * dt;
      this.pos.x += this.vel.x * dt;
    }
    if (this.deathType === 'angel' || this.deathType === 'puff') {
      this.model.root.position.y = t * 1.3;
      this.model.setOpacity?.(Math.max(0.15, 0.85 - t * 0.35));
      this.wings.children.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.5 + Math.sin(t * 16) * 0.5); });
      this.root.visible = !(this.deathType === 'puff' && t < 0.35);
    }
    if (this.deathType === 'cone') {
      const k = Math.min(1, t / 0.35);
      this.deathCone.position.y = 1.15 + (1 - k) * 3;
      this.deathCone.rotation.z = Math.sin(t * 3) * 0.08;
    }
    if (this.deathType === 'flat') this.stars.rotation.y += dt * 5;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  victory() {
    this.mode = 'victory';
    this.vel.set(0, 0, 0);
  }

  // ---------- visuals ----------
  _animate(dt) {
    const st = {
      mode: this.mode === 'dead' ? 'dead' : this.mode === 'victory' ? 'victory' : this.mode,
      speed: Math.hypot(this.vel.x, this.vel.z),
      vy: this.vel.y,
      grounded: this.body.grounded,
      biteT: this.biteT,
      flipT: this.flipT,
      landT: this.landT, landImpact: this.landImpact,
      jumpT: this.jumpT,
      idleTime: this.idleTime,
      flopPhase: this.flopPhase, flopT: this.flopT,
      deathType: this.deathType, deathT: this.deathT,
      bank: this.bank || 0, skid: (this.skidT || 0) > 0,
    };
    if (this.frozen && this.mode === 'normal') { st.speed = 0; st.grounded = true; }
    const pose = this.anim.update(dt, st);
    this.model.apply(pose);
    if (this.mode !== 'dead') {
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.facing;
      this.model.root.position.y = 0;
    }
    // invulnerability blink / invincibility glow
    if (this.invincible) {
      const k = 0.35 + Math.sin(performance.now() / 60) * 0.25;
      const hue = (performance.now() / 600) % 1;
      this.model.setTint?.(_col.setHSL(hue, 1, 0.5), k);
      this.root.visible = true;
    } else if (this.invulnT > 0) {
      this.root.visible = Math.floor(this.invulnT * 16) % 2 === 0;
      this.model.setTint?.(0x000000, 0);
    } else if (this.mode !== 'dead') {
      this.root.visible = true;
      this.model.setTint?.(0x000000, 0);
    }
  }

  _updateShadow(stage) {
    placeShadow(this.shadow, stage.world, this.pos.x, this.pos.y, this.pos.z);
  }

  _makeDeathProps() {
    // angel wings + halo
    const featherTex = canvasTex(64, 128, (g) => {
      g.fillStyle = '#fff';
      g.strokeStyle = '#c9c2e0'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(4, 8); g.quadraticCurveTo(64, 0, 60, 120); g.quadraticCurveTo(30, 90, 4, 8); g.fill(); g.stroke();
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(8 + i * 4, 10 + i * 18); g.lineTo(56, 30 + i * 20); g.stroke(); }
    });
    const wm = new THREE.MeshBasicMaterial({ map: featherTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.wings = new THREE.Group();
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.12, 0.95, -0.2);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), wm);
      w.position.set(sx * 0.27, 0.1, 0);
      w.scale.x = sx;
      pivot.add(w);
      this.wings.add(pivot);
    }
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffd84a }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 1.72;
    this.model.root.add(this.wings, this.halo);
    // cone of shame
    const coneGeo = new THREE.CylinderGeometry(0.62, 0.2, 0.55, 18, 1, true);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xd8d0ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    this.deathCone = new THREE.Mesh(coneGeo, coneMat);
    this.deathCone.rotation.x = Math.PI / 2 - 0.25;
    this.deathCone.position.set(0, 1.15, 0.12);
    this.root.add(this.deathCone);
    // dizzy stars ring
    this.stars = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), starMat);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.45, 0.35, Math.sin(a) * 0.45);
      this.stars.add(s);
    }
    this.root.add(this.stars);
  }

  // Swap the model (pause menu toggle) while keeping death props attached.
  rebuildModel(kind) {
    this.model.root.remove(this.wings, this.halo);
    this.setModel(kind);
    this.model.root.add(this.wings, this.halo);
  }
}

const _col = new THREE.Color();
