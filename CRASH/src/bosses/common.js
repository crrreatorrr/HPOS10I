// Shared boss tech: Boss base class, projectiles (feathers, cones, hairballs, shockwaves, falling cones),
// ground telegraph markers.
import * as THREE from 'three';
import { Entity } from '../entities/entity.js';
import { audio } from '../audio/audio.js';
import { canvasTex, rand } from '../core/util.js';
import { toon } from '../player/nobuPrims.js';
import { TUNING } from '../player/player.js';

import { Assets } from '../art/assets.js';

// Put a Higgsfield GLB body inside an animated rig group, hiding the primitive meshes of `hideRoots`.
export function attachGlb(parent, id, height, offsetY = 0, hideRoots = []) {
  const m = Assets.model(id, height);
  if (!m) return null;
  for (const r of hideRoots) r.traverse((o) => { if (o.isMesh) o.visible = false; });
  m.position.y = offsetY;
  parent.add(m);
  return m;
}

// ---------- telegraph marker ----------
let markerTex;
function markerTexture() {
  markerTex ||= canvasTex(128, 128, (g) => {
    g.strokeStyle = 'rgba(255,60,60,1)'; g.lineWidth = 10;
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,40,40,0.28)';
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(64, 30); g.lineTo(64, 98); g.moveTo(30, 64); g.lineTo(98, 64); g.stroke();
  });
  return markerTex;
}
export function makeMarker(radius = 1.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: markerTexture(), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

// ---------- projectiles ----------
const PG = {};
function pgeo() {
  if (PG.ready) return PG;
  Object.assign(PG, {
    ready: true,
    feather: (() => { const g = new THREE.ConeGeometry(0.16, 1.0, 5); g.rotateX(Math.PI / 2); return g; })(),
    cone: (() => { const g = new THREE.CylinderGeometry(0.42, 0.14, 0.5, 14, 1, true); g.rotateX(Math.PI / 2); return g; })(),
    bigCone: new THREE.CylinderGeometry(0.15, 1.1, 1.6, 16, 1, true),
    hairball: new THREE.IcosahedronGeometry(0.42, 1),
    ring: new THREE.TorusGeometry(1, 0.22, 6, 40),
    mFeather: toon(0xb87aff), mCone: new THREE.MeshLambertMaterial({ color: 0xe0d8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: 0x30204a }),
    mHair: toon(0xc8742a), mRing: new THREE.MeshBasicMaterial({ color: 0xffb0ff, transparent: true, opacity: 0.85 }),
  });
  return PG;
}

export class Projectiles {
  constructor(game, stage) {
    this.game = game;
    this.stage = stage;
    this.list = [];
  }

  _add(p) { this.list.push(p); this.stage.scene.add(p.mesh); if (p.marker) this.stage.scene.add(p.marker); return p; }

  feather(pos, dir, speed = 11) {
    const G = pgeo();
    const mesh = new THREE.Mesh(G.feather, G.mFeather);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(dir));
    return this._add({ kind: 'feather', mesh, vel: dir.clone().multiplyScalar(speed), life: 3, r: 0.45, death: 'angel' });
  }

  cone(pos, dir, speed = 10, gravity = 0) {
    const G = pgeo();
    const mesh = new THREE.Mesh(G.cone, G.mCone);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(dir));
    return this._add({ kind: 'cone', mesh, vel: dir.clone().multiplyScalar(speed), life: 3.2, r: 0.5, death: 'cone', gravity });
  }

  hairball(pos, dir, speed = 7, groundY = 0) {
    const G = pgeo();
    const mesh = new THREE.Mesh(G.hairball, G.mHair);
    mesh.position.copy(pos);
    return this._add({ kind: 'hairball', mesh, vel: new THREE.Vector3(dir.x * speed, 5, dir.z * speed), life: 4, r: 0.5, death: 'angel', gravity: 20, groundY, bounce: true, biteable: true });
  }

  // A giant cone that falls onto a marked spot after `delay`.
  dropCone(x, y, z, delay = 0.9, radius = 1.3) {
    const G = pgeo();
    const mesh = new THREE.Mesh(G.bigCone, G.mCone);
    mesh.position.set(x, y + 14, z);
    mesh.visible = false;
    const marker = makeMarker(radius);
    marker.position.set(x, y + 0.05, z);
    return this._add({ kind: 'drop', mesh, marker, vel: new THREE.Vector3(0, 0, 0), life: delay + 1.6, delay, r: radius, death: 'cone', groundY: y, t: 0 });
  }

  shockwave(x, y, z, speed = 8, maxR = 14) {
    const G = pgeo();
    const mesh = new THREE.Mesh(G.ring, G.mRing);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.25, z);
    audio.play('stomp');
    return this._add({ kind: 'wave', mesh, vel: new THREE.Vector3(), life: maxR / speed, r: 0.2, speed, R: 0.3, cx: x, cz: z, groundY: y, death: 'angel' });
  }

  update(dt) {
    const p = this.game.player;
    const pc = new THREE.Vector3(p.pos.x, p.pos.y + 0.65, p.pos.z);
    const biting = p.biteT >= 0.1 && p.biteT <= 0.75;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i];
      pr.life -= dt;
      let hit = false;
      if (pr.kind === 'wave') {
        pr.R += pr.speed * dt;
        pr.mesh.scale.set(pr.R, pr.R, 1);
        pr.mesh.material.opacity = Math.min(0.85, pr.life * 2);
        const d = Math.hypot(p.pos.x - pr.cx, p.pos.z - pr.cz);
        if (Math.abs(d - pr.R) < 0.55 && p.pos.y - pr.groundY < 0.7) hit = true;
      } else if (pr.kind === 'drop') {
        pr.t += dt;
        const k = Math.min(1, pr.t / pr.delay);
        pr.marker.scale.setScalar(0.5 + k * 0.5);
        pr.marker.material.opacity = 0.5 + Math.sin(pr.t * 20) * 0.3;
        if (pr.t > pr.delay - 0.35) {
          pr.mesh.visible = true;
          const f = Math.min(1, (pr.t - (pr.delay - 0.35)) / 0.35);
          pr.mesh.position.y = pr.groundY + 0.8 + (1 - f) * 13;
          if (f >= 1 && !pr.landed) {
            pr.landed = true;
            audio.play('stomp');
            this.game.camera.shake(0.25, 0.2);
            this.game.fx.puff(pr.mesh.position.x, pr.groundY + 0.2, pr.mesh.position.z, { count: 6, size: 0.5, color: 0xe8e0ff, speed: 3 });
            const d = Math.hypot(p.pos.x - pr.mesh.position.x, p.pos.z - pr.mesh.position.z);
            if (d < pr.r && p.pos.y - pr.groundY < 1.6) hit = true;
            pr.life = 0.5;
          }
        }
      } else {
        if (pr.gravity) pr.vel.y -= pr.gravity * dt;
        pr.mesh.position.addScaledVector(pr.vel, dt);
        if (pr.bounce && pr.mesh.position.y < pr.groundY + 0.42) {
          pr.mesh.position.y = pr.groundY + 0.42;
          pr.vel.y = Math.abs(pr.vel.y) * 0.7 + 2.5;
        }
        if (pr.kind === 'hairball') pr.mesh.rotation.x += dt * 8;
        if (pr.kind === 'cone' && pr.gravity) pr.mesh.lookAt(pr.mesh.position.clone().add(pr.vel));
        if (pr.biteable && biting) {
          const f = p.forward;
          const bc = new THREE.Vector3(p.pos.x + f.x * 0.75, p.pos.y + 0.75, p.pos.z + f.z * 0.75);
          if (bc.distanceTo(pr.mesh.position) < 1.1) {
            this.game.fx.burst(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, { count: 8, colors: [0xc8742a, 0xa85a20], size: 0.12 });
            audio.play('chompHit');
            pr.life = 0;
          }
        }
        if (pr.life > 0 && pc.distanceTo(pr.mesh.position) < pr.r + 0.38) hit = true;
      }
      if (hit && !p.dead) {
        p.hurt(pr.death, pr.mesh.position.x, pr.mesh.position.z);
        if (pr.kind !== 'wave' && pr.kind !== 'drop') pr.life = 0;
      }
      if (pr.life <= 0) {
        this.stage.scene.remove(pr.mesh);
        if (pr.marker) this.stage.scene.remove(pr.marker);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const pr of this.list) { this.stage.scene.remove(pr.mesh); if (pr.marker) this.stage.scene.remove(pr.marker); }
    this.list.length = 0;
  }
}

// ---------- Boss base ----------
export class Boss extends Entity {
  constructor(stage, x, y, z, { name, portrait, hp, phaseHp }) {
    super(stage, x, y, z);
    this.name = name;
    this.portrait = portrait;
    this.maxHp = hp;
    this.hp = hp;
    this.phaseHp = phaseHp; // hits per phase
    this.phase = 1;
    this.vulnerable = false;
    this.hitCool = 0;
    this.alwaysActive = true;
    this.active = false;   // fight running
    this.state = 'intro';
    this.stateT = 0;
    this.speedMul = 1;
    this.defeated = false;
    this.flashT = 0;
    this.meshes = [];
  }

  get proj() { return this.game.session.projectiles; }

  setState(s) { this.state = s; this.stateT = 0; }

  // collect materials for hit flash
  collectMeshes() {
    this.obj.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) this.meshes.push(o); });
  }

  flash(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = Math.floor(this.flashT * 20) % 2 === 0;
      for (const m of this.meshes) m.material.emissive.setRGB(on ? 0.8 : 0, on ? 0.8 : 0, on ? 0.8 : 0);
      if (this.flashT <= 0) for (const m of this.meshes) m.material.emissive.setRGB(0, 0, 0);
    }
  }

  damage(p) {
    if (!this.vulnerable || this.hitCool > 0 || this.defeated) return false;
    this.hp--;
    this.hitCool = 0.6;
    this.flashT = 0.5;
    this.vulnerable = false;
    audio.play('bossHit');
    this.game.camera.shake(0.6, 0.4);
    this.fx.sparkle(this.pos.x, this.pos.y + 1.5, this.pos.z, { count: 18, color: 0xffffff, size: 0.9, speed: 6 });
    this.game.ui.bossHp(this.hp / this.maxHp, this.phase);
    if (p && p.bounce && p.vel.y <= 0) p.bounce(TUNING.STOMP_BOUNCE * 1.05);
    if (this.hp <= 0) { this.defeated = true; this.game.session.onBossDefeated(this); return true; }
    const used = this.maxHp - this.hp;
    if (used % this.phaseHp === 0) {
      this.phase++;
      this.game.session.onBossPhase(this, this.phase);
    }
    this.onHit?.();
    return true;
  }

  // restart the current phase after Nobu dies (phase checkpoints)
  resetToPhase(phase) {
    this.phase = phase;
    this.hp = this.maxHp - (phase - 1) * this.phaseHp;
    this.vulnerable = false;
    this.hitCool = 0;
    this.flashT = 0;
    for (const m of this.meshes) m.material.emissive.setRGB(0, 0, 0);
    this.onResetPhase?.();
  }

  update(dt) {
    this.hitCool = Math.max(0, this.hitCool - dt);
    this.stateT += dt;
    this.flash(dt);
    if (this.active && !this.defeated) this.ai(dt);
    else if (this.defeated) this.defeatAnim?.(dt);
    else this.idleAnim?.(dt);
    this.obj.position.copy(this.pos);
    this.updateBox();
  }

  ai() {}
  onTouch(p) { if (!this.vulnerable && !this.defeated && this.active) p.hurt('angel', this.pos.x, this.pos.z); }
  onBite(p) { if (this.vulnerable) this.damage(p); }
  onStomp(p) { if (this.vulnerable) this.damage(p); else this.onTouch(p); }
  onSlide(p) { this.onBite(p); }
}

export function dirTo(from, to) {
  const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const l = d.length() || 1;
  return d.divideScalar(l);
}

export function rotY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

export { rand };
