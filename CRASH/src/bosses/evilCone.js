// Final boss: the Evil Cone. Three phases, faster each time, short vulnerability windows.
// Attacks: cone barrages, SPIRAL cone storms, shockwave slams, summoned minions, spinning sweep arms,
// falling cones, EYE LASERS that chase Nobu, the SHAME VORTEX (sucks him toward the cone's mouth),
// "the Cone Grab" (flips over and slams down on Nobu like a cup), phase-3 GHOST CLONES that grab together,
// PUMP.FUN minions launched in every phase (they pump up with each hop, then dump: explode),
// and the rechargeable ultimate SHAME SUPERNOVA (spinning floor-laser spokes + cone rain).
import * as THREE from 'three';
import { Boss, makeMarker, dirTo, rotY, attachGlb, Beam } from './common.js';
import { autoRig, sstep, chain, blendPose } from './autorig.js';
import { Broccoli, PumpPill } from '../entities/enemies.js';
import { toon } from '../player/nobuPrims.js';
import { audio } from '../audio/audio.js';
import { Assets } from '../art/assets.js';
import { damp, rand, pick, clamp } from '../core/util.js';
import { TUNING } from '../player/player.js';

const ARENA_R = 12.5;

// rig layout (model units: 4 tall, facing +z). The cone's axis leans a little toward +x.
const CJ = {
  root: [0.1, 0.9, 0.15], upper: [0.2, 2.3, 0.15],
  armL: [-0.45, 2.3, 0.2], foreL: [-1.0, 2.45, 0.3],
  armR: [0.6, 2.2, 0.4], foreR: [1.1, 1.9, 0.8],
  cape: [0.05, 2.25, -0.35], cape2: [0, 1.4, -0.7],
  shadow: [0, 0.02, 0],
};
const CPARENTS = { root: null, upper: 'root', armL: 'upper', foreL: 'armL', armR: 'upper', foreR: 'armR', cape: 'upper', cape2: 'cape', shadow: 'root' };
function weighCone(x, y, z) {
  if (y < 0.08) return { shadow: 1 }; // the baked-in ground shadow disc (collapsed away)
  const ax = 0.05 + Math.max(0, y - 1) * 0.11, az = 0.15;
  const r = 0.12 + 0.3 * Math.max(0, y - 0.5); // the cone flares toward its rim
  const dx = x - ax, dz = z - az, d = Math.hypot(dx, dz);
  const out = sstep(r + 0.12, r + 0.3, d);
  const back = sstep(-0.1, -0.35, dz);
  const cape = out * back * sstep(2.55, 2.25, y);
  const arm = out * (1 - back) * sstep(0.8, 1.1, y) * sstep(3.35, 3.15, y);
  const w = {};
  if (arm > 0) {
    if (dx < 0) chain(w, [x, y, z], ['armL', 'foreL'], CJ, [-1.2, 3.2, 0.5], arm);
    else chain(w, [x, y, z], ['armR', 'foreR'], CJ, [0.85, 1.0, 0.9], arm);
  }
  if (cape > 0) { const lo = sstep(1.9, 1.2, y); w.cape = cape * (1 - lo); w.cape2 = cape * lo; }
  const body = Math.max(0, 1 - arm - cape);
  const up = sstep(1.3, 2.4, y);
  w.upper = body * up; w.root = body * (1 - up);
  return w;
}

export class EvilCone extends Boss {
  constructor(stage, x, y, z) {
    super(stage, x, y, z, { name: 'THE EVIL CONE', portrait: 'portrait_cone', hp: 9, phaseHp: 3 });
    this.buildModel();
    this.setBox(2.6, 2.8, 2.6, -1.4);
    this.home = new THREE.Vector3(0, 3.2, -6);
    this.pos.copy(this.home);
    this.prevPos = this.pos.clone();
    this.marker = makeMarker(1.9);
    this.marker.visible = false;
    stage.scene.add(this.marker);
    this.beams = [new Beam(stage.scene, 0xff2050), new Beam(stage.scene, 0xff2050), new Beam(stage.scene, 0xff40c0), new Beam(stage.scene, 0xff40c0)];
    this.decoys = [];
    this.plan = [];
    this.minions = [];
    this.yaw = 0;
    this.lastPhase = 1;
    this.collectMeshes();
  }

  get ground() { return this.home.y - 3.2; }

  buildModel() {
    const plastic = new THREE.MeshPhongMaterial({ color: 0xc8b4ff, emissive: 0x000000, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const purple = toon(0x5a1f9a), steel = toon(0x9a8ab8);
    const red = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    this.rig = new THREE.Group();
    this.obj.add(this.rig);
    this.coneBody = new THREE.Group();
    this.rig.add(this.coneBody);
    // primitive fallback (only shown if the GLB failed to load)
    this.coneBody.add(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 0.55, 2.8, 28, 1, true), plastic));
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), red); e.position.set(sx * 0.45, 0.45, 1.25); this.coneBody.add(e); }
    this.fbArms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 1.25, 0.3, 0); this.rig.add(sh);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), purple); up.position.set(sx * 0.45, -0.25, 0); up.rotation.z = sx * 1.1; sh.add(up);
      this.fbArms.push(sh);
    }
    // hover glow
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0xb060ff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2;
    this.obj.add(this.glow);
    // sweep bars (cone chains)
    this.sweep = new THREE.Group();
    this.bars = [];
    for (let b = 0; b < 2; b++) {
      const bar = new THREE.Group();
      for (let i = 0; i < 11; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 10), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xff5ad0 : 0xc8b4ff, emissive: 0x401040 }));
        c.rotation.z = -Math.PI / 2;
        c.position.set(1.4 + i * 1.0, 0, 0);
        bar.add(c);
      }
      bar.rotation.y = b * Math.PI;
      this.sweep.add(bar);
      this.bars.push(bar);
    }
    this.sweep.visible = false;
    this.stage.scene.add(this.sweep);
    // dizzy stars
    this.stars = new THREE.Group(); this.stars.visible = false;
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffe14a })); const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4); this.stars.add(s); }
    this.obj.add(this.stars);
    // Higgsfield 3D body, auto-rigged: claws, flapping cape, bending body. Lives inside coneBody so tipping/flipping still work.
    this.glb = attachGlb(this.coneBody, 'model_evil_cone', 4.0, -2.2, [this.coneBody, ...this.fbArms]);
    if (this.glb) {
      const r = autoRig(this.glb, { height: 4.0, joints: CJ, parents: CPARENTS, weigh: weighCone });
      if (r) { this.bones = r.bones; this.bones.shadow.scale.setScalar(0.0001); }
    }
  }

  get sp() { return [1, 1, 1.25, 1.5][this.phase]; }

  idleAnim(dt) {
    this.anim(dt);
    this.pos.y = this.home.y + Math.sin(this.stateT * 1.6) * 0.25;
    this.faceTo(this.player.pos, dt, 3);
  }

  faceTo(p, dt, k = 6) {
    const yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw = damp(this.yaw, yaw + Math.round((this.yaw - yaw) / (Math.PI * 2)) * Math.PI * 2, k, dt);
    this.rig.rotation.y = this.yaw;
  }

  // Secondary motion: cape flutter, claws flexing, body lean, squash & stretch. `pose` overrides bones.
  anim(dt, pose = null) {
    this.animT = (this.animT || 0) + dt;
    const t = this.animT;
    const v = this.pos.clone().sub(this.prevPos).divideScalar(Math.max(dt, 1e-4));
    this.prevPos.copy(this.pos);
    const fwd = v.x * Math.sin(this.yaw) + v.z * Math.cos(this.yaw);
    const side = v.x * Math.cos(this.yaw) - v.z * Math.sin(this.yaw);
    this.glow.position.y = -this.pos.y + this.ground + 0.05;
    this.glow.material.opacity = 0.25 + Math.sin(t * 5) * 0.1;
    // squash & stretch target (eased)
    const sq = pose?.squash ?? 0;
    const s = this.coneBody.scale;
    s.y = damp(s.y, 1 + sq, 14, dt); s.x = s.z = damp(s.x, 1 - sq * 0.5, 14, dt);
    if (!this.bones) {
      this.fbArms.forEach((a, i) => { a.rotation.x = Math.sin(t * 2 + i) * 0.2; });
      return;
    }
    const lean = clamp(fwd * 0.04, -0.3, 0.3);
    const P = {
      upper: [lean * 0.5 + Math.sin(t * 1.7) * 0.03, Math.sin(t * 1.1) * 0.05, clamp(-side * 0.03, -0.2, 0.2)],
      armL: [Math.sin(t * 2.1) * 0.15, 0, Math.sin(t * 1.6) * 0.1],
      foreL: [Math.sin(t * 3.3) * 0.2, 0, Math.sin(t * 2.4 + 1) * 0.15],
      armR: [Math.sin(t * 2.1 + 1.5) * 0.15, 0, Math.sin(t * 1.4 + 2) * 0.1],
      foreR: [Math.sin(t * 3.1 + 2) * 0.2, 0, 0],
      // the cape trails behind the motion and ripples
      cape: [-0.15 - Math.max(0, fwd) * 0.05 + Math.sin(t * 4) * 0.08, Math.sin(t * 2.3) * 0.1, clamp(side * 0.04, -0.3, 0.3)],
      cape2: [-0.1 + Math.sin(t * 5 - 1) * 0.18, Math.sin(t * 3.1) * 0.12, 0],
    };
    if (pose) for (const [k, val] of Object.entries(pose)) if (Array.isArray(val)) P[k] = val;
    blendPose(this.bones, P, pose?.snap ? 30 : 10, dt);
    this.bones.shadow.rotation.set(0, 0, 0);
  }

  // world position of an eye (side -1 / 1) for the eye lasers
  eyePos(side, out) {
    if (!this.bones) return out.copy(this.pos).add(new THREE.Vector3(side * 0.4, 0.5, 0));
    const b = this.bones.upper;
    b.updateWorldMatrix(true, false);
    const ax = 0.05 + 2.05 * 0.11;
    return b.localToWorld(out.set(ax + side * 0.27 - CJ.upper[0], 3.05 - CJ.upper[1], 0.95 - CJ.upper[2]));
  }

  start() { this.active = true; this.beginPhase(); }

  beginPhase() {
    // a phase change queues the rage roar (it plays once the phase dialogue is over)
    if (this.pendingRage) { this.pendingRage = false; this.plan = []; this.hideBeams(); this.sweep.visible = false; this.setState('rage'); this.did = false; return; }
    this.plan = [];
    this.sweep.visible = false;
    this.marker.visible = false;
    this.hideBeams();
    this.coneBody.rotation.set(0, 0, 0);
    this.rig.rotation.set(0, this.yaw, 0);
    this.setState('hover');
    this.hoverFor = 1.2;
  }

  nextAction() {
    if (!this.plan.length) {
      this.plan = this.phase === 1
        ? ['summon', 'barrage', 'shock', 'spiral', 'overheat', 'drops', 'barrage', 'overheat']
        : this.phase === 2
          ? ['summon', 'sweep', 'lasers', 'overheat', 'grab', 'vortex', 'spiral', 'shock', 'overheat']
          : ['summon', 'clones', 'spiral', 'lasers', 'grab', 'vortex', 'sweep', 'overheat', 'drops', 'barrage', 'grab', 'overheat'];
    }
    if (this.state !== 'ultimate') this.cancelUlt();
    if (this.ultReady) this.plan.unshift('ultimate');
    const s = this.plan.shift();
    this.setState(s);
    this.hideBeams();
    this.shots = 0;
    this.did = false;
    this.slammed = false;
  }

  hideBeams() { for (const b of this.beams) b.hide(); }

  ai(dt) {
    const p = this.player;
    const sp = this.sp;
    const ground = this.ground;
    this.vulnerable = false;
    this.stars.visible = false;
    this.minions = this.minions.filter((m) => !m.dead);
    switch (this.state) {
      case 'hover': {
        const a = this.stateT * 0.6;
        const tx = Math.sin(a) * 5, tz = -4 + Math.cos(a) * 2;
        this.pos.x = damp(this.pos.x, tx, 2, dt); this.pos.z = damp(this.pos.z, tz, 2, dt);
        this.pos.y = damp(this.pos.y, this.home.y + Math.sin(this.stateT * 2) * 0.3, 3, dt);
        this.faceTo(p.pos, dt, 5);
        this.anim(dt);
        if (this.stateT > this.hoverFor / sp) this.nextAction();
        break;
      }
      case 'rage': {
        // new phase: spins up, claws high, red shockwave
        this.pos.y = damp(this.pos.y, this.home.y + 1, 4, dt);
        this.faceTo(p.pos, dt, 6);
        this.anim(dt, { armL: [0, 0, -0.9], armR: [0, 0, 1.2], foreL: [-0.4, 0, -0.3], foreR: [-0.4, 0, 0.3], upper: [-0.25, 0, Math.sin(this.stateT * 45) * 0.05], squash: 0.12 });
        if (this.stateT > 0.4 && !this.did) {
          this.did = true;
          audio.play('bossRoar'); audio.play('laugh');
          this.fx.shock(this.pos.x, ground, this.pos.z, { radius: 10, color: 0xff3060, life: 0.6 });
          this.fx.flash(this.pos.x, this.pos.y, this.pos.z, { size: 5, color: 0xff70c0, life: 0.3 });
          this.game.camera.shake(0.7, 0.5);
          this.launchPumps(2);
        }
        if (this.stateT > 1.4) this.toHover(0.4);
        break;
      }
      case 'barrage': {
        this.faceTo(p.pos, dt, 8);
        const charge = 0.6 / sp;
        const waves = this.phase === 3 ? 2 : 1;
        const k = Math.min(1, this.stateT / charge);
        const recoil = this.shots > 0 && this.stateT < charge + this.shots * 0.55 - 0.35;
        this.anim(dt, recoil
          ? { upper: [-0.3, 0, 0], armL: [0, 0.9, 0.3], armR: [0, -0.9, -0.3], squash: -0.12, snap: true }
          : { upper: [0.2 * k, 0, 0], armL: [0, 0.4 * k, -0.4 * k], armR: [0, -0.4 * k, 0.6 * k], squash: 0.15 * k });
        if (this.stateT > charge + this.shots * 0.55 && this.shots < waves) {
          this.shots++;
          const n = this.phase === 1 ? 5 : this.phase === 2 ? 7 : 9;
          const dir = dirTo(this.pos, p.pos);
          const off = this.shots === 2 ? 0.12 : 0;
          for (let i = 0; i < n; i++) {
            const from = this.pos.clone(); from.y = ground + 1.05;
            this.proj.cone(from, rotY(dir, (i - (n - 1) / 2) * 0.2 + off), 9.5 * sp);
          }
          audio.play('shoot');
          audio.play('laugh');
        }
        if (this.stateT > charge + waves * 0.55 + 0.5) this.toHover(0.5);
        break;
      }
      case 'spiral': {
        // spins on the spot spraying cones in rotating spiral arms: weave through the gaps
        this.pos.x = damp(this.pos.x, 0, 2, dt); this.pos.z = damp(this.pos.z, -1, 2, dt);
        this.pos.y = damp(this.pos.y, this.home.y + 0.3, 3, dt);
        const wind = 0.7, dur = 2.6;
        if (this.stateT < wind) {
          this.faceTo(p.pos, dt, 5);
          this.anim(dt, { armL: [0, 0, -0.5], armR: [0, 0, 0.9], squash: -0.15 * (this.stateT / wind) });
          if (!this.did) { this.did = true; audio.play('charge'); }
        } else if (this.stateT < wind + dur) {
          this.yaw += dt * 6;
          this.rig.rotation.y = this.yaw;
          this.anim(dt, { armL: [0, 0, 0.6], armR: [0, 0, -0.5], cape: [-1.0, 0, 0], cape2: [-0.6, 0, 0], squash: 0.05 });
          const arms = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 5;
          const every = 0.13 / sp;
          const local = this.stateT - wind;
          if (local > this.shots * every) {
            this.shots++;
            const dirSign = this.phase === 3 && this.shots % 16 > 7 ? -1 : 1;
            this.spinA = (this.spinA || 0) + 0.27 * dirSign;
            for (let i = 0; i < arms; i++) {
              const a = this.spinA + (i / arms) * Math.PI * 2;
              const from = this.pos.clone(); from.y = ground + 1.05;
              this.proj.cone(from, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 7 * sp);
            }
            if (this.shots % 3 === 0) audio.play('shoot');
          }
        } else {
          this.faceTo(p.pos, dt, 5);
          this.anim(dt);
          if (this.stateT > wind + dur + 0.4) this.toHover(0.5);
        }
        break;
      }
      case 'shock': {
        const slams = this.phase === 3 ? 3 : 1;
        const cycle = 1.0 / sp;
        const c = (this.stateT % cycle) / cycle;
        const top = ground + 1.45;
        const rising = c < 0.55;
        if (rising) this.pos.y = damp(this.pos.y, top + 3.2, 6, dt);
        else this.pos.y = Math.max(top, this.pos.y - 30 * dt);
        const idx = Math.floor(this.stateT / cycle);
        const landed = this.pos.y <= top + 0.01;
        this.anim(dt, { squash: rising ? 0.2 : landed ? -0.3 : 0.1, armL: [0, 0, rising ? -0.8 : 0.6], armR: [0, 0, rising ? 1.1 : -0.4], snap: !rising });
        if (c > 0.6 && landed && this.shots <= idx) {
          this.shots = idx + 1;
          this.proj.shockwave(this.pos.x, ground, this.pos.z, 7.5 * sp, ARENA_R + 2);
          this.game.camera.shake(0.5, 0.3);
          this.fx.ring(this.pos.x, ground, this.pos.z, { color: 0xd8c8ff, radius: 2.4 });
        }
        if (this.shots >= slams && c > 0.95) this.toHover(0.6);
        break;
      }
      case 'drops': {
        this.faceTo(p.pos, dt, 4);
        const n = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 6;
        const every = 0.6 / sp;
        // conducting the cone rain
        const wave = Math.sin(this.stateT * 10);
        this.anim(dt, { armL: [0, 0, -0.6 - wave * 0.4], armR: [0, 0, 0.9 + wave * 0.4], foreL: [0, 0, -wave * 0.5], foreR: [0, 0, wave * 0.5] });
        if (this.stateT > 0.4 + this.shots * every && this.shots < n) {
          this.shots++;
          const lead = p.vel.clone().multiplyScalar(0.35);
          const tx = clamp(p.pos.x + lead.x, -ARENA_R + 1, ARENA_R - 1), tz = clamp(p.pos.z + lead.z, -ARENA_R + 1, ARENA_R - 1);
          this.proj.dropCone(tx, ground, tz, 0.9 / sp, 1.4);
          audio.play('shoot');
        }
        if (this.stateT > 0.4 + n * every + 0.5) this.toHover(0.4);
        break;
      }
      case 'summon': {
        const k = Math.min(1, this.stateT);
        this.anim(dt, { armL: [0, 0, -1.0 * k], armR: [0, 0, 1.3 * k], foreL: [0, 0, -0.5 * k], foreR: [0, 0, 0.5 * k], upper: [-0.2 * k, 0, Math.sin(this.stateT * 30) * 0.04 * k] });
        if (this.stateT > 0.8 && !this.did) {
          this.did = true;
          audio.play('laugh');
          // pump.fun launches (more every phase) + a broccoli bodyguard from phase 2
          this.launchPumps(this.phase + 1);
          if (this.phase >= 2) {
            const [x, z] = this.freeSpot(5, 9);
            const m = new Broccoli(this.stage, x, ground, z, { variant: this.phase === 3 ? 'spiky' : 'normal', chase: true, speed: 2.0 + this.phase * 0.3, range: 0 });
            m.alwaysActive = true;
            this.stage.add(m);
            this.minions.push(m);
            this.fx.puff(x, ground + 0.3, z, { count: 8, size: 0.6, color: 0xd8c8ff, speed: 3 });
          }
        }
        if (this.stateT > 1.4) this.toHover(0.4);
        break;
      }
      case 'sweep': {
        // descend, telegraph, then spin cone-chain arms around at ankle height: JUMP!
        this.pos.y = damp(this.pos.y, ground + 1.9, 5, dt);
        this.pos.x = damp(this.pos.x, 0, 3, dt); this.pos.z = damp(this.pos.z, 0, 3, dt);
        const tele = 0.9;
        this.sweep.visible = true;
        this.sweep.position.set(this.pos.x, ground + 0.45, this.pos.z);
        this.bars[1].visible = this.phase === 3;
        this.anim(dt, { armL: [0, 0, 0.8], armR: [0, 0, -0.6], cape: [-1.1, 0, 0], cape2: [-0.5, 0, 0] });
        if (this.stateT < tele) {
          if (!this.did) { this.did = true; this.sweepA = Math.atan2(p.pos.x, p.pos.z) + Math.PI; audio.play('whoosh'); }
          this.sweep.rotation.y = this.sweepA;
          const k = this.stateT / tele;
          this.bars.forEach((b) => b.scale.set(k, 1, 1));
          this.bars.forEach((b) => b.children.forEach((c) => c.material.emissive.setRGB(0.3 + Math.sin(this.stateT * 30) * 0.3, 0.05, 0.3)));
        } else {
          const w = (this.phase === 2 ? 1.7 : 2.2) * (this.phase === 3 ? 1.1 : 1);
          this.sweep.rotation.y += w * dt;
          this.coneBody.rotation.y += w * 2 * dt;
          const rel = new THREE.Vector3(p.pos.x - this.sweep.position.x, 0, p.pos.z - this.sweep.position.z);
          const pr = rel.length();
          const pa = Math.atan2(rel.x, rel.z);
          for (const b of this.bars) {
            if (!b.visible) continue;
            const ba = this.sweep.rotation.y + b.rotation.y + Math.PI / 2; // bar points along local +X
            const da = Math.atan2(Math.sin(pa - ba), Math.cos(pa - ba));
            const perp = Math.abs(Math.sin(da)) * pr;
            if (Math.cos(da) > 0 && pr > 1.0 && pr < 12.6 && perp < 0.5 && p.pos.y - ground < 0.85) p.hurt('angel', this.pos.x, this.pos.z);
          }
          if (this.stateT > tele + Math.PI * 2 * 1.15 / w) { this.sweep.visible = false; this.coneBody.rotation.y = 0; this.toHover(0.5); }
        }
        break;
      }
      case 'lasers': {
        // eyes lock on, then two burning laser spots chase Nobu across the floor: keep moving, jump them
        const aim = 0.8, dur = 3.2;
        this.pos.y = damp(this.pos.y, this.home.y + 0.8, 3, dt);
        this.faceTo(this.laserC || p.pos, dt, 6);
        if (!this.did) {
          this.did = true;
          this.laserC = new THREE.Vector3(this.pos.x, ground, this.pos.z).addScaledVector(dirTo(this.pos, p.pos), 3);
          audio.play('charge');
        }
        const firing = this.stateT > aim;
        if (firing) {
          if (this.shots === 0) { this.shots = 1; audio.play('laser'); audio.play('laugh'); }
          const to = new THREE.Vector3(p.pos.x - this.laserC.x, 0, p.pos.z - this.laserC.z);
          const l = to.length();
          const v = (3.8 + this.phase * 0.6) * dt;
          if (l > 0.01) this.laserC.addScaledVector(to, Math.min(1, v / l));
          if (this.stateT > aim + 1.6 && this.shots === 1) { this.shots = 2; audio.play('laser'); }
        }
        const perp = dirTo(this.pos, this.laserC);
        const side = new THREE.Vector3(-perp.z, 0, perp.x);
        this.anim(dt, { upper: [0.3, 0, 0], armL: [0, 0.6, -0.2], armR: [0, -0.6, 0.3], squash: firing ? Math.sin(this.stateT * 40) * 0.03 : 0 });
        for (let i = 0; i < 2; i++) {
          const s = i ? 1 : -1;
          const spot = this.laserC.clone().addScaledVector(side, s * 0.9);
          spot.x = clamp(spot.x, -ARENA_R, ARENA_R); spot.z = clamp(spot.z, -ARENA_R, ARENA_R); spot.y = ground;
          this.beams[i].set(this.eyePos(s, new THREE.Vector3()), spot, firing, this.stateT);
          if (firing) {
            if (Math.random() < dt * 30) this.fx.sparkle(spot.x, ground + 0.15, spot.z, { count: 1, color: 0xff6080, size: 0.5, speed: 3, up: 3 });
            if (Math.random() < dt * 14) this.fx.smokeCard(spot.x, ground + 0.1, spot.z, { vy: 1.2, size: 0.25, life: 0.8, colors: [0x5a3a50, 0x8a8090], grow: 1.5, g: -0.5, alpha: 0.7 });
            if (!p.dead && this.beams[i].hits(p)) p.hurt('angel', spot.x, spot.z);
          }
        }
        if (this.stateT > aim + dur) { this.hideBeams(); this.laserC = null; this.toHover(0.5); }
        break;
      }
      case 'vortex': {
        // tips its open mouth at Nobu and SUCKS: run away or get pulled into the cone
        const tele = 0.6, dur = 2.8;
        this.pos.y = damp(this.pos.y, ground + 2.3, 4, dt);
        this.faceTo(p.pos, dt, 5);
        const k = Math.min(1, this.stateT / tele);
        this.coneBody.rotation.x = damp(this.coneBody.rotation.x, 1.25 * k, 8, dt);
        this.anim(dt, { armL: [0, 0.8, 0.2], armR: [0, -0.8, -0.2], cape: [-1.2, 0, 0], cape2: [-0.7, 0, 0] });
        if (this.stateT > tele && this.stateT < tele + dur) {
          if (this.shots === 0) { this.shots = 1; audio.play('suck'); }
          if (this.stateT > tele + 1.4 && this.shots === 1) { this.shots = 2; audio.play('suck'); }
          const to = dirTo(p.pos, this.pos);
          const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          const f = (2.6 + this.phase * 0.5) * clamp(1.4 - d / 14, 0.4, 1.2);
          p.pushX = to.x * f; p.pushZ = to.z * f;
          // debris and air streaming into the mouth
          if (Math.random() < dt * 45) {
            const a = rand(0, Math.PI * 2), r = rand(3, 9);
            const sx = this.pos.x + Math.cos(a) * r, sz = this.pos.z + Math.sin(a) * r, sy = ground + rand(0.2, 2.5);
            const life = 0.5;
            this.fx.smokeCard(sx, sy, sz, { vx: (this.pos.x - sx) / life, vy: (this.pos.y - sy) / life, vz: (this.pos.z - sz) / life, size: 0.18, life, colors: [0xe8d8ff], grow: -0.5, g: 0, drag: 1, alpha: 0.5, fadeAt: 0.6 });
          }
          if (!p.dead && d < 2.2 && p.pos.y - ground < 3) p.hurt('cone', this.pos.x, this.pos.z);
        } else if (this.stateT >= tele + dur && !this.did) {
          // spit out a fan of cones on the way back up
          this.did = true;
          const dir = dirTo(this.pos, p.pos);
          for (let i = 0; i < 5; i++) { const from = this.pos.clone(); from.y = ground + 1.05; this.proj.cone(from, rotY(dir, (i - 2) * 0.25), 9 * sp); }
          audio.play('shoot');
        }
        if (this.stateT > tele + dur + 0.5) this.toHover(0.5);
        break;
      }
      case 'grab': {
        // flip upside down and slam over Nobu like a cup
        const track = (this.phase === 2 ? 1.25 : 1.0);
        const lock = 0.35;
        if (this.stateT < track + lock) {
          this.coneBody.rotation.x = damp(this.coneBody.rotation.x, Math.PI, 6, dt);
          if (this.stateT < track) this.grabT = new THREE.Vector3(clamp(p.pos.x, -ARENA_R + 1, ARENA_R - 1), 0, clamp(p.pos.z, -ARENA_R + 1, ARENA_R - 1));
          this.pos.x = damp(this.pos.x, this.grabT.x, 7, dt); this.pos.z = damp(this.pos.z, this.grabT.z, 7, dt);
          this.pos.y = damp(this.pos.y, ground + 7, 4, dt);
          this.marker.visible = true;
          this.marker.position.set(this.grabT.x, ground + 0.06, this.grabT.z);
          this.marker.scale.setScalar(this.stateT > track ? 1.15 : 1 + Math.sin(this.stateT * 14) * 0.06);
          this.anim(dt, { armL: [0, 0, -1.2], armR: [0, 0, 1.4], squash: this.stateT > track ? 0.15 : 0 });
          if (!this.did) { this.did = true; audio.play('laugh'); }
        } else if (!this.slammed) {
          this.pos.y -= 34 * dt;
          this.anim(dt, { squash: 0.2 });
          if (this.pos.y <= ground + 1.45) this._slam(ground);
        } else {
          // missed? stuck rim-down in the floor: bonus vulnerability
          this.stuckT += dt;
          this.vulnerable = !this.grabHit;
          this.stars.visible = this.vulnerable;
          this.stars.position.y = 1.6;
          this.stars.rotation.y += dt * 5;
          this.coneBody.rotation.z = Math.sin(this.stuckT * 25) * 0.06;
          this.anim(dt, { squash: -0.15, armL: [0, 0, Math.sin(this.stuckT * 18) * 0.5], armR: [0, 0, -Math.sin(this.stuckT * 18) * 0.5] });
          if (this.stuckT > (this.grabHit ? 0.5 : 1.3 / Math.sqrt(sp))) {
            this.coneBody.rotation.set(0, 0, 0);
            this.slammed = false; this.grabHit = false;
            this.proj.shockwave(this.pos.x, ground, this.pos.z, 8 * sp, 9);
            this.toHover(0.4);
          }
        }
        break;
      }
      case 'clones': {
        // phase 3: two ghost clones appear; all three flip and track, then slam one after another
        if (!this.did) { this.did = true; this._spawnDecoys(); audio.play('laugh'); }
        const track = 1.1, gap = 0.3;
        const tgt = (i) => {
          const c = new THREE.Vector3(clamp(p.pos.x, -ARENA_R + 1, ARENA_R - 1), 0, clamp(p.pos.z, -ARENA_R + 1, ARENA_R - 1));
          if (i === 0) return c;
          const d = dirTo(this.pos, p.pos);
          return c.addScaledVector(new THREE.Vector3(-d.z, 0, d.x), i === 1 ? 3.2 : -3.2);
        };
        if (this.stateT < track) {
          this.grabT = tgt(0);
          this.decoys.forEach((dc, i) => { dc.target = tgt(i + 1); dc.target.x = clamp(dc.target.x, -ARENA_R + 1, ARENA_R - 1); dc.target.z = clamp(dc.target.z, -ARENA_R + 1, ARENA_R - 1); });
        }
        // the real one slams first, the clones follow
        const order = [this, ...this.decoys];
        order.forEach((o, i) => {
          const isMe = o === this;
          const t0 = track + i * gap;
          const pos = isMe ? this.pos : o.pos;
          const T = isMe ? this.grabT : o.target;
          const body = isMe ? this.coneBody : o.body;
          const mk = isMe ? this.marker : o.marker;
          if (this.stateT < t0) {
            body.rotation.x = damp(body.rotation.x, Math.PI, 6, dt);
            pos.x = damp(pos.x, T.x, 7, dt); pos.z = damp(pos.z, T.z, 7, dt); pos.y = damp(pos.y, ground + 7, 4, dt);
            mk.visible = true; mk.position.set(T.x, ground + 0.06, T.z);
            mk.scale.setScalar(this.stateT > track - 0.2 ? 1.15 : 1 + Math.sin(this.stateT * 14) * 0.06);
          } else if (!(isMe ? this.slammed : o.slammed)) {
            pos.y -= 34 * dt;
            if (pos.y <= ground + 1.45) {
              if (isMe) this._slam(ground);
              else {
                o.slammed = true; pos.y = ground + 1.45; mk.visible = false;
                audio.play('stomp'); this.game.camera.shake(0.4, 0.25);
                this.fx.ring(pos.x, ground, pos.z, { color: 0xc8a0ff, radius: 2.2 });
                if (!p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 1.75 && p.pos.y - ground < 2.4) p.hurt('cone', pos.x, pos.z);
              }
            }
          }
          if (!isMe) o.group.position.copy(o.pos);
        });
        if (this.slammed) {
          this.stuckT += dt;
          this.vulnerable = !this.grabHit;
          this.stars.visible = this.vulnerable;
          this.stars.position.y = 1.6;
          this.stars.rotation.y += dt * 5;
          this.coneBody.rotation.z = Math.sin(this.stuckT * 25) * 0.06;
        }
        this.anim(dt, { armL: [0, 0, -1.2], armR: [0, 0, 1.4] });
        if (this.stateT > track + gap * 2 + 0.6) this._removeDecoys(true);
        if (this.slammed && this.stuckT > (this.grabHit ? 0.6 : 1.4)) {
          this._removeDecoys(true);
          this.coneBody.rotation.set(0, 0, 0);
          this.slammed = false; this.grabHit = false;
          this.toHover(0.4);
        }
        break;
      }
      case 'overheat': {
        // drops, tips over, steams: SHORT vulnerability window (longer after the ultimate)
        const win = (this.phase === 1 ? 1.8 : this.phase === 2 ? 1.4 : 1.1) + (this.longHeat ? 1.0 : 0);
        if (this.stateT < 0.45) {
          this.pos.y = damp(this.pos.y, ground + 1.0, 10, dt);
          this.coneBody.rotation.z = damp(this.coneBody.rotation.z, 1.25, 10, dt);
          this.anim(dt, { squash: -0.2, snap: true });
          if (!this.did) { this.did = true; audio.play('dizzy'); }
        } else if (this.stateT < 0.45 + win) {
          this.vulnerable = true;
          this.stars.visible = true;
          this.stars.position.y = 1.0;
          this.stars.rotation.y += dt * 5;
          // claws twitch, cape limp, steam pouring out
          const tw = Math.sin(this.stateT * 22) * 0.15;
          this.anim(dt, { armL: [0.6, 0, 0.9 + tw], armR: [0.6, 0, -0.9 - tw], foreL: [0, 0, 0.6], foreR: [0, 0, -0.6], cape: [0.3, 0, 0], cape2: [0.2, 0, 0], squash: Math.sin(this.stateT * 6) * 0.04 });
          if (Math.random() < dt * 14) this.fx.steam(this.pos.x + rand(-1, 1), this.pos.y + 1, this.pos.z + rand(-1, 1), { size: 0.4, alpha: 0.8, up: 3, windX: 0 });
        } else {
          this.longHeat = false;
          this.coneBody.rotation.z = 0;
          this.proj.shockwave(this.pos.x, ground, this.pos.z, 9 * sp, 10);
          this.toHover(0.6);
        }
        break;
      }
      case 'ultimate': {
        // SHAME SUPERNOVA: powers up over the middle, then laser spokes spin across the floor while cones rain.
        // Jump every spoke. When it's over it overheats for longer than usual.
        const charge = 1.7;
        const dur = this.phase === 3 ? 6 : 5;
        if (!this.ultStarted) { this.ultStarted = true; this.beginUlt(); audio.play('bossRoar'); audio.play('laugh'); this.game.camera.shake(0.5, 0.8); }
        this.pos.x = damp(this.pos.x, 0, 3, dt); this.pos.z = damp(this.pos.z, 0, 3, dt);
        if (this.stateT < charge) {
          const k = this.stateT / charge;
          this.pos.y = damp(this.pos.y, this.home.y + 1.5, 3, dt);
          this.faceTo(p.pos, dt, 4);
          this.anim(dt, { armL: [0, 0, -1.2 * k], armR: [0, 0, 1.4 * k], upper: [-0.3 * k, 0, Math.sin(this.stateT * 50) * 0.04 * k], squash: 0.25 * k, cape: [-0.9, 0, 0] });
          this.powerUp(dt, k, 0xff40c0, 0.5, ground);
          break;
        }
        if (!this.glowCleared) { this.glowCleared = true; this.clearGlow(); this.fx.flash(this.pos.x, this.pos.y, this.pos.z, { size: 7, color: 0xff80e0, life: 0.4 }); this.fx.shock(this.pos.x, ground, this.pos.z, { radius: 12, color: 0xff40c0, life: 0.6 }); audio.play('explosion'); audio.play('laser'); }
        const local = this.stateT - charge;
        const n = this.phase === 1 ? 3 : 4;
        const w = [0, 0.95, 1.15, 1.35][this.phase];
        this.ultA = (this.ultA || 0) + w * dt;
        this.yaw = this.ultA;
        this.rig.rotation.y = this.yaw;
        this.anim(dt, { armL: [0, 0, 0.7], armR: [0, 0, -0.5], cape: [-1.1, 0, 0], squash: Math.sin(this.stateT * 30) * 0.03 });
        const c = new THREE.Vector3(this.pos.x, ground + 0.45, this.pos.z);
        const rel = new THREE.Vector3(p.pos.x - c.x, 0, p.pos.z - c.z);
        const pr = rel.length(), pa = Math.atan2(rel.x, rel.z);
        for (let i = 0; i < 4; i++) {
          if (i >= n) { this.beams[i].hide(); continue; }
          const a = this.ultA + (i / n) * Math.PI * 2;
          const end = c.clone().add(new THREE.Vector3(Math.sin(a) * 12, 0, Math.cos(a) * 12));
          this.beams[i].set(c, end, true, this.stateT);
          const da = Math.atan2(Math.sin(pa - a), Math.cos(pa - a));
          if (!p.dead && Math.cos(da) > 0 && pr > 1.2 && Math.abs(Math.sin(da)) * pr < 0.45 && p.pos.y - ground < 0.95) p.hurt('angel', c.x, c.z);
          if (Math.random() < dt * 12) { const r = rand(2, 12); this.fx.sparkle(c.x + Math.sin(a) * r, ground + 0.2, c.z + Math.cos(a) * r, { count: 1, color: 0xff60c0, size: 0.45, speed: 2, up: 2 }); }
        }
        if (this.phase >= 2 && local > this.shots * 0.9 && local < dur - 0.8) {
          this.shots++;
          this.proj.dropCone(clamp(p.pos.x + rand(-2, 2), -ARENA_R + 1, ARENA_R - 1), ground, clamp(p.pos.z + rand(-2, 2), -ARENA_R + 1, ARENA_R - 1), 1.0, 1.3);
        }
        if (local > dur) {
          this.hideBeams();
          this.endUlt();
          this.ultStarted = false; this.glowCleared = false;
          this.longHeat = true;
          this.plan.unshift('overheat');
          this.nextAction();
        }
        break;
      }
    }
  }

  // a spot on the arena floor away from Nobu
  freeSpot(r0, r1) {
    const p = this.player.pos;
    let x = 0, z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, Math.PI * 2), r = rand(r0, r1);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      if (Math.hypot(x - p.x, z - p.z) > 4.5) break;
    }
    return [x, z];
  }

  // Pump.fun minions beam into the arena (capped so the floor never floods)
  launchPumps(n) {
    const alive = this.minions.filter((m) => !m.dead && m instanceof PumpPill).length;
    n = Math.min(n, 5 - alive);
    for (let i = 0; i < n; i++) {
      const [x, z] = this.freeSpot(4, 10);
      const m = new PumpPill(this.stage, x, this.ground, z, { maxPump: this.phase >= 3 ? 3 : 4 });
      m.alwaysActive = true;
      this.stage.add(m);
      this.minions.push(m);
    }
    if (n > 0) audio.play('doubleJump');
  }

  _slam(ground) {
    const p = this.player;
    this.pos.y = ground + 1.45;
    this.slammed = true;
    this.marker.visible = false;
    audio.play('stomp');
    this.game.camera.shake(0.8, 0.4);
    this.fx.ring(this.pos.x, ground, this.pos.z, { color: 0xd8c8ff, radius: 2.6 });
    this.fx.puff(this.pos.x, ground + 0.2, this.pos.z, { count: 8, size: 0.7, color: 0xd8c8ff, speed: 5 });
    this.grabHit = false;
    if (!p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.75 && p.pos.y - ground < 2.4) {
      p.hurt('cone', this.pos.x, this.pos.z);
      this.grabHit = true;
    }
    this.stuckT = 0;
  }

  // translucent copies of the cone for the clone attack (static models, purely a threat to dodge)
  _spawnDecoys() {
    this._removeDecoys(false);
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      const body = new THREE.Group();
      group.add(body);
      const m = Assets.model('model_evil_cone', 4.0);
      if (m) {
        m.rotation.y = -Math.PI / 2;
        m.position.y = -2.2;
        m.traverse((o) => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false;
          if (o.material.emissive) o.material.emissive.setHex(0x6020a0);
        });
        body.add(m);
      }
      const pos = this.pos.clone();
      group.position.copy(pos);
      group.rotation.y = this.yaw;
      this.stage.scene.add(group);
      const marker = makeMarker(1.9);
      marker.visible = false;
      this.stage.scene.add(marker);
      this.fx.puff(pos.x, pos.y, pos.z, { count: 10, size: 0.7, color: 0xc8a0ff, speed: 4 });
      this.decoys.push({ group, body, pos, marker, target: pos.clone(), slammed: false });
    }
  }

  _removeDecoys(poof) {
    for (const d of this.decoys) {
      if (poof) this.fx.puff(d.pos.x, d.pos.y, d.pos.z, { count: 10, size: 0.7, color: 0xc8a0ff, speed: 3 });
      this.stage.scene.remove(d.group);
      this.stage.scene.remove(d.marker);
    }
    this.decoys = [];
  }

  toHover(t = 1) { this.setState('hover'); this.hoverFor = t; this.coneBody.rotation.set(0, 0, 0); this.marker.visible = false; this.hideBeams(); }

  onHit() {
    audio.play('bossRoar');
    this.coneBody.rotation.set(0, 0, 0);
    this.sweep.visible = false;
    this.slammed = false;
    this.hideBeams();
    this._removeDecoys(true);
    this.plan = this.plan.filter((s) => s !== 'overheat');
    this.proj.shockwave(this.pos.x, this.ground, this.pos.z, 9, 8);
    if (this.phase !== this.lastPhase) { this.lastPhase = this.phase; this.pendingRage = true; this.setState('rage'); this.did = false; }
    else this.toHover(0.8);
  }

  onTouch(p) {
    if (this.vulnerable || !this.active || this.defeated) return;
    if (this.pos.y - this.ground < 3.5) p.hurt('cone', this.pos.x, this.pos.z);
  }

  killMinions() {
    for (const m of this.minions) if (!m.dead) { m.dead = true; m.obj.visible = false; }
    this.minions = [];
  }

  onResetPhase() {
    this.killMinions();
    this._removeDecoys(false);
    this.hideBeams();
    this.pos.copy(this.home);
    this.prevPos.copy(this.pos);
    this.slammed = false;
    this.ultStarted = false; this.glowCleared = false; this.longHeat = false;
    this.lastPhase = this.phase;
    this.pendingRage = false;
    this.coneBody.scale.setScalar(1);
    this.beginPhase();
  }

  defeatAnim(dt) {
    this.defT = (this.defT || 0) + dt;
    const t = this.defT;
    this.sweep.visible = false;
    this.marker.visible = false;
    this.hideBeams();
    this._removeDecoys(false);
    this.killMinions();
    this.rig.rotation.y += dt * (2 + t * 8);
    this.coneBody.rotation.z = Math.sin(t * 30) * 0.15;
    this.anim(dt, { armL: [Math.sin(t * 25) * 0.8, 0, -1 + Math.sin(t * 19) * 0.5], armR: [Math.sin(t * 23) * 0.8, 0, 1 + Math.sin(t * 17) * 0.5], squash: Math.sin(t * 20) * 0.1 * Math.min(1, t) });
    if (t < 2.2) {
      if (Math.random() < dt * 10) { audio.play('explosion'); this.fx.flash(this.pos.x + rand(-1, 1), this.pos.y + rand(-1, 1), this.pos.z + rand(-1, 1), { size: 1.8, color: 0xff5ad0 }); this.fx.sparkle(this.pos.x + rand(-1, 1), this.pos.y + rand(-1, 1), this.pos.z + rand(-1, 1), { count: 6, color: 0xff5ad0, size: 1 }); }
      this.pos.y = damp(this.pos.y, this.home.y + 1, 2, dt);
    } else if (!this.blown) {
      this.blown = true;
      this.rig.visible = false;
      this.glow.visible = false;
      this.fx.explosion(this.pos.x, this.pos.y - 1, this.pos.z, { radius: 5, color: 0xff80e0 });
      this.fx.burst(this.pos.x, this.pos.y, this.pos.z, { count: 60, colors: [0xc8b4ff, 0xe8e0ff, 0x5a1f9a, 0xff2030], speed: 12, size: 0.35, up: 12, floor: this.ground });
      this.fx.confettiBurst(this.pos.x, this.pos.y, this.pos.z, 120);
      audio.play('explosion');
      this.game.camera.shake(1.2, 0.8);
    }
  }
}
