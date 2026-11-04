// The game's connection to the hub, on the vendored @metaverse/hub-sdk.
//
// - Boot: init('hpos10i') redeems the #t= portal ticket (or reuses the tab's
//   session) and reads Relics, Ranked and the loadout. Without a server key,
//   a ticket or a network, the game plays standalone ("offline").
// - Every act start mints a run id (saved first); every act clear banks the
//   tickets collected as hub Tickets with that id as the idempotency key, so
//   a retry, a reload or a second tab can never pay twice. Unacked earns are
//   resent after the next successful init.
// - Every act clear is reported as hpos10i.level_complete {zone, act}: the
//   server grants the HPOS10I Core for Zone 1 Act 1 and pets for later acts.
// - The act-time board keeps one time per player, so only Zone 1 Act 1 posts
//   to it (a like-for-like time trial; the server ignores unranked runs).
// - Exit to Hub flushes the SDK outbox and returns to <hubUrl>#from=hpos10i.
//
// Writes are fire-and-forget: the SDK's IndexedDB outbox resends each key
// until it is acked.

import { createHubSdk, type HubSdk, type GameId } from '@hub-sdk';
import { GameState } from '../core/game_state';
import { SceneRouter } from '../core/scene_router';
import { Signal } from '../runtime/signal';
import { HubSave } from './hub_save';

export const GAME_ID: GameId = 'hpos10i';
export const EVENT_LEVEL_COMPLETE = 'hpos10i.level_complete';
export const BOARD_ACT_TIME = 'hpos10i_act_time';
export const BOARD_ZONE = 'z1_retro_rush_hills';
export const BOARD_ACT = 1;
export const EARN_REASON = 'level_end';
/** How often the session token is checked for refresh (the SDK refreshes within 5 min of expiry). */
const REFRESH_EVERY_MS = 120_000;

export type Reach = 'offline' | 'pending' | 'ready';

type Payload = Record<string, unknown>;

function errorPayload(err: unknown): Payload {
  const e = err as { code?: unknown; message?: unknown } | null;
  return {
    code: e && e.code ? String(e.code) : 'rejected',
    message: e && e.message ? String(e.message) : String(err),
  };
}

class HubClientImpl {
  readonly stateChanged = new Signal();
  reach: Reach = 'offline';
  inSession = false;
  /** Server Ticket balance, mirrored from earn answers (never saved locally). */
  ticketBalance = 0;
  balanceKnown = false;
  ticketsCapLeft = 0;
  earnCapped = false;
  effects: Record<string, unknown> = {};
  relics: string[] = [];
  ranked = false;
  serverLoadout: Record<string, unknown> = {};
  /** Bumped on every state change (RelicLoadout caches on it). */
  revision = 0;
  /** Last banked earn, for the tally ("+N Tickets to the hub"). */
  lastBanked: { amount: number; acked: boolean } | null = null;

  readonly save = new HubSave();
  private sdk: HubSdk | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private wired = false;
  private hubUrl = '/hub/';

  /** Connects to the hub. Pass an SDK in tests; the browser build creates the real one. */
  async init(opts: { sdk?: HubSdk | null; hubUrl?: string; serverKey?: string } = {}): Promise<void> {
    this.save.loadAll();
    this.hubUrl = opts.hubUrl ?? __HUB_URL__;
    this.wire();
    let sdk = opts.sdk ?? null;
    if (!sdk && typeof window !== 'undefined') {
      try {
        sdk = createHubSdk({ serverUrl: '', serverKey: opts.serverKey ?? __NAKAMA_SERVER_KEY__, hubUrl: this.hubUrl });
      } catch (err) {
        console.warn('[Hub] SDK unavailable, playing standalone', err);
      }
    }
    this.sdk = sdk;
    if (!sdk) {
      this.reach = 'offline';
      this.changed();
      return;
    }
    this.reach = 'pending';
    this.changed();
    try {
      const result = (await sdk.init(GAME_ID)) as unknown as Payload;
      this.onInit(true, result ?? {});
    } catch (err) {
      this.onInit(false, errorPayload(err));
    }
  }

  /** Disconnects listeners (tests). */
  shutdown(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.sdk = null;
    this.reach = 'offline';
    this.inSession = false;
    this.relics = [];
    this.ranked = false;
    this.serverLoadout = {};
    this.ticketBalance = 0;
    this.balanceKnown = false;
    this.lastBanked = null;
    this.changed();
  }

  exitToHub(): void {
    const base = this.hubUrl.replace(/\/+$/, '');
    const target = `${base}/#from=${GAME_ID}`;
    try {
      // Flushes the outbox; with a session it navigates itself.
      this.sdk?.exit('exit_to_hub');
    } catch {
      /* fall through to plain navigation */
    }
    if (typeof window !== 'undefined') window.location.assign(target);
  }

  /** The hub URL players return to (shown in the pause menu). */
  get hubTarget(): string {
    return this.hubUrl;
  }

  private changed(): void {
    this.revision++;
    this.stateChanged.emit();
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    GameState.levelStarted.connect((zone, act) => this.onLevelStarted(zone, act));
    GameState.levelCompleted.connect(() => this.onLevelCompleted());
  }

  private onInit(ok: boolean, payload: Payload): void {
    if (!ok) {
      this.reach = 'offline';
      this.inSession = false;
      this.relics = [];
      this.ranked = false;
      this.serverLoadout = {};
      this.changed();
      return;
    }
    this.reach = 'ready';
    this.effects = payload.effects && typeof payload.effects === 'object' ? (payload.effects as Payload) : {};
    this.relics = stringList(payload.relics);
    this.ranked = payload.ranked === true;
    this.serverLoadout = loadoutFrom(payload);
    this.ticketsCapLeft = Number(payload.ticketsCapLeft ?? 0);
    this.inSession = this.readSession();
    // Resend only with a session: a no-session call answers with a no-op and
    // must not clear the slot while the outbox may still drain the key.
    if (this.inSession) {
      this.resendPendingEarns();
      this.startRefresh();
    }
    this.changed();
  }

  private readSession(): boolean {
    const info = this.sdk?.getSession?.();
    if (info) return true;
    try {
      const raw = globalThis.sessionStorage?.getItem(`hub:${GAME_ID}:session`);
      return raw !== null && raw !== undefined && raw !== '';
    } catch {
      return false;
    }
  }

  private startRefresh(): void {
    if (this.refreshTimer || !this.sdk?.refreshSession) return;
    this.refreshTimer = setInterval(() => {
      void this.sdk?.refreshSession?.().catch(() => undefined);
    }, REFRESH_EVERY_MS);
  }

  // --- Level hooks -------------------------------------------------------------------

  private onLevelStarted(zone: string, act: number): void {
    // Respawns keep the attempt; only a fresh start (startLevel) mints a run id.
    if (SceneRouter.freeScene !== '' || zone === '') return;
    if (!this.save.beginAttempt(zone, act)) {
      console.warn('[Hub] level attempt id was not saved; earnTickets will not be sent until it is');
    }
  }

  private onLevelCompleted(): void {
    // Sandboxes and the dev menu set a free scene. Real acts leave it empty.
    if (SceneRouter.freeScene !== '') return;
    const zone = GameState.zoneId;
    const act = GameState.act;
    if (zone === '') return;
    // Boss arenas are stage acts + 1: they bank tickets but are not acts.
    const timeMs = Math.round(GameState.levelTime * 1000);
    const timeSec = timeMs / 1000;
    const tickets = Math.trunc(GameState.tickets);
    const zoneDef = SceneRouter.currentZone();
    const isAct = !!zoneDef && act >= 1 && act <= zoneDef.acts.length;
    if (isAct) {
      const best = this.save.recordClear(zone, act, timeSec);
      if (zone === BOARD_ZONE && act === BOARD_ACT) {
        void this.call(() => this.sdk!.submitScore(BOARD_ACT_TIME, best, { zone, act }));
      }
      // One key per clear: the attempt's run id is part of the id, so two
      // attempts that clear the same act in the same time are two reports.
      if (!this.save.runMatches(zone, act)) this.save.beginAttempt(zone, act);
      const eventKey = this.save.keyFor('relic', `${zone}:${act}:${this.save.currentRunId()}:${timeMs}`);
      void this.call(() => this.sdk!.reportEvent(EVENT_LEVEL_COMPLETE, { zone, act, time: timeSec }, eventKey));
    }
    if (tickets > 0) this.bankTickets(zone, act, tickets);
  }

  private bankTickets(zone: string, act: number, tickets: number): void {
    if (!this.save.runMatches(zone, act)) this.save.beginAttempt(zone, act);
    if (!this.save.isRunOnDisk() && !this.save.persistRun()) {
      console.warn('[Hub] earn left pending; run id was not saved, so earnTickets was not sent');
      return;
    }
    const runId = this.save.currentRunId();
    const existing = this.save.earnRecord(runId);
    const amount = existing ? existing.amount : tickets;
    if (!this.save.commitEarn(runId, amount)) {
      console.warn('[Hub] earn left pending; could not save the idempotency key, so earnTickets was not sent');
      return;
    }
    const saved = this.save.earnRecord(runId);
    if (!saved || saved.acked) return;
    this.lastBanked = { amount: saved.amount, acked: false };
    this.sendEarn(runId, saved.amount);
  }

  private resendPendingEarns(): void {
    for (const rec of this.save.unackedEarns()) {
      if (rec.runId !== '' && rec.amount > 0) this.sendEarn(rec.runId, rec.amount);
    }
  }

  private sendEarn(runId: string, amount: number): void {
    const sdk = this.sdk;
    if (!sdk) return;
    sdk.earnTickets(amount, EARN_REASON, runId).then(
      (res) => this.onEarn(true, (res ?? {}) as unknown as Payload, runId),
      (err: unknown) => this.onEarn(false, errorPayload(err), runId),
    );
  }

  private onEarn(ok: boolean, payload: Payload, runId: string): void {
    if (!ok) {
      const code = String(payload.code ?? '');
      // Caps and idempotency mismatches never succeed on retry.
      if (code === 'idempotency_mismatch' || code.endsWith('_cap')) {
        this.save.ackEarn(runId);
        console.warn(`[Hub] dropped earn ${runId} (${code}): ${String(payload.message ?? '')}`);
        if (code.endsWith('_cap')) this.earnCapped = true;
        this.changed();
      }
      return;
    }
    if (!('balance' in payload)) return;
    if (!this.inSession && !this.readSession()) return;
    this.inSession = true;
    this.save.ackEarn(runId);
    this.ticketBalance = Number(payload.balance);
    this.balanceKnown = true;
    this.earnCapped = payload.capped === true;
    if (this.lastBanked) this.lastBanked = { ...this.lastBanked, acked: true };
    this.changed();
  }

  private async call(fn: () => Promise<unknown>): Promise<void> {
    if (!this.sdk) return;
    try {
      await fn();
    } catch (err) {
      console.info('[Hub] call failed', errorPayload(err));
    }
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = String(item);
    if (id !== '' && !out.includes(id)) out.push(id);
  }
  return out;
}

function loadoutFrom(payload: Payload): Record<string, unknown> {
  const items = payload.items;
  if (!items || typeof items !== 'object') return {};
  const loadout = (items as Payload).loadout;
  return loadout && typeof loadout === 'object' && !Array.isArray(loadout) ? (loadout as Payload) : {};
}

export const HubClient = new HubClientImpl();
