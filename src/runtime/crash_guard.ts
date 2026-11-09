// Crash guard: keeps one thrown error from freezing the game forever.
//
// The main loop reports every frame to the guard (frameOk / frameFailed). A
// frame that throws is counted; after CRASH_HALT_FRAMES failures in a row the
// guard halts: the loop stops stepping the game and the onHalt listeners show
// a "Something broke" panel with a Reload button. A single bad frame followed
// by a good one just resets the streak.
//
// Uncaught errors and unhandled promise rejections (installGlobal) are counted
// too, but they only add to a streak that already has a failing frame in it:
// errors from async loading or a hidden tab never halt the game by themselves.
// Browser noise (ResizeObserver loop warnings, cross-origin "Script error.",
// other origins' scripts, AbortError/NotAllowedError rejections) is ignored.
// The guard never calls preventDefault, so the browser still logs every
// uncaught error itself.
//
// Console output is rate-limited: the guard writes at most CRASH_LOG_LIMIT
// lines per session (distinct errors by message and stack, the halt line, the
// "further errors" note), so a throw in every frame never logs 60 times a
// second. A caught frame error is also handed once to `reportError`, so the
// browser and QA page-error checks still see it as uncaught; the guard's own
// window listener does not count it a second time.
//
// onCrash(fn) is the hook for an opt-in crash reporter (hub Diagnostics,
// later). Nothing here sends data anywhere.

/** Failures in a row before the game halts and shows the panel. */
export const CRASH_HALT_FRAMES = 3;
/** Console lines the guard writes per session; later errors are only counted. */
export const CRASH_LOG_LIMIT = 5;
/** Distinct errors remembered for dedupe; past this, new ones are only counted. */
const MAX_SIGNATURES = 100;

export type CrashSource = 'frame' | 'error' | 'unhandledrejection' | 'boot';

export interface CrashInfo {
  readonly source: CrashSource;
  readonly error: unknown;
  readonly message: string;
  readonly stack: string;
  /** Errors seen this session, this one included. */
  readonly total: number;
  /** Failures in the current streak (it starts with a failing frame), this one included. */
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

/** The fields of an ErrorEvent the noise filter reads. */
export interface ErrorEventLike {
  readonly message?: string;
  readonly error?: unknown;
  readonly filename?: string;
}

/**
 * Browser noise that is not a game error: ResizeObserver loop warnings, a cross-origin
 * "Script error." (no error object), and errors thrown by another origin's script
 * (extensions, injected ads). `origin` is the page's origin; without one the file check is skipped.
 */
export function isBenignError(ev: ErrorEventLike, origin?: string): boolean {
  const message = typeof ev.message === 'string' ? ev.message : '';
  if (/ResizeObserver loop/.test(message)) return true;
  const hasError = ev.error !== undefined && ev.error !== null;
  if (!hasError && /^Script error\.?$/.test(message.trim())) return true;
  if (origin && ev.filename) {
    try {
      if (new URL(ev.filename, origin).origin !== origin) return true;
    } catch {
      // Not a URL we can read: keep the error.
    }
  }
  return false;
}

/** Rejections that are not game errors: an aborted fetch or media play, autoplay refused. */
export function isBenignRejection(reason: unknown): boolean {
  if (typeof reason !== 'object' || reason === null) return false;
  const name = (reason as { name?: unknown }).name;
  return name === 'AbortError' || name === 'NotAllowedError';
}

function describeTarget(target: unknown): string {
  if (typeof target !== 'object' || target === null) return '';
  const el = target as { tagName?: unknown; src?: unknown; href?: unknown };
  if (typeof el.tagName !== 'string') return '';
  const url = typeof el.src === 'string' && el.src ? ` src="${el.src}"` : typeof el.href === 'string' && el.href ? ` href="${el.href}"` : '';
  return ` on <${el.tagName.toLowerCase()}${url}>`;
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' };
  if (typeof error === 'string') return { message: error, stack: '' };
  if (typeof error === 'object' && error !== null) {
    const o = error as { type?: unknown; isTrusted?: unknown; target?: unknown; name?: unknown; message?: unknown; stack?: unknown };
    // A DOM Event (an <img> or <script> load failure rejected as-is): name it, not {"isTrusted":true}.
    if ((typeof Event !== 'undefined' && error instanceof Event) || (typeof o.type === 'string' && typeof o.isTrusted === 'boolean')) {
      return { message: `Event "${String(o.type)}"${describeTarget(o.target)}`, stack: '' };
    }
    // Error-shaped objects (a DOMException from another realm, a library's error object).
    if (typeof o.message === 'string') {
      const name = typeof o.name === 'string' && o.name ? o.name : 'Error';
      return { message: `${name}: ${o.message}`, stack: typeof o.stack === 'string' ? o.stack : '' };
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return { message: json, stack: '' };
    } catch {
      // Circular or otherwise not JSON: fall through.
    }
    return { message: Object.prototype.toString.call(error), stack: '' };
  }
  return { message: String(error), stack: '' };
}

export class CrashGuard {
  total = 0;
  consecutive = 0;
  halted = false;
  /** Errors that were counted but not logged (repeats and the rate limit). */
  suppressed = 0;

  /** Whether the current streak has a failing frame; only then do global errors add to it. */
  private streakHasFrame = false;
  /** Console lines written this session (capped at logLimit). */
  private lines = 0;
  private readonly logged = new Set<string>();
  /** Frame errors handed to reportError: the window listener must not count them again. */
  private readonly surfaced = new WeakSet<object>();
  private readonly crashListeners: CrashListener[] = [];
  private readonly haltListeners: CrashListener[] = [];
  private uninstall: (() => void) | null = null;

  /**
   * @param surface Hands a caught frame error back to the browser (once per distinct error).
   *   Left out: `globalThis.reportError` when the browser has it. `null`: never.
   */
  constructor(
    readonly haltFrames = CRASH_HALT_FRAMES,
    readonly logLimit = CRASH_LOG_LIMIT,
    private readonly log: (...args: unknown[]) => void = (...args) => console.error(...args),
    private readonly surface?: ((error: unknown) => void) | null,
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
    this.resetStreak();
  }

  /** Ends the current streak without un-halting (boot finished, the tab became visible again). */
  resetStreak(): void {
    this.consecutive = 0;
    this.streakHasFrame = false;
  }

  /** A frame threw. Returns true if the game is (now) halted. */
  frameFailed(error: unknown): boolean {
    return this.report(error, 'frame');
  }

  /** Any error (a frame, a global handler, boot). Returns true if the game is halted. */
  report(error: unknown, source: CrashSource): boolean {
    this.total++;
    if (source === 'frame') this.streakHasFrame = true;
    // Global errors only extend a streak a failing frame started.
    if (source === 'frame' || source === 'boot' || this.streakHasFrame) this.consecutive++;
    const { message, stack } = describe(error);
    const tipping = !this.halted && (source === 'boot' || (this.streakHasFrame && this.consecutive >= this.haltFrames));
    if (tipping) this.halted = true;
    const fresh = this.writeLog(source, `${message}\n${stack}`, error);
    if (fresh && source === 'frame') this.surfaceOnce(error);
    const info: CrashInfo = { source, error, message, stack, total: this.total, consecutive: this.consecutive, halted: this.halted };
    for (const fn of this.crashListeners.slice()) this.safely(fn, info);
    if (tipping) {
      this.say(
        source === 'boot'
          ? `[Crash] the game could not start (${this.total} error(s) this session)`
          : `[Crash] game halted after ${this.consecutive} failure(s) in a row (${this.total} error(s) this session)`,
      );
      for (const fn of this.haltListeners.slice()) this.safely(fn, info);
    }
    return this.halted;
  }

  /** Clears the halt and the streak (a dev "try to continue"; tests). */
  resume(): void {
    this.halted = false;
    this.resetStreak();
  }

  /**
   * Listens for uncaught errors and unhandled rejections on `target` (window). `origin` is the
   * page's origin, for ignoring other origins' scripts. The events are never preventDefault-ed.
   */
  installGlobal(target: CrashEventTarget, origin: string | undefined = globalThis.location?.origin): void {
    this.uninstall?.();
    const onError = (e: Event) => {
      const ev = e as ErrorEvent;
      // A frame error we handed to reportError: already counted.
      if (typeof ev.error === 'object' && ev.error !== null && this.surfaced.has(ev.error)) return;
      if (isBenignError(ev, origin)) return;
      this.report(ev.error ?? ev.message ?? 'Unknown error', 'error');
    };
    const onRejection = (e: Event) => {
      const ev = e as PromiseRejectionEvent;
      if (isBenignRejection(ev.reason)) return;
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

  /** Logs a distinct error once (within the line cap). Returns true the first time it is seen. */
  private writeLog(source: CrashSource, signature: string, error: unknown): boolean {
    if (this.logged.has(signature) || this.logged.size >= MAX_SIGNATURES) {
      this.suppressed++;
      return false;
    }
    this.logged.add(signature);
    // The error object itself, so the console shows its stack.
    if (!this.say(`[Crash] ${source}:`, error)) this.suppressed++;
    return true;
  }

  /** One console line, within the cap; the last line allowed is the "further errors" note. */
  private say(...args: unknown[]): boolean {
    if (this.lines >= this.logLimit) return false;
    this.lines++;
    if (this.lines === this.logLimit) {
      this.log(`[Crash] further errors are counted but not logged`);
      return false;
    }
    this.log(...args);
    return true;
  }

  /** Hands a caught frame error to the browser (reportError) so page-error checks see it. */
  private surfaceOnce(error: unknown): void {
    if (typeof error !== 'object' || error === null || this.surfaced.has(error)) return;
    const g = globalThis as { reportError?: (e: unknown) => void };
    const surface = this.surface === undefined ? (typeof g.reportError === 'function' ? (e: unknown) => g.reportError?.(e) : null) : this.surface;
    if (!surface) return;
    this.surfaced.add(error);
    try {
      surface(error);
    } catch {
      // Surfacing is best effort.
    }
  }

  private safely(fn: CrashListener, info: CrashInfo): void {
    try {
      fn(info);
    } catch (err) {
      // A broken listener must not break the guard; log it through the same limit.
      const d = describe(err);
      this.writeLog(info.source, `listener: ${d.message}\n${d.stack}`, err);
    }
  }
}

/** The game's guard: the main loop, window errors and boot all report here. */
export const crashGuard = new CrashGuard();

/** Hook for an opt-in crash reporter (hub Diagnostics). Sends nothing by itself. */
export function onCrash(fn: CrashListener): () => void {
  return crashGuard.onCrash(fn);
}
