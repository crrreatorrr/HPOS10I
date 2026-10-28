// Simple AABB collision world. Solids are axis-aligned boxes; bodies are feet-anchored boxes.
// Static solids live in a spatial hash along Z (levels are long corridors); moving solids are checked always.

const CELL = 6;
const EPS = 0.001;
export const STEP_HEIGHT = 0.36;

export class Solid {
  constructor(min, max, opts = {}) {
    this.min = { ...min };
    this.max = { ...max };
    this.kind = opts.kind || 'static';     // static | moving | breakable | hazard
    this.ref = opts.ref || null;           // owning entity (breakables, platforms)
    this.conveyor = opts.conveyor || null; // {x, z} m/s applied to grounded bodies
    this.delta = { x: 0, y: 0, z: 0 };     // movement this frame (moving solids)
    this.enabled = true;
    this.slippery = !!opts.slippery;
  }
  setCenter(x, y, z, w, h, d) {
    const nx = x - w / 2, ny = y, nz = z - d / 2;
    this.delta.x += nx - this.min.x; this.delta.y += ny - this.min.y; this.delta.z += nz - this.min.z;
    this.min.x = nx; this.min.y = ny; this.min.z = nz;
    this.max.x = x + w / 2; this.max.y = y + h; this.max.z = z + d / 2;
  }
}

// Stand-in "solid" for the track ground so platform-riding code has something to point at.
export const TRACK_GROUND = { enabled: true, delta: { x: 0, y: 0, z: 0 }, conveyor: null, kind: 'track', max: { y: 0 } };

export class World {
  constructor() {
    this.track = null;
    this.buckets = new Map();
    this.moving = [];
    this.all = [];
    this._stamp = 0;
  }

  add(solid) {
    this.all.push(solid);
    if (solid.kind === 'moving') { this.moving.push(solid); return solid; }
    const z0 = Math.floor(solid.min.z / CELL), z1 = Math.floor(solid.max.z / CELL);
    for (let z = z0; z <= z1; z++) {
      if (!this.buckets.has(z)) this.buckets.set(z, []);
      this.buckets.get(z).push(solid);
    }
    return solid;
  }

  addBox(x, y, z, w, h, d, opts) {
    return this.add(new Solid({ x: x - w / 2, y, z: z - d / 2 }, { x: x + w / 2, y: y + h, z: z + d / 2 }, opts));
  }

  remove(solid) {
    solid.enabled = false;
  }

  beginFrame() {
    for (const m of this.moving) { m.delta.x = 0; m.delta.y = 0; m.delta.z = 0; }
  }

  query(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let z = z0; z <= z1; z++) {
      const b = this.buckets.get(z);
      if (!b) continue;
      for (const s of b) {
        if (s._stamp === stamp || !s.enabled) continue;
        s._stamp = stamp;
        if (s.min.x < maxX && s.max.x > minX && s.min.y < maxY && s.max.y > minY && s.min.z < maxZ && s.max.z > minZ) out.push(s);
      }
    }
    for (const s of this.moving) {
      if (!s.enabled) continue;
      if (s.min.x < maxX && s.max.x > minX && s.min.y < maxY && s.max.y > minY && s.min.z < maxZ && s.max.z > minZ) out.push(s);
    }
    return out;
  }

  // Highest solid top under (x, z) at or below y (for blob shadows / spawning).
  groundBelow(x, y, z, r = 0.2, hint = -1) {
    const hits = this.query(x - r, -100, z - r, x + r, y + 0.05, z + r, this._tmp || (this._tmp = []));
    let best = -Infinity;
    for (const s of hits) if (s.max.y <= y + 0.05 && s.max.y > best) best = s.max.y;
    if (this.track) {
      const pr = this.track.project(x, z, hint, this._pr || (this._pr = {}));
      const g = this.track.groundAt(pr.s, pr.u, this._g || (this._g = {}));
      if (g && g.y <= y + 0.05 && g.y > best) best = g.y;
    }
    return best;
  }
}

const scratch = [];

// Body: { pos:{x,y,z}, vel:{x,y,z}, hw, hd, h, grounded, ground, onLand(solid), onHead(solid) }
// Carry a grounded body with its moving platform. Call ONCE per frame (deltas are per frame).
export function rideGround(body) {
  if (body.grounded && body.ground && body.ground.enabled && body.ground.delta) {
    const d = body.ground.delta;
    body.pos.x += d.x; body.pos.y += d.y; body.pos.z += d.z;
  }
}

export function moveBody(world, body, dt) {
  // conveyors push every substep
  if (body.grounded && body.ground) {
    const g = body.ground;
    if (g.enabled && g.conveyor) { body.pos.x += g.conveyor.x * dt; body.pos.z += g.conveyor.z * dt; }
    if (g === TRACK_GROUND && body.groundSpan && body.groundSpan.conveyor && world.track) {
      const c = body.groundSpan.conveyor, t = world.track;
      const tan = t.tangent(body.s ?? 0, _cv1), rt = t.right(body.s ?? 0, _cv2);
      // conveyor {x: rightward, z: backward} in track space
      body.pos.x += (rt.x * c.x - tan.x * c.z) * dt;
      body.pos.z += (rt.z * c.x - tan.z * c.z) * dt;
    }
  }

  const wasGrounded = body.grounded;
  body.grounded = false;
  body.wallHit = false;
  const prevBottom = body.pos.y;
  const prevX = body.pos.x, prevZ = body.pos.z;

  // --- X axis
  body.pos.x += body.vel.x * dt;
  resolveHorizontal(world, body, 'x', body.vel.x, wasGrounded);
  // --- Z axis
  body.pos.z += body.vel.z * dt;
  resolveHorizontal(world, body, 'z', body.vel.z, wasGrounded);
  // --- Y axis
  body.pos.y += body.vel.y * dt;
  const hits = world.query(body.pos.x - body.hw, body.pos.y, body.pos.z - body.hd, body.pos.x + body.hw, body.pos.y + body.h, body.pos.z + body.hd, scratch);
  let landed = null;
  for (const s of hits) {
    if (body.vel.y <= 0 && prevBottom >= s.max.y - 0.25 + Math.min(0, s.delta.y)) {
      if (!landed || s.max.y > landed.max.y) landed = s;
    } else if (body.vel.y > 0 && prevBottom + body.h <= s.min.y + 0.25) {
      body.pos.y = s.min.y - body.h - EPS;
      body.vel.y = 0;
      if (body.onHead) body.onHead(s);
    }
  }
  if (landed) {
    body.pos.y = landed.max.y;
    const impact = body.vel.y;
    body.vel.y = 0;
    body.grounded = true;
    body.ground = landed;
    if (body.onLand) body.onLand(landed, impact, wasGrounded);
  } else if (wasGrounded && body.vel.y <= 0) {
    // snap down small steps so walking down stairs doesn't become a fall
    const below = world.query(body.pos.x - body.hw, body.pos.y - STEP_HEIGHT, body.pos.z - body.hd, body.pos.x + body.hw, body.pos.y - EPS, body.pos.z + body.hd, scratch);
    let top = -Infinity, sol = null;
    for (const s of below) if (s.max.y <= body.pos.y + EPS && s.max.y > top) { top = s.max.y; sol = s; }
    if (sol && body.pos.y - top < STEP_HEIGHT) {
      body.pos.y = top; body.vel.y = 0; body.grounded = true; body.ground = sol;
    }
  }
  if (world.track) resolveTrack(world, body, prevX, prevZ, prevBottom, wasGrounded);
  if (!body.grounded) body.ground = null;
}

const _cv1 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const _cv2 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const _pr = {};
const _gi = {};

// Track collision: side walls (lateral clamp) + ground spans (land / step up / block / snap down slopes).
function resolveTrack(world, body, prevX, prevZ, prevBottom, wasGrounded) {
  const t = world.track;
  const pr = t.project(body.pos.x, body.pos.z, body.trackHint ?? -1, _pr);
  body.trackHint = pr.i;
  body.s = pr.s; body.u = pr.u;
  const w = t.wallAt(pr.s);
  if (w) {
    const r = t.right(pr.s, _cv2);
    const hiLim = w.right - body.hw, loLim = -w.left + body.hw;
    let shift = 0;
    if (pr.u > hiLim) shift = hiLim - pr.u;
    else if (pr.u < loLim) shift = loLim - pr.u;
    if (shift) {
      body.pos.x += r.x * shift; body.pos.z += r.z * shift;
      body.u += shift;
      body.wallHit = true;
    }
  }
  let g = t.groundAt(body.s, body.u, _gi);
  if (g && body.pos.y < g.y) {
    const rise = g.y - prevBottom;
    if (body.vel.y <= 0 && prevBottom >= g.y - 0.3) {
      land(body, g.y, g.span, wasGrounded);
      return;
    }
    if (wasGrounded && rise <= STEP_HEIGHT + 0.05) {
      land(body, g.y, g.span, true);
      return;
    }
    if (rise > 0.3) {
      // walked into a ledge / log: block horizontal motion, then stand on whatever is under us now
      body.pos.x = prevX; body.pos.z = prevZ;
      body.wallHit = true;
      const pr2 = t.project(body.pos.x, body.pos.z, body.trackHint, _pr);
      body.s = pr2.s; body.u = pr2.u;
      g = t.groundAt(body.s, body.u, _gi);
      if (g && body.pos.y < g.y + 0.001 && prevBottom >= g.y - 0.3) { land(body, g.y, g.span, wasGrounded); return; }
      if (g && wasGrounded && body.vel.y <= 0 && body.pos.y - g.y < STEP_HEIGHT + 0.1) { land(body, g.y, g.span, true); return; }
      return;
    }
    land(body, g.y, g.span, wasGrounded);
    return;
  }
  if (!g) return;
  if (!body.grounded && wasGrounded && body.vel.y <= 0 && body.pos.y - g.y < STEP_HEIGHT + 0.1) {
    // follow downhill slopes / small drops instead of launching off them
    body.pos.y = g.y; body.vel.y = 0; body.grounded = true; body.ground = TRACK_GROUND; body.groundSpan = g.span;
  } else if (body.grounded && body.ground === TRACK_GROUND) {
    body.groundSpan = g.span;
  }
}

function land(body, gy, span, wasGrounded) {
  const impact = body.vel.y;
  body.pos.y = gy;
  body.vel.y = 0;
  const fresh = !body.grounded;
  body.grounded = true;
  body.ground = TRACK_GROUND;
  body.groundSpan = span;
  if (fresh && body.onLand && !wasGrounded) body.onLand(TRACK_GROUND, impact, wasGrounded);
}

function resolveHorizontal(world, body, axis, v, wasGrounded) {
  const h = axis === 'x' ? body.hw : body.hd;
  const hits = world.query(body.pos.x - body.hw, body.pos.y + EPS, body.pos.z - body.hd, body.pos.x + body.hw, body.pos.y + body.h, body.pos.z + body.hd, scratch);
  for (const s of hits) {
    // step up onto low ledges
    const rise = s.max.y - body.pos.y;
    if (wasGrounded && rise > 0 && rise <= STEP_HEIGHT && s.kind !== 'breakable' && headroom(world, body, s.max.y)) {
      body.pos.y = s.max.y;
      continue;
    }
    if (rise <= 0.02) continue;
    const c = axis === 'x' ? (s.min.x + s.max.x) / 2 : (s.min.z + s.max.z) / 2;
    const p = body.pos[axis];
    let dir = Math.sign(v);
    if (dir === 0) dir = p < c ? 1 : -1;
    if (dir > 0) body.pos[axis] = (axis === 'x' ? s.min.x : s.min.z) - h - EPS;
    else body.pos[axis] = (axis === 'x' ? s.max.x : s.max.z) + h + EPS;
    body.wallHit = true;
    if (body.onWall) body.onWall(s, axis);
  }
}

function headroom(world, body, y) {
  const hits = world.query(body.pos.x - body.hw, y + EPS, body.pos.z - body.hd, body.pos.x + body.hw, y + body.h, body.pos.z + body.hd, []);
  return hits.length === 0;
}
