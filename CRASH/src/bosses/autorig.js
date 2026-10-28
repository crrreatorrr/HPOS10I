// Procedural rigging for the static (unrigged) boss GLBs.
// The model is turned to face +z, a skeleton is built from a joint list, and every vertex gets skin weights
// from a per-boss `weigh(x, y, z)` function. Bosses then pose the bones procedurally each frame.
//
// Joint positions and `weigh` use "model units": the model scaled to 4 units tall, feet at y = 0, facing +z.
import * as THREE from 'three';

export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Distance from point p to segment ab (arrays [x, y, z]); also returns the 0..1 position along it.
export function segDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}

// Share weight `w` across a chain of bones by distance to each bone's segment (smooth at the joints).
export function chain(out, p, names, joints, end, w) {
  if (w <= 0) return;
  const ds = names.map((n, i) => segDist(p, joints[n], i + 1 < names.length ? joints[names[i + 1]] : end).d);
  const inv = ds.map((d) => 1 / Math.pow(d + 0.05, 4));
  const sum = inv.reduce((a, b) => a + b, 0);
  names.forEach((n, i) => { out[n] = (out[n] || 0) + (w * inv[i]) / sum; });
}

/**
 * @param model   Group from Assets.model(id, height)
 * @param height  the height the model was scaled to
 * @param joints  { name: [x, y, z] } in model units
 * @param parents { name: parentName | null }
 * @param weigh   (x, y, z) => { boneName: weight } in model units (normalized here, top 4 kept)
 * @param yaw     rotation that turns the raw model to face +z
 */
export function autoRig(model, { height, joints, parents, weigh, yaw = -Math.PI / 2 }) {
  let src = null;
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isMesh && !src) src = o; });
  if (!src) return null;
  // bake the mesh into the model's own space (keeping the model's scale; its position stays on the group)
  const geo = src.geometry.clone();
  const rel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(src.matrixWorld);
  geo.applyMatrix4(rel);
  geo.applyMatrix4(new THREE.Matrix4().makeScale(model.scale.x, model.scale.y, model.scale.z));
  geo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
  const k = height / 4;
  const names = Object.keys(joints);
  const index = Object.fromEntries(names.map((n, i) => [n, i]));
  // skin weights
  const pos = geo.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = weigh(pos.getX(i) / k, pos.getY(i) / k, pos.getZ(i) / k);
    const list = Object.entries(w).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((a, [, v]) => a + v, 0) || 1;
    if (!list.length) list.push([names[0], 1]);
    list.forEach(([b, v], j) => { si[i * 4 + j] = index[b]; sw[i * 4 + j] = v / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  // bones (rest pose = no rotation, so posing is just setting rotations)
  const bones = {};
  for (const nm of names) { bones[nm] = new THREE.Bone(); bones[nm].name = nm; }
  const roots = [];
  for (const nm of names) {
    const p = parents[nm];
    const j = joints[nm], pj = p ? joints[p] : [0, 0, 0];
    bones[nm].position.set((j[0] - pj[0]) * k, (j[1] - pj[1]) * k, (j[2] - pj[2]) * k);
    if (p) bones[p].add(bones[nm]); else roots.push(bones[nm]);
  }
  const mat = src.material.clone();
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  for (const r of roots) mesh.add(r);
  mesh.bind(new THREE.Skeleton(names.map((nm) => bones[nm])));
  model.clear();
  model.scale.setScalar(1);
  model.add(mesh);
  return { mesh, bones, k };
}

// Ease bone rotations toward a target pose: pose = { bone: [x, y, z] }; bones missing from the pose relax to 0.
export function blendPose(bones, pose, rate, dt) {
  const a = 1 - Math.exp(-rate * dt);
  for (const [nm, b] of Object.entries(bones)) {
    const t = pose[nm] || ZERO;
    b.rotation.x += (t[0] - b.rotation.x) * a;
    b.rotation.y += (t[1] - b.rotation.y) * a;
    b.rotation.z += (t[2] - b.rotation.z) * a;
  }
}
const ZERO = [0, 0, 0];
