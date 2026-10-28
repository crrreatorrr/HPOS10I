// Final boss: the Evil Cone. Three phases, faster each time, short vulnerability windows.
// Attacks: cone barrages, shockwave slams, summoned minions, spinning sweep arms, falling cones,
// and "the Cone Grab" (he flips over and slams down on Nobu like a cup).
import * as THREE from 'three';
import { Boss, makeMarker, dirTo, rotY, attachGlb } from './common.js';
import { Broccoli, PillBot } from '../entities/enemies.js';
import { toon } from '../player/nobuPrims.js';
import { audio } from '../audio/audio.js';
import { damp, rand, pick, clamp } from '../core/util.js';
import { TUNING } from '../player/player.js';

const ARENA_R = 12.5;

export class EvilCone extends Boss {
  constructor(stage, x, y, z) {
    super(stage, x, y, z, { name: 'THE EVIL CONE', portrait: 'portrait_cone', hp: 9, phaseHp: 3 });
    this.buildModel();
    this.setBox(2.6, 2.8, 2.6, -1.4);
    this.home = new THREE.Vector3(0, 3.2, -6);
    this.pos.copy(this.home);
    this.marker = makeMarker(1.9);
    this.marker.visible = false;
    stage.scene.add(this.marker);
    this.plan = [];
    this.minions = [];
    this.yaw = 0;
    this.collectMeshes();
  }

  buildModel() {
    const plastic = new THREE.MeshPhongMaterial({ color: 0xc8b4ff, emissive: 0x000000, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const inner = new THREE.MeshLambertMaterial({ color: 0x6a4ab0, side: THREE.BackSide });
    const purple = toon(0x5a1f9a), ink = toon(0x1a0a24), white = toon(0xffffff), steel = toon(0x9a8ab8);
    const red = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    this.rig = new THREE.Group();
    this.obj.add(this.rig);
    this.coneBody = new THREE.Group();
    this.rig.add(this.coneBody);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 0.55, 2.8, 28, 1, true), plastic);
    this.coneBody.add(shell);
    this.coneBody.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.45, 2.7, 28, 1, true), inner));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.13, 8, 32), plastic); rim.rotation.x = Math.PI / 2; rim.position.y = 1.4; this.coneBody.add(rim);
    const tip = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 20), steel); tip.rotation.x = Math.PI / 2; tip.position.y = -1.4; this.coneBody.add(tip);
    // tabs like a real vet cone
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), steel); const a = (i / 6) * Math.PI * 2; t.position.set(Math.cos(a) * 0.62, -1.38, Math.sin(a) * 0.62); this.coneBody.add(t); }
    // face on the front
    const rAt = (y) => 0.55 + 1.2 * ((y + 1.4) / 2.8);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const y = 0.45;
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), red);
      e.scale.set(1.2, 0.8, 0.5);
      e.position.set(sx * 0.45, y, rAt(y) - 0.05);
      this.coneBody.add(e);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.12), ink); brow.position.set(sx * 0.45, y + 0.3, rAt(y + 0.3) - 0.02); brow.rotation.z = sx * 0.45;
      this.coneBody.add(brow);
      this.eyes.push(e);
    }
    const my = -0.25;
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.26, 0.1), ink); mouth.position.set(0, my, rAt(my) - 0.02); mouth.rotation.z = 0.08; this.coneBody.add(mouth);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), white);
      tooth.position.set(-0.38 + i * 0.15, my + 0.06, rAt(my) + 0.03); tooth.rotation.x = Math.PI;
      this.coneBody.add(tooth);
    }
    this.mouthMesh = mouth;
    // cape
    const capeGeo = new THREE.PlaneGeometry(2.6, 2.6, 6, 6);
    this.cape = new THREE.Mesh(capeGeo, new THREE.MeshLambertMaterial({ color: 0x4a1080, side: THREE.DoubleSide }));
    this.cape.position.set(0, 0.2, -1.45);
    this.capeBase = capeGeo.attributes.position.array.slice();
    this.rig.add(this.cape);
    // robot arms
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 1.25, 0.3, 0); this.rig.add(sh);
      sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), steel));
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), purple); up.position.set(sx * 0.45, -0.25, 0); up.rotation.z = sx * 1.1; sh.add(up);
      const el = new THREE.Group(); el.position.set(sx * 0.9, -0.5, 0); sh.add(el);
      el.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), steel));
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), purple); fore.position.y = -0.45; el.add(fore);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), steel); c.position.set((i - 1) * 0.1, -1.0, 0); c.rotation.x = Math.PI; c.rotation.z = (i - 1) * 0.4; el.add(c); }
      this.arms.push({ sh, el, sx });
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
    // dizzy stars + steam
    this.stars = new THREE.Group(); this.stars.visible = false;
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffe14a })); const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4); this.stars.add(s); }
    this.obj.add(this.stars);
    // Higgsfield 3D body: lives inside coneBody so tipping over / flipping still animate it
    const hide = [this.coneBody, this.cape, ...this.arms.map((a) => a.sh)];
    this.glb = attachGlb(this.coneBody, 'model_evil_cone', 4.0, -2.2, hide);
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

  anim(dt) {
    const t = this.stateT + (this.animT = (this.animT || 0) + dt);
    // waving cape
    const pos = this.cape.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.capeBase[i * 3], by = this.capeBase[i * 3 + 1];
      pos.setZ(i, Math.sin(this.animT * 4 + bx * 2 + by) * 0.15 * (1.3 - by) * 0.6 - (1.3 - by) * 0.25);
    }
    pos.needsUpdate = true;
    this.arms.forEach(({ sh, sx }, i) => { sh.rotation.x = Math.sin(this.animT * 2 + i) * 0.2; });
    this.eyes.forEach((e) => e.material.color.setHSL(0, 1, 0.5 + Math.sin(this.animT * 6) * 0.1));
    this.glow.position.y = -this.pos.y + this.home.y - 3.15;
    this.glow.material.opacity = 0.25 + Math.sin(this.animT * 5) * 0.1;
  }

  start() { this.active = true; this.beginPhase(); }

  beginPhase() {
    this.plan = [];
    this.sweep.visible = false;
    this.marker.visible = false;
    this.coneBody.rotation.set(0, 0, 0);
    this.rig.rotation.set(0, this.yaw, 0);
    this.setState('hover');
    this.hoverFor = 1.2;
  }

  nextAction() {
    if (!this.plan.length) {
      this.plan = this.phase === 1
        ? ['barrage', 'shock', 'overheat', 'drops', 'barrage', 'overheat']
        : this.phase === 2
          ? ['summon', 'sweep', 'barrage', 'overheat', 'grab', 'drops', 'shock', 'overheat']
          : ['summon', 'sweep', 'barrage', 'grab', 'drops', 'shock', 'overheat', 'sweep', 'grab', 'barrage', 'overheat'];
    }
    const s = this.plan.shift();
    this.setState(s);
    this.shots = 0;
    this.did = false;
  }

  ai(dt) {
    this.anim(dt);
    const p = this.player;
    const sp = this.sp;
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
        if (this.stateT > this.hoverFor / sp) this.nextAction();
        break;
      }
      case 'barrage': {
        this.faceTo(p.pos, dt, 8);
        const charge = 0.6 / sp;
        this.mouthMesh.scale.y = 1 + Math.min(1, this.stateT / charge) * 1.5;
        const waves = this.phase === 3 ? 2 : 1;
        if (this.stateT > charge + this.shots * 0.55 && this.shots < waves) {
          this.shots++;
          const n = this.phase === 1 ? 5 : this.phase === 2 ? 7 : 9;
          const dir = dirTo(this.pos, p.pos);
          const off = this.shots === 2 ? 0.12 : 0;
          for (let i = 0; i < n; i++) {
            const from = this.pos.clone(); from.y = (this.home.y - 3.2) + 1.05;
            this.proj.cone(from, rotY(dir, (i - (n - 1) / 2) * 0.2 + off), 9.5 * sp);
          }
          audio.play('shoot');
          audio.play('laugh');
        }
        if (this.stateT > charge + waves * 0.55 + 0.5) { this.mouthMesh.scale.y = 1; this.toHover(0.5); }
        break;
      }
      case 'shock': {
        const slams = this.phase === 3 ? 3 : 1;
        const cycle = 1.0 / sp;
        const c = (this.stateT % cycle) / cycle;
        const ground = this.home.y - 3.2 + 1.45;
        if (c < 0.55) this.pos.y = damp(this.pos.y, ground + 3.2, 6, dt);
        else this.pos.y = Math.max(ground, this.pos.y - 30 * dt);
        const idx = Math.floor(this.stateT / cycle);
        if (c > 0.6 && this.pos.y <= ground + 0.01 && this.shots <= idx) {
          this.shots = idx + 1;
          this.proj.shockwave(this.pos.x, this.home.y - 3.2, this.pos.z, 7.5 * sp, ARENA_R + 2);
          this.game.camera.shake(0.5, 0.3);
          this.fx.puff(this.pos.x, this.home.y - 3.2 + 0.2, this.pos.z, { count: 10, size: 0.6, color: 0xd8c8ff, speed: 5 });
        }
        if (this.shots >= slams && c > 0.95) this.toHover(0.6);
        break;
      }
      case 'drops': {
        this.faceTo(p.pos, dt, 4);
        const n = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 6;
        const every = 0.6 / sp;
        this.arms.forEach(({ el }) => (el.rotation.z = Math.sin(this.stateT * 10) * 0.4));
        if (this.stateT > 0.4 + this.shots * every && this.shots < n) {
          this.shots++;
          const lead = p.vel.clone().multiplyScalar(0.35);
          const tx = clamp(p.pos.x + lead.x, -ARENA_R + 1, ARENA_R - 1), tz = clamp(p.pos.z + lead.z, -ARENA_R + 1, ARENA_R - 1);
          this.proj.dropCone(tx, this.home.y - 3.2, tz, 0.9 / sp, 1.4);
          audio.play('shoot');
        }
        if (this.stateT > 0.4 + n * every + 0.5) this.toHover(0.4);
        break;
      }
      case 'summon': {
        this.arms.forEach(({ sh, sx }) => (sh.rotation.z = sx * -Math.min(1, this.stateT) * 1.2));
        if (this.stateT > 0.8 && !this.did) {
          this.did = true;
          const n = this.phase === 2 ? 3 : 4;
          audio.play('laugh');
          for (let i = 0; i < n; i++) {
            let x, z, tries = 0;
            do { const a = rand(0, Math.PI * 2), r = rand(4, 9); x = Math.cos(a) * r; z = Math.sin(a) * r; tries++; } while (Math.hypot(x - p.pos.x, z - p.pos.z) < 4 && tries < 10);
            const y0 = this.home.y - 3.2;
            const m = i % 2 === 0
              ? new Broccoli(this.stage, x, y0, z, { variant: this.phase === 3 && i === 0 ? 'spiky' : 'normal', chase: true, speed: 2.0 + this.phase * 0.3, range: 0 })
              : new PillBot(this.stage, x, y0, z, { range: 3 });
            m.alwaysActive = true;
            this.stage.add(m);
            this.minions.push(m);
            this.fx.puff(x, y0 + 0.3, z, { count: 8, size: 0.6, color: 0xd8c8ff, speed: 3 });
          }
        }
        if (this.stateT > 1.4) { this.arms.forEach(({ sh }) => (sh.rotation.z = 0)); this.toHover(0.4); }
        break;
      }
      case 'sweep': {
        // descend, telegraph, then spin cone-chain arms around at ankle height: JUMP!
        const ground = this.home.y - 3.2;
        this.pos.y = damp(this.pos.y, ground + 1.9, 5, dt);
        this.pos.x = damp(this.pos.x, 0, 3, dt); this.pos.z = damp(this.pos.z, 0, 3, dt);
        const tele = 0.9;
        this.sweep.visible = true;
        this.sweep.position.set(this.pos.x, ground + 0.45, this.pos.z);
        this.bars[1].visible = this.phase === 3;
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
          // hit test along each visible bar
          const rel = new THREE.Vector3(p.pos.x - this.sweep.position.x, 0, p.pos.z - this.sweep.position.z);
          const pr = rel.length();
          const pa = Math.atan2(rel.x, rel.z);
          for (const b of this.bars) {
            if (!b.visible) continue;
            const ba = this.sweep.rotation.y + b.rotation.y + Math.PI / 2; // bar points along local +X
            let da = Math.atan2(Math.sin(pa - ba), Math.cos(pa - ba));
            const perp = Math.abs(Math.sin(da)) * pr;
            if (Math.cos(da) > 0 && pr > 1.0 && pr < 12.6 && perp < 0.5 && p.pos.y - ground < 0.85) p.hurt('angel', this.pos.x, this.pos.z);
          }
          if (this.stateT > tele + Math.PI * 2 * 1.15 / w) { this.sweep.visible = false; this.coneBody.rotation.y = 0; this.toHover(0.5); }
        }
        break;
      }
      case 'grab': {
        // flip upside down and slam over Nobu like a cup
        const ground = this.home.y - 3.2;
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
          if (!this.did) { this.did = true; audio.play('laugh'); }
        } else if (!this.slammed) {
          this.pos.y -= 34 * dt;
          if (this.pos.y <= ground + 1.45) {
            this.pos.y = ground + 1.45;
            this.slammed = true;
            this.marker.visible = false;
            audio.play('stomp');
            this.game.camera.shake(0.8, 0.4);
            this.fx.puff(this.pos.x, ground + 0.2, this.pos.z, { count: 12, size: 0.7, color: 0xd8c8ff, speed: 5 });
            if (!p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.75 && p.pos.y - ground < 2.4) {
              p.hurt('cone', this.pos.x, this.pos.z);
              this.grabHit = true;
            }
            this.stuckT = 0;
          }
        } else {
          // missed? stuck rim-down in the floor: bonus vulnerability
          this.stuckT += dt;
          this.vulnerable = !this.grabHit;
          this.stars.visible = this.vulnerable;
          this.stars.position.y = 1.6;
          this.stars.rotation.y += dt * 5;
          this.coneBody.rotation.z = Math.sin(this.stuckT * 25) * 0.06;
          if (this.stuckT > (this.grabHit ? 0.5 : 1.3 / Math.sqrt(sp))) {
            this.coneBody.rotation.set(0, 0, 0);
            this.slammed = false; this.grabHit = false;
            this.proj.shockwave(this.pos.x, ground, this.pos.z, 8 * sp, 9);
            this.toHover(0.4);
          }
        }
        break;
      }
      case 'overheat': {
        // drops, tips over, steams: SHORT vulnerability window
        const ground = this.home.y - 3.2;
        const win = this.phase === 1 ? 1.8 : this.phase === 2 ? 1.4 : 1.1;
        if (this.stateT < 0.45) {
          this.pos.y = damp(this.pos.y, ground + 1.0, 10, dt);
          this.coneBody.rotation.z = damp(this.coneBody.rotation.z, 1.25, 10, dt);
          if (!this.did) { this.did = true; audio.play('dizzy'); }
        } else if (this.stateT < 0.45 + win) {
          this.vulnerable = true;
          this.stars.visible = true;
          this.stars.position.y = 1.0;
          this.stars.rotation.y += dt * 5;
          if (Math.random() < dt * 12) this.fx.puff(this.pos.x + rand(-1, 1), this.pos.y + 1, this.pos.z + rand(-1, 1), { count: 1, size: 0.5, color: 0xffffff, up: 3, speed: 0.5 });
        } else {
          this.coneBody.rotation.z = 0;
          this.proj.shockwave(this.pos.x, ground, this.pos.z, 9 * sp, 10);
          this.toHover(0.6);
        }
        break;
      }
    }
  }

  toHover(t = 1) { this.setState('hover'); this.hoverFor = t; this.coneBody.rotation.set(0, 0, 0); this.marker.visible = false; }

  onHit() {
    audio.play('bossRoar');
    this.coneBody.rotation.set(0, 0, 0);
    this.sweep.visible = false;
    this.slammed = false;
    this.plan = this.plan.filter((s) => s !== 'overheat');
    this.proj.shockwave(this.pos.x, this.home.y - 3.2, this.pos.z, 9, 8);
    this.toHover(0.8);
  }

  onTouch(p) {
    if (this.vulnerable || !this.active || this.defeated) return;
    if (this.pos.y - (this.home.y - 3.2) < 3.5) p.hurt('cone', this.pos.x, this.pos.z);
  }

  killMinions() {
    for (const m of this.minions) if (!m.dead) { m.dead = true; m.obj.visible = false; }
    this.minions = [];
  }

  onResetPhase() {
    this.killMinions();
    this.pos.copy(this.home);
    this.slammed = false;
    this.beginPhase();
  }

  defeatAnim(dt) {
    this.defT = (this.defT || 0) + dt;
    const t = this.defT;
    this.sweep.visible = false;
    this.marker.visible = false;
    this.killMinions();
    this.rig.rotation.y += dt * (2 + t * 8);
    this.coneBody.rotation.z = Math.sin(t * 30) * 0.15;
    if (t < 2.2) {
      if (Math.random() < dt * 10) { audio.play('explosion'); this.fx.sparkle(this.pos.x + rand(-1, 1), this.pos.y + rand(-1, 1), this.pos.z + rand(-1, 1), { count: 6, color: 0xff5ad0, size: 1 }); }
      this.pos.y = damp(this.pos.y, this.home.y + 1, 2, dt);
    } else if (!this.blown) {
      this.blown = true;
      this.rig.visible = false;
      this.glow.visible = false;
      this.fx.burst(this.pos.x, this.pos.y, this.pos.z, { count: 60, colors: [0xc8b4ff, 0xe8e0ff, 0x5a1f9a, 0xff2030], speed: 12, size: 0.35, up: 12, floor: this.home.y - 3.2 });
      this.fx.confettiBurst(this.pos.x, this.pos.y, this.pos.z, 120);
      this.fx.puff(this.pos.x, this.pos.y, this.pos.z, { count: 24, size: 1.4, color: 0xf0e0ff, speed: 7, up: 4, life: 1.4 });
      audio.play('explosion');
      this.game.camera.shake(1.2, 0.8);
    }
  }
}
