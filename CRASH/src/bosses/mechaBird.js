// Boss 1: the Mecha Bird — the Evil Cone's flying cone delivery machine.
// Phase 1: dive bombs (gets stuck in the ground -> vulnerable)
// Phase 2: feather missile volleys, then lands to reload (vulnerable) + dives
// Phase 3: drops cones from above + dives + volleys
import * as THREE from 'three';
import { Boss, makeMarker, dirTo, rotY, attachGlb } from './common.js';
import { toon } from '../player/nobuPrims.js';
import { audio } from '../audio/audio.js';
import { Assets } from '../art/assets.js';
import { damp, rand } from '../core/util.js';

export class MechaBird extends Boss {
  constructor(stage, x, y, z) {
    super(stage, x, y, z, { name: 'MECHA BIRD', portrait: 'portrait_bird', hp: 6, phaseHp: 2 });
    this.buildModel();
    this.setBox(2.8, 2.0, 2.8, -1.0);
    this.marker = makeMarker(1.7);
    this.marker.visible = false;
    stage.scene.add(this.marker);
    this.target = new THREE.Vector3();
    this.circleA = 0;
    this.plan = [];
    this.vel = new THREE.Vector3();
    this.home = new THREE.Vector3(0, 7, -8);
    this.pos.copy(this.home);
    this.collectMeshes();
  }

  buildModel() {
    const purple = toon(0x6a3fb0), silver = toon(0xc8ccd8), dark = toon(0x2a1a44), yellow = toon(0xffc52c);
    const red = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    const S = (r) => new THREE.SphereGeometry(r, 16, 12);
    this.rig = new THREE.Group();
    this.obj.add(this.rig);
    const body = new THREE.Mesh(S(1), purple); body.scale.set(1.0, 0.85, 1.45); this.rig.add(body);
    const belly = new THREE.Mesh(S(0.9), silver); belly.scale.set(0.85, 0.7, 1.2); belly.position.set(0, -0.2, 0.1); this.rig.add(belly);
    // rivets
    for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(S(0.06), silver); const a = (i / 8) * Math.PI * 2; r.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.5 + 0.1, 0.3); this.rig.add(r); }
    this.head = new THREE.Group(); this.head.position.set(0, 0.55, 1.25); this.rig.add(this.head);
    this.head.add(new THREE.Mesh(S(0.62), purple));
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.3), red); visor.position.set(0, 0.12, 0.45); this.head.add(visor);
    this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 10), yellow);
    this.beak.rotation.x = Math.PI / 2; this.beak.position.set(0, -0.08, 0.95); this.head.add(this.beak);
    for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.04, 0.025, 4, 12), dark); ring.position.set(0, -0.08, 0.7 + i * 0.18); this.head.add(ring); }
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 4), silver); crest.position.set(0, 0.7, -0.1); crest.rotation.x = -0.4; this.head.add(crest);
    // wings with jet engines
    this.wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sx * 0.9, 0.25, 0); this.rig.add(w);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.3), purple); plate.position.x = sx * 1.3; w.add(plate);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.25), silver); trim.position.set(sx * 1.3, 0, -0.65); w.add(trim);
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.8), silver); f.position.set(sx * (2.2 + i * 0.35), -0.02, -0.95 - i * 0.15); w.add(f); }
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 12), silver); eng.rotation.x = Math.PI / 2; eng.position.set(sx * 1.4, -0.3, 0.1); w.add(eng);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), glow); flame.rotation.x = -Math.PI / 2; flame.position.set(sx * 1.4, -0.3, -0.6); w.add(flame);
      w.userData.flame = flame;
      this.wings.push(w);
    }
    // tail fins
    for (const sx of [-1, 0, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.8), sx ? silver : purple); f.position.set(sx * 0.35, 0.35, -1.45); f.rotation.x = -0.4; this.rig.add(f); }
    // talons + cargo cage with coned dogs
    for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 6), dark); t.position.set(sx * 0.35, -0.95, 0.2); t.rotation.x = Math.PI; this.rig.add(t); }
    this.cage = new THREE.Group(); this.cage.position.set(0, -1.75, 0.1); this.rig.add(this.cage);
    const bar = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
    for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(bar, silver); const a = (i / 10) * Math.PI * 2; b.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6); this.cage.add(b); }
    for (const yy of [-0.5, 0.5]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 20), silver); r.rotation.x = Math.PI / 2; r.position.y = yy; this.cage.add(r); }
    const dog = Assets.model('model_dog_corgi_coned', 0.8) || new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.tex('dog_corgi_coned'), transparent: true }));
    if (dog.isSprite) dog.scale.set(0.8, 0.8, 1);
    dog.position.set(0, dog.isSprite ? -0.05 : -0.45, 0); this.cage.add(dog);
    this.cageDog = dog;
    // dizzy stars
    this.stars = new THREE.Group(); this.stars.position.y = 1.5; this.stars.visible = false;
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffe14a })); const a = (i / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9); this.stars.add(s); }
    this.obj.add(this.stars);
    // Higgsfield 3D body (wings/cage baked in); flapping becomes a body roll + bob
    this.glb = attachGlb(this.rig, 'model_mecha_bird', 4.2, -2.4, [this.rig]);
    if (this.glb) this.glb.rotation.y = 0;
  }

  get P() { return this.player.pos; }

  idleAnim(dt) {
    this.flap(dt, 1);
    this.pos.y = this.home.y + Math.sin(this.stateT * 2) * 0.4;
    this.faceTo(this.P, dt, 4);
  }

  flap(dt, k = 1) {
    const a = Math.sin(this.stateT * 9 * k) * 0.35;
    this.wings[0].rotation.z = a; this.wings[1].rotation.z = -a;
    this.beak.rotation.y += dt * 25;
    if (this.glb) {
      this.glb.position.y = -2.4 + Math.sin(this.stateT * 9 * k) * 0.18;
      this.glb.rotation.z = Math.sin(this.stateT * 4.5 * k) * 0.08;
      this.glb.scale.y = this.glb.scale.x * (1 + Math.sin(this.stateT * 9 * k) * 0.03);
    }
  }

  faceTo(p, dt, k = 6) {
    const yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.rig.rotation.y = damp(this.rig.rotation.y, yaw + Math.round((this.rig.rotation.y - yaw) / (Math.PI * 2)) * Math.PI * 2, k, dt);
  }

  start() {
    this.active = true;
    this.nextAction();
  }

  nextAction() {
    if (!this.plan.length) {
      if (this.phase === 1) this.plan = ['circle', 'aim'];
      else if (this.phase === 2) this.plan = ['circle', 'volley', 'volley', 'volley', 'tired', 'circle', 'aim'];
      else this.plan = ['circle', 'bomb', 'aim', 'circle', 'volley', 'volley', 'bomb', 'aim'];
    }
    this.setState(this.plan.shift());
    this.shots = 0;
    if (this.state === 'aim') { this.marker.visible = true; audio.play('bossRoar'); }
  }

  ai(dt) {
    const sp = this.phase === 3 ? 1.25 : this.phase === 2 ? 1.1 : 1;
    this.stars.visible = false;
    this.vulnerable = false;
    this.cage.rotation.y += dt;
    switch (this.state) {
      case 'circle': {
        this.flap(dt);
        this.circleA += dt * 0.9 * sp;
        const tx = Math.sin(this.circleA) * 9, tz = Math.cos(this.circleA) * 9;
        this.pos.x = damp(this.pos.x, tx, 2.5, dt); this.pos.z = damp(this.pos.z, tz, 2.5, dt);
        this.pos.y = damp(this.pos.y, 7 + Math.sin(this.stateT * 3) * 0.5, 2, dt);
        this.faceTo(this.P, dt);
        this.rig.rotation.z = -0.3;
        if (this.stateT > 1.6 / sp) { this.rig.rotation.z = 0; this.nextAction(); }
        break;
      }
      case 'aim': {
        this.flap(dt, 1.4);
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
        this.rig.rotation.x = -0.3;
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
        this.rig.rotation.x = 0.9;
        this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * -0.6));
        if (len <= step) {
          this.pos.copy(this.target).setY(1.1);
          this.marker.visible = false;
          this.setState('stuck');
          audio.play('stomp');
          this.game.camera.shake(0.7, 0.4);
          this.fx.puff(this.pos.x, 0.2, this.pos.z, { count: 14, size: 0.7, color: 0xd8c8a8, speed: 5 });
          this.fx.burst(this.pos.x, 0.3, this.pos.z, { count: 14, colors: [0x6a4a2a, 0x3a8a2a], speed: 6, floor: 0 });
          this.proj.shockwave(this.pos.x, 0, this.pos.z, 7, 5);
          audio.play('dizzy');
        } else {
          this.pos.addScaledVector(d.normalize(), step);
          // body slam hurts on the way down
          const p = this.player;
          if (!p.dead && p.pos.distanceTo(this.pos) < 1.8) p.hurt('flat', this.pos.x, this.pos.z);
        }
        break;
      }
      case 'stuck': {
        // beak drilled into the ground, wings twitching: VULNERABLE
        this.vulnerable = true;
        this.stars.visible = true;
        this.stars.rotation.y += dt * 4;
        this.rig.rotation.x = 0.7;
        this.rig.rotation.z = Math.sin(this.stateT * 20) * 0.05;
        this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.5 + Math.sin(this.stateT * 14) * 0.15)));
        const dur = this.phase === 3 ? 2.2 : this.phase === 2 ? 2.4 : 2.7;
        if (this.stateT > dur) this.recover();
        break;
      }
      case 'tired': {
        // land at the edge to reload feathers: VULNERABLE
        if (this.stateT < 0.6) {
          this.pos.y = damp(this.pos.y, 1.0, 6, dt);
          this.flap(dt, 2);
        } else {
          this.vulnerable = true;
          this.stars.visible = true;
          this.stars.rotation.y += dt * 4;
          this.rig.rotation.x = 0.25;
          this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * 0.8));
          this.head.rotation.x = 0.4 + Math.sin(this.stateT * 6) * 0.1;
        }
        if (this.stateT > 2.9) { this.head.rotation.x = 0; this.recover(); }
        break;
      }
      case 'recover': {
        this.flap(dt, 2);
        this.rig.rotation.x = damp(this.rig.rotation.x, -0.2, 6, dt);
        this.pos.y = damp(this.pos.y, 7, 3, dt);
        if (this.stateT > 1.0) { this.rig.rotation.x = 0; this.nextAction(); }
        break;
      }
      case 'volley': {
        this.flap(dt);
        const edgeA = Math.atan2(this.pos.x, this.pos.z);
        this.pos.x = damp(this.pos.x, Math.sin(edgeA) * 10, 3, dt);
        this.pos.z = damp(this.pos.z, Math.cos(edgeA) * 10, 3, dt);
        this.pos.y = damp(this.pos.y, 3.4, 3, dt);
        this.faceTo(this.P, dt, 8);
        const charge = 0.65 / sp;
        this.wings.forEach((w) => w.userData.flame.scale.setScalar(1 + Math.min(1, this.stateT / charge) * 1.5));
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
          this.wings.forEach((w) => w.userData.flame.scale.setScalar(1));
        }
        if (this.stateT > charge + 0.8) this.nextAction();
        break;
      }
      case 'bomb': {
        // fly over Nobu dropping cones that land where he's heading
        this.flap(dt, 1.5);
        const p = this.player;
        const lead = p.vel.clone().multiplyScalar(0.45);
        this.pos.x = damp(this.pos.x, p.pos.x, 2.4, dt);
        this.pos.z = damp(this.pos.z, p.pos.z + 2, 2.4, dt);
        this.pos.y = damp(this.pos.y, 7.5, 3, dt);
        this.faceTo(p.pos, dt);
        const every = 0.55 / sp;
        const n = 6;
        if (this.stateT > 0.6 + this.shots * every && this.shots < n) {
          this.shots++;
          const tx = Math.max(-11, Math.min(11, p.pos.x + lead.x)), tz = Math.max(-11, Math.min(11, p.pos.z + lead.z));
          this.proj.dropCone(tx, 0, tz, 0.95 / sp, 1.4);
          audio.play('shoot');
        }
        if (this.stateT > 0.6 + n * every + 0.6) this.nextAction();
        break;
      }
    }
  }

  recover() { this.setState('recover'); this.vulnerable = false; this.stars.visible = false; }

  onHit() {
    audio.play('bossRoar');
    this.recover();
    this.plan = [];
  }

  onTouch(p) {
    if (this.vulnerable || !this.active || this.defeated) return;
    if (this.state === 'dive' || this.pos.y < 3) p.hurt('angel', this.pos.x, this.pos.z);
  }

  onResetPhase() {
    this.plan = [];
    this.marker.visible = false;
    this.pos.copy(this.home);
    this.rig.rotation.set(0, 0, 0);
    this.stars.visible = false;
    this.setState('circle');
  }

  defeatAnim(dt) {
    this.defT = (this.defT || 0) + dt;
    const t = this.defT;
    this.marker.visible = false;
    this.stars.visible = false;
    this.rig.rotation.y += dt * 8;
    this.rig.rotation.z = Math.sin(t * 20) * 0.3;
    if (t < 1.6) {
      this.pos.y = Math.max(1.2, this.pos.y - dt * 3);
      if (Math.random() < dt * 14) this.fx.puff(this.pos.x + rand(-1, 1), this.pos.y + rand(0, 1), this.pos.z + rand(-1, 1), { count: 2, size: 0.6, color: 0x444444, speed: 1, up: 3 });
      if (Math.random() < dt * 8) audio.play('explosion');
    } else if (!this.blown) {
      this.blown = true;
      this.fx.burst(this.pos.x, this.pos.y, this.pos.z, { count: 40, colors: [0x6a3fb0, 0xc8ccd8, 0xffc52c, 0x2a1a44], speed: 10, size: 0.3, up: 10, floor: 0 });
      this.fx.puff(this.pos.x, this.pos.y, this.pos.z, { count: 20, size: 1.2, color: 0xffd0a0, speed: 6, up: 4, life: 1.2 });
      this.fx.confettiBurst(this.pos.x, this.pos.y + 1, this.pos.z, 80);
      audio.play('explosion');
      this.game.camera.shake(1, 0.6);
      this.rig.visible = false;
    }
  }
}
