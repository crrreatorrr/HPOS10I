// Procedural animation for Nobu. Produces a rig-agnostic pose each frame; both the primitive
// model and the rigged GLB apply the same pose, so all animation lives here.
import { clamp, lerp, smooth, pick } from '../core/util.js';

export function makePose() {
  return {
    rootY: 0, rootRotX: 0, rootRotY: 0, rootRotZ: 0, scaleY: 1, scaleXZ: 1,
    hipsY: 0, lean: 0, sway: 0, twist: 0,
    headX: 0, headY: 0, headZ: 0, headLunge: 0,
    jaw: 0, tongue: 0, blink: 0, browL: 0, browR: 0, browY: 0, lookX: 0, lookY: 0,
    armL: { swing: 0, out: 0.22, elbow: 0.25 }, armR: { swing: 0, out: 0.22, elbow: 0.25 },
    legL: { swing: 0, out: 0.04, knee: 0 }, legR: { swing: 0, out: 0.04, knee: 0 },
    tail: 0, tailUp: 0, ears: 0, chomp: 0, breathe: 0,
  };
}

const IDLE_VARIANTS = ['scratch', 'yawn', 'tailChase', 'lookCam', 'scratch', 'lookCam'];

export class NobuAnimator {
  constructor() {
    this.pose = makePose();
    this.t = 0;
    this.phase = 0;
    this.blinkTimer = 2.5;
    this.blinkT = 0;
    this.idleVariant = null;
    this.idleVariantT = 0;
    this.nextIdleAt = 3.5;
    this.runBlend = 0;
    this.airBlend = 0;
  }

  // st: { mode, speed, vy, grounded, biteT, flipT, landT, jumpT, idleTime, slideT, flopPhase, flopT, deathType, deathT }
  update(dt, st) {
    this.t += dt;
    const P = this.pose;
    const reset = makePose();
    Object.assign(P, reset, { armL: { ...reset.armL }, armR: { ...reset.armR }, legL: { ...reset.legL }, legR: { ...reset.legR } });

    // blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinkT = 0.14; this.blinkTimer = 2 + Math.random() * 3; }
    if (this.blinkT > 0) { this.blinkT -= dt; P.blink = 1; }

    const speed = st.speed || 0;
    const runK = clamp(speed / 7.5, 0, 1);
    this.runBlend = lerp(this.runBlend, st.grounded && st.mode === 'normal' ? runK : 0, 1 - Math.exp(-14 * dt));
    this.airBlend = lerp(this.airBlend, !st.grounded && st.mode === 'normal' ? 1 : 0, 1 - Math.exp(-16 * dt));

    if (st.mode === 'dead') { this._death(dt, st); return P; }
    if (st.mode === 'victory') { this._dance(dt); return P; }

    // ---- idle base ----
    const breathe = Math.sin(this.t * 2.6);
    P.breathe = breathe * 0.02;
    P.hipsY = breathe * 0.008;
    P.tail = Math.sin(this.t * 5) * 0.35;
    P.armL.swing = breathe * 0.04; P.armR.swing = -breathe * 0.04;
    P.headX = -0.03 + breathe * 0.02;

    // ---- idle variants ----
    if (st.mode === 'normal' && st.grounded && speed < 0.3 && st.idleTime > this.nextIdleAt && !this.idleVariant) {
      this.idleVariant = pick(IDLE_VARIANTS);
      this.idleVariantT = 0;
    }
    if (this.idleVariant) {
      if (st.mode !== 'normal' || !st.grounded || speed > 0.3 || st.biteT >= 0) {
        this.idleVariant = null;
        this.nextIdleAt = st.idleTime + 4;
      } else {
        this.idleVariantT += dt;
        if (this._idle(this.idleVariant, this.idleVariantT)) {
          this.idleVariant = null;
          this.nextIdleAt = st.idleTime + 3 + Math.random() * 3;
        }
      }
    }
    if (st.idleTime < 0.1) this.nextIdleAt = Math.max(this.nextIdleAt, 3.5);

    // ---- run cycle ----
    const r = this.runBlend;
    if (r > 0.01) {
      this.phase += dt * (speed * 1.45 + 2);
      const ph = this.phase;
      const s = Math.sin(ph), c = Math.cos(ph);
      P.legL.swing = lerp(P.legL.swing, s * 0.95, r);
      P.legR.swing = lerp(P.legR.swing, -s * 0.95, r);
      P.legL.knee = lerp(P.legL.knee, Math.max(0, c) * 1.3 + 0.15, r);
      P.legR.knee = lerp(P.legR.knee, Math.max(0, -c) * 1.3 + 0.15, r);
      P.armL.swing = lerp(P.armL.swing, -s * 0.95, r);
      P.armR.swing = lerp(P.armR.swing, s * 0.95, r);
      P.armL.elbow = P.armR.elbow = lerp(0.25, 1.45, r);
      P.armL.out = P.armR.out = lerp(0.22, 0.28, r);
      P.hipsY += Math.abs(s) * 0.08 * r - 0.04 * r;
      P.lean = 0.3 * r;
      P.twist = s * 0.18 * r;
      P.headX += -0.18 * r + Math.abs(c) * 0.06 * r;
      P.tail = lerp(P.tail, Math.sin(ph * 2) * 0.7, r);
      P.ears = Math.abs(s) * 0.25 * r;
    }

    // ---- airborne ----
    const a = this.airBlend;
    if (a > 0.01) {
      const rising = st.vy > 0;
      const k = rising ? 1 : clamp(-st.vy / 12, 0, 1);
      P.legL.swing = lerp(P.legL.swing, rising ? 0.7 : 0.3, a);
      P.legL.knee = lerp(P.legL.knee, rising ? 1.4 : 0.5, a);
      P.legR.swing = lerp(P.legR.swing, rising ? -0.2 : 0.1, a);
      P.legR.knee = lerp(P.legR.knee, rising ? 0.6 : 0.3, a);
      const flail = rising ? 0 : Math.sin(this.t * 22) * 0.35 * k;
      P.armL.out = lerp(P.armL.out, rising ? 1.9 : 2.3 + flail, a);
      P.armR.out = lerp(P.armR.out, rising ? 1.9 : 2.3 - flail, a);
      P.armL.elbow = P.armR.elbow = lerp(P.armL.elbow, 0.5, a);
      P.headX += lerp(0, rising ? -0.18 : 0.12, a);
      P.ears = lerp(P.ears, rising ? -0.3 : 0.6, a);
      P.tailUp = 0.3 * a;
    }

    // ---- double jump flip ----
    if (st.flipT >= 0 && st.flipT < 1) {
      const t = smooth(st.flipT);
      P.rootRotX = t * Math.PI * 2;
      P.rootY = Math.sin(st.flipT * Math.PI) * 0.35;
      P.legL.swing = P.legR.swing = 1.2; P.legL.knee = P.legR.knee = 1.9;
      P.armL.swing = P.armR.swing = 1.0; P.armL.out = P.armR.out = 0.5;
      P.lean = 0.4;
    }

    // ---- bank into turns / skid ----
    if (st.mode === 'normal') {
      P.rootRotZ = st.bank || 0;
      P.headZ -= (st.bank || 0) * 0.6;
    }
    if (st.skid) {
      P.lean = -0.35;
      P.legL.swing = 0.7; P.legR.swing = 0.2; P.legL.knee = 0.3; P.legR.knee = 0.9;
      P.armL.out = P.armR.out = 1.4;
      P.browL = P.browR = 0.5;
      P.jaw = 0.4;
    }

    // ---- squash & stretch ----
    if (st.landT < 0.16) {
      const k = 1 - st.landT / 0.16;
      P.scaleY = 1 - 0.24 * k * Math.min(1, st.landImpact || 1);
      P.scaleXZ = 1 + 0.16 * k * Math.min(1, st.landImpact || 1);
    }
    if (st.jumpT < 0.18) {
      const k = 1 - st.jumpT / 0.18;
      P.scaleY = Math.max(P.scaleY, 1 + 0.2 * k);
      P.scaleXZ = Math.min(P.scaleXZ, 1 - 0.1 * k);
    }

    // ---- slide ----
    if (st.mode === 'slide') {
      P.rootRotX = -1.15;
      P.rootY = 0.32;
      P.legL.swing = 0.9; P.legL.knee = 0.2;
      P.legR.swing = 0.4; P.legR.knee = 1.0;
      P.armL.swing = -1.3; P.armR.swing = -1.3; P.armL.out = P.armR.out = 0.6;
      P.headX = 0.75;
      P.ears = 0.8;
      P.tail = Math.sin(this.t * 30) * 0.4;
    }

    // ---- belly flop ----
    if (st.mode === 'flop') {
      if (st.flopPhase === 'wind') {
        P.rootRotY = smooth(Math.min(1, st.flopT / 0.2)) * Math.PI * 2;
        P.legL.swing = P.legR.swing = 1.2; P.legL.knee = P.legR.knee = 1.8;
        P.armL.out = P.armR.out = 2.8;
        P.jaw = 0.5;
      } else {
        P.rootRotX = 1.45;
        P.rootY = 0.28;
        P.armL.out = P.armR.out = 1.5; P.armL.swing = P.armR.swing = 0.6;
        P.legL.out = 0.5; P.legR.out = 0.5;
        P.headX = -0.9;
        P.jaw = st.flopPhase === 'land' ? 0.2 : 0.7;
        P.blink = st.flopPhase === 'land' ? 1 : 0;
        P.ears = 1;
      }
    }

    // ---- bite ----
    if (st.biteT >= 0) {
      const t = st.biteT;
      const lunge = Math.sin(Math.min(1, t / 0.7) * Math.PI);
      P.headLunge = lunge * 0.2;
      P.headX += lunge * 0.25;
      P.lean += lunge * 0.3;
      P.twist += Math.sin(t * Math.PI) * 0.35;
      P.jaw = t < 0.3 ? (t / 0.3) * 1.0 : t < 0.42 ? 1.0 - ((t - 0.3) / 0.12) : 0;
      P.chomp = t < 0.42 ? t / 0.42 : Math.max(0, 1 - (t - 0.42) / 0.3);
      P.armR.swing = lerp(P.armR.swing, 1.3, lunge);
      P.armL.swing = lerp(P.armL.swing, -0.6, lunge);
      P.browL = P.browR = 0.35;
      P.ears = -0.3;
    }
    return P;
  }

  // Returns true when finished.
  _idle(kind, t) {
    const P = this.pose;
    if (kind === 'scratch') {
      const d = 2.4;
      const k = Math.min(1, t / 0.3) * Math.min(1, (d - t) / 0.3);
      P.legR.swing = -1.5 * k; P.legR.out = 0.9 * k; P.legR.knee = (2.1 + Math.sin(t * 34) * 0.35) * k;
      P.headZ = 0.45 * k; P.headY = -0.3 * k;
      P.sway = -0.18 * k;
      P.blink = k > 0.5 ? 0.6 : P.blink;
      P.jaw = 0.15 * k; P.tongue = k;
      P.tail = Math.sin(t * 16) * 0.6;
      return t > d;
    }
    if (kind === 'yawn') {
      const d = 2.2;
      const k = smooth(Math.min(1, t / 0.6)) * Math.min(1, (d - t) / 0.4);
      P.jaw = 1.1 * k;
      P.blink = k > 0.3 ? 1 : 0;
      P.headX = -0.35 * k;
      P.armL.out = P.armR.out = 0.22 + 2.4 * k;
      P.armL.elbow = P.armR.elbow = 0.25 + 0.6 * k;
      P.lean = -0.15 * k;
      P.browL = P.browR = -0.25 * k;
      return t > d;
    }
    if (kind === 'tailChase') {
      const d = 1.8;
      P.rootRotY = smooth(Math.min(1, t / d)) * Math.PI * 4;
      P.lean = 0.35;
      P.headY = -0.6; P.headX = 0.2;
      P.jaw = Math.max(0, Math.sin(t * 22)) * 0.8;
      P.legL.swing = Math.sin(t * 25) * 0.6; P.legR.swing = -Math.sin(t * 25) * 0.6;
      P.tail = Math.sin(t * 30) * 0.8;
      return t > d;
    }
    if (kind === 'lookCam') {
      const d = 2.6;
      const k = Math.min(1, t / 0.25) * Math.min(1, (d - t) / 0.25);
      P.headX = -0.15 * k;
      P.headZ = Math.sin(t * 3) * 0.12 * k;
      P.browL = (Math.sin(t * 14) > 0 ? 0.45 : -0.1) * k;
      P.browR = (Math.sin(t * 14) > 0 ? -0.1 : 0.45) * k;
      P.browY = Math.max(0, Math.sin(t * 14)) * 0.04 * k;
      P.armR.swing = 0.4 * k; P.armR.elbow = 1.8 * k; P.armR.out = 0.6 * k; // hand on hip
      P.armL.out = 0.9 * k; P.armL.elbow = 2.2 * k;
      P.tail = Math.sin(t * 9) * 0.6;
      return t > d;
    }
    return true;
  }

  _dance() {
    const P = this.pose;
    const t = this.t;
    const beat = t * 9;
    P.rootY = Math.abs(Math.sin(beat)) * 0.25;
    P.rootRotY = Math.sin(t * 2.2) * 0.5;
    P.legL.swing = Math.max(0, Math.sin(beat)) * 1.5; P.legL.knee = Math.max(0, Math.sin(beat)) * 0.4;
    P.legR.swing = Math.max(0, -Math.sin(beat)) * 1.5; P.legR.knee = Math.max(0, -Math.sin(beat)) * 0.4;
    P.armL.out = 2.2 + Math.sin(beat * 2) * 0.5; P.armR.out = 2.2 - Math.sin(beat * 2) * 0.5;
    P.armL.elbow = P.armR.elbow = 0.8;
    P.headZ = Math.sin(beat) * 0.3;
    P.jaw = 0.6; P.tongue = 1;
    P.blink = 1;
    P.tail = Math.sin(t * 20) * 0.8;
    P.ears = Math.sin(beat * 2) * 0.4;
  }

  _death(dt, st) {
    const P = this.pose;
    const t = st.deathT;
    switch (st.deathType) {
      case 'flat': {
        const k = Math.min(1, t / 0.1);
        P.scaleY = lerp(1, 0.07, k);
        P.scaleXZ = lerp(1, 1.7, k);
        P.armL.out = P.armR.out = 1.5; P.legL.out = P.legR.out = 0.7;
        P.blink = 1; P.jaw = 0.4; P.tongue = 1;
        break;
      }
      case 'cone': {
        const k = smooth(Math.min(1, t / 0.5));
        P.rootY = -0.38 * k;
        P.legL.swing = P.legR.swing = 1.45 * k; P.legL.out = 0.25 * k; P.legR.out = 0.25 * k;
        P.headX = 0.4 * k;
        P.armL.out = P.armR.out = 0.1; P.armL.swing = P.armR.swing = 0.25 * k;
        P.browL = -0.5 * k; P.browR = -0.5 * k;
        P.ears = 1.2 * k;
        P.lookY = -0.6;
        P.jaw = 0.12 * k;
        P.lean = -0.2 * k;
        break;
      }
      case 'rug': {
        P.rootRotX = -t * 9;
        P.rootY = Math.max(-2, 2.6 * t - 4 * t * t) + 0.5;
        P.armL.out = 2.4 + Math.sin(t * 25) * 0.5; P.armR.out = 2.4 - Math.sin(t * 25) * 0.5;
        P.legL.swing = Math.sin(t * 20); P.legR.swing = -Math.sin(t * 20);
        P.jaw = 1; P.tongue = 1;
        P.browL = P.browR = 0.6;
        break;
      }
      case 'angel':
      case 'fall': {
        P.armL.out = P.armR.out = 2.5 + Math.sin(t * 6) * 0.3;
        P.legL.swing = 0.3; P.legR.swing = -0.2; P.legL.knee = 0.5;
        P.blink = 1; P.jaw = 0.25;
        P.headX = -0.2;
        P.tail = Math.sin(t * 4) * 0.4;
        break;
      }
      default: break;
    }
  }
}
