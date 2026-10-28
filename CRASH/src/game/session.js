// A play session for one level: the path stage, then its boss arena.
// Owns checkpoints (with Crash-style rollback on death), lives, tickets, masks, invincibility and stats.
import * as THREE from 'three';
import { Stage } from '../world/stage.js';
import { TicketSystem } from '../entities/tickets.js';
import { FX } from '../entities/fx.js';
import { Projectiles } from '../bosses/common.js';
import { MechaBird } from '../bosses/mechaBird.js';
import { BigCatBoss } from '../bosses/bigCat.js';
import { EvilCone } from '../bosses/evilCone.js';
import { BlueSphere } from '../entities/breakables.js';
import { Breakable } from '../entities/entity.js';
import { Enemy } from '../entities/enemies.js';
import { ConedDog } from '../entities/dogs.js';
import { CrumblePlatform, CrackedFloor, CoconutRoller } from '../entities/props.js';
import { buildLevel1, buildBoss1Arena } from '../levels/level1.js';
import { buildLevel2, buildBoss2Arena } from '../levels/level2.js';
import { buildLevel3, buildBoss3Arena } from '../levels/level3.js';
import { LEVEL_INTRO, BOSS_TALK } from '../story/script.js';
import { audio } from '../audio/audio.js';
import { save, START_LIVES } from '../core/save.js';
import { input } from '../core/input.js';

const LEVELS = {
  1: { build: buildLevel1, arena: buildBoss1Arena, Boss: MechaBird, bossKey: 'bird', theme: 1, bossTheme: 'boss1', name: 'Bark Jungle' },
  2: { build: buildLevel2, arena: buildBoss2Arena, Boss: BigCatBoss, bossKey: 'cat', theme: 2, bossTheme: 'boss2', name: 'Scratchpost Canyon' },
  3: { build: buildLevel3, arena: buildBoss3Arena, Boss: EvilCone, bossKey: 'cone', theme: 3, bossTheme: 'boss3', name: 'The Cone Factory' },
};
export const LEVEL_NAMES = { 1: LEVELS[1].name, 2: LEVELS[2].name, 3: LEVELS[3].name };

export class Session {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.def = LEVELS[level];
    this.seq = 0;
    this.mask = 0;
    this.invincibleT = 0;
    this.phase = 'level';
    this.levelTickets = 0;
    this.stats = null;
    this.deathsAtCp = 0;
    this.busy = false;     // transitions / dialogue
    this.over = false;
  }

  nextSeq() { return ++this.seq; }

  // ---------- stage setup ----------
  _newStage(themeKey) {
    const g = this.game;
    if (this.stage) this.stage.dispose();
    const stage = new Stage(g, themeKey);
    this.stage = stage;
    g.stage = stage;
    g.fx = new FX(stage.scene, g.camera.cam);
    this.tickets = new TicketSystem(g, stage);
    g.tickets = this.tickets;
    this.projectiles = new Projectiles(g, stage);
    return stage;
  }

  _attachActors(info) {
    const g = this.game;
    const stage = this.stage;
    g.player.attach(stage.scene);
    g.mask.attach(stage.scene);
    g.player.spawnAt(info.spawn, info.facing);
    g.mask.setLevel(this.mask, this.mask);
    g.mask.snapTo(g.player);
    g.camera.setMode(info.camera.mode, info.camera);
    g.camera.cam.fov = info.fov || 58;
    g.camera.cam.updateProjectionMatrix();
    g.camera.endCinematic();
    g.camera.snap(g.player);
    this.cp = { pos: info.spawn.clone(), facing: info.facing, seq: this.seq, tickets: save.data.tickets, levelTickets: this.levelTickets };
    this.deathsAtCp = 0;
  }

  async startLevel() {
    const g = this.game;
    this.busy = true;
    this.phase = 'level';
    const stage = this._newStage(this.def.theme);
    const info = this.def.build(g, stage, this.tickets);
    stage.finalize();
    this.tickets.finalize();
    this.info = info;
    this.chase = info.chase || null;
    this._attachActors(info);
    this.breakablesTotal = stage.entities.filter((e) => e instanceof Breakable && e.countable).length;
    this.dogsTotal = stage.entities.filter((e) => e instanceof ConedDog).length;
    audio.setRate(1);
    audio.playMusic(stage.theme.music);
    g.ui.showHud(4);
    this._pushHud();
    await g.ui.fade(0);
    g.ui.banner(this.def.name.toUpperCase(), `LEVEL ${this.level}`, 2.2);
    if (LEVEL_INTRO[this.level]) {
      g.player.frozen = true;
      await g.ui.say(LEVEL_INTRO[this.level]);
      g.player.frozen = false;
    }
    if (this.chase) this._startChase(this.chase.s, 1.8, true);
    this.busy = false;
  }

  _startChase(s, delay, first) {
    this.chase.begin(s, delay);
    if (first) setTimeout(() => this.game.ui.banner('RUN!', 'Hold ↓ / S toward the camera', 2.2), delay * 1000 - 300);
  }

  reachBossGate() {
    if (this.phase !== 'level' || this.busy) return;
    this.busy = true;
    this._recordLevelStats();
    if (this.chase) this.chase.state = 'stop';
    this.game.player.frozen = true;
    this.game.ui.fade(1).then(() => this.startBoss());
  }

  _recordLevelStats() {
    const ents = this.stage.entities;
    this.stats = {
      tickets: this.levelTickets,
      broken: ents.filter((e) => e instanceof Breakable && e.countable && e.broken).length,
      breakables: this.breakablesTotal,
      dogs: ents.filter((e) => e instanceof ConedDog && e.freed).length,
      dogsTotal: this.dogsTotal,
    };
  }

  async startBoss() {
    const g = this.game;
    this.phase = 'boss';
    this.tickets.clearFlying?.();
    const stage = this._newStage(this.def.bossTheme);
    const info = this.def.arena(g, stage, this.tickets);
    stage.finalize();
    this.tickets.finalize();
    // arena pick-ups don't count toward the level reward
    for (const e of stage.entities) if (e instanceof Breakable) e.countable = false;
    this.info = info;
    this.chase = null;
    const boss = new this.def.Boss(stage, 0, 0, -6);
    stage.add(boss);
    this.boss = boss;
    this.bossPhaseCp = 1;
    this._attachActors(info);
    g.player.frozen = true;
    audio.playMusic('cutscene');
    // intro shot on the boss
    const bp = boss.pos.clone();
    g.camera.cinematic(new THREE.Vector3(bp.x + 3, Math.max(3, bp.y + 1.5), bp.z + 9), new THREE.Vector3(bp.x, bp.y + 1, bp.z), 2.5);
    g.camera.pos.set(bp.x + 6, bp.y + 4, bp.z + 16);
    await g.ui.fade(0);
    audio.play('bossRoar');
    g.camera.shake(0.4, 0.5);
    await g.ui.say(BOSS_TALK[this.def.bossKey].intro);
    g.camera.endCinematic();
    g.player.frozen = false;
    g.ui.bossShow(boss.name, boss.portrait);
    g.ui.bossCharge(0, false);
    audio.playMusic(stage.theme.music);
    g.ui.banner('FIGHT!', boss.name, 1.4);
    boss.start();
    g.camera.opts.focus = boss.pos;
    g.camera.opts.focusWeight = 0.2;
    this.busy = false;
  }

  async onBossPhase(boss, phase) {
    const g = this.game;
    this.busy = true;
    boss.active = false;
    this.projectiles.clear();
    this.bossPhaseCp = phase;
    await new Promise((r) => setTimeout(r, 600));
    if (g.player.dead || this.over) { this.busy = false; return; }
    g.player.frozen = true;
    const lines = BOSS_TALK[this.def.bossKey]['phase' + phase];
    if (lines) await g.ui.say(lines);
    g.player.frozen = false;
    g.ui.bossHp(boss.hp / boss.maxHp, phase);
    // a little help: a fresh Blue Sphere each phase
    const sp = this.info.spheres?.[phase - 1];
    if (sp) { const s = new BlueSphere(this.stage, sp.x, sp.y, sp.z); s.countable = false; this.stage.add(s); }
    boss.stateT = 0; // the phase-change reaction (rage/roar) starts now, after the dialogue
    boss.active = true;
    boss.beginPhase?.();
    this.busy = false;
  }

  onBossDefeated(boss) {
    const g = this.game;
    this.busy = true;
    this.projectiles.clear();
    g.player.frozen = true;
    g.ui.bossHp(0, 0);
    audio.stopMusic();
    audio.play('bossRoar');
    if (this.def.bossKey === 'cone') g.ui.say(BOSS_TALK.cone.death);
    setTimeout(() => {
      g.ui.bossHide();
      g.player.victory();
      g.camera.cinematic(g.player.pos.clone().add(new THREE.Vector3(0, 2.2, 5.5)), g.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 2);
      audio.playMusic('complete');
    }, 2600);
    setTimeout(() => {
      g.ui.fade(1).then(() => g.levelCleared(this));
    }, 6200);
  }

  // ---------- events from entities ----------
  onBreak() { this._pushHud(); }
  onEnemyDefeated() {}

  addTickets(n) {
    save.data.tickets += n;
    this.levelTickets += n;
    while (save.data.tickets >= 100) {
      save.data.tickets -= 100;
      this.addLife(1);
    }
    this.game.ui.setHud('tickets', save.data.tickets);
  }

  addLife(n) {
    save.data.lives = Math.min(99, save.data.lives + n);
    this.game.ui.setHud('lives', save.data.lives);
    audio.play('oneUp');
    this.game.ui.banner('1UP!', '', 1);
  }

  setMask(n) {
    const prev = this.mask;
    n = Math.max(0, Math.min(3, n));
    if (n >= 3) {
      if (this.invincibleT <= 0) { audio.play('invincible'); this.game.ui.banner('INVINCIBLE!', 'Sproto power x3', 1.6); }
      this.invincibleT = 20;
      audio.setRate(1.35);
    }
    this.mask = n;
    this.game.mask.setLevel(n, prev);
    this.game.ui.setHud('mask', n);
  }

  rescueDog() {
    const freed = this.stage.entities.filter((e) => e instanceof ConedDog && e.freed).length;
    this.game.ui.setHud('dogs', `${freed}/${this.dogsTotal}`);
    if (freed === this.dogsTotal && this.dogsTotal > 0) this.game.ui.banner('ALL DOGS FREE!', '', 1.6);
  }

  checkpoint(pos, snacks) {
    this.cp = { pos: pos.clone(), facing: this.game.player.facing, seq: this.seq, tickets: save.data.tickets, levelTickets: this.levelTickets };
    this.deathsAtCp = 0;
    this.game.ui.banner('CHECKPOINT!', 'yum', 1.4);
  }

  _pushHud() {
    const ui = this.game.ui;
    ui.setHud('tickets', save.data.tickets, { show: false });
    ui.setHud('lives', save.data.lives, { show: false });
    ui.setHud('mask', this.mask, { show: false });
    const freed = this.stage ? this.stage.entities.filter((e) => e instanceof ConedDog && e.freed).length : 0;
    ui.setHud('dogs', `${freed}/${this.dogsTotal ?? 0}`, { show: false });
  }

  // ---------- death + respawn ----------
  onPlayerDeath(type) {
    if (this.dying) return;
    this.dying = true;
    const g = this.game;
    this.invincibleT = 0;
    audio.setRate(1);
    const prevMask = this.mask;
    this.mask = 0;
    g.mask.setLevel(0, prevMask);
    const wait = type === 'fall' ? 1.0 : 1.5;
    setTimeout(async () => {
      g.ui.deathCard(type);
      await new Promise((r) => setTimeout(r, 1700));
      await g.ui.fade(1, 0.35);
      g.ui.clearScreen();
      save.data.lives -= 1;
      if (save.data.lives < 0) {
        this.over = true;
        this.dying = false;
        g.gameOver(this);
        return;
      }
      this.respawn();
      this.dying = false;
      g.ui.showHud(2.5);
      await g.ui.fade(0, 0.35);
    }, wait * 1000);
  }

  respawn() {
    const g = this.game;
    const cp = this.cp;
    this.deathsAtCp++;
    // roll back everything broken/collected after the checkpoint
    for (const e of this.stage.entities) {
      if (e instanceof Breakable && e.broken && e.brokenSeq > cp.seq) e.restore();
      else if (e instanceof ConedDog && e.freed && e.seq > cp.seq) e.restore();
      if (e instanceof Enemy) e.reset();
      if (e instanceof CrumblePlatform || e instanceof CrackedFloor || e instanceof CoconutRoller) e.reset();
    }
    this.tickets.restoreAfter(cp.seq);
    this.tickets.clearFlying();
    save.data.tickets = cp.tickets;
    this.levelTickets = cp.levelTickets;
    this.projectiles.clear();
    g.fx.clear();
    g.player.spawnAt(cp.pos, cp.facing);
    g.camera.snap(g.player);
    // pity mask after a few deaths at the same checkpoint (classic!)
    this.setMask(this.deathsAtCp >= 3 ? 1 : 0);
    g.mask.snapTo(g.player);
    this._pushHud();
    if (this.chase && this.stage.track) {
      const pr = this.stage.track.project(cp.pos.x, cp.pos.z);
      this.chase.begin(pr.s - 13, 1.6);
    }
    if (this.phase === 'boss' && this.boss) {
      this.boss.killMinions?.();
      const phase = this.def.bossKey === 'cone' ? this.bossPhaseCp : 1;
      this.boss.resetToPhase(phase);
      g.ui.bossHp(this.boss.hp / this.boss.maxHp, phase);
      this.boss.active = true;
    }
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    if (!this.stage) return;
    if (this.invincibleT > 0) {
      this.invincibleT -= dt;
      if (this.invincibleT <= 0) {
        this.invincibleT = 0;
        audio.setRate(1);
        this.setMask(2);
      }
    }
    this.stage.update(dt, g.player);
    g.player.update(dt, this.stage, g.camera.basis);
    const tr = this.stage.track;
    if (tr && !g.player.dead) {
      const ps = g.player.body.s ?? 0;
      for (const t of tr.triggers) if (!t.fired && ps >= t.d && ps < t.d + 25) { t.fired = true; t.fn(g.player); }
    }
    this.tickets.update(dt);
    this.projectiles.update(dt);
    g.mask.update(dt, g.player, g.camera.cam);
    g.camera.update(dt, g.player);
    this.stage.followSky(g.camera.cam);
    g.fx.update(dt);
  }

  // Belly flop shockwave: breaks / squashes everything nearby.
  onFlop(pos) {
    const g = this.game;
    g.camera.shake(0.45, 0.3);
    g.fx.ring(pos.x, pos.y, pos.z, { color: 0xffffff, radius: 2.4 });
    g.fx.puff(pos.x, pos.y + 0.1, pos.z, { count: 8, size: 0.5, color: 0xf0e8d8, speed: 4 });
    for (const e of this.stage.entities) {
      if (e.dead || !e.onFlop || !e.interactive) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, dy = e.pos.y - pos.y;
      if (dx * dx + dz * dz < 2.5 * 2.5 && Math.abs(dy) < 1.6) e.onFlop(g.player);
    }
  }

  dispose() {
    if (this.stage) this.stage.dispose();
  }
}
