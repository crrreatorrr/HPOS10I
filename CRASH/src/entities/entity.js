import * as THREE from 'three';

// Base class for everything that lives in a stage and can interact with Nobu.
export class Entity {
  constructor(stage, x, y, z) {
    this.stage = stage;
    this.game = stage.game;
    this.pos = new THREE.Vector3(x, y, z);
    this.home = this.pos.clone();
    this.obj = new THREE.Group();
    this.obj.position.copy(this.pos);
    this.box = null;
    this.size = null;
    this.interactive = true;
    this.dead = false;
    this.alwaysActive = false;
  }

  setBox(w, h, d, oy = 0) {
    this.size = { w, h, d, oy };
    this.box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    this.updateBox();
  }

  updateBox() {
    if (!this.size) return;
    const { w, h, d, oy } = this.size;
    const b = this.box;
    b.min.x = this.pos.x - w / 2; b.max.x = this.pos.x + w / 2;
    b.min.y = this.pos.y + oy; b.max.y = this.pos.y + oy + h;
    b.min.z = this.pos.z - d / 2; b.max.z = this.pos.z + d / 2;
  }

  get session() { return this.game.session; }
  get player() { return this.game.player; }
  get fx() { return this.game.fx; }

  distToPlayer() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  update() {}
  reset() {}
}

// Things counted toward the "all breakables" reward. Broken state can be rolled back on death.
export class Breakable extends Entity {
  constructor(stage, x, y, z) {
    super(stage, x, y, z);
    this.countable = true;
    this.broken = false;
    this.brokenSeq = 0;
  }

  markBroken() {
    if (this.broken) return false;
    this.broken = true;
    this.brokenSeq = this.session.nextSeq();
    if (this.countable) this.session.onBreak(this);
    return true;
  }

  // Undo a break that happened after the last checkpoint.
  restore() {
    this.broken = false;
    this.dead = false;
    this.obj.visible = true;
    if (this.solid) this.solid.enabled = true;
    this.onRestore?.();
  }

  hide() {
    this.dead = true;
    this.obj.visible = false;
    if (this.solid) this.solid.enabled = false;
  }
}
