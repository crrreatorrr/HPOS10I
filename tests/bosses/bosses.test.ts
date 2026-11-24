// The four boss fights (docs/LEVELS.md "Bosses", docs/CONTRACTS.md
// "Bosses"): 8 hits, telegraphs before every attack (never under 0.35 s,
// aimed attacks lock their target), contact rules, invincibility after a
// hit, the respawn grace, escalation after hits 4 and 6, desperation for the
// last two only, ticket refills, the arena scenes, and a scripted bot that
// shows a human-viable route (a no-damage win against the first boss).

import { afterEach, describe, expect, it } from 'vitest';
import { Difficulty } from '../../src/core/difficulty';
import { GameState } from '../../src/core/game_state';
import { Scenes } from '../../src/core/scenes';
import { Gfx } from '../../src/runtime/gfx';
import { Node, Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { BoundsRect } from '../../src/levels/common/level_nodes';
import { LevelRoot } from '../../src/levels/common/level_root';
import { Checkpoint } from '../../src/levels/objects/checkpoint';
import { LevelTicket } from '../../src/levels/objects/ticket';
import { ArenaController, ArenaLayout, refillHits } from '../../src/bosses/arena';
import { Boss } from '../../src/bosses/boss_base';
import { BOSS_ARENAS, registerBosses } from '../../src/bosses/register';
import { buildRugPullArena } from '../../src/bosses/rug_pull/arena';
import { TheExecutive } from '../../src/bosses/the_executive/the_executive';
import { press, release, releaseAll, step } from '../helpers/world';
import { enterArena, floorPoint, landHit, openArena, playWithBot, recordTelegraphs, safeX, waitFor, type ArenaWorld } from './helpers';

interface Case {
  scene: keyof typeof BOSS_ARENAS;
  zone: string;
  desperation: boolean;
  specials: string[];
}

const CASES: Case[] = [
  { scene: 'boss:rug_pull', zone: 'z1_retro_rush_hills', desperation: false, specials: ['tassel_fan', 'loom_columns', 'fray_boomerang'] },
  { scene: 'boss:library_demon', zone: 'z2_wizard_academy', desperation: false, specials: ['ink_seals', 'bookends', 'quill_fall'] },
  { scene: 'boss:broccoli_head', zone: 'z3_capital_mansion', desperation: true, specials: ['rail_burst', 'wheelie', 'board_drop'] },
  { scene: 'boss:the_executive', zone: 'z4_neon_rush_remix', desperation: true, specials: ['closing_bell', 'red_tape', 'stamp'] },
];

/** 0.35 s at 60 Hz. */
const MIN_TELEGRAPH_FRAMES = 21;

const open = (c: Case): Promise<ArenaWorld> => openArena(async () => BOSS_ARENAS[c.scene]());

/** Lands all 8 hits (the helper waits for each opening). */
function winFight(w: ArenaWorld): void {
  enterArena(w);
  for (let i = 0; i < Boss.HITS; i++) expect(landHit(w), `hit ${i + 1}`).toBe(true);
}

/** Waits until touching the boss would hurt (no grace, no invincibility, not drained) and `extra` holds. */
function waitUntilHarmful(w: ArenaWorld, extra: () => boolean): void {
  const ok = waitFor(() => !w.boss.isTouchSafe() && extra(), 3000, () => {
    if (GameState.tickets < 20) GameState.addTickets(20);
    w.player.respawnAt(floorPoint(w, w.boss.position.x > (w.arena.info.left + w.arena.info.right) / 2 ? w.arena.info.left + 20 : w.arena.info.right - 20));
  });
  expect(ok).toBeGreaterThanOrEqual(0);
}

/** A Canvas2D stand-in that accepts every call. */
function stubGfx(): Gfx {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => {
      t[k as string] = v;
      return true;
    },
  });
  return new Gfx(ctx as unknown as CanvasRenderingContext2D);
}

/** Draws the boss, its hazards and overlay, the gates and the rooftop platforms. */
function drawAll(w: ArenaWorld, g: Gfx): void {
  const nodes: Node[] = [w.boss, ...w.boss.findChildren(), w.arena.entryGate, w.arena.exitGate, ...w.root.findChildren((n) => n.name.startsWith('Platform'))];
  for (const n of nodes) if (n instanceof Node2D && !n.isFreed()) n.draw(g);
}

afterEach(() => {
  releaseAll();
  tree.timeScale = 1;
});

describe('arena scenes', () => {
  it('registerBosses registers the four arenas under the zone registry ids', () => {
    registerBosses();
    for (const c of CASES) expect(Scenes.exists(c.scene), c.scene).toBe(true);
  });

  it.each(CASES)('$scene builds a LevelRoot with Bounds, PlayerStart, a checkpoint and tickets outside the gate', async (c) => {
    registerBosses();
    const root = await Scenes.factory(c.scene)!();
    expect(root).toBeInstanceOf(LevelRoot);
    const level = root as LevelRoot;
    expect(level.zoneId).toBe(c.zone);
    expect(level.music).toBe('boss');
    const bounds = level.getNodeOrNull<BoundsRect>('Bounds');
    expect(bounds).toBeInstanceOf(BoundsRect);
    expect(bounds!.rect.hasArea()).toBe(true);
    expect(level.getNodeOrNull('PlayerStart')).not.toBeNull();
    const checkpoints = level.findChildren<Checkpoint>((n) => n instanceof Checkpoint);
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0]!.position.x).toBeLessThan(ArenaLayout.GATE_X);
    const tickets = level.findChildren<LevelTicket>((n) => n instanceof LevelTicket);
    expect(tickets.length).toBeGreaterThanOrEqual(3);
    for (const t of tickets) expect(t.position.x).toBeLessThan(ArenaLayout.GATE_X);
    // A retry respawns at the checkpoint: it stands before every ticket, so he picks them all up again.
    for (const t of tickets) expect(t.position.x).toBeGreaterThan(checkpoints[0]!.position.x + 16);
    expect(level.findChildren((n) => n.isInGroup('boss')).length).toBe(1);
  });

  it.each(CASES)('$scene: a retry from the checkpoint walks through every corridor ticket again', async (c) => {
    const first = await open(c);
    press('move_right');
    expect(waitFor(() => first.boss.engaged, 60 * 20)).toBeGreaterThan(0);
    release('move_right');
    expect(GameState.tickets).toBe(ArenaLayout.CORRIDOR_TICKETS.length);
    const at = GameState.checkpointPosition;
    expect(at).not.toBeNull();
    // Died in the arena: the respawn is a fresh scene from the checkpoint, on 0 tickets.
    GameState.restartFromCheckpoint();
    expect(GameState.tickets).toBe(0);
    const root = await BOSS_ARENAS[c.scene]();
    root.useSceneRouter = false;
    tree.changeSceneNow(() => root);
    step(2);
    expect(root.player!.globalPosition.x).toBeCloseTo(at!.x, 0);
    press('move_right');
    expect(waitFor(() => (ArenaController.find(root)?.boss.engaged ?? false), 60 * 20)).toBeGreaterThan(0);
    release('move_right');
    expect(GameState.tickets).toBe(ArenaLayout.CORRIDOR_TICKETS.length);
  });

  it.each(CASES)('$scene locks the camera and shuts the gate when Sproto walks in', async (c) => {
    const w = await open(c);
    expect(w.player.globalPosition.x).toBeLessThan(ArenaLayout.GATE_X);
    expect(w.boss.engaged).toBe(false);
    press('move_right');
    expect(waitFor(() => w.boss.engaged, 60 * 20)).toBeGreaterThan(0);
    release('move_right');
    expect(w.arena.entryGate.closed).toBe(true);
    step(60);
    const view = w.root.camera!.viewRect();
    expect(view.x).toBeCloseTo(w.arena.info.view.x, 0);
    expect(view.right).toBeCloseTo(w.arena.info.view.right, 0);
  });
});

describe.each(CASES)('$scene', (c) => {
  it('has a weak point in group boss_weak_point and a harmful body in group boss_body', async () => {
    const w = await open(c);
    expect(w.boss.weakPoint.isInGroup('boss_weak_point')).toBe(true);
    expect(w.boss.body.isInGroup('boss_body')).toBe(true);
    expect(w.boss.tuning).toEqual(Difficulty.boss(c.zone));
  });

  it('takes exactly 8 hits, emits defeated once, then opens the exit and completes the level', async () => {
    const w = await open(c);
    const left: number[] = [];
    let defeated = 0;
    let finishing = 0;
    w.boss.hitTaken.connect((n) => left.push(n));
    w.boss.defeated.connect(() => (defeated += 1));
    w.root.levelFinishing.connect(() => (finishing += 1));
    enterArena(w);
    for (let i = 0; i < 7; i++) expect(landHit(w), `hit ${i + 1}`).toBe(true);
    expect(w.boss.isDefeated).toBe(false);
    expect(defeated).toBe(0);
    expect(landHit(w)).toBe(true);
    expect(defeated).toBe(1);
    expect(w.boss.isDefeated).toBe(true);
    expect(left).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(w.boss.liveHazards().length).toBe(0);
    expect(waitFor(() => finishing > 0, 60 * 8)).toBeGreaterThan(0);
    expect(w.arena.exitGate.closed).toBe(false);
    expect(defeated).toBe(1);
  });

  it('speeds up after hits 4 and 6 (and changes phase); desperation only when the design says', async () => {
    const w = await open(c);
    const escalations: [number, number][] = [];
    const phases: number[] = [];
    const telegraphs: number[] = [];
    w.boss.escalated.connect((s) => escalations.push([w.boss.hitsTaken, s]));
    w.boss.phaseChanged.connect((p) => phases.push(p));
    w.boss.hitTaken.connect(() => telegraphs.push(w.boss.telegraphFrames(1)));
    const window1 = w.boss.weakWindowFrames();
    const speed1 = w.boss.speedPx(1);
    winFight(w);
    const e = w.boss.tuning.escalation;
    expect(escalations.map(([h]) => h)).toEqual([4, 6]);
    expect(escalations[0]![1]).toBeCloseTo(e, 6);
    expect(escalations[1]![1]).toBeCloseTo(e * e, 6);
    expect(phases).toEqual([2, 3]);
    expect(w.boss.speedPx(1)).toBeCloseTo(speed1 * e * e, 6);
    // Telegraphs only get shorter (never under 0.35 s).
    for (let i = 1; i < telegraphs.length; i++) expect(telegraphs[i]!).toBeLessThanOrEqual(telegraphs[i - 1]!);
    for (const t of telegraphs) expect(t).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(w.boss.desperate).toBe(c.desperation);
    if (c.desperation) {
      expect(w.boss.weakWindowFrames()).toBe(Math.round(w.boss.tuning.weak_window * 60));
      expect(window1).toBeGreaterThan(w.boss.weakWindowFrames());
    } else {
      expect(w.boss.weakWindowFrames()).toBe(window1);
    }
  });

  it('telegraphs every attack for at least 0.35 s before it starts', async () => {
    const w = await open(c);
    const log = recordTelegraphs(w.boss);
    winFight(w);
    expect(log.unmatched).toEqual([]);
    expect(log.pairs.length).toBeGreaterThanOrEqual(8 * w.boss.tuning.attacks_per_cycle);
    for (const p of log.pairs) {
      expect(p.attack - p.telegraph, `${p.id} at ${p.telegraph}`).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
      expect(p.frames).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    }
  });

  it('uses every special and keeps its hazards inside the warned area', async () => {
    const w = await open(c);
    const warnings = new Map<string, Rect2[]>();
    const seen = new Set<string>();
    const outside: string[] = [];
    w.boss.telegraphStarted.connect((id) => {
      if (c.specials.includes(id)) warnings.set(id, w.boss.dangerZones());
    });
    const observer = w.root.addChild(new Node('ObserveBossSpecials'));
    observer.processPriority = 200;
    observer.physicsProcess = () => {
      for (const hazard of w.boss.liveHazards()) {
        if (!c.specials.includes(hazard.name)) continue;
        seen.add(hazard.name);
        const hit = hazard.rect();
        const zones = warnings.get(hazard.name) ?? [];
        if (!zones.some((zone) => zone.grow(.01).encloses(hit))) outside.push(hazard.name);
      }
    };
    winFight(w);
    expect([...seen].sort()).toEqual([...c.specials].sort());
    expect(outside).toEqual([]);
  });

  it('locks an aimed attack on where Sproto was when the telegraph started', async () => {
    const w = await open(c);
    enterArena(w);
    let checked = 0;
    for (let guard = 0; guard < 60 * 60 && checked < 2; guard++) {
      GameState.addTickets(GameState.tickets < 20 ? 20 : 0);
      const t = w.boss.currentTelegraph();
      if (t && t.plan.aimed && t.left === t.frames) {
        const locked = w.boss.lockedTarget!;
        expect(locked).not.toBeNull();
        expect(locked.distanceTo(t.target)).toBe(0);
        // Run away during the telegraph: the target stays put.
        const away = locked.x > (w.arena.info.left + w.arena.info.right) / 2 ? -1 : 1;
        w.player.respawnAt(floorPoint(w, locked.x + away * 120));
        step(3);
        expect(w.boss.currentTelegraph()?.target.distanceTo(locked)).toBe(0);
        expect(w.boss.lockedTarget?.distanceTo(locked)).toBe(0);
        checked += 1;
      }
      if (!landedAndStep(w)) break;
    }
    expect(checked).toBe(2);
  });

  it('hurts Sproto on the closed weak point and on the body', async () => {
    const w = await open(c);
    enterArena(w);
    // The closed weak point, landed on in a jump.
    waitUntilHarmful(w, () => !w.boss.isWeakOpen() && w.boss.weakRect() !== null);
    const before = w.boss.hitsTaken;
    const hurts = w.hurts;
    press('jump');
    step(2);
    expect(w.player.isAttacking()).toBe(true);
    for (let i = 0; i < 6 && w.hurts === hurts; i++) {
      const weak = w.boss.weakRect();
      if (!weak) break;
      w.player.globalPosition = new Vec2(weak.center.x, weak.center.y);
      w.player.velocity = new Vec2(0, 1);
      step(1);
    }
    release('jump');
    expect(w.hurts).toBe(hurts + 1);
    expect(w.boss.hitsTaken).toBe(before);
    // The body, walked into.
    step(150);
    waitUntilHarmful(w, () => w.boss.bodyRects().length > 0);
    const hurts2 = w.hurts;
    for (let i = 0; i < 6 && w.hurts === hurts2; i++) {
      const body = w.boss.bodyRects()[0]!;
      w.player.respawnAt(body.center);
      step(1);
    }
    expect(w.hurts).toBe(hurts2 + 1);
    expect(w.boss.hitsTaken).toBe(before);
  });

  it('ignores a second hit during its invincibility after a hit', async () => {
    const w = await open(c);
    enterArena(w);
    expect(landHit(w)).toBe(true);
    expect(w.boss.isInvincible()).toBe(true);
    const hurts = w.hurts;
    press('jump');
    let frames = 0;
    while (w.boss.isInvincible() && frames < Boss.HIT_INVINCIBLE_FRAMES + 5) {
      const weak = w.boss.weakRect();
      if (weak && frames % 10 === 0 && frames < Boss.HIT_INVINCIBLE_FRAMES - 30) {
        w.player.globalPosition = new Vec2(weak.center.x, weak.y - 10);
        w.player.velocity = new Vec2(0, 3);
      }
      // Leave before it wears off (touching it after that hurts again).
      if (frames === Boss.HIT_INVINCIBLE_FRAMES - 20) w.player.respawnAt(floorPoint(w, safeX(w)));
      step(1);
      frames += 1;
    }
    release('jump');
    expect(frames).toBeGreaterThanOrEqual(60); // 1-2 s
    expect(frames).toBeLessThanOrEqual(120);
    expect(w.boss.hitsTaken).toBe(1);
    expect(w.hurts).toBe(hurts);
  });

  it('cannot hit Sproto within 2 s of the fight starting or of a respawn', async () => {
    const w = await open(c);
    enterArena(w);
    for (let i = 0; i < Boss.GRACE_FRAMES - 2; i++) {
      expect(w.boss.canHarm()).toBe(false);
      const body = w.boss.bodyRects()[0];
      if (body) w.player.respawnAt(body.center);
      step(1);
    }
    expect(w.hurts).toBe(0);
    // Later: dies and comes back in place: another 2 s of grace.
    step(200);
    GameState.tickets = 0;
    w.player.kill();
    step(70);
    w.player.respawnAt(floorPoint(w, w.arena.info.left + 30));
    step(1);
    expect(w.boss.canHarm()).toBe(false);
    expect(w.boss.graceLeft()).toBeGreaterThan(Boss.GRACE_FRAMES - 3);
    const hurts = w.hurts;
    for (let i = 0; i < Boss.GRACE_FRAMES - 4; i++) {
      for (const h of w.boss.liveHazards()) w.player.respawnAt(h.globalPosition);
      step(1);
    }
    expect(w.hurts).toBe(hurts);
  });

  it('drops ticket refills after the hits the design names', async () => {
    const w = await open(c);
    const at: number[] = [];
    let count = 0;
    enterArena(w);
    for (let i = 0; i < Boss.HITS; i++) {
      expect(landHit(w)).toBe(true);
      const now = w.root.findChildren((n) => n instanceof LevelTicket && n.name.startsWith('Refill')).length;
      if (now > count) at.push(w.boss.hitsTaken);
      count = now;
    }
    expect(at).toEqual(refillHits(w.boss.tuning.ticket_refills));
    if (c.desperation) expect(at).toEqual([4]);
  });

  it('keeps every open weak point within a standing jump of the floor', async () => {
    const w = await open(c);
    const tops: number[] = [];
    w.boss.weakPointOpened.connect(() => tops.push(w.arena.info.floorY - w.boss.weakRect()!.bottom));
    winFight(w);
    expect(tops.length).toBeGreaterThanOrEqual(8);
    // A jump lifts the ball's top about 120 px; its bottom clears 96 px.
    for (const h of tops) expect(h).toBeLessThan(80);
  });

  it('draws every part in every phase without throwing', async () => {
    const w = await open(c);
    const g = stubGfx();
    enterArena(w);
    for (let i = 0; i < Boss.HITS; i++) {
      expect(landHit(w)).toBe(true);
      for (let k = 0; k < 6; k++) {
        step(17);
        drawAll(w, g);
      }
    }
    for (let k = 0; k < 10; k++) {
      step(20);
      drawAll(w, g);
    }
  });

  it('the scripted bot reaches the open weak point in every phase and wins (tickets topped up)', async () => {
    const w = await open(c);
    w.player.respawnAt(w.player.globalPosition);
    const won = playWithBot(w, 60 * 400, true);
    expect(w.boss.hitsTaken).toBe(Boss.HITS);
    expect(won).toBe(true);
  }, 240_000);
});

describe('fairness', () => {
  it('restores caster contact damage only after a player already touching it moves away', async () => {
    const w = await open(CASES[1]!);
    let specialStarted = false;
    w.boss.attackStarted.connect((id) => {
      if (id === 'ink_seals') specialStarted = true;
    });
    enterArena(w);
    expect(landHit(w)).toBe(true);
    const waitSafely = () => w.player.respawnAt(floorPoint(w, safeX(w)));
    expect(waitFor(() => specialStarted && w.boss.liveHazards().some((h) => h.name === 'ink_seals'), 2000, waitSafely)).toBeGreaterThan(0);
    expect(waitFor(() => w.boss.liveHazards().length === 0, 200, waitSafely)).toBeGreaterThan(0);
    expect(w.boss.isTouchSafe()).toBe(true);
    const before = w.hurts;
    const touchWeakPoint = () => w.player.respawnAt(w.boss.weakRect()!.center);
    expect(waitFor(() => !w.boss.isTouchSafe(), 50, touchWeakPoint)).toBeGreaterThan(0);
    touchWeakPoint();
    step(2);
    expect(w.hurts).toBe(before);
    waitSafely();
    step(2);
    touchWeakPoint();
    step(2);
    expect(w.hurts).toBe(before + 1);
  });


  it('a scripted bot beats the Rug Pull without taking any damage (a human-viable route)', async () => {
    const w = await openArena(async () => buildRugPullArena());
    expect(GameState.tickets).toBe(0); // one touch would end the run
    const won = playWithBot(w, 60 * 240);
    expect(w.hurts).toBe(0);
    expect(won).toBe(true);
  }, 120_000);

  it('the final hit on the Executive runs in slow motion, then time goes back to normal', async () => {
    const w = await open(CASES[3]!);
    const boss = w.boss as TheExecutive;
    let slow = 1;
    boss.defeated.connect(() => (slow = tree.timeScale));
    winFight(w);
    expect(slow).toBeLessThan(1);
    step(60);
    expect(tree.timeScale).toBe(1);
    expect(boss.split).toBe(true);
    expect(boss.platforms.length).toBe(3);
  });
});

describe('the Executive over the split roof', () => {
  /** Lands `hits` hits, then keeps Sproto safe (topped up, back on a ledge after a fall) while `each` watches. */
  async function splitFight(hits: number): Promise<{ w: ArenaWorld; boss: TheExecutive }> {
    const w = await open(CASES[3]!);
    enterArena(w);
    for (let i = 0; i < hits; i++) expect(landHit(w), `hit ${i + 1}`).toBe(true);
    const boss = w.boss as TheExecutive;
    expect(waitFor(() => boss.split, 600, () => GameState.tickets < 20 && GameState.addTickets(20))).toBeGreaterThanOrEqual(0);
    return { w, boss };
  }

  it('the arrow slide, and his way down to it and back up, never touch the ledges', async () => {
    const { w, boss } = await splitFight(4);
    const { left, right, floorY } = w.arena.info;
    const ledges = [new Rect2(left, floorY - 80, 56, 80), new Rect2(right - 56, floorY - 80, 56, 80)];
    let sliding = false;
    let slides = 0;
    boss.attackStarted.connect((id) => {
      if (id === 'arrow_slide') {
        sliding = true;
        slides += 1;
      } else sliding = false;
    });
    const parked = () => w.player.respawnAt(floorPoint(w, left + 6));
    for (let i = 0; i < 60 * 40 && slides < 2; i++) {
      if (GameState.tickets < 20) GameState.addTickets(20);
      parked();
      step(1);
      if (sliding) for (const r of boss.bodyRects()) for (const l of ledges) expect(r.intersects(l), `frame ${i}: body ${r} over a ledge`).toBe(false);
    }
    expect(slides).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('in desperation the market crash leaves a four-lane gap (its paper storm lands in it at once)', async () => {
    const { w, boss } = await splitFight(6);
    expect(boss.desperate).toBe(true);
    const laneW = (w.arena.info.right - w.arena.info.left) / 8;
    let marked = -1;
    for (let i = 0; i < 60 * 40 && marked < 0; i++) {
      if (GameState.tickets < 20) GameState.addTickets(20);
      if (w.player.globalPosition.y > w.arena.info.floorY + 4 || w.player.state === 'hurt') w.player.respawnAt(floorPoint(w, safeX(w)));
      step(1);
      if (boss.currentTelegraph()?.plan.id === 'crash') marked = boss.dangerZones().filter((z) => Math.abs(z.w - laneW) < 1).length;
    }
    expect(marked).toBe(8 - 4);
  }, 60_000);
});

/** One tick of a passive fight: tickets topped up, Sproto kept on the floor away from the boss. */
function landedAndStep(w: ArenaWorld): boolean {
  if (w.player.state === 'dead') return false;
  if (w.player.globalPosition.y > w.arena.info.floorY + 4) w.player.respawnAt(floorPoint(w, w.arena.info.left + 20));
  step(1);
  return true;
}
