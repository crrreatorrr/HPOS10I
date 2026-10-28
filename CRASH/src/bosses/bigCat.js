// The Big Cat: shared 3D rig, the level-2 chase pursuer, and the boss fight.
// Boss: hisses a 3-2-1 countdown before pouncing; if it misses it lies dizzy -> jump on its head.
// Also: paw swipes, bouncing hairballs, a giant YARN BALL it bats across the arena,
// CLAW SLASH shockwaves, a TAIL-WHIP SPIN, and phase-3 ZOOMIES (dashes until it collapses, dizzy).
import * as THREE from 'three';
import { Boss, makeMarker, dirTo, rotY, attachGlb } from './common.js';
import { autoRig, sstep, chain, segDist, blendPose } from './autorig.js';
import { Entity } from '../entities/entity.js';
import { toon } from '../player/nobuPrims.js';
import { audio } from '../audio/audio.js';
import { textTexture } from '../entities/fx.js';
import { damp, rand, clamp, pick } from '../core/util.js';
import { TUNING } from '../player/player.js';

// rig layout (model units: 4 tall, facing +z). The model is a low crouch: only the paws poke out
// below the belly (y < 0.7), so legs get small swings and the spine/head/tail carry the acting.
const J = {
  hips: [0, 1.5, -0.9], chest: [0, 1.6, 0.5], head: [0, 1.45, 1.15],
  flU: [-0.95, 0.75, 1.3], flL: [-1.0, 0.35, 1.9], frU: [0.9, 0.75, 1.1], frL: [0.9, 0.35, 1.7],
  blU: [-1.25, 0.8, -0.7], blL: [-1.4, 0.35, -0.85], brU: [1.2, 0.8, -0.8], brL: [1.3, 0.35, -1.0],
  tail0: [-0.3, 2.1, -1.8], tail1: [-0.55, 2.5, -2.6], tail2: [-0.6, 3.3, -2.75], tail3: [-0.6, 3.85, -2.1],
};
const PAW_END = { fl: [-1.0, 0.12, 2.5], fr: [0.9, 0.12, 2.3], bl: [-1.4, 0.1, -1.0], br: [1.3, 0.1, -1.1] };
const TAIL_END = [-0.55, 3.5, -1.35];
const PARENTS = {
  hips: null, chest: 'hips', head: 'chest',
  flU: 'chest', flL: 'flU', frU: 'chest', frL: 'frU', blU: 'hips', blL: 'blU', brU: 'hips', brL: 'brU',
  tail0: 'hips', tail1: 'tail0', tail2: 'tail1', tail3: 'tail2',
};
const TAIL = ['tail0', 'tail1', 'tail2', 'tail3'];
function weighCat(x, y, z) {
  const w = {};
  const p = [x, y, z];
  // tail: close to the tail chain and behind the rump
  let dTail = Infinity;
  TAIL.forEach((n, i) => { dTail = Math.min(dTail, segDist(p, J[n], i < 3 ? J[TAIL[i + 1]] : TAIL_END).d); });
  const tailK = sstep(0.55, 0.32, dTail) * sstep(-1.45, -1.75, z);
  // paws: only low geometry near each paw's bones
  let legK = 0, leg = null, lower = 0;
  for (const l of ['fl', 'fr', 'bl', 'br']) {
    const u = segDist(p, J[l + 'U'], J[l + 'L']).d, lo = segDist(p, J[l + 'L'], PAW_END[l]).d;
    const k = sstep(0.75, 0.45, Math.min(u, lo)) * sstep(0.85, 0.55, y);
    if (k > legK) { legK = k; leg = l; lower = sstep(0.1, -0.1, lo - u); }
  }
  legK *= 1 - tailK;
  if (leg) { w[leg + 'U'] = legK * (1 - lower); w[leg + 'L'] = legK * lower; }
  chain(w, p, TAIL, J, TAIL_END, tailK);
  const rest = Math.max(0, 1 - tailK - legK);
  const head = rest * sstep(1.15, 1.55, z) * sstep(0.7, 1.0, y);
  w.head = head;
  const body = rest - head;
  const ch = sstep(-0.5, 0.7, z);
  w.chest = body * ch; w.hips = body * (1 - ch);
  return w;
}

export class CatRig {
  constructor(scale = 1) {
    const orange = toon(0xf08a2a), cream = toon(0xffe2b8);
    const S = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.body = new THREE.Group(); this.body.position.y = 1.45; this.root.add(this.body);
    // primitive fallback (only shown if the GLB failed to load)
    const torso = new THREE.Mesh(S(1), orange); torso.scale.set(1.25, 0.95, 1.75); this.body.add(torso);
    this.fbHead = new THREE.Mesh(S(0.95), orange); this.fbHead.position.set(0, 0.95, 1.65); this.body.add(this.fbHead);
    this.fbLegs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.65, -0.35, sz * 1.0); this.body.add(hip);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 1.0, 10), cream); leg.position.y = -0.5; hip.add(leg);
      this.fbLegs.push(hip);
    }
    // countdown + dizzy stars
    this.count = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('3'), transparent: true, depthTest: false }));
    this.count.renderOrder = 20; this.count.scale.setScalar(1.6); this.count.position.set(0, 4.6, 0); this.count.visible = false;
    this.root.add(this.count);
    this.stars = new THREE.Group(); this.stars.position.set(0, 2.2, 1.65); this.stars.visible = false;
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffe14a })); const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1); this.stars.add(s); }
    this.root.add(this.stars);
    this.t = 0;
    this.lookYaw = 0;
    // Higgsfield 3D body, auto-rigged: legs, spine, head and a 4-joint tail
    this.glb = attachGlb(this.body, 'model_big_cat', 3.3, -1.45, [this.body]);
    if (this.glb) {
      const r = autoRig(this.glb, { height: 3.3, joints: J, parents: PARENTS, weigh: weighCat });
      if (r) this.bones = r.bones;
    }
  }

  setCount(n) {
    if (!n) { this.count.visible = false; return; }
    this.count.visible = true;
    this.count.material.map = textTexture(String(n), { color: n === 1 ? '#ff5050' : '#ffd23f' });
    this.count.material.needsUpdate = true;
  }

  // pose(mode, dt, k): run | idle | crouch | leap | land | dizzy | swipeUp | swipe | cough | sit | bat | rear | slam | spin | yowl
  pose(mode, dt, k = 1) {
    this.t += dt;
    const t = this.t;
    let bodyY = 1.45, pitch = 0, roll = 0;
    const P = {};
    const tailSwish = (amp, rate, lift = 0) => {
      TAIL.forEach((n, i) => { P[n] = [i === 0 ? lift : 0, Math.sin(t * rate - i * 0.7) * amp * (i === 0 ? 1 : 0.35), 0]; });
    };
    const look = [0, this.lookYaw, 0];
    let rate = 14;
    if (mode === 'run') {
      const ph = t * 11 * k;
      const s = Math.sin(ph), c = Math.cos(ph);
      // rotary gallop: paws paddle front pair then back pair, spine bunches and stretches
      P.flU = [s * 0.45, 0, 0]; P.frU = [Math.sin(ph + 0.45) * 0.45, 0, 0];
      P.flL = [-Math.max(0, -c) * 0.5, 0, 0]; P.frL = [-Math.max(0, -Math.cos(ph + 0.45)) * 0.5, 0, 0];
      P.blU = [-Math.sin(ph + 1.3) * 0.45, 0, 0]; P.brU = [-Math.sin(ph + 1.75) * 0.45, 0, 0];
      P.blL = [Math.max(0, Math.cos(ph + 1.3)) * 0.5, 0, 0]; P.brL = [Math.max(0, Math.cos(ph + 1.75)) * 0.5, 0, 0];
      P.chest = [s * 0.1, 0, 0]; P.hips = [-s * 0.07, 0, 0];
      P.head = [-s * 0.08 + 0.05, look[1], 0];
      P.tail0 = [-0.3, Math.sin(ph * 0.5) * 0.25, 0]; P.tail1 = [-0.1, Math.sin(ph * 0.5 - 1) * 0.15, 0];
      pitch = s * 0.05;
      bodyY = 1.45 + Math.abs(c) * 0.22;
      rate = 30;
    } else if (mode === 'idle') {
      const br = Math.sin(t * 2);
      bodyY = 1.45 + br * 0.03;
      P.chest = [br * 0.03, 0, 0];
      P.head = [Math.sin(t * 1.3) * 0.05, look[1], Math.sin(t * 0.7) * 0.06];
      tailSwish(0.25, 1.8, 0.05);
      rate = 8;
    } else if (mode === 'crouch') {
      // hunting crouch with a butt wiggle before the pounce
      bodyY = 1.33; pitch = 0.1;
      roll = Math.sin(t * 18) * 0.04;
      P.blU = [-0.3, 0, 0]; P.brU = [-0.3, 0, 0]; P.blL = [0.4, 0, 0]; P.brL = [0.4, 0, 0];
      P.flU = [0.2, 0, 0]; P.frU = [0.2, 0, 0];
      P.hips = [-0.08, Math.sin(t * 18) * 0.1, 0];
      P.head = [-0.15, look[1], 0];
      P.tail0 = [-0.25, Math.sin(t * 16) * 0.3, 0]; P.tail1 = [0, Math.sin(t * 16 - 1) * 0.2, 0];
      rate = 20;
    } else if (mode === 'leap') {
      // stretched flying pounce: front paws reach, back legs trail, tail streams behind
      pitch = -0.3 + k * 0.6;
      P.flU = [-0.7, 0, -0.15]; P.frU = [-0.7, 0, 0.15]; P.flL = [-0.3, 0, 0]; P.frL = [-0.3, 0, 0];
      P.blU = [0.6, 0, 0]; P.brU = [0.6, 0, 0];
      P.chest = [-0.12, 0, 0]; P.hips = [0.08, 0, 0]; P.head = [-0.25, 0, 0];
      P.tail0 = [-0.55, 0, 0]; P.tail1 = [-0.15, 0, 0];
      rate = 25;
    } else if (mode === 'land') {
      // squash on impact
      bodyY = 1.45 - k * 0.25; pitch = 0.12 * k;
      P.flU = [0.25 * k, 0, -0.25 * k]; P.frU = [0.25 * k, 0, 0.25 * k]; P.blU = [-0.3 * k, 0, -0.2 * k]; P.brU = [-0.3 * k, 0, 0.2 * k];
      P.head = [0.2 * k, 0, 0];
      rate = 35;
    } else if (mode === 'dizzy') {
      bodyY = 1.2; roll = Math.sin(t * 3) * 0.1;
      P.flU = [0, 0, -0.6]; P.frU = [0, 0, 0.6]; P.blU = [0, 0, -0.6]; P.brU = [0, 0, 0.6];
      P.head = [0.3, Math.sin(t * 2.3) * 0.3, Math.sin(t * 3) * 0.25];
      P.tail0 = [-0.5, Math.sin(t * 2) * 0.15, 0]; P.tail1 = [-0.1, 0, 0];
      rate = 6;
    } else if (mode === 'swipeUp') {
      P.frU = [-1.4 * k, 0, 0.25 * k]; P.frL = [-0.4 * k, 0, 0];
      P.blU = [-0.2 * k, 0, 0]; P.brU = [-0.2 * k, 0, 0];
      P.chest = [-0.12 * k, 0, 0]; P.head = [-0.12, look[1], 0];
      pitch = -0.12 * k; roll = -0.08 * k; tailSwish(0.35, 10, 0.1);
      rate = 18;
    } else if (mode === 'swipe') {
      P.frU = [-1.4 + k * 1.7, k * 0.7, 0.25 - k * 0.45]; P.frL = [-0.4 + k * 0.4, 0, 0];
      P.chest = [0.08, -k * 0.2, 0]; P.head = [0, -k * 0.25, 0];
      roll = 0.12 * k; tailSwish(0.4, 12, 0.1);
      rate = 40;
    } else if (mode === 'bat') {
      // backhand bat at the yarn ball: left paw winds out, then swats across
      const wind = k < 0.6 ? k / 0.6 : 1 - ((k - 0.6) / 0.4) * 1.6;
      P.flU = [-0.9, -0.5 * wind, -0.5 * wind]; P.flL = [-0.25, 0, 0];
      P.chest = [0, 0.25 * wind, 0]; P.head = [0.08, 0.2 * wind, 0];
      roll = 0.08 * wind; tailSwish(0.3, 8, 0.05);
      rate = k < 0.6 ? 12 : 40;
    } else if (mode === 'rear') {
      // rears up on its hind legs, claws spread
      bodyY = 1.45 + k * 0.55; pitch = -0.6 * k;
      P.flU = [-0.9 * k, 0, -0.35 * k]; P.frU = [-0.9 * k, 0, 0.35 * k]; P.flL = [-0.4 * k, 0, 0]; P.frL = [-0.4 * k, 0, 0];
      P.blU = [0.35 * k, 0, 0]; P.brU = [0.35 * k, 0, 0];
      P.head = [0.35 * k, look[1], 0];
      P.tail0 = [-0.35, Math.sin(t * 6) * 0.25, 0];
      rate = 10;
    } else if (mode === 'slam') {
      pitch = 0.2; bodyY = 1.32;
      P.flU = [-0.25, 0, -0.35]; P.frU = [-0.25, 0, 0.35];
      P.blU = [-0.25, 0, 0]; P.brU = [-0.25, 0, 0]; P.blL = [0.3, 0, 0]; P.brL = [0.3, 0, 0];
      P.head = [0.15, look[1], 0];
      rate = 45;
    } else if (mode === 'spin') {
      // braced, low, tail straightened out like a whip
      bodyY = 1.38; roll = 0.15;
      P.flU = [0, 0, -0.35]; P.frU = [0, 0, 0.35]; P.blU = [0, 0, -0.35]; P.brU = [0, 0, 0.35];
      P.tail0 = [-0.7, 0, 0]; P.tail1 = [-0.45, 0, 0]; P.tail2 = [-0.35, 0, 0]; P.tail3 = [-0.2, 0, 0];
      P.head = [0.12, 0.35, 0];
      rate = 25;
    } else if (mode === 'yowl') {
      // furious screech: chest up, head thrown back, tail bristling
      pitch = -0.22; bodyY = 1.6;
      P.head = [-0.45 + Math.sin(t * 40) * 0.04, 0, 0]; P.chest = [-0.15, 0, 0];
      P.flU = [-0.25, 0, -0.2]; P.frU = [-0.25, 0, 0.2];
      P.tail0 = [0.2, Math.sin(t * 30) * 0.08, 0];
      rate = 20;
    } else if (mode === 'cough') {
      const c = Math.sin(t * 22);
      P.head = [0.25 + c * 0.12, 0, 0]; P.chest = [0.08 + c * 0.08, 0, 0]; pitch = 0.05 + c * 0.04;
      tailSwish(0.25, 10, 0);
      rate = 30;
    } else if (mode === 'sit') {
      bodyY = 1.35; pitch = -0.32;
      P.blU = [-0.5, 0, 0]; P.brU = [-0.5, 0, 0]; P.blL = [0.5, 0, 0]; P.brL = [0.5, 0, 0];
      P.flU = [0.25, 0, 0]; P.frU = [0.25, 0, 0];
      P.head = [0.15 + Math.max(0, Math.sin(t * 14)) * 0.08, 0, Math.sin(t * 3) * 0.1];
      tailSwish(0.4, 3, 0.05);
      rate = 10;
    }
    this.body.position.y = damp(this.body.position.y, bodyY, 18, dt);
    this.body.rotation.x = damp(this.body.rotation.x, pitch, 12, dt);
    this.body.rotation.z = damp(this.body.rotation.z, roll, 12, dt);
    if (this.bones) blendPose(this.bones, P, rate, dt);
    else this.fbLegs.forEach((l, i) => { l.rotation.x = (P[['flU', 'frU', 'blU', 'brU'][i]] || [0])[0]; });
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
      this.rig.pose(this.waitT < 0.8 ? 'yowl' : 'crouch', dt, 1);
      if (this.waitT < 0.8 && !this.roared) { this.roared = true; audio.play('yowl'); this.game.camera.shake(0.4, 0.5); }
      if (this.waitT <= 0) this.state = 'run';
    } else if (this.state === 'run') {
      const gap = ps - this.s;
      const target = gap > 13 ? 10.5 : gap > 9 ? 8.2 : gap < 5 ? 6.7 : 7.2;
      this.speed = damp(this.speed, target, 3, dt);
      this.s += this.speed * dt;
      this.u = damp(this.u, clamp(p.body.u ?? 0, -1.8, 1.8), 1.5, dt);
      this.rig.lookYaw = clamp((p.body.u ?? 0) - this.u, -1, 1) * -0.3;
      this.rig.pose('run', dt, this.speed / 8);
      if (Math.random() < dt * 10) this.fx.dust(this.pos.x + rand(-1.5, 1.5), this.pos.y, this.pos.z + rand(-1.5, 1.5), { count: 1, size: 0.6, color: 0xf0c890, speed: 1.5 });
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
    // dash lane telegraph for the zoomies
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, depthWrite: false }));
    this.lane.visible = false;
    this.lane.renderOrder = 2;
    stage.scene.add(this.lane);
    this.yaw = Math.PI;
    this.target = new THREE.Vector3();
    this.leapFrom = new THREE.Vector3();
    this.pouncesLeft = 0;
    this.sinceVuln = 0;
    this.lastAttack = '';
    this.lastPhase = 1;
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
    // head keeps tracking Nobu beyond the body turn
    const d = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.rig.lookYaw = clamp(d, -0.6, 0.6);
  }

  get fwd() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

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
        const spd = (toP > 4.5 ? 2.6 : 0.8) * this.sp;
        this.pos.addScaledVector(this.fwd, spd * dt);
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
          const fwd = this.fwd;
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
          const mouth = this.pos.clone().addScaledVector(this.fwd, 2.4); mouth.y = 1.8;
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
          this.fx.puff(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 8, size: 0.8, color: 0xf0d0a0, speed: 5 });
          const hit = !p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 2.4 && p.pos.y < this.pos.y + 1.6;
          if (hit) p.hurt('flat', this.pos.x, this.pos.z);
          if (this.phase >= 2) this.proj.shockwave(this.pos.x, this.pos.y, this.pos.z, 7 + this.phase, 8);
          this.pouncesLeft--;
          this.landT = 0.25;
          if (hit) { this.toStalk(); audio.play('laugh'); }
          else if (this.pouncesLeft > 0) { this.firstPounce = false; this.lastN = 0; this.setState('countdown'); }
          else { this.setState('dizzy'); audio.play('dizzy'); }
        }
        break;
      }
      case 'dizzy': {
        // MISSED! lying flat with stars: jump on its head!
        this.vulnerable = true;
        this.sinceVuln = 0;
        if (this.landT > 0) { this.landT -= dt; this.rig.pose('land', dt, 1); } else this.rig.pose('dizzy', dt);
        const dur = (this.phase === 1 ? 2.8 : this.phase === 2 ? 2.4 : 2.0) + (this.longDizzy ? 1.2 : 0);
        if (this.stateT > dur) { this.longDizzy = false; this.toStalk(); audio.play('hiss'); }
        break;
      }
      case 'angry': {
        // hit (or new phase): screeches, fur bristling, shockwave of rage
        this.rig.pose('yowl', dt);
        if (this.stateT > 0.25 && !this.did) {
          this.did = true;
          audio.play('yowl');
          this.game.camera.shake(0.5, 0.4);
          if (this.raging) {
            this.fx.shock(this.pos.x, this.pos.y, this.pos.z, { radius: 7, color: 0xffa060, life: 0.55 });
            this.proj.shockwave(this.pos.x, this.pos.y, this.pos.z, 8, 9);
          }
          this.fx.puff(this.pos.x, this.pos.y + 2.4, this.pos.z, { count: 10, size: 0.45, color: 0xf08a2a, speed: 4, up: 3 });
        }
        if (this.stateT > (this.raging ? 1.2 : 0.8)) { this.raging = false; this.toStalk(); }
        break;
      }
      case 'yarn': {
        // bats a giant ball of yarn across the arena; it rebounds off the walls
        const wind = 0.75 / this.sp;
        const k = Math.min(1, this.stateT / (wind + 0.25));
        this.rig.pose('bat', dt, k);
        this.faceTo(p.pos, dt, 6);
        if (this.stateT > wind && !this.did) {
          this.did = true;
          audio.play('whoosh');
          const n = this.phase === 3 ? 2 : 1;
          const dir = dirTo(this.pos, p.pos);
          for (let i = 0; i < n; i++) {
            const d = rotY(dir, n === 1 ? 0 : (i ? 0.45 : -0.45));
            const from = this.pos.clone().addScaledVector(this.fwd, 2.8);
            this.proj.roller(from, d, { radius: 1.0, speed: 6.5 + this.phase * 1.2, bound: 11.2, groundY: this.pos.y, color: pick([0xe8467a, 0x46a8e8, 0x7ad04a, 0xb07aff]) });
          }
          this.fx.puff(this.pos.x + this.fwd.x * 2.8, this.pos.y + 0.6, this.pos.z + this.fwd.z * 2.8, { count: 5, size: 0.5, color: 0xffffff, speed: 3 });
        }
        if (this.stateT > wind + 0.8) this.toStalk();
        break;
      }
      case 'claws': {
        // rears up... and slams down, sending claw slashes skimming along the floor: jump them
        const rise = 0.7 / this.sp;
        const volleys = this.phase === 3 ? 2 : 1;
        const cyc = rise + 0.55;
        const idx = Math.floor(this.stateT / cyc), local = this.stateT - idx * cyc;
        if (idx >= volleys) { this.rig.pose('idle', dt); if (this.stateT > volleys * cyc + 0.3) this.toStalk(); break; }
        this.faceTo(p.pos, dt, local < rise ? 6 : 0);
        if (local < rise) {
          this.rig.pose('rear', dt, local / rise);
          if (local < dt * 1.5) audio.play('hiss');
        } else {
          this.rig.pose('slam', dt);
          if (this.shots <= idx) {
            this.shots = idx + 1;
            audio.play('stomp');
            this.game.camera.shake(0.45, 0.3);
            this.fx.ring(this.pos.x + this.fwd.x * 2, this.pos.y, this.pos.z + this.fwd.z * 2, { color: 0xf0d0a0, radius: 1.8, count: 10 });
            const dir = dirTo(this.pos, p.pos);
            const spread = this.phase === 3 ? [-0.5, -0.17, 0.17, 0.5] : [-0.35, 0, 0.35];
            for (const a of spread) this.proj.clawWave(this.pos.clone().addScaledVector(this.fwd, 2.2), rotY(dir, a + (idx % 2 ? 0.17 : 0)), { speed: 8.5 * this.sp, groundY: this.pos.y });
          }
        }
        break;
      }
      case 'tailspin': {
        // crouches, then spins in place with its tail swept out like a whip: jump it
        const tele = 0.6 / this.sp;
        const turns = this.phase === 3 ? 3 : 2;
        const w = (this.phase === 3 ? 9 : 7.5);
        const dur = (turns * Math.PI * 2) / w;
        if (this.stateT < tele) {
          this.rig.pose('crouch', dt);
          this.faceTo(p.pos, dt, 6);
          if (!this.did) { this.did = true; audio.play('hiss'); }
          this.marker.visible = true;
          this.marker.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
          this.marker.scale.setScalar(2.0 + Math.sin(this.stateT * 20) * 0.08);
        } else if (this.stateT < tele + dur) {
          this.marker.visible = false;
          this.rig.pose('spin', dt);
          this.yaw += w * dt;
          this.rig.root.rotation.y = this.yaw;
          if (this.shots === 0 || this.stateT - tele > this.shots * 0.4) { this.shots++; audio.play('whoosh'); }
          // the tail sweeps a ring around the cat at ankle height
          const tailA = this.yaw + Math.PI;
          const rel = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
          const r = rel.length();
          const da = Math.atan2(Math.sin(Math.atan2(rel.x, rel.z) - tailA), Math.cos(Math.atan2(rel.x, rel.z) - tailA));
          if (!p.dead && r > 1.4 && r < 4.9 && Math.abs(da) < 0.4 && p.pos.y - this.pos.y < 0.8) p.hurt('angel', this.pos.x, this.pos.z);
          if (Math.random() < dt * 30) {
            const tx = this.pos.x + Math.sin(tailA) * rand(2, 4.5), tz = this.pos.z + Math.cos(tailA) * rand(2, 4.5);
            this.fx.dust(tx, this.pos.y, tz, { count: 1, size: 0.45, color: 0xf0d0a0, speed: 2.5 });
          }
        } else {
          this.rig.pose('idle', dt);
          if (this.stateT > tele + dur + 0.6) this.toStalk();
        }
        break;
      }
      case 'frenzy': {
        // NINE LIVES FRENZY: struts to the middle, powers up yowling, then chains lightning pounces;
        // every landing throws a shockwave and a ring of hairballs. Ends flat out dizzy (longer than usual).
        if (!this.did) { this.did = true; this.beginUlt(); this.frenzyLeft = this.phase === 3 ? 5 : 4; audio.play('yowl'); }
        if (this.fz === 'charge') {
          const charge = 1.3;
          const toC = new THREE.Vector3(-this.pos.x, 0, -this.pos.z);
          if (toC.length() > 0.5) this.pos.addScaledVector(toC.normalize(), Math.min(toC.length(), 6 * dt));
          this.faceTo(p.pos, dt, 6);
          this.rig.pose('yowl', dt);
          this.powerUp(dt, Math.min(1, this.stateT / charge), 0xff5ad0, 2.2, this.pos.y);
          if (this.stateT > charge) { this.clearGlow(); this.fz = 'aim'; this.fzT = 0; audio.play('bossRoar'); this.game.camera.shake(0.5, 0.4); }
        } else if (this.fz === 'aim') {
          this.fzT += dt;
          if (this.fzT < 0.25) this.target.set(clamp(p.pos.x, -10.5, 10.5), this.pos.y, clamp(p.pos.z, -10.5, 10.5));
          this.rig.pose('crouch', dt);
          this.faceTo(this.target, dt, 14);
          this.marker.visible = true;
          this.marker.position.set(this.target.x, this.pos.y + 0.06, this.target.z);
          this.marker.scale.setScalar(1 + Math.sin(this.fzT * 30) * 0.08);
          if (this.fzT > 0.5 / this.sp) { this.fz = 'leap'; this.fzT = 0; this.leapFrom.copy(this.pos); audio.play('pounce'); }
        } else if (this.fz === 'leap') {
          this.fzT += dt;
          const k = Math.min(1, this.fzT / (0.55 / this.sp));
          this.pos.lerpVectors(this.leapFrom, this.target, k);
          this.pos.y = this.home.y + Math.sin(k * Math.PI) * 4;
          this.rig.pose('leap', dt, k);
          if (k >= 1) {
            this.marker.visible = false;
            audio.play('stomp');
            this.game.camera.shake(0.7, 0.35);
            this.fx.ring(this.pos.x, this.pos.y, this.pos.z, { color: 0xffb0e0, radius: 2.6 });
            if (!p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 2.4 && p.pos.y < this.pos.y + 1.6) p.hurt('flat', this.pos.x, this.pos.z);
            this.proj.shockwave(this.pos.x, this.pos.y, this.pos.z, 8, 7);
            const mouth = this.pos.clone().addScaledVector(this.fwd, 1.8); mouth.y = 1.6;
            const n = 6, off = rand(0, 1);
            for (let i = 0; i < n; i++) this.proj.hairball(mouth, new THREE.Vector3(Math.sin(off + (i / n) * Math.PI * 2), 0, Math.cos(off + (i / n) * Math.PI * 2)), 5.5, this.pos.y);
            this.frenzyLeft--;
            if (this.frenzyLeft > 0) { this.fz = 'aim'; this.fzT = 0; }
            else { this.endUlt(); this.longDizzy = true; this.landT = 0.3; this.setState('dizzy'); audio.play('dizzy'); }
          }
        }
        break;
      }
      case 'zoomies': {
        // phase 3: tears across the arena in straight lines, then collapses dizzy
        if (this.dashState === 'aim') {
          this.rig.pose('crouch', dt);
          this.faceTo(this.dashTo, dt, 12);
          const len = this.pos.distanceTo(this.dashTo);
          this.lane.visible = true;
          this.lane.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
          this.lane.rotation.y = Math.atan2(this.dashTo.x - this.pos.x, this.dashTo.z - this.pos.z);
          this.lane.scale.set(1, 1, len);
          this.lane.material.opacity = 0.25 + Math.sin(this.stateT * 25) * 0.12;
          if (this.stateT > 0.5 / this.sp) { this.dashState = 'go'; this.stateT = 0; this.dashFrom = this.pos.clone(); audio.play('pounce'); }
        } else {
          this.lane.visible = false;
          const dir = this.dashTo.clone().sub(this.pos).setY(0);
          const step = 19 * dt;
          this.rig.pose('run', dt, 2.2);
          if (Math.random() < dt * 25) this.fx.dust(this.pos.x, this.pos.y, this.pos.z, { count: 1, size: 0.6, color: 0xf0d0a0, speed: 2 });
          if (!p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 2 && p.pos.y < this.pos.y + 2) p.hurt('flat', this.pos.x, this.pos.z);
          if (dir.length() <= step) {
            this.pos.copy(this.dashTo);
            this.dashesLeft--;
            audio.play('stomp');
            this.game.camera.shake(0.3, 0.2);
            this.fx.ring(this.pos.x, this.pos.y, this.pos.z, { color: 0xf0d0a0, radius: 2 });
            if (this.dashesLeft > 0) this._nextDash();
            else { this.landT = 0.25; this.setState('dizzy'); audio.play('dizzy'); }
          } else this.pos.addScaledVector(dir.normalize(), step);
        }
        break;
      }
    }
  }

  // zoomies: aim a lane through Nobu out to the far wall
  _nextDash() {
    const p = this.player.pos;
    const d = dirTo(this.pos, p);
    const to = new THREE.Vector3(p.x, this.pos.y, p.z).addScaledVector(d, 30);
    // clip to the arena
    const tx = (Math.sign(d.x) * 9.5 - p.x) / (d.x || 1e-6), tz = (Math.sign(d.z) * 9.5 - p.z) / (d.z || 1e-6);
    const t = Math.max(1, Math.min(Math.abs(tx), Math.abs(tz)));
    to.set(clamp(p.x + d.x * t, -9.5, 9.5), this.pos.y, clamp(p.z + d.z * t, -9.5, 9.5));
    this.dashTo = to;
    this.dashState = 'aim';
    this.stateT = 0;
  }

  chooseAttack(toP) {
    if (this.ultReady) { this.setState('frenzy'); this.did = false; this.fz = 'charge'; return; }
    if (toP < 4.2 && Math.random() < 0.5) { this.setState('swipeUp'); return; }
    const pool = ['pounce', 'pounce', 'cough', 'yarn'];
    if (this.phase >= 2) pool.push('claws', 'tailspin', 'pounce');
    if (this.phase >= 3) pool.push('zoomies', 'claws', 'yarn');
    let a = this.sinceVuln >= 2 ? (this.phase >= 3 && Math.random() < 0.5 ? 'zoomies' : 'pounce') : pick(pool);
    if (a === this.lastAttack && a !== 'pounce') a = 'pounce';
    this.lastAttack = a;
    this.sinceVuln++;
    this.shots = 0;
    this.did = false;
    if (a === 'pounce') {
      this.setState('countdown');
      this.lastN = 0;
      this.firstPounce = true;
      this.pouncesLeft = this.phase;
    } else if (a === 'cough') {
      this.setState('cough');
      this.coughed = false;
    } else if (a === 'zoomies') {
      this.setState('zoomies');
      this.dashesLeft = 3;
      audio.play('yowl');
      this._nextDash();
    } else this.setState(a);
  }

  toStalk() { this.cancelUlt(); this.setState('stalk'); this.nextAttackAt = rand(1.1, 1.9); this.rig.setCount(0); this.marker.visible = false; this.lane.visible = false; }

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
    if (['countdown', 'stalk', 'leap', 'swipe', 'zoomies', 'tailspin', 'claws', 'yarn', 'frenzy'].includes(this.state)) p.hurt('angel', this.pos.x, this.pos.z);
  }
  onHit() {
    this.raging = this.phase !== this.lastPhase;
    this.lastPhase = this.phase;
    this.setState('angry');
    this.did = false;
    this.rig.setCount(0);
    this.marker.visible = false;
    this.lane.visible = false;
  }
  onResetPhase() {
    this.longDizzy = false;
    this.pos.copy(this.home);
    this.rig.setCount(0);
    this.marker.visible = false;
    this.lane.visible = false;
    this.lastPhase = this.phase;
    this.sinceVuln = 0;
    this.setState('stalk');
    this.nextAttackAt = 1.6;
  }
  defeatAnim(dt) {
    this.defT = (this.defT || 0) + dt;
    this.marker.visible = false;
    this.lane.visible = false;
    this.rig.setCount(0);
    this.rig.pose('dizzy', dt);
    this.rig.root.rotation.z = Math.min(1, this.defT) * Math.PI * 0.95; // rolls onto its back
    this.rig.root.position.y = Math.min(1, this.defT) * 1.4;
    if (this.rig.bones && this.defT > 1) {
      // paws in the air, twitching
      const b = this.rig.bones;
      for (const n of ['flU', 'frU', 'blU', 'brU']) b[n].rotation.x = Math.sin(this.defT * 9 + n.length) * 0.25;
    }
    if (this.defT < 1.2 && Math.random() < dt * 6) this.fx.sparkle(this.pos.x, this.pos.y + 2, this.pos.z, { count: 3, color: 0xffe14a });
  }
}
