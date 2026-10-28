// "Classic" Nobu built from Three.js primitives (fallback / alternative to the Higgsfield GLB).
// Faces +Z, feet at origin, ~1.5m tall. Applies poses from NobuAnimator.
import * as THREE from 'three';

let gradientMap;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}
export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

const C = {
  fur: 0xf7efe0, belly: 0xfffaf2, pink: 0xf2a0ae, nose: 0x161616, brow: 0x4a3a2c, eye: 0xffffff, pupil: 0x101010,
  bandana: 0xff7418, coin: 0xffc52c, shoe: 0xe02c28, sole: 0xffffff, mouth: 0x5a1222, tongue: 0xff7f92, teeth: 0xffffff,
};

export class NobuPrims {
  constructor() {
    this.mats = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, toon(v)]));
    const M = this.mats;
    const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
    const cyl = (r0, r1, h) => { const g = new THREE.CylinderGeometry(r0, r1, h, 10); g.translate(0, -h / 2, 0); return g; };
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

    this.root = new THREE.Group();          // feet at origin
    this.body = new THREE.Group();          // receives pose root transforms
    this.root.add(this.body);

    // hips & torso
    this.hips = new THREE.Group(); this.hips.position.y = 0.62; this.body.add(this.hips);
    this.chest = new THREE.Group(); this.hips.add(this.chest);
    const torso = add(this.chest, new THREE.CapsuleGeometry(0.2, 0.22, 6, 12), M.fur, 0, 0.2, 0);
    torso.scale.set(1, 1, 0.85);
    const belly = add(this.chest, S(0.16), M.belly, 0, 0.16, 0.09); belly.scale.set(1, 1.3, 0.6);
    // bandana (cone around the neck, point down in front)
    const band = add(this.chest, new THREE.CylinderGeometry(0.2, 0.17, 0.08, 14), M.bandana, 0, 0.43, 0);
    band.scale.z = 0.9;
    const flap = add(this.chest, new THREE.ConeGeometry(0.13, 0.2, 3), M.bandana, 0, 0.33, 0.13);
    flap.rotation.set(Math.PI, 0, 0); flap.scale.z = 0.4;
    add(this.chest, new THREE.CylinderGeometry(0.045, 0.045, 0.015, 14), M.coin, 0, 0.26, 0.18).rotation.x = Math.PI / 2;

    // head
    this.head = new THREE.Group(); this.head.position.set(0, 0.5, 0.02); this.chest.add(this.head);
    const skull = add(this.head, S(0.34, 20, 16), M.fur, 0, 0.2, 0); skull.scale.set(1.0, 0.93, 0.92);
    for (const sx of [-1, 1]) {
      const cheek = add(this.head, S(0.13), M.fur, sx * 0.2, 0.07, 0.14); cheek.scale.set(1, 0.8, 0.8);
    }
    const muzzle = add(this.head, S(0.17), M.belly, 0, 0.1, 0.27); muzzle.scale.set(1.05, 0.72, 1.0);
    add(this.head, S(0.07), M.nose, 0, 0.17, 0.43).scale.set(1.2, 0.85, 0.9);
    // grin: upper teeth strip
    const teethTop = add(this.head, new THREE.BoxGeometry(0.17, 0.035, 0.03), M.teeth, 0, 0.05, 0.4);
    teethTop.rotation.x = -0.25;
    // jaw (hinged)
    this.jaw = new THREE.Group(); this.jaw.position.set(0, 0.06, 0.2); this.head.add(this.jaw);
    const mouth = add(this.jaw, S(0.13, 14, 8, ), M.mouth, 0, -0.04, 0.12); mouth.scale.set(1, 0.45, 0.85);
    const lowJaw = add(this.jaw, S(0.13), M.belly, 0, -0.07, 0.11); lowJaw.scale.set(1, 0.42, 0.95);
    this.tongue = add(this.jaw, S(0.07), M.tongue, 0, -0.04, 0.2); this.tongue.scale.set(1, 0.35, 1.3);
    add(this.jaw, new THREE.BoxGeometry(0.15, 0.03, 0.03), M.teeth, 0, -0.025, 0.215);
    // eyes
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * 0.12, 0.29, 0.25); this.head.add(g);
      const white = add(g, S(0.105), M.eye); white.scale.set(0.85, 1.15, 0.55);
      const pupil = add(g, S(0.045), M.pupil, 0, 0, 0.05); pupil.scale.set(0.9, 1.2, 0.5);
      const lid = add(g, S(0.112), M.fur);
      const brow = add(this.head, new THREE.BoxGeometry(0.15, 0.04, 0.05), M.brow, sx * 0.12, 0.44, 0.27);
      brow.rotation.z = sx * -0.15;
      this.eyes.push({ g, pupil, lid, brow, sx });
    }
    // ears
    this.earsL = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(sx * 0.19, 0.46, -0.02); this.head.add(e);
      const outer = add(e, new THREE.ConeGeometry(0.11, 0.26, 4), M.fur, 0, 0.12, 0); outer.rotation.y = Math.PI / 4; outer.scale.z = 0.5;
      const inner = add(e, new THREE.ConeGeometry(0.07, 0.18, 4), M.pink, 0, 0.1, 0.03); inner.rotation.y = Math.PI / 4; inner.scale.z = 0.35;
      e.rotation.z = sx * -0.28;
      this.earsL.push({ e, sx });
    }

    // arms
    const arm = (sx) => {
      const sh = new THREE.Group(); sh.position.set(sx * 0.23, 0.36, 0); this.chest.add(sh);
      add(sh, cyl(0.055, 0.05, 0.28), M.fur);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      add(el, cyl(0.05, 0.045, 0.25), M.fur);
      const paw = add(el, S(0.085), M.belly, 0, -0.28, 0.01); paw.scale.set(0.9, 1, 0.9);
      return { sh, el };
    };
    this.armL = arm(1); this.armR = arm(-1);

    // legs
    const leg = (sx) => {
      const hip = new THREE.Group(); hip.position.set(sx * 0.11, 0.0, 0); this.hips.add(hip);
      add(hip, cyl(0.07, 0.06, 0.32), M.fur);
      const knee = new THREE.Group(); knee.position.y = -0.31; hip.add(knee);
      add(knee, cyl(0.06, 0.05, 0.27), M.fur);
      const shoe = add(knee, S(0.12), M.shoe, 0, -0.29, 0.06); shoe.scale.set(0.95, 0.68, 1.55);
      const sole = add(knee, new THREE.BoxGeometry(0.2, 0.04, 0.36), M.sole, 0, -0.34, 0.06);
      sole.scale.set(1, 1, 1);
      add(knee, S(0.05), M.sole, 0, -0.24, 0.17).scale.set(1.6, 0.5, 0.6);
      return { hip, knee };
    };
    this.legL = leg(1); this.legR = leg(-1);

    // tail: curled fluffy loop over the back
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.05, -0.17); this.hips.add(this.tail);
    const tailMesh = add(this.tail, new THREE.TorusGeometry(0.14, 0.075, 10, 16, Math.PI * 1.6), M.fur, 0, 0.16, -0.06);
    tailMesh.rotation.set(0, Math.PI / 2, -0.6);
    add(this.tail, S(0.085), M.belly, 0, 0.3, -0.04);

    this.allMeshes = [];
    this.root.traverse((o) => { if (o.isMesh) this.allMeshes.push(o); });
    this.headSocket = this.head;
  }

  apply(P) {
    this.body.position.y = P.rootY;
    this.body.rotation.set(P.rootRotX, P.rootRotY, P.rootRotZ);
    this.body.scale.set(P.scaleXZ, P.scaleY, P.scaleXZ);
    this.hips.position.y = 0.62 + P.hipsY;
    this.hips.rotation.set(P.lean, 0, P.sway);
    this.chest.rotation.y = P.twist;
    this.chest.scale.set(1 + P.breathe, 1 + P.breathe, 1 + P.breathe);
    this.head.rotation.set(P.headX, P.headY, P.headZ);
    this.head.position.z = 0.02 + P.headLunge;
    this.jaw.rotation.x = P.jaw * 0.75;
    this.tongue.visible = P.jaw > 0.25 || P.tongue > 0;
    this.tongue.position.z = 0.2 + P.tongue * 0.07;
    for (const e of this.eyes) {
      e.lid.visible = P.blink > 0.05;
      e.lid.scale.set(0.9, 1.2 * Math.max(0.05, P.blink), 0.62);
      e.lid.position.y = 0.125 * (1 - P.blink);
      e.pupil.position.set(P.lookX * 0.03, P.lookY * 0.04, 0.05);
      const b = e.sx < 0 ? P.browR : P.browL;
      e.brow.rotation.z = e.sx * (-0.15 - b * 0.5);
      e.brow.position.y = 0.44 + P.browY + b * 0.02;
    }
    for (const { e, sx } of this.earsL) e.rotation.set(-P.ears * 0.6, 0, sx * (-0.28 - Math.max(0, P.ears) * 0.5));
    const arm = (A, p, sx) => {
      A.sh.rotation.set(-p.swing, 0, sx * p.out);
      A.el.rotation.x = -p.elbow;
    };
    arm(this.armL, P.armL, 1); arm(this.armR, P.armR, -1);
    const leg = (L, p, sx) => {
      L.hip.rotation.set(-p.swing, 0, sx * p.out);
      L.knee.rotation.x = p.knee;
    };
    leg(this.legL, P.legL, 1); leg(this.legR, P.legR, -1);
    this.tail.rotation.set(-P.tailUp, P.tail, P.tail * 0.3);
  }

  setTint(color, amount) {
    for (const m of this.allMeshes) {
      if (!m.material.emissive) continue;
      m.material.emissive.set(color).multiplyScalar(amount);
    }
  }
  setOpacity(a) {
    for (const m of this.allMeshes) { m.material.transparent = a < 1; m.material.opacity = a; }
  }
}
