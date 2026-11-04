// Run-wide state: tickets, score, lives, checkpoint, emeralds and the current
// zone/act. UI listens to the signals; gameplay calls the methods.

import { Signal } from '../runtime/signal';
import type { Vec2 } from '../runtime/vec2';
import { Audio } from './audio';
import { Emeralds } from './emeralds';
import { RelicLoadout } from '../hub/relic_loadout';

export const START_LIVES = 3;
export const TICKETS_PER_LIFE = 100;

class GameStateStore {
  readonly ticketsChanged = new Signal<[number]>();
  readonly scoreChanged = new Signal<[number]>();
  readonly livesChanged = new Signal<[number]>();
  readonly checkpointReached = new Signal<[Vec2]>();
  readonly levelCompleted = new Signal();
  /** A fresh attempt (startLevel), not a respawn. The hub client mints the earn id here. */
  readonly levelStarted = new Signal<[string, number]>();
  readonly emeraldWon = new Signal<[string, number]>();

  tickets = 0;
  score = 0;
  lives = START_LIVES;
  zoneId = '';
  act = 1;
  /** Seconds, counted on physics ticks (so it can't drift), stops while paused. */
  levelTime = 0;
  timerRunning = false;
  checkpointPosition: Vec2 | null = null;
  checkpointTime = 0;
  /** Emeralds.key -> true for every emerald won this game. */
  emeralds = new Set<string>();
  emeraldJustWon = false;

  private nextTicketLife = TICKETS_PER_LIFE;
  private goldenLifeActs = new Set<string>();

  /** Called by the game once per physics tick. */
  tick(delta: number): void {
    if (this.timerRunning) this.levelTime += delta;
  }

  addTickets(amount: number): void {
    this.tickets += amount;
    while (this.tickets >= this.nextTicketLife) {
      this.nextTicketLife += TICKETS_PER_LIFE;
      this.addLife();
    }
    this.ticketsChanged.emit(this.tickets);
  }

  /** Empties the ticket counter and returns how many were lost (for scattering). */
  loseTickets(): number {
    const lost = this.tickets;
    this.tickets = 0;
    this.ticketsChanged.emit(this.tickets);
    return lost;
  }

  addScore(amount: number): void {
    this.score += amount;
    this.scoreChanged.emit(this.score);
  }

  addLife(): void {
    this.lives += 1;
    this.livesChanged.emit(this.lives);
    Audio.playSfx('one_up');
  }

  loseLife(): void {
    this.lives -= 1;
    this.livesChanged.emit(this.lives);
  }

  setCheckpoint(position: Vec2): void {
    this.checkpointPosition = position;
    this.checkpointTime = this.levelTime;
    this.checkpointReached.emit(position);
  }

  /** A fresh act start (not a respawn). */
  startLevel(zoneId: string, act: number): void {
    this.zoneId = zoneId;
    this.act = act;
    this.emeraldJustWon = false;
    this.checkpointPosition = null;
    this.checkpointTime = 0;
    this.resetLevelCounters();
    this.levelStarted.emit(zoneId, act);
    this.grantGoldenLife();
  }

  /** Respawn after a death: keeps the checkpoint. */
  restartFromCheckpoint(): void {
    this.resetLevelCounters();
    this.levelTime = this.checkpointTime;
  }

  /** Goal reached: stops the timer and wins the act's emerald (before levelCompleted). */
  completeLevel(): void {
    this.timerRunning = false;
    this.emeraldJustWon = false;
    if (Emeralds.isEmeraldAct(this.zoneId, this.act) && !this.hasEmerald(this.zoneId, this.act)) {
      this.emeralds.add(Emeralds.key(this.zoneId, this.act));
      this.emeraldJustWon = true;
      this.emeraldWon.emit(this.zoneId, this.act);
    }
    this.levelCompleted.emit();
  }

  hasEmerald(zoneId: string, act: number): boolean {
    return this.emeralds.has(Emeralds.key(zoneId, act));
  }

  emeraldCount(): number {
    return this.emeralds.size;
  }

  resetGame(): void {
    this.goldenLifeActs.clear();
    this.score = 0;
    this.lives = START_LIVES;
    this.zoneId = '';
    this.act = 1;
    this.checkpointPosition = null;
    this.emeralds.clear();
    this.emeraldJustWon = false;
    this.resetLevelCounters();
    this.scoreChanged.emit(this.score);
    this.livesChanged.emit(this.lives);
  }

  /** +1 life at an act start with Golden Sproto equipped, unranked. Once per act per run. */
  private grantGoldenLife(): void {
    if (this.zoneId === '') return;
    if (!RelicLoadout.resolve().extra_life) return;
    const key = `${this.zoneId}:${this.act}`;
    if (this.goldenLifeActs.has(key)) return;
    this.goldenLifeActs.add(key);
    this.addLife();
  }

  private resetLevelCounters(): void {
    this.tickets = 0;
    this.nextTicketLife = TICKETS_PER_LIFE;
    this.levelTime = 0;
    this.timerRunning = true;
    this.ticketsChanged.emit(this.tickets);
  }
}

export const GameState = new GameStateStore();
