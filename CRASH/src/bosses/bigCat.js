// The Big Cat: shared 3D rig, the level-2 chase pursuer, and the boss fight.
// Boss: hisses a 3-2-1 countdown before pouncing; if it misses it lies dizzy -> jump on its head.
// Also paw swipes up close and bouncing hairballs.
import * as THREE from 'three';
import { Boss, makeMarker, dirTo, rotY, attachGlb } from './common.js';
import { Entity } from '../entities/entity.js';
import { toon } from '../player/nobuPrims.js';
import { audio } from '../audio/audio.js';
import { textTexture } from '../entities/fx.js';
import { damp, rand, clamp } from '../core/util.js';
import { TUNING } from '../player/player.js';

export class CatRig {
  constructor(scale = 1) {
    const orange = toon(0xf08a2a), dark = toon(0xc0601a), cream = toon(0xffe2b8), pink = toon(0xf28a9a);
    const ink = toon(0x1a1010), white = toon(0xffffff), purple = toon(0x6a2fb0);
    const eye = new THREE.MeshBasicMaterial({ color: 0xffe040 });
    const S = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.body = new THREE.Group(); this.body.position.y = 1.45; this.root.add(this.body);
    const torso = new THREE.Mesh(S(1), orange); torso.scale.set(1.25, 0.95, 1.75); this.body.add(torso);
    const belly = new THREE.Mesh(S(0.9), cream); belly.scale.set(1.0, 0.7, 1.5); belly.position.y = -0.3; this.body.add(belly);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.08, 6, 18, Math.PI * 0.9), dark);
      st.position.set(0, 0.08, -0.9 + i * 0.55); st.rotation.set(0, Math.PI / 2, Math.PI * 0.05 + Math.PI / 2 * 0); st.rotation.z = Math.PI * 0.55;
      st.scale.set(1.0, 1.2, 1);
      this.body.add(st);
    }
    // head
    this.head = new THREE.Group(); this.head.position.set(0, 0.95, 1.65); this.body.add(this.head);
    const skull = new THREE.Mesh(S(0.95), orange); skull.scale.set(1.15, 0.95, 0.95); this.head.add(skull);
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(S(0.45), cream); cheek.scale.set(1.1, 0.8, 0.9); cheek.position.set(sx * 0.55, -0.35, 0.55); this.head.add(cheek);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.75, 4), orange); ear.position.set(sx * 0.6, 0.85, -0.05); ear.rotation.z = sx * -0.35; ear.rotation.y = Math.PI / 4; this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), pink); inner.position.set(sx * 0.58, 0.8, 0.08); inner.rotation.z = sx * -0.35; inner.rotation.y = Math.PI / 4; this.head.add(inner);
      for (let w = 0; w < 3; w++) {
        const wh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.025), white);
        wh.position.set(sx * 0.95, -0.38 + w * 0.1, 0.7); wh.rotation.z = sx * (0.15 - w * 0.12); this.head.add(wh);
      }
    }
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(sx * 0.38, 0.15, 0.78); this.head.add(e);
      const ball = new THREE.Mesh(S(0.24), eye); ball.scale.set(1, 0.75, 0.5); e.add(ball);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.05), ink); slit.position.z = 0.11; e.add(slit);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.08), ink); brow.position.set(0, 0.2, 0.08); brow.rotation.z = sx * 0.4; e.add(brow);
      this.eyes.push({ e, slit, ball });
    }
    const nose = new THREE.Mesh(S(0.12), pink); nose.scale.set(1.3, 0.8, 0.8); nose.position.set(0, -0.15, 0.95); this.head.add(nose);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.35, 0.6); this.head.add(this.jaw);
    const mouth = new THREE.Mesh(S(0.35), toon(0x5a1222)); mouth.scale.set(1.1, 0.4, 0.6); mouth.position.z = 0.15; this.jaw.add(mouth);
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 6), white); f.rotation.x = Math.PI; f.position.set(sx * 0.2, 0.08, 0.38); this.jaw.add(f); }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 20), purple); collar.position.set(0, 0.45, 1.25); collar.rotation.x = 1.2; this.body.add(collar);
    const tag = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 10), toon(0xd8d0ff)); tag.position.set(0, -0.1, 1.85); tag.rotation.x = Math.PI; this.body.add(tag);
    // legs
    this.legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.65, -0.35, sz * 1.0); this.body.add(hip);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 1.0, 10), orange); leg.position.y = -0.5; hip.add(leg);
      const paw = new THREE.Mesh(S(0.3), cream); paw.scale.set(1, 0.6, 1.25); paw.position.set(0, -1.05, 0.12); hip.add(paw);
      this.legs.push(hip);
    }
    // tail: segmented curve
    this.tail = [];
    let parent = this.body;
    const tp = new THREE.Group(); tp.position.set(0, 0.35, -1.65); this.body.add(tp); parent = tp;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0 : 0.42, 0);
      const m = new THREE.Mesh(S(0.22 - i * 0.015), i % 2 ? dark : orange); m.position.y = 0.21; seg.add(m);
      parent.add(seg); parent = seg; this.tail.push(seg);
    }
    // countdown + dizzy stars
    this.count = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('3'), transparent: true, depthTest: false }));
    this.count.renderOrder = 20; this.count.scale.setScalar(1.6); this.count.position.set(0, 4.6, 0); this.count.visible = false;
    this.root.add(this.count);
    this.stars = new THREE.Group(); this.stars.position.set(0, 2.2, 1.65); this.stars.visible = false;
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffe14a })); const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1); this.stars.add(s); }
    this.root.add(this.stars);
    this.t = 0;
    // Higgsfield 3D body rides the animated torso (gallop pitch/bob, dizzy roll, leap)
    this.glb = attachGlb(this.body, 'model_big_cat', 3.3, -1.45, [this.body]);
  }

  setCount(n) {
    if (!n) { this.count.visible = false; return; }
    this.count.visible = true;
    this.count.material.map = textTexture(String(n), { color: n === 1 ? '#ff5050' : '#ffd23f' });
    this.count.material.needsUpdate = true;
  }

  // pose(mode, dt, k): 'run' | 'idle' | 'crouch' | 'leap' | 'dizzy' | 'swipeUp' | 'swipe' | 'cough' | 'sit'
  pose(mode, dt, k = 1) {
    this.t += dt;
    const t = this.t;
    const B = this.body;
    let bodyY = 1.45, pitch = 0, roll = 0, headX = 0, jaw = 0.05;
    const L = this.legs;
    L.forEach((l) => { l.rotation.set(0, 0, 0); });
    let tailWag = Math.sin(t * 2.5) * 0.25, tailCurl = 0.25;
    this.eyes.forEach((e) => { e.slit.scale.y = 1; });
    if (mode === 'run') {
      const ph = t * 11 * k;
      const s = Math.sin(ph);
      L[0].rotation.x = s * 0.9; L[1].rotation.x = Math.sin(ph + 0.4) * 0.9;
      L[2].rotation.x = -Math.sin(ph + 1.2) * 0.9; L[3].rotation.x = -Math.sin(ph + 1.6) * 0.9;
      pitch = Math.sin(ph) * 0.12;
      bodyY = 1.45 + Math.abs(Math.cos(ph)) * 0.35;
      jaw = 0.5 + Math.sin(ph * 0.5) * 0.15;
      tailWag = Math.sin(ph * 0.5) * 0.4; tailCurl = -0.1;
    } else if (mode === 'idle') {
      bodyY = 1.45 + Math.sin(t * 2) * 0.04;
      headX = Math.sin(t * 1.3) * 0.05;
    } else if (mode === 'crouch') {
      bodyY = 1.0 - k * 0.05; pitch = 0.18;
      L.forEach((l, i) => (l.rotation.x = i < 2 ? -0.5 : 0.6));
      roll = Math.sin(t * 18) * 0.06; // butt wiggle
      tailWag = Math.sin(t * 16) * 0.6; tailCurl = 0.5;
      jaw = 0.55; headX = -0.1;
      this.eyes.forEach((e) => { e.slit.scale.y = 0.4; });
    } else if (mode === 'leap') {
      bodyY = 1.45; pitch = -0.35 + k * 0.7;
      L[0].rotation.x = L[1].rotation.x = -1.1; L[2].rotation.x = L[3].rotation.x = 1.1;
      jaw = 0.9; tailCurl = -0.4;
    } else if (mode === 'dizzy') {
      bodyY = 0.75; roll = Math.sin(t * 3) * 0.12;
      L.forEach((l, i) => (l.rotation.z = (i % 2 ? 1 : -1) * 1.1));
      headX = 0.35; jaw = 0.3;
      tailWag = Math.sin(t * 5) * 0.2; tailCurl = 0.05;
      this.eyes.forEach((e, i) => { e.slit.rotation.z = t * 10 * (i ? 1 : -1); e.slit.scale.y = 0.8; });
    } else if (mode === 'swipeUp') {
      L[1].rotation.x = -2.2 * k; L[1].rotation.z = -0.4 * k; pitch = -0.15 * k; jaw = 0.6; roll = -0.1 * k;
    } else if (mode === 'swipe') {
      L[1].rotation.x = -2.2 + k * 2.6; L[1].rotation.y = k * 1.4; roll = 0.15; jaw = 0.8;
    } else if (mode === 'cough') {
      const c = Math.sin(t * 22);
      headX = 0.3 + c * 0.15; pitch = 0.1 + c * 0.05; jaw = 0.4 + Math.max(0, c) * 0.6;
    } else if (mode === 'sit') {
      bodyY = 1.1; pitch = -0.45;
      L[2].rotation.x = L[3].rotation.x = -1.2;
      L[0].rotation.x = L[1].rotation.x = 0.3;
      headX = 0.2; jaw = 0.3 + Math.max(0, Math.sin(t * 14)) * 0.4;
      tailWag = Math.sin(t * 3) * 0.6;
    }
    B.position.y = bodyY;
    B.rotation.set(pitch, 0, roll);
    this.head.rotation.x = headX;
    this.jaw.rotation.x = jaw;
    this.tail.forEach((s, i) => { s.rotation.x = -0.35 - tailCurl * (i / 5); s.rotation.z = tailWag * (i / 5 + 0.3); });
    this.stars.visible = mode === 'dizzy';
    if (this.stars.visible) this.stars.rotation.y += dt * 4;
  }
}

// ---------------- Level 2 chase pursuer ----------------
// Runs along the track behind Nobu (in track distance). Rubber-banded: always looming, never hopeless.
export class ChaseCat extends Entity {
  constructor(stage, track, s) {
    super(stage, 0, 0, 0);
    this.track = track;
    this.s = s;
    this.u = 0;
    this.rig = new CatRig(1.3);
    this.obj.add(this.rig.root);
    this.alwaysActive = true;
    this.interactive = false;
    this.state = 'wait';
    this.waitT = 99;
    this.speed = 0;
    this._place();
  }
  _place() {
    this.track.toWorld(this.s, this.u, 0, this.pos);
    this.pos.y = this.track.heightAt(this.s);
    this.obj.position.copy(this.pos);
    this.rig.root.rotation.y = this.track.yaw(this.s);
  }
  begin(s, delay = 1.6) {
    this.s = s;
    this.u = 0;
    this.state = 'wait';
    this.waitT = delay;
    this.roared = false;
    this._place();
  }
  update(dt) {
    const p = this.player;
    const ps = p.body.s ?? 0;
    if (this.state === 'wait') {
      this.waitT -= dt;
      this.rig.pose('crouch', dt, 1);
      if (this.waitT < 0.8 && !this.roared) { this.roared = true; audio.play('bossRoar'); this.game.camera.shake(0.4, 0.5); }
      if (this.waitT <= 0) this.state = 'run';
    } else if (this.state === 'run') {
      const gap = ps - this.s;
      const target = gap > 13 ? 10.5 : gap > 9 ? 8.2 : gap < 5 ? 6.7 : 7.2;
      this.speed = damp(this.speed, target, 3, dt);
      this.s += this.speed * dt;
      this.u = damp(this.u, clamp(p.body.u ?? 0, -1.8, 1.8), 1.5, dt);
      this.rig.pose('run', dt, 1);
      if (Math.random() < dt * 6) this.fx.puff(this.pos.x + rand(-1.5, 1.5), this.pos.y + 0.1, this.pos.z + rand(-1.5, 1.5), { count: 1, size: 0.7, color: 0xf0c890, speed: 1, up: 1 });
      if (Math.random() < dt * 1.5) this.game.camera.shake(0.12, 0.15);
      if (gap < 2.4 && !p.dead) {
        p.die('flat');
        this.state = 'gloat';
        audio.play('meow');
      }
      if (p.dead && this.state === 'run') this.state = 'gloat';
    } else if (this.state === 'gloat') {
      this.rig.pose('sit', dt);
    } else if (this.state === 'stop') {
      this.rig.pose('idle', dt);
    }
    this._place();
  }
}

// ---------------- Boss ----------------
export class BigCatBoss extends Boss {
  constructor(stage, x, y, z) {
    super(stage, x, y, z, { name: 'THE BIG CAT', portrait: 'portrait_cat', hp: 6, phaseHp: 2 });
    this.rig = new CatRig(0.95);
    this.obj.add(this.rig.root);
    this.home = new THREE.Vector3(x, y, z);
    this.setBox(3.6, 3.0, 3.6);
    this.marker = makeMarker(2.4);
    this.marker.visible = false;
    stage.scene.add(this.marker);
    this.yaw = Math.PI;
    this.target = new THREE.Vector3();
    this.leapFrom = new THREE.Vector3();
    this.pouncesLeft = 0;
    this.collectMeshes();
  }

  idleAnim(dt) {
    this.rig.pose('idle', dt);
    this.faceTo(this.player.pos, dt, 4);
  }

  faceTo(p, dt, k = 6) {
    const yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw = damp(this.yaw, yaw + Math.round((this.yaw - yaw) / (Math.PI * 2)) * Math.PI * 2, k, dt);
    this.rig.root.rotation.y = this.yaw;
  }

  start() { this.active = true; this.setState('stalk'); this.nextAttackAt = 1.4; }

  get sp() { return this.phase === 3 ? 1.35 : this.phase === 2 ? 1.15 : 1; }

  ai(dt) {
    const p = this.player;
    const toP = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.vulnerable = false;
    this.size.h = this.state === 'dizzy' ? 1.8 : 3.0; // lying flat: easy to land on
    switch (this.state) {
      case 'stalk': {
        this.faceTo(p.pos, dt, 5);
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const spd = (toP > 4.5 ? 2.6 : 0.8) * this.sp;
        this.pos.addScaledVector(fwd, spd * dt);
        this.clampArena();
        this.rig.pose(spd > 1 ? 'run' : 'idle', dt, 0.45);
        if (this.stateT > this.nextAttackAt / this.sp && !p.dead) this.chooseAttack(toP);
        break;
      }
      case 'swipeUp': {
        const tele = 0.55 / this.sp;
        this.rig.pose('swipeUp', dt, Math.min(1, this.stateT / tele));
        this.faceTo(p.pos, dt, 8);
        if (this.stateT > tele) { this.setState('swipe'); audio.play('whoosh'); this.swiped = false; }
        break;
      }
      case 'swipe': {
        const k = Math.min(1, this.stateT / 0.18);
        this.rig.pose('swipe', dt, k);
        if (k > 0.5 && !this.swiped) {
          this.swiped = true;
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const to = dirTo(this.pos, p.pos);
          if (toP < 4.4 && fwd.dot(to) > 0.25 && p.pos.y < this.pos.y + 2.2) p.hurt('angel', this.pos.x, this.pos.z);
          this.fx.puff(this.pos.x + fwd.x * 3, this.pos.y + 0.5, this.pos.z + fwd.z * 3, { count: 6, size: 0.5, color: 0xffffff, speed: 4 });
        }
        if (this.stateT > 0.7) this.toStalk();
        break;
      }
      case 'cough': {
        this.rig.pose('cough', dt);
        this.faceTo(p.pos, dt, 6);
        if (this.stateT > 0.75 / this.sp && !this.coughed) {
          this.coughed = true;
          const n = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 5;
          const dir = dirTo(this.pos, p.pos);
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const mouth = this.pos.clone().addScaledVector(fwd, 2.4); mouth.y = 1.8;
          for (let i = 0; i < n; i++) this.proj.hairball(mouth, rotY(dir, (i - (n - 1) / 2) * 0.32), 6.5 + this.phase * 0.8, this.pos.y);
          audio.play('meow');
        }
        if (this.stateT > 1.3) this.toStalk();
        break;
      }
      case 'countdown': {
        // the 3-2-1 hiss (echo of the small cat), target ring follows Nobu until the last beat
        const beat = (this.firstPounce ? 0.95 : 0.55) / this.sp;
        const n = 3 - Math.floor(this.stateT / beat);
        if (n !== this.lastN && n > 0) { this.lastN = n; this.rig.setCount(n); audio.play('beep', n === 1 ? 1.5 : 1); if (n === 3) audio.play('hiss'); }
        this.rig.pose('crouch', dt);
        this.faceTo(p.pos, dt, 8);
        if (n >= 2) this.target.set(clamp(p.pos.x, -10.5, 10.5), this.pos.y, clamp(p.pos.z, -10.5, 10.5));
        this.marker.visible = true;
        this.marker.position.set(this.target.x, this.pos.y + 0.06, this.target.z);
        this.marker.scale.setScalar(1 + Math.sin(this.stateT * 16) * 0.06);
        if (this.stateT >= beat * 3) {
          this.rig.setCount(0);
          this.leapFrom.copy(this.pos);
          this.setState('leap');
          audio.play('pounce');
        }
        break;
      }
      case 'leap': {
        const dur = 0.75 / this.sp;
        const k = Math.min(1, this.stateT / dur);
        this.pos.lerpVectors(this.leapFrom, this.target, k);
        this.pos.y = this.home.y + Math.sin(k * Math.PI) * 5;
        this.rig.pose('leap', dt, k);
        if (k >= 1) {
          this.marker.visible = false;
          audio.play('stomp');
          this.game.camera.shake(0.8, 0.45);
          this.fx.ring(this.pos.x, this.pos.y, this.pos.z, { color: 0xf0d0a0, radius: 2.4 });
          this.fx.puff(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 12, size: 0.8, color: 0xf0d0a0, speed: 5 });
          const hit = !p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 2.4 && p.pos.y < this.pos.y + 1.6;
          if (hit) p.hurt('flat', this.pos.x, this.pos.z);
          if (this.phase >= 2) this.proj.shockwave(this.pos.x, this.pos.y, this.pos.z, 7 + this.phase, 8);
          this.pouncesLeft--;
          if (hit) { this.toStalk(); audio.play('laugh'); }
          else if (this.pouncesLeft > 0) { this.firstPounce = false; this.lastN = 0; this.setState('countdown'); }
          else { this.setState('dizzy'); audio.play('dizzy'); }
        }
        break;
      }
      case 'dizzy': {
        // MISSED! lying flat with stars: jump on its head!
        this.vulnerable = true;
        this.rig.pose('dizzy', dt);
        const dur = this.phase === 1 ? 2.8 : this.phase === 2 ? 2.4 : 2.0;
        if (this.stateT > dur) { this.toStalk(); audio.play('hiss'); }
        break;
      }
      case 'angry': {
        this.rig.pose('crouch', dt);
        if (this.stateT > 0.7) this.toStalk();
        break;
      }
    }
  }

  chooseAttack(toP) {
    const r = Math.random();
    if (toP < 4.2 && r < 0.6) { this.setState('swipeUp'); return; }
    if (r < 0.62 || this.sinceRanged > 1) {
      this.setState('countdown');
      this.lastN = 0;
      this.firstPounce = true;
      this.pouncesLeft = this.phase;
      this.sinceRanged = 0;
    } else {
      this.setState('cough');
      this.coughed = false;
      this.sinceRanged = (this.sinceRanged || 0) + 1;
    }
  }

  toStalk() { this.setState('stalk'); this.nextAttackAt = rand(1.1, 1.9); this.rig.setCount(0); this.marker.visible = false; }

  clampArena() {
    this.pos.x = clamp(this.pos.x, -9.5, 9.5);
    this.pos.z = clamp(this.pos.z, -9.5, 9.5);
  }

  // Only a stomp on its head (while dizzy) hurts it. Bites just annoy it.
  onBite(p) {
    if (this.vulnerable) { audio.play('meow'); this.fx.sparkle(this.pos.x, this.pos.y + 1.5, this.pos.z, { count: 4, size: 0.4 }); }
  }
  onSlide() {}
  onStomp(p) {
    if (this.vulnerable) { this.damage(p); p.bounce(TUNING.STOMP_BOUNCE * 1.2); }
    else this.onTouch(p);
  }
  onTouch(p) {
    if (this.vulnerable || !this.active || this.defeated) return;
    if (this.state === 'countdown' || this.state === 'stalk' || this.state === 'leap' || this.state === 'swipe') p.hurt('angel', this.pos.x, this.pos.z);
  }
  onHit() {
    audio.play('meow');
    this.setState('angry');
    this.rig.setCount(0);
    this.marker.visible = false;
  }
  onResetPhase() {
    this.pos.copy(this.home);
    this.rig.setCount(0);
    this.marker.visible = false;
    this.setState('stalk');
    this.nextAttackAt = 1.6;
  }
  defeatAnim(dt) {
    this.defT = (this.defT || 0) + dt;
    this.marker.visible = false;
    this.rig.setCount(0);
    this.rig.pose('dizzy', dt);
    this.rig.root.rotation.z = Math.min(1, this.defT) * Math.PI * 0.95; // rolls onto its back
    this.rig.root.position.y = Math.min(1, this.defT) * 1.4;
    if (this.defT < 1.2 && Math.random() < dt * 6) this.fx.sparkle(this.pos.x, this.pos.y + 2, this.pos.z, { count: 3, color: 0xffe14a });
  }
}
