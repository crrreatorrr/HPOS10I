// The Sproto Mask, a 3D guardian that behaves like a classic tiki-mask helper:
// floats behind Nobu's shoulder on a springy, lagging follow, banks into motion, faces where he's heading
// (and turns to the camera when he idles). 1 mask = one free hit, 2 = golden aura, 3 = it covers Nobu's face
// for ~20s of invincibility with a rainbow trail.
import * as THREE from 'three';
import { Assets } from '../art/assets.js';
import { canvasTex, rand } from '../core/util.js';

let glowTex;
function glowTexture() {
  glowTex ||= canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,240,170,1)');
    grd.addColorStop(0.4, 'rgba(255,200,80,0.6)');
    grd.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}

// Flat fallback (curved plane with the face art) when the 3D model isn't available.
export function maskMesh(size = 0.95) {
  const m3d = Assets.model('model_sproto_mask', size);
  if (m3d) return m3d;
  const geo = new THREE.PlaneGeometry(size, size, 8, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / size, y = pos.getY(i) / size;
    pos.setZ(i, -(x * x) * 0.45 * size - (y * y) * 0.15 * size);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: Assets.tex('sproto_mask'), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: 0x331100 });
  const mesh = new THREE.Mesh(geo, mat);
  const g = new THREE.Group();
  mesh.position.y = size / 2;
  g.add(mesh);
  return g;
}

const _t = new THREE.Vector3();
const _a = new THREE.Vector3();

export class SprotoMask {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.size = 0.55; // about the size of Nobu's head
    this.model = maskMesh(this.size);
    this.model.position.y = -this.size / 2; // pivot around the middle of the face
    this.inner.add(this.model);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.scale.setScalar(1.3);
    this.root.add(this.glow);
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.8 }));
    this.root.add(this.aura);
    this.orbs = [];
    for (let i = 0; i < 3; i++) {
      const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
      this.root.add(o);
      this.orbs.push(o);
    }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.level = 0;
    this.t = 0;
    this.spin = 0;
    this.pop = 0;
    this.yaw = 0;
    this.leaving = -1;
    this.root.visible = false;
  }

  attach(scene) { scene.add(this.root); }

  setLevel(n, prev) {
    if (n < prev && n === 0) { this.leaving = 0; this.vel.set(rand(-2, 2), 5, rand(-2, 2)); return; }
    if (n !== prev) this.spin = 1;      // a hit or a pickup: show-off spin
    if (n > prev) this.pop = 1;
    this.level = n;
    if (n > 0) { this.leaving = -1; this.root.visible = true; this.setOpacity(1); }
  }

  setOpacity(a) {
    this.model.traverse((o) => { if (o.isMesh) { o.material.transparent = a < 1; o.material.opacity = a; } });
  }

  snapTo(player) {
    this._target(player, _t);
    this.pos.copy(_t);
    this.vel.set(0, 0, 0);
    this.root.position.copy(this.pos);
  }

  _target(player, out) {
    const inv = this.game.session?.invincibleT > 0;
    const f = player.facing;
    const fx = Math.sin(f), fz = Math.cos(f);      // forward
    const rx = -fz, rz = fx;                        // right... (+90°) from forward
    if (inv) {
      // covers Nobu's face
      out.set(player.pos.x + fx * 0.55, player.pos.y + 1.25, player.pos.z + fz * 0.55);
    } else {
      // behind Nobu's right shoulder
      out.set(player.pos.x + rx * 0.62 - fx * 0.4, player.pos.y + 1.45, player.pos.z + rz * 0.62 - fz * 0.4);
    }
    out.y += Math.sin(this.t * 3) * 0.1;
    return out;
  }

  update(dt, player, camera) {
    this.t += dt;
    if (this.leaving >= 0) {
      // the last mask flies off spinning and fades away
      this.leaving += dt;
      this.vel.y -= 4 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.root.position.copy(this.pos);
      this.inner.rotation.y += dt * 16;
      this.inner.rotation.z += dt * 6;
      this.setOpacity(Math.max(0, 1 - this.leaving * 1.3));
      this.glow.visible = this.aura.visible = false;
      this.orbs.forEach((o) => (o.visible = false));
      if (this.leaving > 0.9) { this.root.visible = false; this.leaving = -1; this.level = 0; this.inner.rotation.set(0, 0, 0); }
      return;
    }
    if (this.level <= 0 || player.dead) { if (player.dead && this.level > 0) this.root.visible = false; return; }
    this.root.visible = true;
    const inv = this.game.session?.invincibleT > 0;

    // springy, slightly underdamped follow (floaty overshoot)
    this._target(player, _t);
    const k = inv ? 140 : 55, c = inv ? 20 : 10;
    _a.copy(_t).sub(this.pos).multiplyScalar(k).addScaledVector(this.vel, -c);
    this.vel.addScaledVector(_a, dt);
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.distanceTo(_t) > 6) { this.pos.copy(_t); this.vel.set(0, 0, 0); }
    this.root.position.copy(this.pos);

    // facing: where Nobu is heading; turn to the camera when he idles
    const toCam = Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z);
    const idle = player.idleTime > 0.8;
    let want = inv ? player.facing : idle ? toCam : player.facing + angleDiff(player.facing, toCam) * 0.45;
    this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 6);
    // bank with sideways motion, nod with vertical motion
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lateral = this.vel.dot(right);
    let spinY = 0;
    if (this.spin > 0) { this.spin = Math.max(0, this.spin - dt * 1.6); spinY = (1 - this.spin) * Math.PI * 4; }
    this.inner.rotation.set(-this.vel.y * 0.04 + Math.sin(this.t * 2.3) * 0.06, this.yaw + spinY, -lateral * 0.06 + Math.sin(this.t * 1.7) * 0.08, 'YXZ');
    // pickup pop
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 2.5);
    const base = inv ? 1.3 : this.level >= 2 ? 1.06 : 1;
    this.inner.scale.setScalar(base * (1 + Math.sin(this.pop * Math.PI) * 0.35));

    // level 2+: golden aura and orbiting sparkles; level 3: rainbow + trail
    const glowOn = this.level >= 2 || inv;
    this.glow.visible = glowOn;
    this.aura.visible = glowOn;
    this.orbs.forEach((o, i) => {
      o.visible = glowOn;
      const a = this.t * 3 + (i / 3) * Math.PI * 2;
      o.position.set(Math.cos(a) * 0.46, Math.sin(a * 1.3) * 0.16, Math.sin(a) * 0.46);
    });
    if (glowOn) {
      const pulse = 1 + Math.sin(this.t * 6) * 0.12;
      this.glow.scale.setScalar((inv ? 2.0 : 1.3) * pulse);
      const col = inv ? new THREE.Color().setHSL((this.t * 0.6) % 1, 1, 0.65) : new THREE.Color(0xffc040);
      this.glow.material.color.copy(col);
      this.aura.material.color.copy(col);
      this.aura.rotation.set(Math.PI / 2 + Math.sin(this.t) * 0.3, 0, this.t * 2);
      this.aura.scale.setScalar(inv ? 1.3 : 1);
    }
    if (inv && this.game.fx && Math.random() < dt * 40) {
      this.game.fx.sparkle(this.pos.x, this.pos.y, this.pos.z, { count: 1, color: new THREE.Color().setHSL(Math.random(), 1, 0.6).getHex(), size: 0.55, speed: 1, up: 0.4 });
    }
  }
}

function angleDiff(a, b) {
  let d = b - a;
  return Math.atan2(Math.sin(d), Math.cos(d));
}
