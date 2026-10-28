// Golden Tickets: a static instanced field (spinning + bobbing) and flying tickets that home into Nobu.
import * as THREE from 'three';
import { Assets } from '../art/assets.js';
import { audio } from '../audio/audio.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class TicketSystem {
  constructor(game, stage) {
    this.game = game;
    this.stage = stage;
    this.list = [];       // static tickets {x,y,z,taken,seq}
    this.flying = [];
    const a = Assets.aspect('ticket') || 1.7;
    const h = 0.46;
    // a chunky 3D ticket: gold edges, the $Bitcoin art on both faces
    this.geo = new THREE.BoxGeometry(h * a * 0.94, h * 0.9, 0.07);
    const face = new THREE.MeshLambertMaterial({ map: Assets.tex('ticket'), emissive: 0x3a2a00 });
    const edge = new THREE.MeshPhongMaterial({ color: 0xf2b519, emissive: 0x5a3a00, specular: 0xffffff, shininess: 80 });
    this.mat = [edge, edge, edge, edge, face, face];
    this.mesh = null;
    this.flyPool = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.visible = false;
      stage.scene.add(m);
      this.flyPool.push(m);
    }
    this.t = 0;
  }

  add(x, y, z) { this.list.push({ x, y, z, taken: false, seq: 0 }); }

  // Lines and arcs for level authoring
  line(x0, y0, z0, x1, y1, z1, n) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      this.add(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
    }
  }
  arc(x0, y0, z0, x1, z1, height, n) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.add(x0 + (x1 - x0) * t, y0 + Math.sin(t * Math.PI) * height, z0 + (z1 - z0) * t);
    }
  }

  finalize() {
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, this.list.length));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.stage.scene.add(this.mesh);
    this.total = this.list.length;
  }

  spawnFlying(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const m = this.flyPool.find((f) => !f.visible);
      if (!m) { this.game.session.addTickets(1); continue; }
      m.visible = true;
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      this.flying.push({ m, vx: Math.cos(a) * 3, vy: 6 + Math.random() * 3, vz: Math.sin(a) * 3, t: -i * 0.06 });
    }
  }

  update(dt) {
    this.t += dt;
    const p = this.game.player;
    const px = p.pos.x, py = p.pos.y + 0.7, pz = p.pos.z;
    const canCollect = !p.dead;
    let n = 0;
    const spin = this.t * 3.2;
    for (const tk of this.list) {
      if (tk.taken) continue;
      const dz = tk.z - pz;
      if (dz > 70 || dz < -90) continue;
      if (canCollect) {
        const dx = tk.x - px, dy = tk.y - py;
        if (dx * dx + dy * dy + dz * dz < 0.95) {
          tk.taken = true;
          tk.seq = this.game.session.nextSeq();
          this.game.session.addTickets(1);
          audio.play('ticket');
          this.game.fx.sparkle(tk.x, tk.y, tk.z, { count: 4, color: 0xffe066, size: 0.4, speed: 2 });
          continue;
        }
      }
      _q.setFromAxisAngle(UP, spin + tk.x * 0.7 + tk.z * 0.3);
      _p.set(tk.x, tk.y + Math.sin(this.t * 3 + tk.z) * 0.08, tk.z);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      if (f.t < 0) continue;
      if (f.t < 0.35) {
        f.vy -= 20 * dt;
        f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      } else {
        // home into Nobu
        const k = Math.min(1, (f.t - 0.35) * 5);
        _p.set(px, py, pz).sub(f.m.position);
        const d = _p.length();
        _p.normalize().multiplyScalar(Math.min(d, (10 + k * 18) * dt));
        f.m.position.add(_p);
        if (d < 0.5 || f.t > 2.2) {
          f.m.visible = false;
          this.flying.splice(i, 1);
          this.game.session.addTickets(1);
          audio.play('ticket');
          continue;
        }
      }
      f.m.rotation.y += dt * 12;
    }
  }

  restoreAfter(seq) {
    for (const tk of this.list) if (tk.taken && tk.seq > seq) tk.taken = false;
  }

  clearFlying() {
    for (const f of this.flying) { f.m.visible = false; this.game.session.addTickets(1); }
    this.flying.length = 0;
  }
}
