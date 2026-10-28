// Breakables (Crash's crates, reimagined): Black Backpack, Blue Sphere, 1UP head, Trampoline, Snacks checkpoint,
// Cat (TNT), Rug (Nitro) and the Lint Roller switch that rolls up every rug.
import * as THREE from 'three';
import { Breakable } from './entity.js';
import { Solid } from '../world/physics.js';
import { toon } from '../player/nobuPrims.js';
import { Assets } from '../art/assets.js';
import { audio } from '../audio/audio.js';
import { textSprite, textTexture, makeShadow, placeShadow } from './fx.js';
import { randInt, rand } from '../core/util.js';
import { TUNING } from '../player/player.js';

// ---------- shared explosion ----------
export function explode(stage, x, y, z, r, { kind = 'flat', source = null, color = 0xffd27a } = {}) {
  const game = stage.game;
  game.fx.ring(x, y, z, { color: 0xfff2c0, radius: r });
  game.fx.puff(x, y + 0.3, z, { count: 14, size: 0.8, color: 0xd8c8b0, speed: 4, up: 3, life: 0.9 });
  game.fx.sparkle(x, y + 0.6, z, { count: 14, color, size: 0.9, speed: 6 });
  game.camera.shake(0.5, 0.35);
  audio.play('explosion');
  for (const e of stage.entities) {
    if (e === source || e.dead || !e.onExplosion) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z, dy = e.pos.y - y;
    if (dx * dx + dz * dz + dy * dy * 0.5 < r * r) e.onExplosion(source);
  }
  const p = game.player;
  if (!p.dead && p.pos.distanceTo(new THREE.Vector3(x, y, z)) < r + 0.2) p.hurt(kind, x, z);
}

// ---------- Black Backpack (front print = the real meme backpack photo) ----------
let backpackParts;
function backpackModel() {
  if (!backpackParts) {
    const front = new THREE.PlaneGeometry(0.78, 0.98, 8, 8);
    const fp = front.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), y = fp.getY(i); fp.setZ(i, -(x * x) * 0.45 - (y * y) * 0.12); }
    front.computeVertexNormals();
    backpackParts = {
      body: new THREE.CapsuleGeometry(0.36, 0.36, 6, 14),
      front,
      side: new THREE.CapsuleGeometry(0.12, 0.22, 4, 8),
      strap: new THREE.BoxGeometry(0.09, 0.66, 0.06),
      handle: new THREE.TorusGeometry(0.11, 0.035, 6, 12, Math.PI),
      zip: new THREE.BoxGeometry(0.05, 0.09, 0.03),
      mBody: toon(0x1e1e26), mStrap: toon(0x141418), mZip: toon(0xd0d0dc),
      mFront: new THREE.MeshLambertMaterial({ map: Assets.has('backpack_front') ? Assets.tex('backpack_front') : Assets.tex('backpack'), transparent: !Assets.has('backpack_front') }),
    };
  }
  const P = backpackParts;
  const g = new THREE.Group();
  const body = new THREE.Mesh(P.body, P.mBody); body.scale.set(1.25, 1.02, 0.86); body.position.y = 0.54; g.add(body);
  const front = new THREE.Mesh(P.front, P.mFront); front.position.set(0, 0.54, 0.33); g.add(front);
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(P.side, P.mStrap); sp.position.set(sx * 0.46, 0.38, 0.02); g.add(sp);
    const st = new THREE.Mesh(P.strap, P.mStrap); st.position.set(sx * 0.2, 0.55, -0.33); g.add(st);
  }
  const handle = new THREE.Mesh(P.handle, P.mStrap); handle.position.y = 1.0; g.add(handle);
  const zip = new THREE.Mesh(P.zip, P.mZip); zip.position.set(-0.33, 0.62, 0.3); g.add(zip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.zip = zip;
  return g;
}

export class Backpack extends Breakable {
  constructor(stage, x, y, z, { tickets } = {}) {
    super(stage, x, y, z);
    this.kind = 'backpack';
    this.tickets = tickets ?? randInt(1, 5);
    this.model = backpackModel();
    this.model.rotation.y = rand(-0.25, 0.25);
    this.obj.add(this.model);
    this.setBox(0.95, 1.05, 0.95);
    this.solid = stage.world.add(new Solid({ x: x - 0.47, y, z: z - 0.47 }, { x: x + 0.47, y: y + 1.0, z: z + 0.47 }, { kind: 'breakable', ref: this }));
    this.wobble = 0;
    this.wiggleIn = rand(1.5, 6);
    this.t = rand(0, 6);
  }
  update(dt) {
    this.t += dt;
    // something's in there... the pack twitches now and then
    this.wiggleIn -= dt;
    if (this.wiggleIn <= 0) { this.wiggleIn = rand(2.5, 7); this.wobble = 0.5; }
    const zip = this.model.userData.zip;
    if (zip) zip.rotation.z = Math.sin(this.t * 3) * 0.3;
    if (this.wobble > 0) {
      this.wobble -= dt;
      const k = Math.sin(this.wobble * 40) * this.wobble;
      this.model.scale.set(1 + k * 0.12, 1 - k * 0.12, 1 + k * 0.06);
      this.model.position.y = Math.max(0, Math.sin(this.wobble * 12)) * 0.06;
    } else {
      const b = Math.sin(this.t * 2) * 0.012;
      this.model.scale.set(1 + b, 1 - b, 1 + b);
      this.model.position.y = 0;
    }
  }
  break(player, how) {
    if (!this.markBroken()) return;
    this.hide();
    const y = this.pos.y + 0.5;
    this.fx.burst(this.pos.x, y, this.pos.z, { count: 16, colors: [0x2b2b33, 0x3d3d48, 0x1c1c22, 0xff8a12], speed: 5, size: 0.2, floor: this.pos.y });
    this.fx.puff(this.pos.x, y, this.pos.z, { count: 4, size: 0.4, color: 0x9a9aaa, speed: 2 });
    audio.play('break');
    this.game.tickets.spawnFlying(this.pos.x, y + 0.3, this.pos.z, this.tickets);
  }
  onBite(p) { this.break(p, 'bite'); }
  onSlide(p) { this.break(p, 'slide'); }
  onFlop(p) { this.break(p, 'flop'); }
  onExplosion() { this.break(null, 'boom'); }
  onHeadHit(p) { this.break(p, 'head'); }
  onLand(p, impact) {
    if (this.broken) return false;
    const flopping = p.mode === 'flop';
    this.break(p, 'stomp');
    if (flopping) { p.vel.y = -TUNING.FLOP_SPEED; p.body.grounded = false; p.body.ground = null; return true; }
    p.bounce(TUNING.STOMP_BOUNCE);
    return true;
  }
}

// ---------- Blue Sphere (releases a Sproto Mask) ----------
let sphereGeo, sphereMat, glowMat;
export class BlueSphere extends Breakable {
  constructor(stage, x, y, z) {
    super(stage, x, y, z);
    this.kind = 'sphere';
    sphereGeo ||= new THREE.SphereGeometry(0.42, 24, 16);
    sphereMat ||= new THREE.MeshPhongMaterial({ color: 0x2a8cff, emissive: 0x0a3a9a, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.92 });
    glowMat ||= new THREE.SpriteMaterial({ map: Assets.tex('blue_sphere'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    this.ball = new THREE.Mesh(sphereGeo, sphereMat);
    this.ball.position.y = 0.75;
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(1.7);
    this.glow.position.y = 0.75;
    this.obj.add(this.ball, this.glow);
    this.shadow = makeShadow(0.9);
    this.obj.add(this.shadow);
    this.shadow.position.y = 0.02;
    this.setBox(0.9, 0.9, 0.9, 0.3);
    this.t = rand(0, 6);
  }
  update(dt) {
    this.t += dt;
    this.ball.position.y = 0.75 + Math.sin(this.t * 2.2) * 0.12;
    this.glow.position.y = this.ball.position.y;
    this.glow.material.rotation = this.t * 0.6;
    this.ball.rotation.y += dt;
  }
  pop() {
    if (!this.markBroken()) return;
    this.hide();
    const y = this.pos.y + 0.75;
    this.fx.burst(this.pos.x, y, this.pos.z, { count: 18, colors: [0x6ac8ff, 0x2a8cff, 0xffffff], speed: 5, size: 0.14, floor: this.pos.y });
    this.fx.sparkle(this.pos.x, y, this.pos.z, { count: 16, color: 0x7fd4ff, size: 0.7, speed: 4 });
    audio.play('sphereBreak');
    this.game.maskPickup(this.pos.x, y, this.pos.z);
  }
  onBite() { this.pop(); }
  onSlide() { this.pop(); }
  onTouch() { this.pop(); }
  onStomp(p) { this.pop(); p.bounce(TUNING.STOMP_BOUNCE * 0.9); }
  onFlop() { this.pop(); }
  onExplosion() { this.pop(); }
}

// ---------- Extra life: floating Nobu head ----------
export class OneUp extends Breakable {
  constructor(stage, x, y, z) {
    super(stage, x, y, z);
    this.kind = 'oneup';
    this.sprite = Assets.model('model_nobu_head', 1.05) || new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.tex('nobu_head'), transparent: true }));
    this.is3d = !this.sprite.isSprite;
    if (!this.is3d) this.sprite.scale.set(Assets.aspect('nobu_head'), 1, 1);
    this.sprite.position.y = this.is3d ? 0.35 : 0.9;
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 30), new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.7 }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 0.4;
    this.obj.add(this.halo);
    this.label = textSprite('1UP', { color: '#7dff8a', size: 96, w: 192, h: 96 });
    this.label.scale.set(0.8, 0.4, 1);
    this.label.position.y = 1.75;
    this.label.material.depthTest = true; // don't reveal secrets through floors
    this.obj.add(this.sprite, this.label);
    this.shadow = makeShadow(0.8);
    this.shadow.position.y = 0.02;
    this.obj.add(this.shadow);
    this.setBox(0.9, 1.0, 0.9, 0.4);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const bob = Math.sin(this.t * 3) * 0.12;
    if (this.is3d) {
      this.sprite.position.y = 0.35 + bob;
      this.sprite.rotation.y = this.t * 2.2;
      this.sprite.rotation.z = Math.sin(this.t * 2) * 0.12;
    } else {
      this.sprite.position.y = 0.9 + bob;
      this.sprite.scale.x = Assets.aspect('nobu_head') * Math.cos(this.t * 2.5);
    }
    this.halo.position.y = 0.4 + bob * 0.5;
    this.halo.scale.setScalar(1 + Math.sin(this.t * 5) * 0.08);
    this.label.position.y = 1.75 + bob;
  }
  collect() {
    if (!this.markBroken()) return;
    this.hide();
    this.session.addLife(1);
    audio.play('oneUp');
    this.fx.sparkle(this.pos.x, this.pos.y + 0.9, this.pos.z, { count: 20, color: 0x7dff8a, size: 0.7, speed: 4 });
  }
  onBite() { this.collect(); }
  onTouch() { this.collect(); }
  onStomp() { this.collect(); }
  onSlide() { this.collect(); }
  onExplosion() { this.collect(); }
}

// ---------- Trampoline ----------
let trampParts;
export class Trampoline extends Breakable {
  constructor(stage, x, y, z, { tickets = 10, power = 17.5 } = {}) {
    super(stage, x, y, z);
    this.kind = 'trampoline';
    this.ticketsLeft = tickets;
    this.ticketsMax = tickets;
    this.power = power;
    trampParts ||= {
      rim: new THREE.TorusGeometry(0.62, 0.12, 8, 24), mat: new THREE.CircleGeometry(0.6, 24), leg: new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6),
      mRim: toon(0xe23a3a), mMat: toon(0x7a3fd0), mLeg: toon(0xc8c8d0), mStripe: toon(0xffd23f), stripe: new THREE.TorusGeometry(0.62, 0.125, 4, 24, 0.35),
    };
    const T = trampParts;
    this.top = new THREE.Group();
    this.top.position.y = 0.42;
    const glb = Assets.model('model_trampoline', 1);
    if (glb) {
      const sc = 1.5 / Math.max(0.5, glb.userData.aspect.w);
      glb.scale.setScalar(sc);
      this.top.position.y = 0;
      this.top.add(glb);
      this.obj.add(this.top);
      this.mat = new THREE.Object3D();
      this.setBox(1.4, 0.5, 1.4);
      this.solid = stage.world.add(new Solid({ x: x - 0.7, y, z: z - 0.7 }, { x: x + 0.7, y: y + Math.min(0.7, sc * 0.8), z: z + 0.7 }, { kind: 'breakable', ref: this }));
      this.squash = 0;
      this.spent = false;
      this.glb = true;
      return;
    }
    const rim = new THREE.Mesh(T.rim, T.mRim); rim.rotation.x = Math.PI / 2; this.top.add(rim);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(T.stripe, T.mStripe); s.rotation.set(Math.PI / 2, 0, i * Math.PI / 2); this.top.add(s); }
    this.mat = new THREE.Mesh(T.mat, T.mMat); this.mat.rotation.x = -Math.PI / 2; this.mat.position.y = 0.02; this.top.add(this.mat);
    this.obj.add(this.top);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const l = new THREE.Mesh(T.leg, T.mLeg); l.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5); this.obj.add(l);
    }
    this.setBox(1.4, 0.5, 1.4);
    this.solid = stage.world.add(new Solid({ x: x - 0.7, y, z: z - 0.7 }, { x: x + 0.7, y: y + 0.45, z: z + 0.7 }, { kind: 'breakable', ref: this }));
    this.squash = 0;
    this.spent = false;
  }
  update(dt) {
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 3);
      const k = Math.sin(this.squash * 14) * this.squash;
      this.top.scale.set(1 + k * 0.15, 1 - k * (this.glb ? 0.35 : 0.6), 1 + k * 0.15);
      this.mat.position.y = 0.02 - k * 0.2;
    }
  }
  onLand(p) {
    if (this.dead) return false;
    p.bounce(this.power, { allowCut: false });
    this.squash = 1;
    audio.play('boing');
    if (this.ticketsLeft > 0) {
      this.ticketsLeft--;
      this.game.tickets.spawnFlying(this.pos.x, this.pos.y + 0.8, this.pos.z, 1);
      if (this.ticketsLeft === 0) { this.spent = true; this.markBroken(); }
    }
    return true;
  }
  onBite() {
    // a bite rips the mat: pays out what's left and breaks it
    if (this.dead) return;
    if (this.ticketsLeft > 0) this.game.tickets.spawnFlying(this.pos.x, this.pos.y + 0.8, this.pos.z, this.ticketsLeft);
    this.ticketsLeft = 0;
    this.markBroken();
    this.hide();
    audio.play('break');
    this.fx.burst(this.pos.x, this.pos.y + 0.4, this.pos.z, { count: 14, colors: [0xe23a3a, 0x7a3fd0, 0xffd23f, 0xc8c8d0], speed: 4, floor: this.pos.y });
  }
  onSlide() { this.onBite(); }
  onExplosion() { this.onBite(); }
  onRestore() { this.ticketsLeft = this.ticketsMax; this.spent = false; }
}

// ---------- Snacks: checkpoint ----------
export class Snacks extends Breakable {
  constructor(stage, x, y, z) {
    super(stage, x, y, z);
    this.kind = 'snacks';
    this.sprite = Assets.model('model_snacks', 1.2);
    if (!this.sprite) {
      this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.tex('snacks'), transparent: true }));
      this.sprite.center.set(0.5, 0);
      this.sprite.scale.set(1.25 * Assets.aspect('snacks'), 1.25, 1);
    }
    this.baseScale = this.sprite.scale.clone();
    this.obj.add(this.sprite);
    // floating checkpoint ring
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6 }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.1;
    this.obj.add(this.ring);
    this.shadow = makeShadow(1.0); this.shadow.position.y = 0.02; this.obj.add(this.shadow);
    this.setBox(1.0, 1.2, 1.0);
    this.t = rand(0, 5);
  }
  update(dt) {
    this.t += dt;
    const k = Math.sin(this.t * 4) * 0.04;
    this.sprite.scale.set(this.baseScale.x * (1 - k * 0.5), this.baseScale.y * (1 + k), this.baseScale.z * (1 - k * 0.5));
    this.sprite.rotation.y = Math.sin(this.t * 0.8) * 0.35;
    this.ring.position.y = 0.1 + (this.t * 0.6 % 1) * 1.2;
    this.ring.material.opacity = 0.6 * (1 - (this.t * 0.6 % 1));
    this.ring.scale.setScalar(1 + (this.t * 0.6 % 1) * 0.3);
  }
  hit() {
    if (!this.markBroken()) return;
    this.hide();
    audio.play('checkpoint');
    this.fx.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, { count: 18, colors: [0xc8894a, 0xe8b070, 0xa86a30], speed: 4, size: 0.15, floor: this.pos.y });
    this.session.checkpoint(this.pos.clone(), this);
  }
  onBite() { this.hit(); }
  onTouch() { this.hit(); }
  onStomp(p) { this.hit(); p.bounce(TUNING.STOMP_BOUNCE * 0.85); }
  onSlide() { this.hit(); }
  onFlop() { this.hit(); }
  onExplosion() { this.hit(); }
}

// ---------- Cat (TNT): touch = 3s hiss countdown, then it pounces on everything nearby ----------
export class Cat extends Breakable {
  constructor(stage, x, y, z) {
    super(stage, x, y, z);
    this.kind = 'cat';
    this.baseH = 1.0;
    this.aspect = 1;
    const glb = Assets.model('model_small_cat', 1.0);
    if (glb) {
      // own materials so the red alarm flash doesn't tint every cat
      glb.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); } });
      this.cat3d = glb;
      this.sprite = new THREE.Group();
      this.sprite.add(glb);
      this.mats = [];
      glb.traverse((o) => { if (o.isMesh && o.material.emissive) this.mats.push(o.material); });
    } else {
      this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.tex('small_cat'), transparent: true }));
      this.sprite.center.set(0.5, 0);
      this.aspect = Assets.aspect('small_cat');
      this.baseH = 1.05;
      this.sprite.scale.set(this.baseH * this.aspect, this.baseH, 1);
    }
    this.obj.add(this.sprite);
    this.shadow = makeShadow(1.0); this.shadow.position.y = 0.02; this.obj.add(this.shadow);
    this.count = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('3'), transparent: true, depthTest: false }));
    this.count.renderOrder = 20;
    this.count.scale.setScalar(0.9);
    this.count.position.y = 1.9;
    this.count.visible = false;
    this.obj.add(this.count);
    this.setBox(0.95, 0.95, 0.95);
    this.timer = -1;
    this.t = rand(0, 4);
    this.lastNum = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.timer >= 0) {
      this.timer += dt;
      const n = 3 - Math.floor(this.timer);
      if (n !== this.lastNum && n > 0) {
        this.lastNum = n;
        this.count.material.map = textTexture(String(n), { color: n === 1 ? '#ff5050' : '#ffd23f' });
        this.count.material.needsUpdate = true;
        audio.play('beep', n === 1 ? 1.5 : 1);
        if (n === 3) audio.play('hiss');
      }
      const frac = this.timer % 1;
      this.count.scale.setScalar(0.9 + (1 - frac) * 0.5);
      // puffed up, shaking, flashing red, crouching lower before the pounce
      const shake = Math.sin(this.t * 60) * 0.05 * (1 + this.timer);
      this.sprite.position.x = shake;
      const puff = 1.1 + this.timer * 0.08;
      if (this.cat3d) {
        this.sprite.scale.set(puff, puff * (1 - (this.timer > 2.4 ? (this.timer - 2.4) * 0.35 : 0)), puff);
        this.faceNobu(dt, 12);
        const red = (Math.sin(this.timer * Math.PI * 2 * (1 + this.timer)) * 0.5 + 0.5) * 0.6;
        for (const m of this.mats) m.emissive.setRGB(red, 0, 0);
      } else this.sprite.scale.set(this.baseH * this.aspect * puff, this.baseH * puff, 1);
      if (this.timer >= 3) this.pounce();
    } else {
      // idle: slow breathing, glaring at Nobu, the odd tail-flick twitch
      const k = Math.sin(this.t * 2) * 0.03;
      if (this.cat3d) {
        this.sprite.scale.set(1 - k, 1 + k, 1 - k);
        this.faceNobu(dt, 3);
        this.sprite.rotation.z = Math.sin(this.t * 0.7) > 0.95 ? Math.sin(this.t * 40) * 0.05 : 0;
      } else this.sprite.scale.set(this.baseH * this.aspect * (1 - k), this.baseH * (1 + k), 1);
    }
  }
  faceNobu(dt, k) {
    const p = this.player.pos;
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z) - this.obj.rotation.y;
    let d = want - this.sprite.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.sprite.rotation.y += d * Math.min(1, k * dt);
  }
  arm() {
    if (this.timer >= 0 || this.dead) return;
    this.timer = 0;
    this.lastNum = 0;
    this.count.visible = true;
  }
  pounce() {
    if (this.dead) return;
    this.markBroken();
    this.hide();
    this.count.visible = false;
    audio.play('pounce');
    explode(this.stage, this.pos.x, this.pos.y + 0.4, this.pos.z, 2.7, { kind: 'flat', source: this, color: 0xffb070 });
  }
  onBite() { this.pounce(); }
  onSlide() { this.pounce(); }
  onTouch(p) { if (p.invincible) this.pounce(); else this.arm(); }
  onStomp(p) { if (p.invincible) { this.pounce(); return; } this.arm(); p.bounce(TUNING.STOMP_BOUNCE); }
  onFlop() { this.pounce(); }
  onExplosion() { if (this.timer < 0 || this.timer < 2.85) this.timer = 2.85; this.count.visible = false; }
  onRestore() { this.timer = -1; this.count.visible = false; this.sprite.position.x = 0; if (this.mats) for (const m of this.mats) m.emissive.setRGB(0, 0, 0); }
}

// ---------- Rug (Nitro): any touch = rug pull ----------
let rugParts;
export class Rug extends Breakable {
  constructor(stage, x, y, z, { rot = 0 } = {}) {
    super(stage, x, y, z);
    this.kind = 'rug';
    rugParts ||= {
      geo: new THREE.BoxGeometry(1.5, 0.1, 1.0),
      tassel: new THREE.BoxGeometry(0.04, 0.03, 0.14),
      mTassel: toon(0xf5e6c8),
    };
    const tex = Assets.tex('rug');
    const side = toon(0x7a1f3a);
    const top = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x220000 });
    this.mesh = new THREE.Mesh(rugParts.geo, [side, side, top, side, side, side]);
    this.mesh.position.y = 0.06;
    this.holder = new THREE.Group();
    this.holder.rotation.y = rot;
    this.holder.add(this.mesh);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const t = new THREE.Mesh(rugParts.tassel, rugParts.mTassel);
        t.rotation.y = Math.PI / 2;
        t.position.set(sx * 0.8, 0.06, -0.42 + i * 0.14);
        this.mesh.add(t);
        t.position.y = 0;
      }
    }
    this.obj.add(this.holder);
    this.topMat = top;
    // footprint of the rotated 1.5 x 1.0 rug (slightly forgiving)
    const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    this.setBox((1.5 * c + 1.0 * sn) * 0.9, 0.5, (1.5 * sn + 1.0 * c) * 0.9);
    this.t = rand(0, 3);
    this.hopT = rand(0.5, 1.5);
    this.hop = 0;
    this.fly = -1;
  }
  update(dt) {
    this.t += dt;
    if (this.fly >= 0) {
      // yanked away offscreen
      this.fly += dt;
      this.holder.position.set(this.fly * 9, this.fly * 4 + Math.sin(this.fly * 10) * 0.3, 0);
      this.holder.rotation.set(this.fly * 6, this.fly * 9, this.fly * 3);
      if (this.fly > 1.2) { this.obj.visible = false; this.fly = -1; this.dead = true; }
      return;
    }
    // nervous twitching + little hops (warning)
    this.hopT -= dt;
    if (this.hopT <= 0) { this.hop = 1; this.hopT = rand(0.6, 1.6); }
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 3.5);
    const h = Math.sin((1 - this.hop) * Math.PI) * (this.hop > 0 ? 0.25 : 0);
    this.mesh.position.y = 0.06 + h;
    this.mesh.rotation.z = Math.sin(this.t * 31) * 0.04 + (this.hop > 0 ? Math.sin(this.t * 50) * 0.08 : 0);
    this.mesh.rotation.x = Math.sin(this.t * 23) * 0.03;
    this.topMat.emissive.setRGB(0.15 + Math.max(0, Math.sin(this.t * 5)) * 0.25, 0.02, 0.05);
  }
  pull(hurtPlayer = true) {
    if (this.broken) return;
    this.markBroken();
    this.interactive = false;
    this.fly = 0;
    audio.play('whoosh');
    this.fx.puff(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 10, size: 0.5, color: 0xd8b0d8, speed: 3 });
    this.fx.sparkle(this.pos.x, this.pos.y + 0.3, this.pos.z, { count: 10, color: 0xff5ad0, size: 0.7 });
    this.game.camera.shake(0.4, 0.3);
    const p = this.player;
    if (hurtPlayer && !p.dead && p.pos.distanceTo(this.pos) < 2.2) p.hurt('rug', this.pos.x, this.pos.z);
    // rug pulls trip neighbors too
    for (const e of this.stage.entities) {
      if (e === this || e.dead || !e.onExplosion) continue;
      if (e.pos.distanceTo(this.pos) < 2.0) e.onExplosion(this);
    }
  }
  rollUp() {
    if (this.broken) return;
    this.markBroken();
    this.interactive = false;
    this.fly = 0;
    this.fx.sparkle(this.pos.x, this.pos.y + 0.3, this.pos.z, { count: 12, color: 0x7dff8a, size: 0.7 });
  }
  onBite() { this.pull(); }
  onSlide() { this.pull(); }
  onTouch() { this.pull(); }
  onStomp() { this.pull(); }
  onFlop() { this.pull(); }
  onExplosion() { this.pull(true); }
  onRestore() { this.interactive = true; this.fly = -1; this.holder.position.set(0, 0, 0); this.holder.rotation.set(0, this.holder.rotation.y, 0); }
}

// ---------- Lint Roller switch: rolls up every rug in the stage ----------
export class LintRoller extends Breakable {
  constructor(stage, x, y, z) {
    super(stage, x, y, z);
    this.kind = 'lintroller';
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), toon(0x3ec46d));
    base.position.y = 0.475;
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 14), toon(0xf8f8ff));
    roller.rotation.z = Math.PI / 2; roller.position.set(0, 1.15, 0);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), toon(0x2a6ad0));
    handle.position.set(0, 1.4, 0.15); handle.rotation.x = 0.6;
    const bang = textSprite('!', { color: '#ffffff', size: 128 });
    bang.scale.setScalar(0.7); bang.position.set(0, 0.5, 0.5); bang.material.depthTest = true;
    this.obj.add(base, roller, handle, bang);
    this.setBox(1.0, 1.0, 1.0);
    this.solid = stage.world.add(new Solid({ x: x - 0.48, y, z: z - 0.48 }, { x: x + 0.48, y: y + 0.95, z: z + 0.48 }, { kind: 'breakable', ref: this }));
  }
  press() {
    if (!this.markBroken()) return;
    this.hide();
    audio.play('switch');
    this.fx.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, { count: 14, colors: [0x3ec46d, 0xffffff, 0x2a6ad0], speed: 4, floor: this.pos.y });
    let n = 0;
    for (const e of this.stage.entities) if (e instanceof Rug && !e.broken) { e.rollUp(); n++; }
    if (n) this.game.ui.banner('RUGS ROLLED UP!', `${n} rug${n > 1 ? 's' : ''} neutralized`);
  }
  onBite() { this.press(); }
  onSlide() { this.press(); }
  onHeadHit() { this.press(); }
  onLand(p) { if (this.broken) return false; this.press(); p.bounce(TUNING.STOMP_BOUNCE); return true; }
  onExplosion() { this.press(); }
}
