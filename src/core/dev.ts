// Developer helpers driven by URL query options (the old command-line flags):
//   ?scene=<id>          open a scene directly (playground:physics, level:z1_retro_rush_hills/act1 ...)
//   ?zone=<id>&stage=<n> start a zone at a stage
//   ?inputs=<name>       replay a scripted input timeline (dev builds: tests/**/inputs/<name>.json)
//   ?dev                 show the dev menu instead of the title
//   ?touch               force touch mode
//   ?overlay             start with the F1 debug overlay open
//   ?mute                start muted
// Input timeline format (60 frames per second):
//   {"events": [[0, "move_right", true], [90, "jump", true], [96, "jump", false]]}
// Frame 0 is the first physics tick on which the target scene runs (or the
// first tick after boot when there is none). A press sent on frame N is seen
// by gameplay on tick N + 1, like a real key press arriving mid-frame.

import { Input, type Action, ACTIONS } from '../runtime/input';
import { Node, ProcessMode } from '../runtime/node';
import { GameState } from './game_state';
import { SceneRouter } from './scene_router';
import { ZoneRegistry } from './zone_registry';

export type TimelineEvent = [number, string, boolean];

function readArgs(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  if (typeof location === 'undefined') return out;
  const params = new URLSearchParams(location.search);
  for (const [k, v] of params) out[k] = v === '' ? true : v;
  return out;
}

class DevNode extends Node {
  readonly args: Record<string, string | true> = readArgs();
  private timeline: [number, Action, boolean, number][] = [];
  private frame = 0;
  private held = new Set<Action>();
  private bootTaken = false;
  private clockScene = '';
  private clockStarted = false;
  /** Timeline frame of the last level completion (bots read it). */
  completedAtFrame = -1;

  constructor() {
    super('Dev');
    this.processMode = ProcessMode.ALWAYS;
  }

  override enterTree(): void {
    GameState.levelCompleted.connect(() => {
      if (this.timeline.length > 0 || this.held.size > 0 || this.clockStarted) {
        this.completedAtFrame = this.frame;
        console.info(`[Dev] level completed at timeline frame ${this.frame}`);
      }
    });
  }

  /** Starts replaying a timeline (from ?inputs=, a test or the bot). */
  play(events: unknown, clockScene = this.timelineScene()): void {
    this.timeline = parseTimeline(events);
    this.frame = 0;
    this.held.clear();
    this.clockScene = clockScene;
    this.clockStarted = false;
  }

  isPlaying(): boolean {
    return this.timeline.length > 0 || this.held.size > 0;
  }

  get timelineFrame(): number {
    return this.frame;
  }

  override physicsProcess(): void {
    if (this.timeline.length === 0 && this.held.size === 0) return;
    if (!this.clockStarted) {
      if (this.clockScene !== '' && SceneRouter.currentId !== this.clockScene) return;
      this.clockStarted = true;
    }
    while (this.timeline.length > 0 && this.timeline[0]![0] <= this.frame) {
      const [, action, pressed] = this.timeline.shift()!;
      if (pressed) {
        Input.actionPress(action, 'timeline');
        this.held.add(action);
      } else {
        Input.actionRelease(action, 'timeline');
        this.held.delete(action);
      }
    }
    this.frame += 1;
  }

  /** The --scene / --zone boot target, returned once. */
  takeBootTarget(): { scene?: string; zone?: string; stage?: number } {
    if (this.bootTaken) return {};
    this.bootTaken = true;
    if (typeof this.args.scene === 'string') return { scene: this.args.scene };
    if (typeof this.args.zone === 'string') return { zone: this.args.zone, stage: Number(this.args.stage ?? 1) || 1 };
    return {};
  }

  timelineScene(): string {
    if (typeof this.args.scene === 'string') return this.args.scene;
    if (typeof this.args.zone === 'string') return ZoneRegistry.stagePath(this.args.zone, Number(this.args.stage ?? 1) || 1);
    return '';
  }

  /** Presses or releases an action as if a device did it. */
  sendAction(action: Action, pressed: boolean): void {
    if (pressed) Input.actionPress(action, 'dev');
    else Input.actionRelease(action, 'dev');
  }
}

export function parseTimeline(data: unknown): [number, Action, boolean, number][] {
  const events = (data as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const out: [number, Action, boolean, number][] = [];
  for (const raw of events) {
    if (Array.isArray(raw) && raw.length === 3 && typeof raw[0] === 'number' && typeof raw[1] === 'string' && typeof raw[2] === 'boolean') {
      if (!(ACTIONS as readonly string[]).includes(raw[1])) continue;
      out.push([Math.trunc(raw[0]), raw[1] as Action, raw[2], out.length]);
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[3] - b[3]);
  return out;
}

export const Dev = new DevNode();
