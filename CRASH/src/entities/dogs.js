// Coned dogs as 3D models (Higgsfield/Tripo GLBs made from the dog art): optional rescues
// (bite or jump near them to pop the cone) and sad background extras.
import * as THREE from 'three';
import { Entity } from './entity.js';
import { Assets } from '../art/assets.js';
import { audio } from '../audio/audio.js';
import { makeShadow } from './fx.js';
import { rand, pick } from '../core/util.js';
import { TUNING } from '../player/player.js';

export const BREEDS = ['shiba', 'corgi', 'pug', 'dalmatian'];
const coneGeo = new THREE.CylinderGeometry(0.45, 0.15, 0.45, 16, 1, true);
let coneMat;

function dogVisual(breed, freed, height) {
  const m = Assets.model(`model_dog_${breed}_${freed ? 'free' : 'coned'}`, height);
  if (m) return m;
  // fallback: flat sprite of the art
  const key = `dog_${breed}_${freed ? 'free' : 'coned'}`;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.tex(key), transparent: true }));
  s.center.set(0.5, 0);
  s.scale.set(height * Assets.aspect(key), height, 1);
  const g = new THREE.Group();
  g.add(s);
  return g;
}

export class ConedDog extends Entity {
  constructor(stage, x, y, z, { breed = pick(BREEDS), height = 1.25 } = {}) {
    super(stage, x, y, z);
    this.breed = breed;
    this.h = height;
    this.body = new THREE.Group();
    this.obj.add(this.body);
    this.sad = dogVisual(breed, false, height);
    this.happy = dogVisual(breed, true, height * 1.05);
    this.happy.visible = false;
    this.body.add(this.sad, this.happy);
    this.sadMixer = Assets.animate(this.sad, 0, 0.6);    // rigged sad idle, if available
    this.happyMixer = Assets.animate(this.happy, 0, 1.1); // rigged celebration dance, if available
    this.shadow = makeShadow(1.1); this.shadow.position.y = 0.02; this.obj.add(this.shadow);
    this.setBox(1.8, 1.6, 1.8);
    this.freed = false;
    this.seq = 0;
    this.t = rand(0, 5);
    this.runT = -1;
    this.whimper = rand(2, 5);
    this.paw = 0;
    coneMat ||= new THREE.MeshLambertMaterial({ color: 0xe8e4ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    this.cone = new THREE.Mesh(coneGeo, coneMat);
    this.cone.visible = false;
    stage.scene.add(this.cone);
    this.coneV = new THREE.Vector3();
    this.runDir = new THREE.Vector3();
  }

  update(dt) {
    this.t += dt;
    const b = this.body;
    if (this.freed) this.happyMixer?.update(dt); else this.sadMixer?.update(dt);
    if (!this.freed) {
      // sad: slow breathing, head-hung sway, the occasional whimper shiver and paw at the cone
      const breathe = Math.sin(this.t * 1.8);
      b.scale.set(1 + breathe * 0.015, 1 - breathe * 0.02, 1 + breathe * 0.015);
      b.rotation.z = Math.sin(this.t * 0.9) * 0.05;
      b.rotation.x = 0.06 + Math.sin(this.t * 0.7) * 0.03;
      this.whimper -= dt;
      if (this.whimper <= 0) { this.whimper = rand(3, 6); this.paw = 1; if (this.distToPlayer() < 9) audio.play('blip'); }
      if (this.paw > 0) {
        this.paw = Math.max(0, this.paw - dt * 1.4);
        b.rotation.z += Math.sin(this.paw * 40) * 0.06 * this.paw;
        b.position.y = Math.abs(Math.sin(this.paw * 12)) * 0.05;
      }
      return;
    }
    if (this.cone.visible) {
      this.coneT += dt;
      this.coneV.y -= 18 * dt;
      this.cone.position.addScaledVector(this.coneV, dt);
      this.cone.rotation.x += dt * 12; this.cone.rotation.z += dt * 7;
      if (this.coneT > 1.6) this.cone.visible = false;
    }
    if (this.runT >= 0) {
      this.runT += dt;
      const t = this.runT;
      if (t < 0.55) {
        // celebratory hop + full spin
        const k = t / 0.55;
        b.position.y = Math.sin(k * Math.PI) * 1.1;
        b.rotation.y = k * Math.PI * 2;
        b.scale.set(1 - Math.sin(k * Math.PI) * 0.1, 1 + Math.sin(k * Math.PI) * 0.15, 1 - Math.sin(k * Math.PI) * 0.1);
      } else if (t < 1.4) {
        // happy bouncing + tail-wag wiggle
        b.position.y = Math.abs(Math.sin(t * 11)) * 0.35;
        b.rotation.y = Math.sin(t * 22) * 0.25;
        b.rotation.z = Math.sin(t * 11) * 0.1;
        b.scale.set(1, 1, 1);
      } else {
        // zoomies: dash off in a happy arc, then vanish in sparkles
        const sp = 7;
        this.runDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 1.4);
        this.pos.addScaledVector(this.runDir, sp * dt);
        this.obj.position.copy(this.pos);
        b.rotation.set(0, Math.atan2(this.runDir.x, this.runDir.z) - this.obj.rotation.y, 0);
        b.position.y = Math.abs(Math.sin(t * 16)) * 0.25;
        if (t > 2.4) {
          this.fx.sparkle(this.pos.x, this.pos.y + 0.6, this.pos.z, { count: 10, color: 0xfff2a0, size: 0.6 });
          this.runT = -1; this.obj.visible = false; this.dead = true;
        }
      }
    }
  }

  free() {
    if (this.freed) return;
    this.freed = true;
    this.interactive = false;
    this.seq = this.session.nextSeq();
    this.session.rescueDog(this);
    this.sad.visible = false;
    this.happy.visible = true;
    this.cone.visible = true;
    this.coneT = 0;
    this.cone.position.set(this.pos.x, this.pos.y + this.h * 0.8, this.pos.z);
    this.coneV.set(rand(-2, 2), 9, rand(-2, 2));
    audio.play('conePop');
    setTimeout(() => audio.play('bark', 1 + Math.random() * 0.2), 180);
    setTimeout(() => audio.play('bark', 1.2), 700);
    this.fx.confettiBurst(this.pos.x, this.pos.y + 1.0, this.pos.z, 50);
    this.fx.sparkle(this.pos.x, this.pos.y + 1.0, this.pos.z, { count: 12, color: 0xffffff, size: 0.7 });
    this.runT = 0;
    const p = this.player.pos;
    this.runDir.set(this.pos.x - p.x, 0, this.pos.z - p.z);
    if (this.runDir.lengthSq() < 0.01) this.runDir.set(1, 0, 0);
    this.runDir.normalize();
  }

  onBite() { this.free(); }
  onStomp(p) { this.free(); p.bounce(TUNING.STOMP_BOUNCE * 0.8); }
  onTouch(p) { if (!p.grounded || p.mode === 'flop') this.free(); }
  onSlide() { this.free(); }
  onFlop() { this.free(); }

  restore() {
    this.freed = false;
    this.dead = false;
    this.interactive = true;
    this.pos.copy(this.home);
    this.obj.position.copy(this.pos);
    this.obj.visible = true;
    this.runT = -1;
    this.cone.visible = false;
    this.sad.visible = true;
    this.happy.visible = false;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
  }
}

// Decorative coned dog (background detail). Optional `cage` draws bars around it.
export function backgroundDog(stage, x, y, z, { breed = pick(BREEDS), height = 1.0, cage = false, free = false, yaw = 0 } = {}) {
  const v = dogVisual(breed, free, height);
  v.position.set(x, y, z);
  v.rotation.y = yaw;
  v.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  stage.scene.add(v);
  if (cage) {
    const g = new THREE.Group();
    const bar = new THREE.CylinderGeometry(0.035, 0.035, height * 1.35, 6);
    const m = new THREE.MeshLambertMaterial({ color: 0x9a9ab0 });
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(bar, m);
      const a = (i / 12) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.75, height * 0.67, Math.sin(a) * 0.75);
      g.add(b);
    }
    for (const yy of [0.02, height * 1.35]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 20), m);
      r.rotation.x = Math.PI / 2; r.position.y = yy;
      g.add(r);
    }
    g.position.set(x, y, z);
    stage.scene.add(g);
  }
  return v;
}
