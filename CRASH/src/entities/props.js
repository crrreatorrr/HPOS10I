// Level props and interactive mechanics.
// Platforms: static, moving, crumbling, sinking lily pads, flipping planks, cracked floors (belly flop to break).
// Interactions: Bone Switch (builds a ghost bridge), Rope drawbridge (bite the rope), bounce mushrooms,
// updraft fans, swinging cone hammers, cone stampers, rolling coconuts, conveyor belts.
// Decor: palms, bushes, ferns, flowers, rocks, fences, scratch posts, pipes, vats, cone stacks.
import * as THREE from 'three';
import { Entity } from './entity.js';
import { Solid } from '../world/physics.js';
import { Assets } from '../art/assets.js';
import { toon } from '../player/nobuPrims.js';
import { canvasTex, rand, pick, damp } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { makeShadow, textSprite } from './fx.js';
import { TUNING } from '../player/player.js';

const UPV = new THREE.Vector3(0, 1, 0);

// Box mesh with the theme's platform texture and non-stretched UVs.
export function platformMesh(stage, w, h, d, tint = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const sx = ny > 0.5 ? w : nx > 0.5 ? d : w;
    const sy = ny > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / 2, (uv.getY(i) * sy) / 2);
  }
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: Assets.tiled(stage.theme.platform), color: tint ?? 0xffffff }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Axis-aligned collision box that covers a yaw-rotated w x d rectangle.
function rotatedHalf(w, d, yaw) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  return { hx: (w * c + d * s) / 2, hz: (w * s + d * c) / 2 };
}

// ---------------- platforms ----------------
export class StaticPlatform extends Entity {
  constructor(stage, x, y, z, { w = 2.4, h = 0.5, d = 2.4, yaw = 0, tint } = {}) {
    super(stage, x, y, z);
    this.mesh = platformMesh(stage, w, h, d, tint);
    this.mesh.position.y = -h / 2;
    this.obj.rotation.y = yaw;
    this.obj.add(this.mesh);
    const { hx, hz } = rotatedHalf(w * 0.92, d * 0.92, yaw);
    this.solid = stage.world.add(new Solid({ x: x - hx, y: y - h, z: z - hz }, { x: x + hx, y, z: z + hz }));
    this.interactive = false;
  }
}

export class MovingPlatform extends Entity {
  constructor(stage, x, y, z, { w = 2.4, h = 0.5, d = 2.4, dir = new THREE.Vector3(1, 0, 0), range = 3, speed = 1, phase = 0, yaw = 0 } = {}) {
    super(stage, x, y, z);
    this.dim = { w, h, d };
    this.dir = dir.clone().normalize();
    this.range = range; this.speed = speed; this.phase = phase;
    this.mesh = platformMesh(stage, w, h, d);
    this.mesh.position.y = -h / 2;
    this.obj.rotation.y = yaw;
    this.obj.add(this.mesh);
    // little glowing runners so moving platforms read at a glance
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, d * 0.9), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
      r.position.set(sx * (w / 2 - 0.1), 0.02, 0);
      this.obj.add(r);
    }
    const { hx, hz } = rotatedHalf(w * 0.95, d * 0.95, yaw);
    this.half = { hx, hz };
    this.solid = stage.world.add(new Solid({ x: x - hx, y: y - h, z: z - hz }, { x: x + hx, y, z: z + hz }, { kind: 'moving' }));
    this.interactive = false;
    this.alwaysActive = true;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const o = Math.sin(this.t * this.speed + this.phase) * this.range;
    this.pos.copy(this.home).addScaledVector(this.dir, o);
    this.obj.position.copy(this.pos);
    const { hx, hz } = this.half;
    this.solid.setCenter(this.pos.x, this.pos.y - this.dim.h, this.pos.z, hx * 2, this.dim.h, hz * 2);
  }
}

// Falls shortly after Nobu stands on it, then respawns.
export class CrumblePlatform extends Entity {
  constructor(stage, x, y, z, { w = 2, h = 0.5, d = 2, yaw = 0 } = {}) {
    super(stage, x, y, z);
    this.dim = { w, h, d };
    this.mesh = platformMesh(stage, w, h, d, 0xffc890);
    this.mesh.position.y = -h / 2;
    this.obj.rotation.y = yaw;
    this.obj.add(this.mesh);
    const { hx, hz } = rotatedHalf(w * 0.95, d * 0.95, yaw);
    this.half = { hx, hz };
    this.solid = stage.world.add(new Solid({ x: x - hx, y: y - h, z: z - hz }, { x: x + hx, y, z: z + hz }, { kind: 'moving' }));
    this.interactive = false;
    this.state = 'idle';
    this.t = 0;
  }
  update(dt) {
    const p = this.player;
    if (this.state === 'idle' && p.body.grounded && p.body.ground === this.solid) { this.state = 'shake'; this.t = 0; audio.play('roll'); }
    if (this.state === 'shake') {
      this.t += dt;
      this.mesh.position.x = Math.sin(this.t * 60) * 0.06;
      this.mesh.rotation.z = Math.sin(this.t * 45) * 0.03;
      if (this.t > 0.55) { this.state = 'fall'; this.t = 0; this.vy = 0; }
    } else if (this.state === 'fall') {
      this.t += dt;
      this.vy -= 25 * dt;
      this.pos.y += this.vy * dt;
      this.obj.position.y = this.pos.y;
      this.obj.rotation.x += dt * 1.5;
      this.solid.setCenter(this.pos.x, this.pos.y - this.dim.h, this.pos.z, this.half.hx * 2, this.dim.h, this.half.hz * 2);
      if (this.t > 0.2) this.solid.enabled = false;
      if (this.t > 2.8) this.reset();
    }
  }
  reset() {
    this.state = 'idle';
    this.pos.copy(this.home);
    this.obj.position.copy(this.home);
    this.obj.rotation.x = 0;
    this.mesh.position.x = 0; this.mesh.rotation.z = 0;
    this.solid.setCenter(this.pos.x, this.pos.y - this.dim.h, this.pos.z, this.half.hx * 2, this.dim.h, this.half.hz * 2);
    this.solid.enabled = true;
  }
}

// Lily pad: sinks while you stand on it, floats back up when you leave.
let padTex;
export class LilyPad extends Entity {
  constructor(stage, x, y, z, { r = 1.3 } = {}) {
    super(stage, x, y, z);
    padTex ||= canvasTex(128, 128, (g) => {
      g.fillStyle = '#3fae46'; g.beginPath(); g.arc(64, 64, 62, 0.25, Math.PI * 2 - 0.05); g.lineTo(64, 64); g.fill();
      g.strokeStyle = '#2a8a34'; g.lineWidth = 3;
      for (let i = 0; i < 10; i++) { const a = 0.3 + i * 0.6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
    });
    this.r = r;
    this.pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 20), [toon(0x2f8a36), new THREE.MeshLambertMaterial({ map: padTex }), toon(0x2f8a36)]);
    this.pad.position.y = -0.07;
    this.pad.rotation.y = rand(0, 6);
    this.obj.add(this.pad);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0xff7ab0));
    flower.position.set(r * 0.4, 0.1, 0.2);
    this.pad.add(flower);
    this.solid = stage.world.add(new Solid({ x: x - r * 0.8, y: y - 0.14, z: z - r * 0.8 }, { x: x + r * 0.8, y, z: z + r * 0.8 }, { kind: 'moving' }));
    this.interactive = false;
    this.alwaysActive = true;
    this.sink = 0;
    this.t = rand(0, 6);
  }
  update(dt) {
    this.t += dt;
    const on = this.player.body.grounded && this.player.body.ground === this.solid;
    this.sink = on ? Math.min(1.4, this.sink + dt * 0.7) : Math.max(0, this.sink - dt * 1.2);
    const bob = Math.sin(this.t * 2) * 0.04;
    this.pos.y = this.home.y - this.sink + bob;
    this.obj.position.y = this.pos.y;
    this.pad.rotation.z = Math.sin(this.t * 1.6) * 0.03;
    this.solid.setCenter(this.pos.x, this.pos.y - 0.14, this.pos.z, this.r * 1.6, 0.14, this.r * 1.6);
    this.solid.enabled = this.sink < 1.3;
  }
}

// Plank that flips over every few seconds (non-solid while flipping). Shakes first as a warning.
export class FlipPlank extends Entity {
  constructor(stage, x, y, z, { w = 2.6, d = 2.2, period = 3.2, phase = 0, yaw = 0 } = {}) {
    super(stage, x, y, z);
    this.w = w; this.d = d; this.period = period;
    this.pivot = new THREE.Group();
    this.obj.add(this.pivot);
    this.obj.rotation.y = yaw;
    const top = platformMesh(stage, w, 0.3, d);
    top.position.y = -0.15;
    const under = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.05, d * 0.98), new THREE.MeshBasicMaterial({ color: 0xff3a3a }));
    under.position.y = -0.32;
    this.pivot.add(top, under);
    const { hx, hz } = rotatedHalf(w * 0.92, d * 0.92, yaw);
    this.solid = stage.world.add(new Solid({ x: x - hx, y: y - 0.3, z: z - hz }, { x: x + hx, y, z: z + hz }));
    this.interactive = false;
    this.t = phase;
  }
  update(dt) {
    this.t += dt;
    const c = (this.t % this.period) / this.period;
    let rot = 0, shake = 0;
    if (c > 0.62 && c < 0.75) shake = Math.sin(this.t * 60) * 0.04;
    if (c >= 0.75) rot = Math.min(1, (c - 0.75) / 0.12) * Math.PI;
    if (c >= 0.93) rot = Math.PI + Math.min(1, (c - 0.93) / 0.07) * Math.PI;
    this.pivot.rotation.z = rot + shake;
    this.solid.enabled = c < 0.78;
  }
}

// Cracked floor tile: only a belly flop breaks it (leads to a secret below).
let crackTex;
export class CrackedFloor extends Entity {
  constructor(stage, x, y, z, { w = 3, d = 3, yaw = 0 } = {}) {
    super(stage, x, y, z);
    crackTex ||= canvasTex(128, 128, (g) => {
      g.fillStyle = '#b98a5a'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#3a2410'; g.lineWidth = 4;
      const crack = (x, y) => { g.beginPath(); g.moveTo(64, 64); let cx = 64, cy = 64; for (let i = 0; i < 5; i++) { cx += (x - 64) / 5 + rand(-8, 8); cy += (y - 64) / 5 + rand(-8, 8); g.lineTo(cx, cy); } g.stroke(); };
      crack(0, 10); crack(128, 30); crack(20, 128); crack(118, 118); crack(64, 0);
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), [toon(0x8a6a4a), toon(0x8a6a4a), new THREE.MeshLambertMaterial({ map: crackTex }), toon(0x8a6a4a), toon(0x8a6a4a), toon(0x8a6a4a)]);
    this.mesh.position.y = -0.2;
    this.obj.rotation.y = yaw;
    this.obj.add(this.mesh);
    const { hx, hz } = rotatedHalf(w, d, yaw);
    this.solid = stage.world.add(new Solid({ x: x - hx, y: y - 0.4, z: z - hz }, { x: x + hx, y, z: z + hz }, { kind: 'static', ref: this }));
    this.interactive = false;
    this.w = w; this.d = d;
  }
  onLand(p) {
    if (p.mode === 'flop' && this.solid.enabled) {
      this.solid.enabled = false;
      this.obj.visible = false;
      audio.play('break');
      this.fx.burst(this.pos.x, this.pos.y, this.pos.z, { count: 26, colors: [0x8a6a4a, 0xb98a5a, 0x5a3a20], speed: 5, size: 0.3 });
      this.game.ui.banner('SECRET!', 'nice belly flop', 1.4);
      p.vel.y = -TUNING.FLOP_SPEED; p.body.grounded = false; p.body.ground = null;
      return true;
    }
    return false;
  }
  reset() { this.solid.enabled = true; this.obj.visible = true; }
}

// Bounce mushroom: launches Nobu up (and a little forward).
export class BouncePad extends Entity {
  constructor(stage, x, y, z, { power = 16, color = 0xe8322f } = {}) {
    super(stage, x, y, z);
    this.power = power;
    this.cap = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(color));
    cap.scale.y = 0.6;
    this.cap.add(cap);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = i ? 0.55 : 0;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(0xffffff));
      dot.position.set(Math.cos(a) * r, Math.sqrt(Math.max(0, 0.81 - r * r)) * 0.6 - 0.02, Math.sin(a) * r);
      dot.scale.y = 0.4;
      this.cap.add(dot);
    }
    this.cap.position.y = 0.55;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.6, 12), toon(0xfff0d8));
    stem.position.y = 0.3;
    this.obj.add(stem, this.cap);
    this.solid = stage.world.add(new Solid({ x: x - 0.75, y, z: z - 0.75 }, { x: x + 0.75, y: y + 0.8, z: z + 0.75 }, { kind: 'static', ref: this }));
    this.interactive = false;
    this.squash = 0;
    this.t = rand(0, 6);
  }
  update(dt) {
    this.t += dt;
    this.squash = Math.max(0, this.squash - dt * 2.5);
    const k = Math.sin(this.squash * 16) * this.squash;
    this.cap.scale.set(1 + k * 0.3, 1 - k * 0.5 + Math.sin(this.t * 3) * 0.03, 1 + k * 0.3);
  }
  onLand(p) {
    p.bounce(this.power, { allowCut: false });
    const f = p.forward;
    p.vel.x += f.x * 1.5; p.vel.z += f.z * 1.5;
    this.squash = 1;
    audio.play('boing');
    this.fx.sparkle(this.pos.x, this.pos.y + 0.9, this.pos.z, { count: 6, color: 0xffffff, size: 0.5 });
    return true;
  }
}

// Bone Switch ("!" box): break it and a ghost bridge pops into existence.
export class BoneSwitch extends Entity {
  constructor(stage, x, y, z, platforms) {
    super(stage, x, y, z);
    this.platforms = platforms; // [{x,y,z,w,d,yaw}]
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), toon(0x2a8cff));
    box.position.y = 0.475;
    const bone = textSprite('🦴', { size: 110, color: '#ffffff' });
    bone.material.depthTest = true;
    bone.scale.setScalar(0.75);
    bone.position.set(0, 0.5, 0.5);
    const bang = textSprite('!', { color: '#ffd23f' });
    bang.scale.setScalar(0.6);
    bang.position.set(0, 1.4, 0);
    this.bang = bang;
    this.box = null;
    this.obj.add(box, bone, bang);
    this.setBox(1, 1, 1);
    this.solid = stage.world.add(new Solid({ x: x - 0.48, y, z: z - 0.48 }, { x: x + 0.48, y: y + 0.95, z: z + 0.48 }, { kind: 'static', ref: this }));
    // ghost outlines of the bridge
    this.ghosts = platforms.map((pl) => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(pl.w, 0.4, pl.d), new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.25, wireframe: true }));
      g.position.set(pl.x, pl.y - 0.2, pl.z);
      g.rotation.y = pl.yaw || 0;
      stage.scene.add(g);
      return g;
    });
    this.built = [];
    this.t = 0;
    this.used = false;
  }
  update(dt) {
    this.t += dt;
    this.bang.position.y = 1.4 + Math.abs(Math.sin(this.t * 4)) * 0.2;
    for (const g of this.ghosts) g.material.opacity = 0.2 + Math.sin(this.t * 4) * 0.08;
  }
  press(p) {
    if (this.used) return;
    this.used = true;
    this.obj.visible = false;
    this.solid.enabled = false;
    this.interactive = false;
    audio.play('switch');
    this.fx.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, { count: 14, colors: [0x2a8cff, 0xffffff], speed: 4 });
    this.platforms.forEach((pl, i) => {
      setTimeout(() => {
        const plat = new StaticPlatform(this.stage, pl.x, pl.y, pl.z, { w: pl.w, d: pl.d, h: 0.4, yaw: pl.yaw || 0, tint: 0xbfe6ff });
        plat.obj.scale.setScalar(0.01);
        this.stage.add(plat);
        plat.update = (dt) => { const s = plat.obj.scale.x; if (s < 1) plat.obj.scale.setScalar(Math.min(1, s + dt * 6)); };
        this.ghosts[i].visible = false;
        this.built.push(plat);
        audio.play('ticket');
        this.fx.sparkle(pl.x, pl.y, pl.z, { count: 8, color: 0x7fd4ff });
      }, 120 * i);
    });
  }
  onBite(p) { this.press(p); }
  onSlide(p) { this.press(p); }
  onHeadHit(p) { this.press(p); }
  onLand(p) { if (this.used) return false; this.press(p); p.bounce(TUNING.STOMP_BOUNCE); return true; }
  onTouch() {}
}

// Rope drawbridge: bite the rope post and the bridge swings down over the gap.
export class RopeBridge extends Entity {
  constructor(stage, x, y, z, { span, track, d0, d1, yaw = 0 }) {
    super(stage, x, y, z);
    this.span = span;           // track ground span to enable when lowered
    span.disabled = true;
    // post with rope
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8), toon(0x7a4a22));
    post.position.y = 1.1;
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), toon(0xe8d8a8));
    this.rope.position.set(0, 1.6, 0.2);
    this.rope.rotation.x = 0.9;
    this.obj.add(post, this.rope);
    this.obj.rotation.y = yaw;
    const hint = textSprite('BITE!', { color: '#ffd23f', size: 80, w: 256, h: 96 });
    hint.scale.set(1.4, 0.5, 1);
    hint.position.y = 2.7;
    this.hint = hint;
    this.obj.add(hint);
    this.setBox(1.4, 2.2, 1.4);
    // the bridge deck: hinged at the far edge, raised up
    const len = d1 - d0;
    const far = track.toWorld(d1, span.u, track.spanDy(span, d1));
    this.hinge = new THREE.Group();
    this.hinge.rotation.order = 'YXZ'; // tilt around the bridge's own hinge axis
    this.hinge.position.copy(far);
    this.hinge.rotation.y = track.yaw(d1);
    const deck = platformMesh(stage, span.w, 0.3, len);
    deck.position.set(0, -0.15, -len / 2);
    this.hinge.add(deck);
    for (const sx of [-1, 1]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 5), toon(0x9a9ab0));
      chain.rotation.x = Math.PI / 2; chain.position.set(sx * span.w / 2, 0.3, -len / 2);
      this.hinge.add(chain);
    }
    this.hinge.rotation.x = 1.3; // raised up (the near end points at the sky)
    stage.scene.add(this.hinge);
    this.lowered = false;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.lowering) {
      this.hinge.rotation.x = Math.max(0, this.hinge.rotation.x - dt * 3);
      if (this.hinge.rotation.x <= 0) {
        this.lowering = false;
        this.span.disabled = false;
        audio.play('stomp');
        this.game.camera.shake(0.3, 0.25);
      }
    }
    this.hint.visible = !this.lowered && this.distToPlayer() < 7;
    this.hint.position.y = 2.7 + Math.sin(this.t * 5) * 0.1;
  }
  cut() {
    if (this.lowered) return;
    this.lowered = true;
    this.lowering = true;
    this.rope.visible = false;
    audio.play('chompHit');
    audio.play('whoosh');
    this.fx.burst(this.pos.x, this.pos.y + 1.6, this.pos.z, { count: 8, colors: [0xe8d8a8], size: 0.1 });
  }
  onBite() { this.cut(); }
  onSlide() {}
}

// Updraft fan: blows Nobu upward while he's inside the column.
export class UpdraftFan extends Entity {
  constructor(stage, x, y, z, { height = 7, power = 30 } = {}) {
    super(stage, x, y, z);
    this.height = height; this.power = power;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.4, 20), toon(0x5a5a70));
    base.position.y = 0.2;
    this.blades = new THREE.Group();
    this.blades.position.y = 0.45;
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.35), toon(0xc8c8d8)); b.rotation.y = (i * Math.PI) / 4; this.blades.add(b); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 6, 24), toon(0xffd23f));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.45;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, height, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    col.position.y = height / 2;
    this.col = col;
    this.obj.add(base, this.blades, ring, col);
    this.solid = stage.world.add(new Solid({ x: x - 1.1, y, z: z - 1.1 }, { x: x + 1.1, y: y + 0.4, z: z + 1.1 }));
    this.interactive = false;
    this.alwaysActive = true;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.blades.rotation.y += dt * 18;
    const p = this.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    if (!p.dead && dx * dx + dz * dz < 1.2 && p.pos.y > this.pos.y + 0.3 && p.pos.y < this.pos.y + this.height) {
      p.vel.y = Math.min(11, p.vel.y + this.power * dt * 2);
      p.body.grounded = false;
      p.canDouble = true;
    }
    if (Math.random() < dt * 20) this.fx.puff(this.pos.x + rand(-0.8, 0.8), this.pos.y + 0.6, this.pos.z + rand(-0.8, 0.8), { count: 1, size: 0.25, color: 0xe8f6ff, up: 9, speed: 0.2, life: 0.8 });
  }
}

// Swinging cone hammer (pendulum across the path).
export class SwingHammer extends Entity {
  constructor(stage, x, y, z, { yaw = 0, period = 2.6, phase = 0, len = 4.2, top = 5.2 } = {}) {
    super(stage, x, y, z);
    this.period = period; this.phase = phase; this.len = len; this.top = top;
    this.pivot = new THREE.Group();
    this.pivot.position.y = top;
    this.obj.rotation.y = yaw;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6), toon(0x9a9ab0));
    arm.position.y = -len / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.3, 1.0, 14), toon(0xc8b4ff));
    head.rotation.z = Math.PI / 2;
    head.position.y = -len;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 14), toon(0xffd23f));
    band.rotation.y = Math.PI / 2; band.position.y = -len;
    this.pivot.add(arm, head, band);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.3, 0.3), toon(0x5a5a70));
    beam.position.y = top + 0.1;
    beam.rotation.y = Math.PI / 2;
    this.obj.add(this.pivot, beam);
    this.headPos = new THREE.Vector3();
    this.setBox(1.6, 1.4, 1.6);
    this.t = phase;
    this.alwaysActive = false;
  }
  update(dt) {
    this.t += dt;
    const a = Math.sin((this.t / this.period) * Math.PI * 2) * 1.15;
    this.pivot.rotation.z = a;
    // head world position for the hitbox
    this.headPos.set(Math.sin(a) * this.len, this.top - Math.cos(a) * this.len, 0).applyEuler(this.obj.rotation).add(this.pos);
    this.box.min.x = this.headPos.x - 0.8; this.box.max.x = this.headPos.x + 0.8;
    this.box.min.y = this.headPos.y - 0.6; this.box.max.y = this.headPos.y + 0.6;
    this.box.min.z = this.headPos.z - 0.8; this.box.max.z = this.headPos.z + 0.8;
    const sw = Math.cos((this.t / this.period) * Math.PI * 2);
    if (Math.abs(sw) > 0.98 && this.distToPlayer() < 12 && !this.swished) { audio.play('whoosh'); this.swished = true; }
    if (Math.abs(sw) < 0.5) this.swished = false;
  }
  onTouch(p) { p.hurt('flat', this.headPos.x, this.headPos.z); }
  onStomp(p) { this.onTouch(p); }
  onBite(p) { this.onTouch(p); }
}

// Cone stamper: rises slowly, slams down. Its shadow telegraphs the impact zone.
export class Crusher extends Entity {
  constructor(stage, x, y, z, { w = 2.2, d = 2.2, period = 2.6, phase = 0, top = 4.2, yaw = 0 } = {}) {
    super(stage, x, y, z);
    this.w = w; this.d = d; this.period = period; this.phase = phase; this.top = top;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), toon(0x5a5a70));
    body.position.y = 0.6;
    body.castShadow = true;
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.22, d + 0.02), new THREE.MeshLambertMaterial({ map: Assets.tiled('tex_l3_platform') }));
    stripes.position.y = 0.12;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 12), toon(0xc9b8ff));
    cone.position.y = 1.6;
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 8, 8), toon(0x9a9ab0));
    piston.position.y = 5.2;
    this.head = new THREE.Group();
    this.head.add(body, stripes, cone, piston);
    this.obj.add(this.head);
    this.obj.rotation.y = yaw;
    this.warn = makeShadow(w * 1.3);
    this.warn.position.y = 0.04;
    this.obj.add(this.warn);
    const { hx, hz } = rotatedHalf(w * 0.9, d * 0.9, yaw);
    this.setBox(hx * 2, 1.2, hz * 2);
    this.t = phase;
    this.lastY = top;
  }
  update(dt) {
    this.t += dt;
    const c = (this.t % this.period) / this.period;
    let y;
    if (c < 0.5) y = this.top * Math.min(1, c / 0.35);
    else if (c < 0.72) y = this.top;
    else if (c < 0.8) y = this.top * (1 - (c - 0.72) / 0.08);
    else y = 0;
    if (y === 0 && this.lastY > 0.01) {
      if (this.distToPlayer() < 14) { audio.play('stomp'); this.game.camera.shake(0.25, 0.2); }
      this.fx.puff(this.pos.x, this.pos.y + 0.1, this.pos.z, { count: 6, size: 0.4, color: 0xbbbbcc, speed: 3 });
    }
    this.lastY = y;
    this.head.position.y = y;
    this.warn.material.opacity = 0.3 + (c > 0.5 && c < 0.8 ? 0.5 : 0);
    this.dangerous = y < 1.3 && c >= 0.72;
    this.box.min.y = this.pos.y + y; this.box.max.y = this.pos.y + y + 1.2;
    this.interactive = this.dangerous;
  }
  onTouch(p) { if (this.dangerous && p.pos.y < this.pos.y + this.head.position.y + 0.3) p.die('flat'); }
  onStomp(p) { this.onTouch(p); }
  onBite() {}
}

// Rolls coconuts down the track toward Nobu (jump them or bite them).
export class CoconutRoller extends Entity {
  constructor(stage, track, d, { every = 2.2, speed = 7, lanes = [-2, 0, 2], until = d - 30 } = {}) {
    const p = track.toWorld(d, 0, 0);
    super(stage, p.x, p.y, p.z);
    this.track = track; this.d = d; this.every = every; this.speed = speed; this.lanes = lanes; this.until = until;
    this.balls = [];
    this.timer = 0.5;
    this.obj = new THREE.Group();
    this.geo = new THREE.SphereGeometry(0.45, 10, 8);
    this.mat = toon(0x6a4020);
    this.interactive = false;
  }
  update(dt) {
    const pl = this.player;
    const ps = pl.body.s ?? 0;
    const active = ps > this.until - 6 && ps < this.d;
    this.timer -= dt;
    if (active && this.timer <= 0) {
      this.timer = this.every;
      const m = new THREE.Mesh(this.geo, this.mat);
      m.castShadow = true;
      this.stage.scene.add(m);
      this.balls.push({ m, s: this.d, u: pick(this.lanes), alive: true });
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.s -= this.speed * dt;
      const g = this.track.groundAt(b.s, b.u);
      const y = g ? g.y : this.track.heightAt(b.s) - 1;
      this.track.toWorld(b.s, b.u, 0, b.m.position);
      b.m.position.y = y + 0.45;
      b.m.rotation.x -= (this.speed * dt) / 0.45;
      const d = b.m.position.distanceTo(pl.pos.clone().setY(pl.pos.y + 0.5));
      if (b.alive && !pl.dead && d < 0.9) {
        if (pl.biteT >= 0.1 && pl.biteT <= 0.75) {
          b.alive = false;
          audio.play('chompHit');
          this.fx.burst(b.m.position.x, b.m.position.y, b.m.position.z, { count: 10, colors: [0x6a4020, 0xffffff], size: 0.15 });
          this.game.tickets.spawnFlying(b.m.position.x, b.m.position.y, b.m.position.z, 1);
        } else if (pl.vel.y < 0 && pl.pos.y > b.m.position.y + 0.1) {
          b.alive = false;
          pl.bounce(TUNING.STOMP_BOUNCE);
          audio.play('squash');
        } else pl.hurt('flat', b.m.position.x, b.m.position.z);
      }
      if (!b.alive || b.s < this.until || !g) {
        if (!g && b.alive) { b.m.position.y -= 1; }
        this.stage.scene.remove(b.m);
        this.balls.splice(i, 1);
      }
    }
  }
  reset() { for (const b of this.balls) this.stage.scene.remove(b.m); this.balls.length = 0; this.timer = 1.5; }
}

// Conveyor belt visual: a scrolling strip along the track over a conveyor span.
let conveyorTex;
export function conveyorStrip(stage, track, span) {
  conveyorTex ||= canvasTex(64, 64, (g) => {
    g.fillStyle = '#2a2a33'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(8, 8 + i * 32); g.lineTo(32, 20 + i * 32); g.lineTo(56, 8 + i * 32); g.lineTo(56, 16 + i * 32); g.lineTo(32, 28 + i * 32); g.lineTo(8, 16 + i * 32); g.fill(); }
  }, { repeat: true });
  const tex = conveyorTex.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  const pos = [], uv = [], idx = [];
  const segs = Math.ceil((span.d1 - span.d0) / 0.75);
  const v = new THREE.Vector3();
  const back = span.conveyor.z > 0; // stripes point the way you get pushed
  for (let i = 0; i <= segs; i++) {
    const s = span.d0 + ((span.d1 - span.d0) * i) / segs;
    const dy = track.spanDy(span, s) + 0.03;
    track.toWorld(s, span.u - span.w / 2, dy, v); pos.push(v.x, v.y, v.z);
    track.toWorld(s, span.u + span.w / 2, dy, v); pos.push(v.x, v.y, v.z);
    const vv = (back ? -1 : 1) * (s - span.d0) / 1.5;
    uv.push(0, vv, span.w / 1.5, vv);
    if (i) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  if (Math.abs(span.conveyor.x) > Math.abs(span.conveyor.z)) tex.rotation = Math.PI / 2;
  stage.scene.add(m);
  const speed = Math.hypot(span.conveyor.x, span.conveyor.z);
  stage.add({ pos: m.position.clone().copy(v), alwaysActive: true, interactive: false, update(dt) { tex.offset.y += (dt * speed) / 1.5; } });
}

// Wooden sign with a canvas message.
export function sign(stage, x, y, z, lines, { yaw = 0, color = '#7a4a22' } = {}) {
  const tex = canvasTex(256, 160, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#3a2210'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 150);
    g.fillStyle = '#fff6e3'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '30px Luckiest Guy, Arial Black, sans-serif';
    lines.forEach((l, i) => g.fillText(l, 128, 80 + (i - (lines.length - 1) / 2) * 38));
  });
  const grp = new THREE.Group();
  const wood = toon(0x6a3a18);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.08), [wood, wood, wood, wood, new THREE.MeshBasicMaterial({ map: tex }), wood]);
  board.position.y = 1.5;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), toon(0x5a3010));
  post.position.y = 0.6;
  grp.add(board, post);
  grp.position.set(x, y, z);
  grp.rotation.y = yaw;
  stage.scene.add(grp);
  return grp;
}

// Boss gate arch.
export function bossGate(stage, x, y, z, label, color = 0x6a2fb0, yaw = 0) {
  const grp = new THREE.Group();
  const m = toon(color);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), m);
    p.position.set(sx * 3.8, 3, 0);
    grp.add(p);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 4), toon(0xffd23f));
    c.position.set(sx * 3.8, 6.8, 0);
    grp.add(c);
  }
  const tex = canvasTex(512, 128, (g) => {
    g.fillStyle = '#2a0a40'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 118);
    g.fillStyle = '#ffd23f'; g.font = '56px Luckiest Guy, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 256, 68);
  });
  const lm = new THREE.MeshBasicMaterial({ map: tex });
  const top = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.6, 0.6), [m, m, m, m, lm, lm]);
  top.position.y = 6;
  grp.add(top);
  grp.position.set(x, y, z);
  grp.rotation.y = yaw;
  stage.scene.add(grp);
  return grp;
}

// Log lying across the path (visual for a raised track span).
export function logMesh(stage, pos, yaw, length) {
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, length, 12), toon(0x8a5a2a));
  log.rotation.z = Math.PI / 2;
  const grp = new THREE.Group();
  grp.add(log);
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.44, 12), toon(0xd8a868));
    ring.position.x = (sx * length) / 2 + sx * 0.01;
    ring.rotation.y = (sx * Math.PI) / 2;
    grp.add(ring);
  }
  grp.position.copy(pos);
  grp.position.y += 0.4;
  grp.rotation.y = yaw;
  log.castShadow = true;
  stage.scene.add(grp);
}

// ---------------- decor (merged into one mesh per stage) ----------------
const D = {};
function dgeo() {
  if (D.ready) return D;
  // palm frond: a long tapered leaf that droops, built from a bent strip
  const frond = (() => {
    const g = new THREE.BufferGeometry();
    const pos = [], idx = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = t * 2.8, y = Math.sin(t * Math.PI * 0.85) * 0.7 - t * t * 1.5;
      const w = Math.sin(t * Math.PI) * 0.5 + 0.06;
      pos.push(x, y, -w, x, y + 0.12, 0, x, y, w);
      if (i) { const b = i * 3; idx.push(b - 3, b, b - 2, b - 2, b, b + 1, b - 2, b + 1, b - 1, b - 1, b + 1, b + 2); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  Object.assign(D, {
    ready: true,
    frond,
    trunk: new THREE.CylinderGeometry(0.17, 0.24, 1, 8),
    ring: new THREE.TorusGeometry(0.22, 0.06, 5, 10),
    blob: new THREE.SphereGeometry(1, 10, 7),
    rock: new THREE.DodecahedronGeometry(1, 0),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    cone: new THREE.ConeGeometry(1, 1, 10),
    blade: new THREE.ConeGeometry(0.06, 0.7, 3),
    flower: new THREE.SphereGeometry(0.12, 6, 4),
    torus: new THREE.TorusGeometry(1, 0.25, 6, 14),
  });
  return D;
}

export function palm(stage, x, y, z, h = 5) {
  const G = dgeo();
  const segs = 7;
  let px = x, pz = z;
  const bendX = rand(-0.5, 0.5), bendZ = rand(-0.5, 0.5);
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const sy = y + (i + 0.5) * (h / segs);
    px = x + bendX * t * t * 2; pz = z + bendZ * t * t * 2;
    const k = 1 - t * 0.35;
    stage.decor(G.trunk, i % 2 ? 0x8a5a2a : 0xa06a34, new THREE.Vector3(px, sy, pz), { x: bendZ * 0.3 * t, z: -bendX * 0.3 * t }, new THREE.Vector3(k, h / segs, k));
    stage.decor(G.ring, 0x6a4420, new THREE.Vector3(px, sy + h / segs / 2, pz), { x: Math.PI / 2 }, k);
  }
  const topY = y + h;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    stage.decor(G.frond, i % 2 ? 0x3fb03e : 0x2c9432, new THREE.Vector3(px, topY, pz), new THREE.Euler(0, a, rand(-0.15, 0.15), 'YXZ'), rand(0.85, 1.15));
  }
  for (let i = 0; i < 3; i++) stage.decor(G.blob, 0x5a3a14, new THREE.Vector3(px + rand(-0.2, 0.2), topY - 0.25, pz + rand(-0.2, 0.2)), null, 0.17);
}

export function bush(stage, x, y, z, s = 1, color = 0x3fa03a) {
  const G = dgeo();
  const c = new THREE.Color(color);
  for (let i = 0; i < 5; i++) {
    const cc = c.clone().offsetHSL(rand(-0.02, 0.02), 0, rand(-0.08, 0.06));
    stage.decor(G.blob, cc.getHex(), new THREE.Vector3(x + rand(-0.6, 0.6) * s, y + (0.35 + rand(0, 0.35)) * s, z + rand(-0.5, 0.5) * s), { y: rand(0, 3) }, new THREE.Vector3(s * rand(0.5, 0.8), s * rand(0.45, 0.65), s * rand(0.5, 0.8)));
  }
  if (Math.random() < 0.7) for (let i = 0; i < 3; i++) stage.decor(G.flower, pick([0xff5a8a, 0xffd23f, 0xffffff, 0xff8a3a]), new THREE.Vector3(x + rand(-0.5, 0.5) * s, y + 0.85 * s, z + rand(-0.4, 0.4) * s), null, 1.3);
}

export function fern(stage, x, y, z, s = 1, color = 0x46b84a) {
  const G = dgeo();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    stage.decor(G.blade, color, new THREE.Vector3(x + Math.cos(a) * 0.15 * s, y + 0.3 * s, z + Math.sin(a) * 0.15 * s), new THREE.Euler(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6), s * 1.3);
  }
}

export function flowers(stage, x, y, z) {
  const G = dgeo();
  for (let i = 0; i < 4; i++) {
    const fx = x + rand(-0.6, 0.6), fz = z + rand(-0.6, 0.6);
    stage.decor(G.blade, 0x3aa83a, new THREE.Vector3(fx, y + 0.2, fz), null, 0.6);
    stage.decor(G.flower, pick([0xff5a8a, 0xffd23f, 0xffffff, 0xb07aff]), new THREE.Vector3(fx, y + 0.45, fz), null, 1.1);
  }
}

export function rock(stage, x, y, z, s = 1, color = 0x8a8a7a) {
  const c = new THREE.Color(color).offsetHSL(0, 0, rand(-0.06, 0.06));
  stage.decor(dgeo().rock, c.getHex(), new THREE.Vector3(x, y + s * 0.35, z), { x: rand(0, 3), y: rand(0, 3) }, new THREE.Vector3(s, s * 0.75, s));
}

export function fencePost(stage, x, y, z) {
  stage.decor(dgeo().box, 0xc89058, new THREE.Vector3(x, y + 0.55, z), null, new THREE.Vector3(0.14, 1.1, 0.14));
}

export function scratchPost(stage, x, y, z, h = 6) {
  const G = dgeo();
  stage.decor(G.cyl, 0xc9a26b, new THREE.Vector3(x, y + h / 2, z), null, new THREE.Vector3(0.7, h, 0.7));
  for (let i = 0; i < h / 0.5; i++) stage.decor(G.torus, 0xb08a50, new THREE.Vector3(x, y + 0.3 + i * 0.5, z), { x: Math.PI / 2 }, new THREE.Vector3(0.72, 0.72, 0.3));
  stage.decor(G.box, 0xe8467a, new THREE.Vector3(x, y + h + 0.15, z), null, new THREE.Vector3(2, 0.3, 2));
}

export function yarnPile(stage, x, y, z) {
  const G = dgeo();
  const cols = [0xe8467a, 0x46a8e8, 0xffd23f, 0x7ad04a];
  for (let i = 0; i < 3; i++) stage.decor(G.blob, cols[i % 4], new THREE.Vector3(x + rand(-0.6, 0.6), y + 0.45, z + rand(-0.6, 0.6)), null, 0.48);
}

export function pipe(stage, x, y, z, h, color = 0x7a5aa0) {
  const G = dgeo();
  stage.decor(G.cyl, color, new THREE.Vector3(x, y + h / 2, z), null, new THREE.Vector3(0.4, h, 0.4));
  stage.decor(G.cyl, 0xffd23f, new THREE.Vector3(x, y + h * 0.7, z), null, new THREE.Vector3(0.48, 0.25, 0.48));
}

export function vat(stage, x, y, z, s = 1.6) {
  const G = dgeo();
  stage.decor(G.cyl, 0x5a4a70, new THREE.Vector3(x, y + s * 0.6, z), null, new THREE.Vector3(s, s * 1.2, s));
  stage.decor(G.cyl, 0x6aff7a, new THREE.Vector3(x, y + s * 1.22, z), null, new THREE.Vector3(s * 0.9, 0.05, s * 0.9));
}

export function coneStack(stage, x, y, z, n = 3) {
  const G = dgeo();
  for (let i = 0; i < n; i++) stage.decor(G.cone, i % 2 ? 0xd8d0ff : 0xc8b8f8, new THREE.Vector3(x, y + 0.4 + i * 0.25, z), { x: Math.PI }, new THREE.Vector3(0.55, 0.6, 0.55));
}
