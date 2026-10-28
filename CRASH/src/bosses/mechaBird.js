// Boss 1: the Mecha Bird — the Evil Cone's flying cone delivery machine.
// Phase 1: dive bombs (beak stuck in the ground -> vulnerable), WING GUST that blows Nobu across the arena
// Phase 2: feather volleys, VISOR LASER sweeps across the floor, lands to reload (vulnerable)
// Phase 3: HOMING ROCKETS, ticking EGG BOMBS, cone drops, lasers, gusts, dives
// The GLB is auto-rigged: real wing flaps (with a lagging wingtip), head tracking, tail and a swinging cage.
import * as THREE from 'three';
import { Boss, makeMarker, dirTo, rotY, attachGlb, Beam } from './common.js';
import { autoRig, sstep, blendPose } from './autorig.js';
import { toon } from '../player/nobuPrims.js';
import { audio } from '../audio/audio.js';
import { Assets } from '../art/assets.js';
import { damp, rand, clamp } from '../core/util.js';

const ARENA = 11;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// rig layout (model units: 4 tall, facing +z)
const JOINTS = {
  root: [0, 2.55, 0],
  head: [0, 3.0, 0.42],
  wingL: [-0.5, 3.0, 0], wingL2: [-1.4, 3.35, 0],
  wingR: [0.5, 3.0, 0], wingR2: [1.4, 3.35, 0],
  tail: [0, 2.55, -0.65],
  cage: [0, 2.15, 0.05],
};
const PARENTS = { root: null, head: 'root', wingL: 'root', wingL2: 'wingL', wingR: 'root', wingR2: 'wingR', tail: 'root', cage: 'root' };
function weigh(x, y, z) {
  const w = {};
  const ax = Math.abs(x);
  const wing = sstep(0.48, 0.78, ax) * sstep(2.45, 2.75, y);
  const outer = sstep(1.15, 1.65, ax);
  const s = x < 0 ? 'L' : 'R';
  w['wing' + s] = wing * (1 - outer);
  w['wing' + s + '2'] = wing * outer;
  const rest = 1 - wing;
  // the drill beak juts forward and down: anything far enough forward belongs to the head
  const cage = sstep(2.3, 1.95, y) * sstep(1.0, 0.8, z) * rest;
  const tail = sstep(-0.5, -0.85, z) * sstep(1.95, 2.2, y) * (rest - cage);
  const head = sstep(0.28, 0.55, z) * Math.max(sstep(2.2, 2.45, y), sstep(0.8, 1.0, z)) * (rest - cage);
  w.cage = cage; w.tail = tail; w.head = head;
  w.root = Math.max(0, rest - cage - tail - head);
  return w;
}

export class MechaBird extends Boss {
  constructor(stage, x, y, z) {
    super(stage, x, y, z, { name: 'MECHA BIRD', portrait: 'portrait_bird', hp: 6, phaseHp: 2 });
    this.buildModel();
    this.setBox(2.8, 2.0, 2.8, -1.0);
    this.marker = makeMarker(1.7);
    this.marker.visible = false;
    stage.scene.add(this.marker);
    this.beam = new Beam(stage.scene, 0xff3040);
    this.target = new THREE.Vector3();
    this.circleA = 0;
    this.plan = [];
    this.home = new THREE.Vector3(0, 7, -8);
    this.pos.copy(this.home);
    this.prevPos = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.flapPh = 0;
    this.flapRate = 9; this.flapAmp = 0.55; this.flapBias = 0.1;
    this.cageSwing = { x: 0, z: 0, vx: 0, vz: 0 };
    this.roll = 0; this.pitch = 0;
    this.lastPhase = 1;
    this.collectMeshes();
  }

  buildModel() {
    const purple = toon(0x6a3fb0), silver = toon(0xc8ccd8), yellow = toon(0xffc52c);
    const S = (r) => new THREE.SphereGeometry(r, 16, 12);
    this.rig = new THREE.Group();
    this.obj.add(this.rig);
    // primitive fallback (only shown if the GLB failed to load)
    const body = new THREE.Mesh(S(1), purple); body.scale.set(1.0, 0.85, 1.45); this.rig.add(body);
    this.fbHead = new THREE.Group(); this.fbHead.position.set(0, 0.55, 1.25); this.rig.add(this.fbHead);
    this.fbHead.add(new THREE.Mesh(S(0.62), purple));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 10), yellow); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.08, 0.95); this.fbHead.add(beak);
    this.fbWings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sx * 0.9, 0.25, 0); this.rig.add(w);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.3), purple); plate.position.x = sx * 1.3; w.add(plate);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.25), silver); trim.position.set(sx * 1.3, 0, -0.65); w.add(trim);
      this.fbWings.push(w);
    }
    // dizzy stars
    this.stars = new THREE.Group(); this.stars.position.y = 1.5; this.stars.visible = false;
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffe14a })); const a = (i / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9); this.stars.add(s); }
    this.obj.add(this.stars);
    // Higgsfield body, auto-rigged so the wings, head, tail and cage move
    this.glb = attachGlb(this.rig, 'model_mecha_bird', 4.2, -2.4, [this.rig]);
    if (this.glb) {
      const r = autoRig(this.glb, { height: 4.2, joints: JOINTS, parents: PARENTS, weigh });
      if (r) this.bones = r.bones;
    }
  }

  get P() { return this.player.pos; }
  get ground() { return 0; }

  // ---------- animation ----------
  faceTo(p, dt, k = 6) {
    const yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.rig.rotation.y = damp(this.rig.rotation.y, yaw + Math.round((this.rig.rotation.y - yaw) / (Math.PI * 2)) * Math.PI * 2, k, dt);
  }

  setFlap(rate, amp, bias = 0.1) { this.flapRate = rate; this.flapAmp = amp; this.flapBias = bias; }

  // Wing beat + head/tail/cage secondary motion. `pose` overrides bones (dive tuck, stuck flail...).
  animate(dt, pose = null) {
    const t = this.stateT;
    this.flapPh += dt * this.flapRate;
    const s = Math.sin(this.flapPh);
    const down = s < 0 ? s * 1.15 : s; // snappier downstroke
    const a = this.flapBias + down * this.flapAmp;
    const tip = this.flapBias * 0.5 + Math.sin(this.flapPh - 0.7) * this.flapAmp * 0.6;
    // body rises on the downstroke
    const lift = -Math.cos(this.flapPh) * 0.08 * Math.min(1, this.flapAmp * 1.6);
    // velocity -> lean and bank
    _v.copy(this.pos).sub(this.prevPos).divideScalar(Math.max(dt, 1e-4));
    this.prevPos.copy(this.pos);
    const acc = _w.copy(_v).sub(this.vel).divideScalar(Math.max(dt, 1e-4));
    this.vel.copy(_v);
    const yaw = this.rig.rotation.y;
    const fwd = _v.x * Math.sin(yaw) + _v.z * Math.cos(yaw);
    const side = _v.x * Math.cos(yaw) - _v.z * Math.sin(yaw);
    if (!pose?.keepTilt) {
      this.rig.rotation.x = damp(this.rig.rotation.x, (pose?.pitch ?? clamp(fwd * 0.03, -0.25, 0.35)), 6, dt);
      this.rig.rotation.z = damp(this.rig.rotation.z, (pose?.roll ?? clamp(-side * 0.05, -0.45, 0.45)), 5, dt);
    }
    if (this.glb) this.glb.position.y = -2.4 + lift;
    if (!this.bones) {
      this.fbWings[0].rotation.z = a; this.fbWings[1].rotation.z = -a;
      return;
    }
    // head looks at Nobu (within its neck range), bobs with the beat
    let hx = 0.08 + Math.sin(this.flapPh) * 0.04, hy = 0;
    if (!pose?.head) {
      const dx = this.P.x - this.pos.x, dz = this.P.z - this.pos.z;
      hy = clamp(Math.atan2(dx, dz) - yaw, -Math.PI, Math.PI);
      hy = clamp(Math.atan2(Math.sin(hy), Math.cos(hy)), -0.7, 0.7);
      hx = clamp(Math.atan2(this.pos.y - this.P.y, Math.hypot(dx, dz)) * 0.6 - this.rig.rotation.x, -0.3, 0.7);
    }
    // cage: damped pendulum pushed by the body's acceleration, always hanging plumb
    const cs = this.cageSwing;
    const ax = acc.x * Math.sin(yaw) + acc.z * Math.cos(yaw), az = acc.x * Math.cos(yaw) - acc.z * Math.sin(yaw);
    cs.vx += (-cs.x * 30 - cs.vx * 3 - clamp(ax, -40, 40) * 0.04) * dt; cs.x += cs.vx * dt;
    cs.vz += (-cs.z * 30 - cs.vz * 3 + clamp(az, -40, 40) * 0.04) * dt; cs.z += cs.vz * dt;
    const P = {
      wingL: [0, 0, -a], wingR: [0, 0, a],
      wingL2: [0, 0, -tip], wingR2: [0, 0, tip],
      head: [hx, hy, 0],
      tail: [Math.sin(this.flapPh - 1.2) * 0.12 - this.rig.rotation.x * 0.3, Math.sin(t * 1.3) * 0.1, 0],
      cage: [cs.x - this.rig.rotation.x, 0, cs.z - this.rig.rotation.z],
    };
    if (pose) for (const [k, v] of Object.entries(pose)) if (Array.isArray(v)) P[k] = v;
    blendPose(this.bones, P, pose?.snap ? 40 : 22, dt);
  }

  idleAnim(dt) {
    this.setFlap(8, 0.55);
    this.pos.y = this.home.y + Math.sin(this.stateT * 2) * 0.4;
    this.faceTo(this.P, dt, 4);
    this.animate(dt);
  }

  headPos(out) {
    if (this.bones) { this.bones.head.updateWorldMatrix(true, false); return this.bones.head.getWorldPosition(out).add(_w.set(0, -0.1, 0)); }
    return out.copy(this.pos).add(_w.set(0, 0.4, 0));
  }

  // ---------- fight ----------
  start() {
    this.active = true;
    this.nextAction();
  }

  nextAction() {
    if (!this.plan.length) {
      if (this.phase === 1) this.plan = ['circle', 'aim', 'circle', 'gust', 'aim'];
      else if (this.phase === 2) this.plan = ['circle', 'volley', 'laser', 'circle', 'volley', 'tired', 'aim'];
      else this.plan = ['circle', 'missiles', 'aim', 'eggs', 'laser', 'volley', 'aim', 'gust', 'bomb', 'aim'];
    }
    // SPECIAL gauge full: unleash the ultimate before anything else
    if (this.state !== 'ultimate') this.cancelUlt();
    if (this.ultReady) this.plan.unshift('ultimate');
    this.setState(this.plan.shift());
    this.beam.hide();
    this.shots = 0;
    this.did = false;
    if (this.state === 'aim') { this.marker.visible = true; audio.play('bossRoar'); }
  }

  ai(dt) {
    const sp = this.phase === 3 ? 1.25 : this.phase === 2 ? 1.1 : 1;
    const p = this.player;
    this.stars.visible = false;
    this.vulnerable = false;
    switch (this.state) {
      case 'circle': {
        this.setFlap(9, 0.55);
        this.circleA += dt * 0.9 * sp;
        const tx = Math.sin(this.circleA) * 9, tz = Math.cos(this.circleA) * 9;
        this.pos.x = damp(this.pos.x, tx, 2.5, dt); this.pos.z = damp(this.pos.z, tz, 2.5, dt);
        this.pos.y = damp(this.pos.y, 7 + Math.sin(this.stateT * 3) * 0.5, 2, dt);
        this.faceTo(this.P, dt);
        this.animate(dt);
        if (this.stateT > 1.6 / sp) this.nextAction();
        break;
      }
      case 'rage': {
        // phase change: rockets up to the middle, spreads its wings and screeches
        this.setFlap(14, 0.35, 0.5);
        this.pos.x = damp(this.pos.x, 0, 3, dt); this.pos.z = damp(this.pos.z, -2, 3, dt);
        this.pos.y = damp(this.pos.y, 6.5, 4, dt);
        this.faceTo(this.P, dt, 6);
        const shake = Math.sin(this.stateT * 50) * 0.04;
        this.animate(dt, { roll: shake, pitch: -0.35, head: [-0.6, 0, 0], tail: [0.5, 0, 0] });
        if (this.stateT > 0.35 && !this.did) {
          this.did = true;
          audio.play('bossRoar');
          this.fx.shock(this.pos.x, 0, this.pos.z, { radius: 9, color: 0xffb070, life: 0.6 });
          this.fx.flash(this.pos.x, this.pos.y + 0.6, this.pos.z, { size: 4, color: 0xffd0a0, life: 0.3 });
          this.game.camera.shake(0.6, 0.5);
        }
        if (Math.random() < dt * 20) this.fx.sparkle(this.pos.x + rand(-2, 2), this.pos.y + rand(-0.5, 1), this.pos.z + rand(-1, 1), { count: 1, color: 0xffa040, size: 0.5, speed: 3, up: 2 });
        if (this.stateT > 1.3) this.nextAction();
        break;
      }
      case 'aim': {
        this.setFlap(14, 0.4, 0.15);
        // marker tracks Nobu, then locks
        const lockAt = (this.phase === 1 ? 1.1 : 0.85);
        if (this.stateT < lockAt - 0.3) this.target.set(this.P.x, 0, this.P.z);
        this.marker.position.set(this.target.x, 0.06, this.target.z);
        this.marker.scale.setScalar(1 + Math.sin(this.stateT * 18) * 0.08);
        const back = dirTo(this.target, new THREE.Vector3(0, 0, 0)).multiplyScalar(-6);
        this.pos.x = damp(this.pos.x, this.target.x - back.x * 0.5, 3, dt);
        this.pos.z = damp(this.pos.z, this.target.z - back.z * 0.5, 3, dt);
        this.pos.y = damp(this.pos.y, 8.5, 3, dt);
        this.faceTo(this.target, dt, 10);
        // rear back, wings high: wind-up before the dive
        const k = Math.min(1, this.stateT / lockAt);
        this.animate(dt, { pitch: -0.45 * k, tail: [0.5 * k, 0, 0] });
        if (this.stateT > lockAt) {
          this.setState('dive');
          this.diveFrom = this.pos.clone();
          audio.play('whoosh');
        }
        break;
      }
      case 'dive': {
        const d = this.target.clone().setY(1.1).sub(this.pos);
        const len = d.length();
        const step = 24 * sp * dt;
        this.setFlap(0, 0);
        // wings tucked and swept back like a falcon
        this.animate(dt, { pitch: 0.9, wingL: [0, -0.9, -0.5], wingR: [0, 0.9, 0.5], wingL2: [0, -0.4, -0.2], wingR2: [0, 0.4, 0.2], tail: [-0.3, 0, 0], head: [0.3, 0, 0], cage: [0.6, 0, 0], snap: true });
        if (Math.random() < dt * 40) this.fx.smokeCard(this.pos.x, this.pos.y + 0.5, this.pos.z, { size: 0.3, life: 0.4, colors: [0xffffff], grow: 1.4, g: 0, alpha: 0.5, fadeAt: 0.2 });
        if (len <= step) {
          this.pos.copy(this.target).setY(1.1);
          this.marker.visible = false;
          this.setState('stuck');
          audio.play('stomp');
          this.game.camera.shake(0.7, 0.4);
          this.fx.ring(this.pos.x, 0, this.pos.z, { color: 0xe8d8b8, radius: 2.6, count: 14 });
          this.fx.puff(this.pos.x, 0.2, this.pos.z, { count: 10, size: 0.7, color: 0xd8c8a8, speed: 5 });
          this.fx.burst(this.pos.x, 0.3, this.pos.z, { count: 14, colors: [0x6a4a2a, 0x3a8a2a], speed: 6, floor: 0 });
          this.proj.shockwave(this.pos.x, 0, this.pos.z, 7, 5);
          audio.play('dizzy');
        } else {
          this.pos.addScaledVector(d.normalize(), step);
          // body slam hurts on the way down
          if (!p.dead && p.pos.distanceTo(this.pos) < 1.8) p.hurt('flat', this.pos.x, this.pos.z);
        }
        break;
      }
      case 'stuck': {
        // beak drilled into the ground, wings flailing, tail wagging: VULNERABLE
        this.vulnerable = true;
        this.stars.visible = true;
        this.stars.rotation.y += dt * 4;
        this.setFlap(22, 0.25, 0.2);
        const tug = Math.sin(this.stateT * 7);
        // the cage flops out behind, rattling on the grass
        this.animate(dt, { pitch: 0.7 + tug * 0.06, roll: Math.sin(this.stateT * 20) * 0.05, tail: [0.4, Math.sin(this.stateT * 16) * 0.5, 0], head: [0.4 + Math.max(0, tug) * 0.1, 0, 0], cage: [0.65 + Math.sin(this.stateT * 9) * 0.04, 0, Math.sin(this.stateT * 13) * 0.05] });
        if (tug > 0.95 && Math.random() < 0.3) this.fx.dust(this.pos.x, 0, this.pos.z, { count: 2, size: 0.3, color: 0xd8c8a8 });
        const dur = this.phase === 3 ? 2.2 : this.phase === 2 ? 2.4 : 2.7;
        if (this.stateT > dur) this.recover();
        break;
      }
      case 'tired': {
        // crash-lands to reload feathers (cage tipped over behind it), engines sputtering: VULNERABLE
        if (this.stateT < 0.6) {
          this.pos.y = damp(this.pos.y, 1.0, 6, dt);
          this.setFlap(14, 0.5);
          this.animate(dt, { cage: [1.15 * Math.min(1, this.stateT / 0.4), 0, 0] });
        } else {
          this.vulnerable = true;
          this.stars.visible = true;
          this.stars.rotation.y += dt * 4;
          this.setFlap(1.5, 0.08, -0.55);
          const nod = Math.sin(this.stateT * 6) * 0.1;
          this.animate(dt, { pitch: 0.25, head: [0.55 + nod, Math.sin(this.stateT * 1.7) * 0.3, 0], tail: [0.25, 0, 0], wingL2: [0, 0.2, 0.4], wingR2: [0, -0.2, -0.4], cage: [1.15, 0, 0] });
          if (Math.random() < dt * 6) this.fx.steam(this.pos.x + rand(-1.4, 1.4), this.pos.y + 1.2, this.pos.z + rand(-0.3, 0.3), { color: 0x5a5060, size: 0.3, alpha: 0.8, up: 1.4 });
        }
        if (this.stateT > 2.9) this.recover();
        break;
      }
      case 'recover': {
        this.setFlap(16, 0.6);
        this.pos.y = damp(this.pos.y, 7, 3, dt);
        this.animate(dt, { pitch: -0.2 });
        if (this.stateT > 1.0) this.nextAction();
        break;
      }
      case 'volley': {
        this.setFlap(10, 0.45, 0.25);
        const edgeA = Math.atan2(this.pos.x, this.pos.z);
        this.pos.x = damp(this.pos.x, Math.sin(edgeA) * 10, 3, dt);
        this.pos.z = damp(this.pos.z, Math.cos(edgeA) * 10, 3, dt);
        this.pos.y = damp(this.pos.y, 3.4, 3, dt);
        this.faceTo(this.P, dt, 8);
        const charge = 0.65 / sp;
        const fired = this.shots > 0;
        const k = fired ? Math.max(0, 1 - (this.stateT - charge) * 4) : Math.min(1, this.stateT / charge);
        // wings cock back while charging, then whip forward on release
        this.animate(dt, fired && k > 0 ? { wingL: [0, 0.7, -0.2], wingR: [0, -0.7, 0.2], snap: true } : { wingL: [0, -0.5 * k, -0.6 * k], wingR: [0, 0.5 * k, 0.6 * k], pitch: -0.15 * k });
        if (!fired && Math.random() < dt * 12 * k) this.fx.sparkle(this.pos.x, this.pos.y + 0.8, this.pos.z, { count: 1, color: 0xc89aff, size: 0.4, speed: 2 });
        if (this.stateT > charge && this.shots === 0) {
          this.shots = 1;
          const dir = dirTo(this.pos, this.P);
          const n = this.phase === 3 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = (i - (n - 1) / 2) * 0.22;
            const from = this.pos.clone(); from.y = 1.05;
            this.proj.feather(from, rotY(dir, a), 10.5 * sp);
          }
          audio.play('shoot');
        }
        if (this.stateT > charge + 0.8) this.nextAction();
        break;
      }
      case 'gust': {
        // perch at the edge and beat the wings hard: the wind shoves Nobu toward the far side
        const edgeA = this.did ? this.gustA : (this.gustA = Math.atan2(this.pos.x, this.pos.z));
        this.did = true;
        this.pos.x = damp(this.pos.x, Math.sin(edgeA) * 10.5, 3, dt);
        this.pos.z = damp(this.pos.z, Math.cos(edgeA) * 10.5, 3, dt);
        this.pos.y = damp(this.pos.y, 3.2, 3, dt);
        this.faceTo(new THREE.Vector3(0, 0, 0), dt, 5);
        const wind = 0.8, dur = 2.8;
        if (this.stateT < wind) {
          // rear up, wings raised to the sky
          this.setFlap(2, 0.1, 0.9);
          this.animate(dt, { pitch: -0.4, head: [-0.4, 0, 0] });
          if (this.shots === 0) { this.shots = 1; audio.play('charge'); }
        } else if (this.stateT < wind + dur) {
          this.setFlap(7.5, 1.0, 0.15);
          this.animate(dt, { pitch: -0.1 });
          if (this.shots === 1) { this.shots = 2; audio.play('gust'); }
          // push away from the bird, strongest on each downstroke
          const beat = Math.max(0, -Math.cos(this.flapPh));
          const dir = dirTo(this.pos, p.pos);
          // fades out near the arena edge: a shove, never a cheap ring-out
          const edge = clamp((11.2 - Math.max(Math.abs(p.pos.x), Math.abs(p.pos.z))) / 3, 0, 1);
          const f = (2.2 + beat * 3.4) * (this.phase === 3 ? 1.15 : 1) * edge;
          if (p.body.grounded || p.pos.y < 3) { p.pushX = dir.x * f; p.pushZ = dir.z * f; }
          if (this.stateT > wind + 1.4 && this.shots === 2) { this.shots = 3; audio.play('gust'); }
          // wind streaks across the arena
          if (Math.random() < dt * 40) {
            const side = rand(-9, 9);
            const ox = this.pos.x + dir.x * rand(1, 4) + dir.z * side, oz = this.pos.z + dir.z * rand(1, 4) - dir.x * side;
            this.fx.smokeCard(ox, rand(0.3, 2.5), oz, { vx: dir.x * 16, vz: dir.z * 16, size: 0.22, life: 0.7, colors: [0xffffff], grow: 2.5, g: 0, drag: 1, alpha: 0.4, fadeAt: 0.2 });
          }
          if (Math.random() < dt * 10) this.fx.burst(this.pos.x + rand(-2, 2), 0.3, this.pos.z + rand(-2, 2), { count: 1, colors: [0x3a8a2a, 0x5ab040], speed: 2, size: 0.12, up: 3 });
        } else {
          this.setFlap(9, 0.55);
          this.animate(dt);
          if (this.stateT > wind + dur + 0.4) this.nextAction();
        }
        break;
      }
      case 'laser': {
        // hover at the edge, visor beam sweeps a line of fire across the floor: jump it!
        const aimT = 0.75 / sp, sweepT = 1.7 / sp;
        if (!this.did) {
          this.did = true;
          const edgeA = Math.atan2(this.pos.x, this.pos.z);
          this.perch = new THREE.Vector3(Math.sin(edgeA) * 10, 4.2, Math.cos(edgeA) * 10);
          this.sweeps = this.phase === 3 ? 2 : 1;
          this._aimLaser();
          audio.play('charge');
        }
        this.pos.x = damp(this.pos.x, this.perch.x, 3, dt); this.pos.z = damp(this.pos.z, this.perch.z, 3, dt);
        this.pos.y = damp(this.pos.y, this.perch.y + Math.sin(this.stateT * 3) * 0.15, 3, dt);
        this.setFlap(11, 0.35, 0.3);
        const from = this.headPos(new THREE.Vector3());
        const tt = this.stateT;
        const cyc = aimT + sweepT;
        const n = Math.floor(tt / cyc), local = tt - n * cyc;
        if (n >= this.sweeps) {
          this.beam.hide();
          this.animate(dt);
          if (tt > this.sweeps * cyc + 0.4) this.nextAction();
          break;
        }
        if (n !== this.sweepIdx) { this.sweepIdx = n; if (n > 0) { this._aimLaser(true); audio.play('charge'); } }
        const firing = local >= aimT;
        const k = firing ? (local - aimT) / sweepT : 0;
        const spot = new THREE.Vector3().lerpVectors(this.laserA, this.laserB, k);
        this.faceTo(spot, dt, 10);
        this.animate(dt, { head: [0.5, 0, 0], pitch: 0.1 });
        this.beam.set(from, spot, firing, tt);
        if (firing) {
          if (!this.firingSnd || this.firingSnd !== n) { this.firingSnd = n; audio.play('laser'); }
          if (Math.random() < dt * 50) this.fx.sparkle(spot.x, 0.15, spot.z, { count: 1, color: 0xffa060, size: 0.5, speed: 3, up: 3 });
          if (Math.random() < dt * 25) this.fx.smokeCard(spot.x, 0.1, spot.z, { vy: 1.2, size: 0.25, life: 0.8, colors: [0x5a4a50, 0x8a8090], grow: 1.5, g: -0.5, alpha: 0.7 });
          if (!p.dead && this.beam.hits(p)) p.hurt('angel', spot.x, spot.z);
        }
        break;
      }
      case 'missiles': {
        // climb, pop open the wing pods, fire homing rockets one after another
        this.setFlap(10, 0.5, 0.35);
        this.pos.y = damp(this.pos.y, 6.5, 3, dt);
        this.faceTo(this.P, dt, 6);
        this.animate(dt, { pitch: -0.15 });
        const n = 3, every = 0.45 / sp;
        if (this.stateT > 0.6 + this.shots * every && this.shots < n) {
          const side = this.shots % 2 ? 1 : -1;
          const yaw = this.rig.rotation.y;
          const from = this.pos.clone().add(new THREE.Vector3(Math.cos(yaw) * side * 1.5, 0.6, -Math.sin(yaw) * side * 1.5));
          const dir = new THREE.Vector3(Math.cos(yaw) * side * 0.6, 0.8, -Math.sin(yaw) * side * 0.6);
          this.proj.missile(from, dir, { speed: 6.2 * sp, turn: 1.7 + this.phase * 0.15 });
          this.fx.flash(from.x, from.y, from.z, { size: 1, color: 0xffb060 });
          this.shots++;
        }
        if (this.stateT > 0.6 + n * every + 0.8) this.nextAction();
        break;
      }
      case 'eggs': {
        // strafe over the arena laying egg bombs that tick down and explode
        this.setFlap(11, 0.5);
        const lead = p.vel.clone().multiplyScalar(0.5);
        this.pos.x = damp(this.pos.x, clamp(p.pos.x + lead.x, -9, 9), 1.8, dt);
        this.pos.z = damp(this.pos.z, clamp(p.pos.z + lead.z - 1.5, -9, 9), 1.8, dt);
        this.pos.y = damp(this.pos.y, 5, 3, dt);
        this.faceTo(this.P, dt, 5);
        this.animate(dt, { tail: [0.6, 0, 0] });
        const n = 4, every = 0.7 / sp;
        if (this.stateT > 0.5 + this.shots * every && this.shots < n) {
          this.shots++;
          const v = new THREE.Vector3(rand(-2, 2), 2, rand(-2, 2));
          this.proj.eggBomb(this.pos.clone().add(new THREE.Vector3(0, -1.2, 0)), v, { groundY: 0, fuse: 2.3 / Math.sqrt(sp), radius: 2.2 });
          audio.play('boing');
        }
        if (this.stateT > 0.5 + n * every + 0.5) this.nextAction();
        break;
      }
      case 'ultimate': {
        // SKY FALL: overdrive above the middle of the arena, then waves of falling cones and feather rings,
        // finished with a dive at Nobu (which leaves it stuck: the payoff for surviving)
        const charge = 1.5;
        const waves = this.phase === 3 ? 4 : 3, every = 1.15 / sp;
        if (!this.ultStarted) { this.ultStarted = true; this.beginUlt(); audio.play('bossRoar'); this.game.camera.shake(0.4, 0.6); }
        this.pos.x = damp(this.pos.x, 0, 3, dt); this.pos.z = damp(this.pos.z, 0, 3, dt);
        this.pos.y = damp(this.pos.y, 8.5 + Math.sin(this.stateT * 2) * 0.3, 3, dt);
        this.faceTo(this.P, dt, 4);
        if (this.stateT < charge) {
          this.setFlap(18, 0.25, 0.75);
          this.animate(dt, { pitch: -0.3, head: [-0.55, 0, 0], tail: [0.6, 0, 0] });
          this.powerUp(dt, this.stateT / charge, 0xffa040, 0.6, 0);
          break;
        }
        if (!this.glowCleared) { this.glowCleared = true; this.clearGlow(); this.fx.flash(this.pos.x, this.pos.y + 0.5, this.pos.z, { size: 6, color: 0xffc070, life: 0.35 }); audio.play('explosion'); }
        this.setFlap(12, 0.6, 0.2);
        this.animate(dt);
        const local = this.stateT - charge;
        if (local > this.shots * every && this.shots < waves) {
          this.shots++;
          // ring of feathers at jumping height, rotated each wave
          const n = 16;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + this.shots * 0.2;
            const from = this.pos.clone(); from.y = 1.05;
            this.proj.feather(from, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 8 * sp);
          }
          // ring of cones around Nobu (gaps between them) plus one on his head
          const c = this.P;
          const k = 6, r = 3.6, off = rand(0, Math.PI);
          for (let i = 0; i < k; i++) {
            const a = off + (i / k) * Math.PI * 2;
            this.proj.dropCone(clamp(c.x + Math.cos(a) * r, -ARENA, ARENA), 0, clamp(c.z + Math.sin(a) * r, -ARENA, ARENA), 1.1 / sp, 1.3);
          }
          this.proj.dropCone(clamp(c.x, -ARENA, ARENA), 0, clamp(c.z, -ARENA, ARENA), 1.1 / sp, 1.3);
          audio.play('shoot');
        }
        if (local > waves * every + 0.6) {
          this.endUlt();
          this.ultStarted = false; this.glowCleared = false;
          this.plan.unshift('aim');
          this.nextAction();
        }
        break;
      }
      case 'bomb': {
        // fly over Nobu dropping cones that land where he's heading
        this.setFlap(13, 0.5);
        const lead = p.vel.clone().multiplyScalar(0.45);
        this.pos.x = damp(this.pos.x, p.pos.x, 2.4, dt);
        this.pos.z = damp(this.pos.z, p.pos.z + 2, 2.4, dt);
        this.pos.y = damp(this.pos.y, 7.5, 3, dt);
        this.faceTo(p.pos, dt);
        this.animate(dt);
        const every = 0.55 / sp;
        const n = 6;
        if (this.stateT > 0.6 + this.shots * every && this.shots < n) {
          this.shots++;
          const tx = clamp(p.pos.x + lead.x, -ARENA, ARENA), tz = clamp(p.pos.z + lead.z, -ARENA, ARENA);
          this.proj.dropCone(tx, 0, tz, 0.95 / sp, 1.4);
          audio.play('shoot');
        }
        if (this.stateT > 0.6 + n * every + 0.6) this.nextAction();
        break;
      }
    }
  }

  // laser sweep line: crosses the arena through Nobu's spot, perpendicular to the bird's line of sight
  _aimLaser(reverse = false) {
    const p = this.P;
    const to = dirTo(this.pos, p);
    const perp = new THREE.Vector3(-to.z, 0, to.x);
    const c = new THREE.Vector3(clamp(p.x, -9, 9), 0, clamp(p.z, -9, 9));
    const a = c.clone().addScaledVector(perp, -8), b = c.clone().addScaledVector(perp, 8);
    for (const v of [a, b]) { v.x = clamp(v.x, -ARENA, ARENA); v.z = clamp(v.z, -ARENA, ARENA); v.y = 0; }
    if (reverse) { this.laserA = b; this.laserB = a; } else { this.laserA = a; this.laserB = b; }
  }

  recover() { this.setState('recover'); this.vulnerable = false; this.stars.visible = false; }

  onHit() {
    audio.play('bossRoar');
    this.beam.hide();
    this.plan = [];
    if (this.phase !== this.lastPhase) { this.lastPhase = this.phase; this.setState('rage'); this.did = false; }
    else this.recover();
  }

  onTouch(p) {
    if (this.vulnerable || !this.active || this.defeated) return;
    if (this.state === 'dive' || this.pos.y < 3) p.hurt('angel', this.pos.x, this.pos.z);
  }

  onResetPhase() {
    this.plan = [];
    this.ultStarted = false; this.glowCleared = false;
    this.marker.visible = false;
    this.beam.hide();
    this.pos.copy(this.home);
    this.prevPos.copy(this.pos);
    this.rig.rotation.set(0, 0, 0);
    this.stars.visible = false;
    this.lastPhase = this.phase;
    this.setState('circle');
  }

  defeatAnim(dt) {
    this.defT = (this.defT || 0) + dt;
    const t = this.defT;
    this.marker.visible = false;
    this.beam.hide();
    this.stars.visible = false;
    if (t < 1.8) {
      // engines sputter, it spirals down flapping wildly
      this.rig.rotation.y += dt * (3 + t * 5);
      this.pos.y = Math.max(1.2, this.pos.y - dt * (2 + t * 2));
      this.setFlap(20, 0.9, Math.sin(t * 7) * 0.4);
      this.animate(dt, { roll: Math.sin(t * 20) * 0.35, pitch: 0.4, head: [Math.sin(t * 17) * 0.5, Math.sin(t * 11) * 0.6, 0], keepTilt: false });
      if (Math.random() < dt * 18) this.fx.smokeCard(this.pos.x + rand(-1.5, 1.5), this.pos.y + rand(0, 1), this.pos.z + rand(-1, 1), { vy: 2, size: 0.5, life: 1.2, colors: [0xff9040, 0x3a3038], grow: 1.3, g: -1 });
      if (Math.random() < dt * 6) { audio.play('explosion'); this.fx.flash(this.pos.x + rand(-1.5, 1.5), this.pos.y + rand(0, 1.5), this.pos.z + rand(-1, 1), { size: 1.6, color: 0xffa040 }); }
    } else if (!this.blown) {
      this.blown = true;
      this.fx.explosion(this.pos.x, this.pos.y - 0.6, this.pos.z, { radius: 4 });
      this.fx.burst(this.pos.x, this.pos.y, this.pos.z, { count: 40, colors: [0x6a3fb0, 0xc8ccd8, 0xffc52c, 0x2a1a44], speed: 10, size: 0.3, up: 10, floor: 0 });
      this.fx.confettiBurst(this.pos.x, this.pos.y + 1, this.pos.z, 80);
      audio.play('explosion');
      this.game.camera.shake(1, 0.6);
      this.rig.visible = false;
    }
  }
}
