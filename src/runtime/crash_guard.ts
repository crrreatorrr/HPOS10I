// Crash guard: keeps one thrown error from freezing the game forever.
//
// The main loop reports every frame to the guard (frameOk / frameFailed). A
// frame that throws is counted; after CRASH_HALT_FRAMES failing frames in a
// row the guard halts: the loop stops stepping the game and the onHalt
// listeners show a "Something broke" panel with a Reload button. A single bad
// frame followed by a good one just resets the streak.
//
// Uncaught errors and unhandled promise rejections (installGlobal) feed the
// same counter. Console output is rate-limited: the first CRASH_LOG_LIMIT
// distinct errors are logged once each with their stack, the rest are only
// counted, so a throw in every frame never logs 60 times a second.
//
// onCrash(fn) is the hook for an opt-in crash reporter (hub Diagnostics,
// later). Nothing here sends data anywhere.

/** Failing frames in a row before the game halts and shows the panel. */
export const CRASH_HALT_FRAMES = 3;
/** Distinct errors logged to the console per session; later ones are only counted. */
export const CRASH_LOG_LIMIT = 5;

export type CrashSource = 'frame' | 'error' | 'unhandledrejection' | 'boot';

export interface CrashInfo {
  readonly source: CrashSource;
  readonly error: unknown;
  readonly message: string;
  readonly stack: string;
  /** Errors seen this session, this one included. */
  readonly total: number;
  /** Failures since the last good frame, this one included. */
  readonly consecutive: number;
  /** True once the game has halted (this error tipped it, or it already had). */
  readonly halted: boolean;
}

export type CrashListener = (info: CrashInfo) => void;

/** The bits of `window` the guard listens on (a stand-in in tests). */
export interface CrashEventTarget {
  addEventListener(type: 'error' | 'unhandledrejection', fn: (e: Event) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', fn: (e: Event) => void): void;
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' };
  let message: string;
  try {
    message = typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return { message, stack: '' };
}

export class CrashGuard {
  total = 0;
  consecutive = 0;
  halted = false;
  /** Errors that were counted but not logged (rate limit). */
  suppressed = 0;

  private readonly logged = new Set<string>();
  private readonly crashListeners: CrashListener[] = [];
  private readonly haltListeners: CrashListener[] = [];
  private uninstall: (() => void) | null = null;

  constructor(
    readonly haltFrames = CRASH_HALT_FRAMES,
    readonly logLimit = CRASH_LOG_LIMIT,
    private readonly log: (...args: unknown[]) => void = (...args) => console.error(...args),
  ) {}

  /** Calls `fn` for every error the guard sees (crash reporter hook). Returns an unsubscribe. */
  onCrash(fn: CrashListener): () => void {
    this.crashListeners.push(fn);
    return () => {
      const i = this.crashListeners.indexOf(fn);
      if (i >= 0) this.crashListeners.splice(i, 1);
    };
  }

  /** Calls `fn` once, when the game halts (shows the panel). Returns an unsubscribe. */
  onHalt(fn: CrashListener): () => void {
    this.haltListeners.push(fn);
    return () => {
      const i = this.haltListeners.indexOf(fn);
      if (i >= 0) this.haltListeners.splice(i, 1);
    };
  }

  /** A frame finished without throwing: the failure streak resets. */
  frameOk(): void {
    this.consecutive = 0;
  }

  /** A frame threw. Returns true if the game is (now) halted. */
  frameFailed(error: unknown): boolean {
    return this.report(error, 'frame');
  }

  /** Any error (a frame, a global handler, boot). Returns true if the game is halted. */
  report(error: unknown, source: CrashSource): boolean {
    this.total++;
    this.consecutive++;
    const { message, stack } = describe(error);
    const tipping = !this.halted && (source === 'boot' || this.consecutive >= this.haltFrames);
    if (tipping) this.halted = true;
    this.writeLog(source, message, error);
    const info: CrashInfo = { source, error, message, stack, total: this.total, consecutive: this.consecutive, halted: this.halted };
    for (const fn of this.crashListeners.slice()) this.safely(fn, info);
    if (tipping) {
      this.log(`[Crash] game halted after ${this.consecutive} failing frame(s) in a row (${this.total} error(s) this session)`);
      for (const fn of this.haltListeners.slice()) this.safely(fn, info);
    }
    return this.halted;
  }

  /** Clears the halt and the streak (a dev "try to continue"; tests). */
  resume(): void {
    this.halted = false;
    this.consecutive = 0;
  }

  /** Listens for uncaught errors and unhandled rejections on `target` (window). */
  installGlobal(target: CrashEventTarget): void {
    this.uninstall?.();
    const onError = (e: Event) => {
      const ev = e as ErrorEvent;
      // We log it ourselves (once, with the stack): keep the browser from logging it again.
      ev.preventDefault?.();
      this.report(ev.error ?? ev.message ?? 'Unknown error', 'error');
    };
    const onRejection = (e: Event) => {
      const ev = e as PromiseRejectionEvent;
      ev.preventDefault?.();
      this.report(ev.reason, 'unhandledrejection');
    };
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    this.uninstall = () => {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
      this.uninstall = null;
    };
  }

  uninstallGlobal(): void {
    this.uninstall?.();
  }

  private writeLog(source: CrashSource, message: string, error: unknown): void {
    if (this.logged.has(message) || this.logged.size >= this.logLimit) {
      this.suppressed++;
      return;
    }
    this.logged.add(message);
    // The error object itself, so the console shows its stack.
    this.log(`[Crash] ${source}:`, error);
    if (this.logged.size === this.logLimit) this.log(`[Crash] further errors are counted but not logged`);
  }

  private safely(fn: CrashListener, info: CrashInfo): void {
    try {
      fn(info);
    } catch (err) {
      // A broken listener must not break the guard; log it through the same limit.
      this.writeLog(info.source, `listener: ${describe(err).message}`, err);
    }
  }
}

/** The game's guard: the main loop, window errors and boot all report here. */
export const crashGuard = new CrashGuard();

/** Hook for an opt-in crash reporter (hub Diagnostics). Sends nothing by itself. */
export function onCrash(fn: CrashListener): () => void {
  return crashGuard.onCrash(fn);
}
