// Spline track: the winding, rolling path a level is built along.
// Level content is authored in track coordinates: d = distance along the path, u = lateral offset
// (positive = right when facing forward), y = height above the path.
// The track also provides collision: ground spans (with gaps, ramps, lanes) and side walls.
import * as THREE from 'three';

const STEP = 0.5;
const UP = new THREE.Vector3(0, 1, 0);

// Build control points from turtle moves: [length, turnDegrees, climb]. Heading 0 = toward -Z.
export function turtle(start, moves, heading = 0) {
  const pts = [new THREE.Vector3(...start)];
  let x = start[0], y = start[1], z = start[2], h = heading;
  for (const [len, turn = 0, climb = 0] of moves) {
    const n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i < n; i++) {
      h += (turn * Math.PI / 180) / n;
      x += Math.sin(h) * (len / n);
      z += -Math.cos(h) * (len / n);
      y += climb / n;
      pts.push(new THREE.Vector3(x, y, z));
    }
  }
  return pts;
}

export class Track {
  constructor(points) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.length = this.curve.getLength();
    const n = Math.ceil(this.length / STEP);
    this.n = n;
    const pts = this.curve.getSpacedPoints(n);
    this.px = new Float32Array(n + 1); this.py = new Float32Array(n + 1); this.pz = new Float32Array(n + 1);
    this.tx = new Float32Array(n + 1); this.tz = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) {
      this.px[i] = pts[i].x; this.py[i] = pts[i].y; this.pz[i] = pts[i].z;
    }
    for (let i = 0; i <= n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    this.step = this.length / n;
    this.spans = [];
    this.wallKeys = [];
    this.triggers = [];
    this.waters = [];
  }

  // Water zones: dropping into the water is a fall-out (like a pit).
  waterZone(d0, d1, y) { this.waters.push({ d0, d1, y }); }
  waterAt(s) { for (const w of this.waters) if (s >= w.d0 && s <= w.d1) return this.heightAt(s) + w.y; return null; }

  // ---------- sampling ----------
  _idx(s) {
    const f = Math.max(0, Math.min(this.n, s / this.step));
    const i = Math.min(this.n - 1, Math.floor(f));
    return [i, f - i];
  }
  // Point on the centerline (+ lateral u, + height y), world space. Extends linearly past the ends.
  toWorld(s, u = 0, y = 0, out = new THREE.Vector3()) {
    let extra = 0;
    if (s < 0) { extra = s; s = 0; } else if (s > this.length) { extra = s - this.length; s = this.length; }
    const [i, t] = this._idx(s);
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * t;
    const yy = this.py[i] + (this.py[i + 1] - this.py[i]) * t;
    const z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t;
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    const nx = tx / l, nz = tz / l;
    // right = (-tz, tx)
    return out.set(x + nx * extra - nz * u, yy + y, z + nz * extra + nx * u);
  }
  heightAt(s) {
    s = Math.max(0, Math.min(this.length, s));
    const [i, t] = this._idx(s);
    return this.py[i] + (this.py[i + 1] - this.py[i]) * t;
  }
  tangent(s, out = new THREE.Vector3()) {
    s = Math.max(0, Math.min(this.length, s));
    const [i, t] = this._idx(s);
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    return out.set(tx / l, 0, tz / l);
  }
  right(s, out = new THREE.Vector3()) {
    const t = this.tangent(s, out);
    return out.set(-t.z, 0, t.x);
  }
  // Yaw (rotation.y) that faces forward along the track.
  yaw(s) { const t = this.tangent(s); return Math.atan2(t.x, t.z); }

  // Nearest (s, u) for a world point. `hint` = sample index to search around.
  project(x, z, hint = -1, out = {}) {
    let best = -1, bestD = Infinity;
    const scan = (a, b) => {
      for (let i = Math.max(0, a); i <= Math.min(this.n, b); i++) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    if (hint >= 0) scan(hint - 40, hint + 40);
    if (best < 0 || bestD > 400) { bestD = Infinity; scan(0, this.n); }
    const i = best;
    const dx = x - this.px[i], dz = z - this.pz[i];
    const along = dx * this.tx[i] + dz * this.tz[i];
    out.i = i;
    out.s = Math.max(-50, i * this.step + along);
    if (i === 0 && along < 0) out.s = along;
    out.u = (dx - this.tx[i] * along) * -this.tz[i] + (dz - this.tz[i] * along) * this.tx[i];
    return out;
  }

  // ---------- authoring ----------
  // Ground span [d0, d1] of width w centred at lateral u. dy may be a number or [start, end] (ramp).
  ground(d0, d1, opts = {}) {
    const sp = { d0: Math.min(d0, d1), d1: Math.max(d0, d1), w: opts.w ?? 8.6, u: opts.u ?? 0, dy: opts.dy ?? 0, style: opts.style || 'ground', depth: opts.depth ?? 7, conveyor: opts.conveyor || null, visible: opts.visible !== false, slippery: !!opts.slippery };
    this.spans.push(sp);
    return sp;
  }
  // Wall profile keyframe: at distance d the walls sit at -left / +right with height h. Interpolated.
  wall(d, left, right = left, h = 2.6) { this.wallKeys.push({ d, left, right, h }); this.wallKeys.sort((a, b) => a.d - b.d); }

  spanDy(sp, s) {
    if (typeof sp.dy === 'number') return sp.dy;
    const t = (s - sp.d0) / Math.max(0.001, sp.d1 - sp.d0);
    return sp.dy[0] + (sp.dy[1] - sp.dy[0]) * Math.max(0, Math.min(1, t));
  }

  // Highest ground under (s, u): { y, span } or null for a gap.
  groundAt(s, u, out = {}) {
    let best = null, by = -Infinity;
    for (const sp of this.spans) {
      if (sp.disabled || s < sp.d0 || s > sp.d1) continue;
      if (Math.abs(u - sp.u) > sp.w / 2) continue;
      const y = this.heightAt(s) + this.spanDy(sp, s);
      if (y > by) { by = y; best = sp; }
    }
    if (!best) return null;
    out.y = by; out.span = best;
    return out;
  }

  wallAt(s) {
    const k = this.wallKeys;
    if (!k.length || s < k[0].d || s > k[k.length - 1].d) return null;
    for (let i = 0; i < k.length - 1; i++) {
      if (s >= k[i].d && s <= k[i + 1].d) {
        const t = (s - k[i].d) / Math.max(0.001, k[i + 1].d - k[i].d);
        return { left: k[i].left + (k[i + 1].left - k[i].left) * t, right: k[i].right + (k[i + 1].right - k[i].right) * t, h: k[i].h + (k[i + 1].h - k[i].h) * t };
      }
    }
    return null;
  }

  trigger(d, fn) { this.triggers.push({ d, fn, fired: false }); }

  // ---------- meshes ----------
  buildMeshes(stage, mats) {
    const B = {};
    const bucket = (k) => (B[k] ||= { pos: [], uv: [], col: [], idx: [] });
    const v = new THREE.Vector3(), v2 = new THREE.Vector3();
    const quadStrip = (key, rows, tileU, tileV, shadeFn) => {
      // rows: [[p0, p1, vCoord], ...] each row two points; builds quads between consecutive rows
      const b = bucket(key);
      for (let r = 0; r < rows.length; r++) {
        const [a, c, vv, ua = 0, ub = 1] = rows[r];
        const base = b.pos.length / 3;
        b.pos.push(a.x, a.y, a.z, c.x, c.y, c.z);
        b.uv.push(ua / tileU, vv / tileV, ub / tileU, vv / tileV);
        const sa = shadeFn ? shadeFn(a, 0) : 1, sc = shadeFn ? shadeFn(c, 1) : 1;
        b.col.push(sa, sa, sa, sc, sc, sc);
        if (r > 0) b.idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
      }
    };
    // ground spans
    for (const sp of this.spans) {
      if (!sp.visible) continue;
      const topKey = sp.style === 'platform' ? 'platform' : sp.style === 'metal' ? 'platform' : 'ground';
      const sideKey = sp.style === 'platform' ? 'platform' : 'wall';
      const top = [], sideL = [], sideR = [];
      const segs = Math.max(1, Math.ceil((sp.d1 - sp.d0) / 0.75));
      for (let i = 0; i <= segs; i++) {
        const s = sp.d0 + ((sp.d1 - sp.d0) * i) / segs;
        const dy = this.spanDy(sp, s);
        const L = this.toWorld(s, sp.u - sp.w / 2, dy, new THREE.Vector3());
        const R = this.toWorld(s, sp.u + sp.w / 2, dy, new THREE.Vector3());
        top.push([L, R, s, sp.u - sp.w / 2, sp.u + sp.w / 2]);
        sideL.push([L.clone().setY(L.y - sp.depth), L, s, 0, sp.depth]);
        sideR.push([R, R.clone().setY(R.y - sp.depth), s, 0, sp.depth]);
      }
      quadStrip(topKey, top, 3, 3);
      quadStrip(sideKey, sideL, 3, 3, (p, k) => (k ? 0.95 : 0.4));
      quadStrip(sideKey, sideR, 3, 3, (p, k) => (k ? 0.4 : 0.95));
      // end caps (cliff faces at gaps)
      for (const [s, flip] of [[sp.d0, false], [sp.d1, true]]) {
        const dy = this.spanDy(sp, s);
        const L = this.toWorld(s, sp.u - sp.w / 2, dy, new THREE.Vector3());
        const R = this.toWorld(s, sp.u + sp.w / 2, dy, new THREE.Vector3());
        const rows = flip ? [[R, L, 0, 0, sp.w], [R.clone().setY(R.y - sp.depth), L.clone().setY(L.y - sp.depth), sp.depth, 0, sp.w]]
          : [[L, R, 0, 0, sp.w], [L.clone().setY(L.y - sp.depth), R.clone().setY(R.y - sp.depth), sp.depth, 0, sp.w]];
        quadStrip(sideKey, rows, 3, 3, (p) => (p.y < this.heightAt(s) + dy - 1 ? 0.45 : 0.95));
      }
    }
    // walls: inner face, top bank, outer drop for each side
    if (this.wallKeys.length > 1) {
      const d0 = this.wallKeys[0].d, d1 = this.wallKeys[this.wallKeys.length - 1].d;
      const segs = Math.ceil((d1 - d0) / 0.75);
      for (const side of [-1, 1]) {
        const inner = [], topRows = [], outer = [];
        for (let i = 0; i <= segs; i++) {
          const s = d0 + ((d1 - d0) * i) / segs;
          const w = this.wallAt(s);
          const half = side < 0 ? w.left : w.right;
          const hb = this.toWorld(s, side * half, -9, new THREE.Vector3());
          const ht = this.toWorld(s, side * half, w.h, new THREE.Vector3());
          const ot = this.toWorld(s, side * (half + 9), w.h, new THREE.Vector3());
          const ob = this.toWorld(s, side * (half + 9), -12, new THREE.Vector3());
          if (side < 0) {
            inner.push([hb, ht, s, 0, w.h + 9]);
            topRows.push([ot, ht, s, 0, 9]);
            outer.push([ob, ot, s, 0, w.h + 12]);
          } else {
            inner.push([ht, hb, s, 0, w.h + 9]);
            topRows.push([ht, ot, s, 0, 9]);
            outer.push([ot, ob, s, 0, w.h + 12]);
          }
        }
        quadStrip('wall', inner, 3, 3, (p) => Math.max(0.35, Math.min(1, 0.55 + (p.y - (this.heightAt(0) - 9)) * 0.03)));
        quadStrip('bank', topRows, 3, 3);
      }
    }
    const meshes = [];
    for (const [key, b] of Object.entries(B)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats[key === 'bank' ? 'ground' : key]);
      m.receiveShadow = true;
      m.castShadow = key === 'wall' || key === 'platform';
      stage.scene.add(m);
      meshes.push(m);
    }
    return meshes;
  }
}
