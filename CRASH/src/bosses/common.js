// Shared boss tech: Boss base class, projectiles (feathers, cones, hairballs, shockwaves, falling cones),
// ground telegraph markers.
import * as THREE from 'three';
import { Entity } from '../entities/entity.js';
import { audio } from '../audio/audio.js';
import { canvasTex, rand } from '../core/util.js';
import { toon } from '../player/nobuPrims.js';
import { TUNING } from '../player/player.js';

import { Assets } from '../art/assets.js';
import { textTexture } from '../entities/fx.js';

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
    // homing rocket
    rocket: new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10).rotateX(Math.PI / 2),
    nose: new THREE.ConeGeometry(0.13, 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    fin: new THREE.BoxGeometry(0.42, 0.04, 0.22).translate(0, 0, -0.28),
    flame: new THREE.ConeGeometry(0.11, 0.45, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.55),
    mRocket: toon(0x6a3fb0), mNose: toon(0xffc52c), mFin: toon(0xc8ccd8),
    mFlame: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    // egg bomb
    egg: new THREE.SphereGeometry(0.42, 16, 12).scale(1, 1.25, 1),
    mEgg: toon(0x3a2a5a), mBlink: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
    // yarn ball
    ball: new THREE.SphereGeometry(1, 18, 14), wrap: new THREE.TorusGeometry(1.01, 0.06, 5, 32),
    // claw slash
    slash: new THREE.PlaneGeometry(2.4, 1.0),
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

  // Homing rocket: steers after Nobu, explodes on contact or on the ground. Bite it to pop it.
  missile(pos, dir, { speed = 6.5, turn = 2.0, life = 4.2, groundY = 0 } = {}) {
    const G = pgeo();
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(G.rocket, G.mRocket), new THREE.Mesh(G.nose, G.mNose));
    for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(G.fin, G.mFin); f.rotation.z = i * Math.PI / 2; mesh.add(f); }
    const flame = new THREE.Mesh(G.flame, G.mFlame);
    mesh.add(flame);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(dir));
    audio.play('missile');
    return this._add({ kind: 'missile', mesh, flame, vel: dir.clone().normalize().multiplyScalar(speed), speed, turn, life, r: 0.42, death: 'puff', groundY, biteable: true, t: 0 });
  }

  // Egg bomb: bounces to a stop, beeps 3-2-1 under a warning ring, then blows up.
  eggBomb(pos, vel, { groundY = 0, fuse = 2.4, radius = 2.3 } = {}) {
    const G = pgeo();
    const mesh = new THREE.Group();
    const shell = new THREE.Mesh(G.egg, G.mEgg);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), G.mBlink.clone());
    blink.position.set(0, 0.5, 0);
    mesh.add(shell, blink);
    const count = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('3'), transparent: true, depthTest: false }));
    count.scale.setScalar(0.9); count.position.y = 1.3; count.renderOrder = 20;
    mesh.add(count);
    mesh.position.copy(pos);
    const marker = makeMarker(radius);
    marker.position.set(pos.x, groundY + 0.05, pos.z);
    marker.visible = false;
    return this._add({ kind: 'egg', mesh, marker, blink, count, vel: vel.clone(), life: 99, fuse, fuseMax: fuse, r: 0.5, radius, death: 'puff', groundY, shown: 0 });
  }

  // Giant yarn ball that rolls across the arena and rebounds off the walls. Jump over it (or bounce on it).
  roller(pos, dir, { radius = 1.1, speed = 7, life = 6.5, bound = 10.5, groundY = 0, color = 0xe8467a } = {}) {
    const G = pgeo();
    const mesh = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(G.ball, toon(color)));
    const dark = toon(new THREE.Color(color).offsetHSL(0, 0, -0.12).getHex());
    for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(G.wrap, dark); w.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI)); spin.add(w); }
    spin.scale.setScalar(radius);
    mesh.add(spin);
    mesh.position.set(pos.x, groundY + radius, pos.z);
    const d = dir.clone().setY(0).normalize();
    return this._add({ kind: 'roller', mesh, spin, vel: d.multiplyScalar(speed), life, r: radius, radius, bound, groundY, death: 'flat', t: 0 });
  }

  // Three claw marks skimming along the floor. Jump them.
  clawWave(pos, dir, { speed = 9, life = 1.7, groundY = 0 } = {}) {
    const G = pgeo();
    const mesh = new THREE.Mesh(G.slash, new THREE.MeshBasicMaterial({ map: slashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const d = dir.clone().setY(0).normalize();
    mesh.position.set(pos.x, groundY + 0.5, pos.z);
    mesh.rotation.y = Math.atan2(d.x, d.z);
    audio.play('slash');
    return this._add({ kind: 'claw', mesh, vel: d.multiplyScalar(speed), dir: d.clone(), life, r: 1.2, groundY, death: 'angel' });
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
      } else if (pr.kind === 'missile') {
        pr.t += dt;
        // steer toward Nobu's chest with a limited turn rate
        const want = pc.clone().sub(pr.mesh.position).normalize().multiplyScalar(pr.speed);
        pr.vel.lerp(want, Math.min(1, pr.turn * dt)).setLength(pr.speed);
        pr.mesh.position.addScaledVector(pr.vel, dt);
        pr.mesh.lookAt(pr.mesh.position.clone().add(pr.vel));
        pr.flame.scale.set(1, 1, 0.8 + Math.random() * 0.5);
        if (Math.random() < dt * 30) {
          const b = pr.mesh.position.clone().addScaledVector(pr.vel, -0.12);
          this.game.fx.smokeCard(b.x, b.y, b.z, { size: 0.16, life: 0.6, colors: [0xffd080, 0x8a8090], grow: 2, g: -0.6, alpha: 0.85 });
        }
        if (biting && pr.mesh.position.distanceTo(new THREE.Vector3(p.pos.x + p.forward.x * 0.75, p.pos.y + 0.75, p.pos.z + p.forward.z * 0.75)) < 1.1) {
          this.game.fx.explosion(pr.mesh.position.x, pr.mesh.position.y - 0.5, pr.mesh.position.z, { radius: 1.2 });
          audio.play('chompHit');
          pr.life = 0;
        } else if (pc.distanceTo(pr.mesh.position) < pr.r + 0.38 || pr.mesh.position.y < pr.groundY + 0.25 || pr.life <= 0) {
          this._boom(pr.mesh.position, 1.6, pr.groundY);
          pr.life = 0;
        }
      } else if (pr.kind === 'egg') {
        const m = pr.mesh.position;
        pr.vel.y -= 22 * dt;
        m.addScaledVector(pr.vel, dt);
        if (m.y < pr.groundY + 0.52) {
          m.y = pr.groundY + 0.52;
          if (pr.vel.y < -2) audio.play('knock');
          pr.vel.y = Math.abs(pr.vel.y) * 0.45;
          pr.vel.x *= 0.7; pr.vel.z *= 0.7;
          pr.landed = true;
        }
        pr.mesh.rotation.z = Math.sin(pr.fuse * 9) * 0.15;
        if (pr.landed) {
          pr.fuse -= dt;
          pr.marker.visible = true;
          pr.marker.position.set(m.x, pr.groundY + 0.05, m.z);
          pr.marker.material.opacity = 0.55 + Math.sin(pr.fuse * 24) * 0.35;
          const n = Math.max(1, Math.ceil((pr.fuse / pr.fuseMax) * 3));
          if (n !== pr.shown) {
            pr.shown = n;
            pr.count.material.map = textTexture(String(n), { color: n === 1 ? '#ff5050' : '#ffd23f' });
            pr.count.material.needsUpdate = true;
            audio.play('tick');
          }
          const on = Math.sin(pr.fuse * (30 - pr.fuse * 8)) > 0;
          pr.blink.material.color.setHex(on ? 0xff3030 : 0x401010);
          const sq = 1 + Math.max(0, 0.6 - pr.fuse) * 0.6;
          pr.mesh.scale.set(sq, 2 - sq, sq);
          if (pr.fuse <= 0) {
            this._boom(m, pr.radius, pr.groundY);
            pr.life = 0;
          }
        }
      } else if (pr.kind === 'roller') {
        pr.t += dt;
        const m = pr.mesh.position;
        m.addScaledVector(pr.vel, dt);
        m.y = pr.groundY + pr.radius;
        let bounced = false;
        if (Math.abs(m.x) > pr.bound) { m.x = Math.sign(m.x) * pr.bound; pr.vel.x *= -1; bounced = true; }
        if (Math.abs(m.z) > pr.bound) { m.z = Math.sign(m.z) * pr.bound; pr.vel.z *= -1; bounced = true; }
        if (bounced) { audio.play('boing'); this.game.fx.dust(m.x, pr.groundY, m.z, { count: 4, size: 0.4, color: 0xf0d0a0, speed: 2 }); }
        // roll: spin around the axis perpendicular to travel
        const sp = pr.vel.length();
        const axis = new THREE.Vector3(pr.vel.z, 0, -pr.vel.x).normalize();
        pr.spin.rotateOnWorldAxis(axis, (sp / pr.radius) * dt);
        if (Math.random() < dt * 8) this.game.fx.dust(m.x, pr.groundY, m.z, { count: 1, size: 0.3, color: 0xf0d0a0, speed: 1 });
        const s = pr.life < 0.4 ? Math.max(0.01, pr.life / 0.4) : Math.min(1, pr.t / 0.25);
        pr.mesh.scale.setScalar(s);
        const dh = Math.hypot(p.pos.x - m.x, p.pos.z - m.z);
        const top = pr.groundY + pr.radius * 2;
        if (dh < pr.radius + 0.35 && !p.dead) {
          if (p.vel.y < 0 && p.pos.y > top - 0.45) p.bounce(TUNING.STOMP_BOUNCE); // bounce off the top
          else if (p.pos.y < top - 0.5) hit = true;
        }
      } else if (pr.kind === 'claw') {
        pr.mesh.position.addScaledVector(pr.vel, dt);
        pr.mesh.material.opacity = Math.min(1, pr.life * 3);
        const rx = p.pos.x - pr.mesh.position.x, rz = p.pos.z - pr.mesh.position.z;
        const along = rx * pr.dir.x + rz * pr.dir.z, side = Math.abs(rx * pr.dir.z - rz * pr.dir.x);
        if (Math.abs(along) < 0.45 && side < 1.15 && p.pos.y - pr.groundY < 0.7) hit = true;
        if (Math.random() < dt * 20) this.game.fx.sparkle(pr.mesh.position.x + rand(-1, 1) * pr.dir.z, pr.groundY + 0.2, pr.mesh.position.z - rand(-1, 1) * pr.dir.x, { count: 1, color: 0xffb0e0, size: 0.4, speed: 1, up: 1 });
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
        if (pr.kind !== 'wave' && pr.kind !== 'drop' && pr.kind !== 'roller' && pr.kind !== 'claw') pr.life = 0;
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

  _boom(at, radius, groundY) {
    const p = this.game.player;
    this.game.fx.explosion(at.x, Math.max(groundY, at.y - 0.6), at.z, { radius });
    audio.play('explosion');
    this.game.camera.shake(0.35, 0.3);
    const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
    if (!p.dead && d < radius && Math.abs(p.pos.y + 0.6 - at.y) < radius + 0.6) p.hurt('puff', at.x, at.z);
  }
}

// ---------- laser beam (visor / eye lasers) ----------
// A glowing line from a source to a point on the floor; the hot spot on the floor burns.
export class Beam {
  constructor(scene, color = 0xff3050) {
    this.group = new THREE.Group();
    const unit = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.core = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.core, this.glow, this.spot);
    this.group.visible = false;
    this.color = color;
    scene.add(this.group);
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
  }
  // aim: thin and dim (telegraph). fire: thick, flickering, burns.
  set(from, to, firing, t = 0) {
    this.group.visible = true;
    this.from.copy(from); this.to.copy(to);
    const len = from.distanceTo(to);
    for (const [m, w] of [[this.core, firing ? 0.07 : 0.015], [this.glow, firing ? 0.2 + Math.sin(t * 60) * 0.04 : 0.04]]) {
      m.position.copy(from);
      m.lookAt(to);
      m.scale.set(w, w, len);
    }
    this.glow.material.opacity = firing ? 0.6 : 0.3 + Math.sin(t * 30) * 0.15;
    this.spot.position.set(to.x, to.y + 0.04, to.z);
    this.spot.scale.setScalar(firing ? 1 + Math.sin(t * 40) * 0.12 : 0.5);
  }
  hide() { this.group.visible = false; }
  // true when Nobu stands in the hot spot (jumping clears it)
  hits(p, r = 0.75) {
    return Math.hypot(p.pos.x - this.to.x, p.pos.z - this.to.z) < r && p.pos.y - this.to.y < 0.9;
  }
  dispose(scene) { scene.remove(this.group); }
}

let _slashTex;
function slashTexture() {
  _slashTex ||= canvasTex(256, 128, (g) => {
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = 50 + i * 78;
      const grd = g.createLinearGradient(x - 30, 0, x + 30, 128);
      grd.addColorStop(0, 'rgba(255,120,220,0)'); grd.addColorStop(0.5, 'rgba(255,230,250,1)'); grd.addColorStop(1, 'rgba(255,120,220,0)');
      g.strokeStyle = 'rgba(255,90,200,0.55)'; g.lineWidth = 22;
      g.beginPath(); g.moveTo(x - 26, 110); g.quadraticCurveTo(x + 8, 64, x + 26, 14); g.stroke();
      g.strokeStyle = grd; g.lineWidth = 9;
      g.beginPath(); g.moveTo(x - 26, 110); g.quadraticCurveTo(x + 8, 64, x + 26, 14); g.stroke();
    }
  });
  return _slashTex;
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
    // rechargeable ultimate: the SPECIAL gauge fills over time (faster each phase, and a bit with every hit)
    this.charge = 0;
    this.chargeTimes = [0, 26, 20, 15]; // seconds to fill, per phase
    this.ulting = false;
  }

  get ultReady() { return this.charge >= 1 && !this.ulting; }

  // call when the ultimate starts / ends
  beginUlt() { this.ulting = true; }
  endUlt() { this.ulting = false; this.charge = 0; this.game.ui.bossCharge(0, false); }

  // Power-up flourish while charging the ultimate: glowing body, sparks pulled in, pulsing rings on the floor.
  powerUp(dt, k, color = 0xffd23f, y = 1.5, groundY = 0) {
    const c = new THREE.Color(color);
    const pulse = (0.35 + 0.35 * Math.sin(this.stateT * (14 + k * 20))) * k;
    for (const m of this.meshes) m.material.emissive.setRGB(c.r * pulse, c.g * pulse, c.b * pulse);
    const fx = this.fx;
    if (Math.random() < dt * (30 + k * 40)) {
      const a = rand(0, Math.PI * 2), r = rand(3, 5.5), h = rand(-1.5, 2.5);
      const sx = this.pos.x + Math.cos(a) * r, sy = this.pos.y + y + h, sz = this.pos.z + Math.sin(a) * r;
      const life = 0.45;
      fx.sparks.spawn({ x: sx, y: sy, z: sz, vx: (this.pos.x - sx) / life, vy: (this.pos.y + y - sy) / life, vz: (this.pos.z - sz) / life, rx: 0, ry: 0, sx: 0, sy: 0, size: rand(0.35, 0.7), color, life, max: life, g: 0, drag: 1 });
    }
    this.ringT = (this.ringT || 0) - dt;
    if (this.ringT <= 0) { this.ringT = 0.35 - k * 0.15; fx.shock(this.pos.x, groundY, this.pos.z, { radius: 4.5 - k * 2, color, life: 0.4, k: 0.7, start: 1.2 }); }
  }
  clearGlow() { for (const m of this.meshes) m.material.emissive.setRGB(0, 0, 0); }
  // safety: if an ultimate was ever cut short, don't leave the gauge locked
  cancelUlt() { if (this.ulting) { this.ulting = false; this.ultStarted = false; this.glowCleared = false; this.clearGlow(); } }

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
    if (!this.ulting) { this.charge = Math.min(1, this.charge + 0.15); this.game.ui.bossCharge(this.charge, this.charge >= 1); }
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
    this.ulting = false;
    this.charge = 0;
    this.game.ui.bossCharge(0, false);
    this.onResetPhase?.();
  }

  update(dt) {
    this.hitCool = Math.max(0, this.hitCool - dt);
    this.stateT += dt;
    this.flash(dt);
    if (this.active && !this.defeated && !this.ulting && this.charge < 1) {
      this.charge = Math.min(1, this.charge + dt / this.chargeTimes[Math.min(3, this.phase)]);
      this.game.ui.bossCharge(this.charge, this.charge >= 1);
      if (this.charge >= 1) audio.play('charge');
    }
    // gauge full: a warning shimmer until the boss gets the chance to unleash it
    if (this.ultReady && this.active && this.flashT <= 0 && Math.random() < dt * 12) this.fx.sparkle(this.pos.x + rand(-1.2, 1.2), this.pos.y + rand(0, 2.5), this.pos.z + rand(-1.2, 1.2), { count: 1, color: 0xffe14a, size: 0.5, speed: 1, up: 2 });
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
