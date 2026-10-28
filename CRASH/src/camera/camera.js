// Fixed Crash-style cameras: behind (levels 1 & 3), front-facing chase (level 2), arena framing for bosses,
// and a cinematic mode for intros/defeats. Exposes a camera-relative movement basis for the player.
import * as THREE from 'three';
import { damp, rand } from '../core/util.js';

const _v = new THREE.Vector3();

export class GameCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(58, aspect, 0.1, 800);
    this.mode = 'behind';
    this.opts = {};
    this.pos = new THREE.Vector3(0, 5, 10);
    this.look = new THREE.Vector3();
    this.trackY = 0;
    this.trackX = 0;
    this.shakeT = 0;
    this.shakeDur = 0.0001;
    this.shakeAmp = 0;
    this.basis = { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), toCamera: 0 };
    this.cine = null;
  }

  setMode(mode, opts = {}) {
    this.mode = mode;
    this.opts = opts;
  }

  // Cinematic shot: fixed position/look, eased in.
  cinematic(pos, look, speed = 3) {
    this.cine = { pos: pos.clone(), look: look.clone(), speed };
  }
  endCinematic() { this.cine = null; }

  shake(amp, dur = 0.3) {
    if (amp >= this.shakeAmp * (this.shakeT / this.shakeDur)) {
      this.shakeAmp = amp; this.shakeT = dur; this.shakeDur = dur;
    }
  }

  _targets(player, out) {
    const p = player.pos;
    const o = this.opts;
    if (player.body.grounded || p.y < this.trackY) this.trackY = p.y;
    else if (p.y > this.trackY + 2.4) this.trackY = p.y - 2.4;
    const ty = this.trackY;
    if ((this.mode === 'track' || this.mode === 'trackFront') && o.track) {
      const tr = o.track;
      const sp = player.body.s ?? 0, u = player.body.u ?? 0;
      // keep the camera above the path itself (hills behind / ahead)
      if (this.mode === 'track') {
        const cs = sp - (o.dist ?? 8.6);
        tr.toWorld(cs, u * 0.55, 0, out.pos);
        out.pos.y = Math.max(ty + (o.height ?? 4.3), tr.heightAt(cs) + 2.2);
        tr.toWorld(sp + (o.ahead ?? 5.5), u * 0.8, 0, out.look);
        out.look.y = ty + 1.15;
      } else {
        const cs = sp + (o.dist ?? 12.5);
        tr.toWorld(cs, u * 0.5, 0, out.pos);
        out.pos.y = Math.max(ty + (o.height ?? 6.6), tr.heightAt(cs) + 3);
        tr.toWorld(sp - (o.behind ?? 0.5), u * 0.7, 0, out.look);
        out.look.y = ty + 1.0;
      }
      return;
    }
    if (this.mode === 'behind') {
      const cx = (o.centerX ?? 0) * 0.35 + p.x * 0.65;
      out.pos.set(cx, ty + (o.height ?? 4.4), p.z + (o.dist ?? 8.4));
      out.look.set(p.x * 0.85 + (o.centerX ?? 0) * 0.15, ty + 1.2, p.z - (o.ahead ?? 5));
    } else if (this.mode === 'front') {
      out.pos.set(p.x * 0.55, ty + (o.height ?? 5.6), p.z - (o.dist ?? 9.8));
      out.look.set(p.x * 0.7, ty + 1.0, p.z + (o.behind ?? 2.5));
    } else if (this.mode === 'arena') {
      const c = o.center || _v.set(0, 0, 0);
      const k = o.follow ?? 0.45;
      const fx = c.x + (p.x - c.x) * k, fz = c.z + (p.z - c.z) * k;
      const off = o.offset || { x: 0, y: 10, z: 15 };
      out.pos.set(fx + off.x, (o.baseY ?? 0) + off.y + Math.max(0, p.y - (o.baseY ?? 0)) * 0.4, fz + off.z);
      out.look.set(c.x + (p.x - c.x) * 0.6, (o.baseY ?? 0) + 1.2 + Math.max(0, p.y - (o.baseY ?? 0)) * 0.5, c.z + (p.z - c.z) * 0.6);
      if (o.focus) {
        const f = o.focus;
        out.look.lerp(f, o.focusWeight ?? 0.25);
      }
    }
  }

  snap(player) {
    const t = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.trackY = player.pos.y;
    this._targets(player, t);
    this.pos.copy(t.pos);
    this.look.copy(t.look);
    this._apply(0);
  }

  update(dt, player) {
    const t = this._t || (this._t = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    if (this.cine) {
      t.pos.copy(this.cine.pos); t.look.copy(this.cine.look);
      const k = this.cine.speed;
      this.pos.x = damp(this.pos.x, t.pos.x, k, dt); this.pos.y = damp(this.pos.y, t.pos.y, k, dt); this.pos.z = damp(this.pos.z, t.pos.z, k, dt);
      this.look.x = damp(this.look.x, t.look.x, k, dt); this.look.y = damp(this.look.y, t.look.y, k, dt); this.look.z = damp(this.look.z, t.look.z, k, dt);
    } else if (player) {
      this._targets(player, t);
      const k = this.mode === 'arena' ? 4 : 7;
      this.pos.x = damp(this.pos.x, t.pos.x, k, dt);
      this.pos.y = damp(this.pos.y, t.pos.y, 4.5, dt);
      this.pos.z = damp(this.pos.z, t.pos.z, k, dt);
      this.look.x = damp(this.look.x, t.look.x, k + 3, dt);
      this.look.y = damp(this.look.y, t.look.y, 6, dt);
      this.look.z = damp(this.look.z, t.look.z, k + 3, dt);
    }
    this._apply(dt);
    if (player) {
      const f = this.basis.forward.set(this.look.x - this.pos.x, 0, this.look.z - this.pos.z).normalize();
      this.basis.right.set(-f.z, 0, f.x);
      this.basis.toCamera = Math.atan2(this.cam.position.x - player.pos.x, this.cam.position.z - player.pos.z);
    }
  }

  _apply(dt) {
    this.cam.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / this.shakeDur);
      this.cam.position.x += rand(-a, a);
      this.cam.position.y += rand(-a, a);
      this.cam.position.z += rand(-a, a) * 0.5;
    }
    this.cam.lookAt(this.look);
  }
}
