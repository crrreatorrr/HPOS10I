// Nobu from the Higgsfield (Meshy) rigged GLB. Bones are driven procedurally from NobuAnimator poses.
// Rotations are expressed in model space (X right, Y up, Z forward) and converted to each bone's parent frame.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Assets } from '../art/assets.js';

let fixedTex = null;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

// Rest A-pose arm angle away from the body (radians) and model yaw so Nobu faces +Z.
const REST_ARM_OUT = 0.62;
const FACE_YAW = 0;

export class NobuGlb {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const model = cloneSkinned(gltf.scene);
    model.rotation.y = FACE_YAW;
    this.model = model;
    this.body.add(model);

    // normalize height to 1.5m with feet at y=0
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    const s = 1.5 / h;
    model.scale.multiplyScalar(s);
    model.position.y = -box.min.y * s;
    model.updateMatrixWorld(true);

    this.allMeshes = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.material = o.material.clone();
        const m = o.material;
        // retouched texture (the generated one had a third pupil)
        if (Assets.has('nobu_tex_fixed')) {
          if (!fixedTex) { fixedTex = Assets.tex('nobu_tex_fixed').clone(); fixedTex.flipY = false; fixedTex.colorSpace = THREE.SRGBColorSpace; fixedTex.needsUpdate = true; }
          m.map = fixedTex;
        }
        // Soften the PBR look toward the cartoon style: matte, slightly brighter.
        if (m.isMeshStandardMaterial) { m.roughness = 0.85; m.metalness = 0; m.envMapIntensity = 0; }
        this.allMeshes.push(o);
      }
    });

    // Bone lookup + rest data
    this.bones = {};
    const rootInv = new THREE.Quaternion();
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(rootInv).invert();
    model.traverse((o) => {
      if (o.isBone) {
        const parentQ = new THREE.Quaternion();
        o.parent.getWorldQuaternion(parentQ);
        parentQ.premultiply(rootInv);
        this.bones[o.name] = { bone: o, rest: o.quaternion.clone(), parentQ, parentInv: parentQ.clone().invert() };
      }
    });
    this.ok = !!(this.bones.Hips && this.bones.Head && this.bones.LeftUpLeg && this.bones.RightArm);

    // Chomp teeth effect (the scan has no jaw bone)
    this.chomp = new THREE.Group();
    const toothMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ink = new THREE.MeshBasicMaterial({ color: 0x1a0a24 });
    const mkRow = (flip) => {
      const g = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI), ink);
      arc.rotation.z = flip ? Math.PI : 0;
      g.add(arc);
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4), toothMat);
        const a = (i + 0.5) / 5 * Math.PI;
        t.position.set(Math.cos(a) * 0.15, (flip ? -1 : 1) * Math.sin(a) * 0.15 - (flip ? -0.04 : 0.04), 0);
        t.rotation.z = flip ? 0 : Math.PI;
        g.add(t);
      }
      return g;
    };
    this.chompTop = mkRow(false);
    this.chompBot = mkRow(true);
    this.chomp.add(this.chompTop, this.chompBot);
    this.chomp.visible = false;
    this.root.add(this.chomp);
    this.headSocket = this.bones.Head ? this.bones.Head.bone : this.body;
  }

  _rot(name, d) {
    const b = this.bones[name];
    if (!b) return;
    // local = parentInv * D * parent * rest
    _q.copy(b.parentInv).multiply(d).multiply(b.parentQ);
    b.bone.quaternion.copy(_q).multiply(b.rest);
  }

  apply(P) {
    this.body.position.y = P.rootY;
    this.body.rotation.set(P.rootRotX, P.rootRotY, P.rootRotZ);
    this.body.scale.set(P.scaleXZ, P.scaleY, P.scaleXZ);
    if (!this.ok) return;

    const D = new THREE.Quaternion();
    const R = (axis, a) => _q2.setFromAxisAngle(axis, a);

    D.copy(R(AX, P.lean)).multiply(R(AZ, P.sway));
    this.bodyLiftY = P.hipsY;
    this._rot('Hips', D);
    this.bones.Hips.bone.position.y = this.bones.Hips.restY ??= this.bones.Hips.bone.position.y;
    this.bones.Hips.bone.position.y += P.hipsY / this.model.scale.y;

    D.copy(R(AY, P.twist * 0.5)); this._rot('Spine', D);
    D.copy(R(AY, P.twist * 0.5)).multiply(R(AX, P.breathe * 2)); this._rot('Spine01', D);
    D.copy(R(AX, P.headX * 0.35)); this._rot('neck', D);
    D.copy(R(AY, P.headY)).multiply(R(AX, P.headX * 0.65 + P.headLunge * 1.6)).multiply(R(AZ, P.headZ));
    this._rot('Head', D);

    const arm = (side, p, sx) => {
      D.copy(R(AX, -p.swing)).multiply(R(AZ, sx * (p.out - REST_ARM_OUT)));
      this._rot(side + 'Arm', D);
      D.copy(R(AX, -p.elbow * 1.2)); this._rot(side + 'ForeArm', D);
    };
    arm('Left', P.armL, 1); arm('Right', P.armR, -1);
    const leg = (side, p, sx) => {
      D.copy(R(AX, -p.swing)).multiply(R(AZ, sx * p.out));
      this._rot(side + 'UpLeg', D);
      D.copy(R(AX, p.knee)); this._rot(side + 'Leg', D);
      D.copy(R(AX, -p.knee * 0.35)); this._rot(side + 'Foot', D);
    };
    leg('Left', P.legL, 1); leg('Right', P.legR, -1);

    // chomp teeth in front of the muzzle while biting
    this.chomp.visible = P.chomp > 0.02;
    if (this.chomp.visible) {
      this.root.updateMatrixWorld(true);
      const head = this.bones.Head.bone;
      head.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      this.chomp.position.set(_v.x, _v.y + 0.02, _v.z + 0.42 + P.headLunge);
      const open = Math.max(0, P.jaw) * 0.16;
      this.chompTop.position.y = open;
      this.chompBot.position.y = -open;
      const s = 0.8 + P.chomp * 0.5;
      this.chomp.scale.setScalar(s);
    }
  }

  setTint(color, amount) {
    for (const m of this.allMeshes) {
      if (m.material.emissive) m.material.emissive.set(color).multiplyScalar(amount);
    }
  }
  setOpacity(a) {
    for (const m of this.allMeshes) { m.material.transparent = a < 1; m.material.opacity = a; }
  }
}
