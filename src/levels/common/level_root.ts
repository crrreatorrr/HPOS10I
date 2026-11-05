// Root of every act scene and boss arena (docs/CONTRACTS.md, "Levels").
// Expected children: PlayerStart (a marker), Bounds (camera limits; below its
// bottom edge is a pit) and any structure for Terrain, Objects and Enemies.
//
// On ready it spawns Sproto at the checkpoint or PlayerStart (lifted onto the
// floor when the marker sits on the ground line), adds the camera with the
// Bounds as limits, the HUD and the parallax backdrop, dresses terrain in the
// art zone and plays the zone music. While playing it kills Sproto when he
// falls below Bounds; after Player.died it stops the timer, waits about a
// second and calls SceneRouter.respawn() once. completeLevel() runs the goal
// sequence: brake, victory pose, tally, then SceneRouter.nextStage(). Every
// wait counts physics ticks, so pausing pauses them too.

import { Audio, type MusicName } from '../../core/audio';
import { GameState } from '../../core/game_state';
import { Layers } from '../../core/layers';
import { SceneRouter } from '../../core/scene_router';
import { Tuning } from '../../core/tuning';
import { ZoneRegistry } from '../../core/zone_registry';
import { GameCamera } from '../../camera/game_camera';
import { Player } from '../../player/player';
import { Node, Node2D } from '../../runtime/node';
import { Signal } from '../../runtime/signal';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { CurveTerrain } from '../../terrain/curve_terrain';
import { TerrainLoop } from '../../terrain/loop';
import { BoundsRect, TileLayer } from './level_nodes';
import type { Configurable, Props } from './props';

const RESPAWN_WAIT_FRAMES = 60;
const BRAKE_FRAMES = 45;
const BRAKE_KEEP = 0.82;
const BRAKE_STOP_SPEED = 0.5;
const POSE_FRAMES = 40;
const AFTER_TALLY_FRAMES = 30;
const TALLY_TIMEOUT_FRAMES = 60 * 30;
const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;

enum Finish {
  NONE,
  BRAKE,
  POSE,
  TALLY,
  AFTER_TALLY,
  DONE,
}

/** What the UI and art provide to every level (set at boot; missing = skipped). */
export const LevelHooks: {
  hud: (() => Node) | null;
  /** The act-clear tally; it must emit `finished` (a Signal) when done. */
  tally: ((zoneId: string) => Node & { finished: Signal }) | null;
  /** Parallax backdrop for an art zone. */
  backdrop: ((root: LevelRoot, artZone: string) => Node) | null;
  /** Called after the level is built (debug overlays, item box placement...). */
  afterReady: ((root: LevelRoot) => void)[];
} = { hud: null, tally: null, backdrop: null, afterReady: [] };

export class LevelRoot extends Node2D implements Configurable {
  readonly playerSpawned = new Signal<[Player]>();
  readonly levelFinishing = new Signal();
  readonly respawnRequested = new Signal();
  readonly nextStageRequested = new Signal();

  zoneId = '';
  artZoneId = '';
  music = '';
  backgroundYScroll = 0.25;
  horizonHeight = 0;
  backgroundYOffsets = [0, 0, 0, 0];

  player: Player | null = null;
  camera: GameCamera | null = null;
  /** Turn off to keep scene changes from running (tests). The signals still fire. */
  useSceneRouter = true;

  private bounds = new Rect2(-100000, -100000, 200000, 200000);
  private hasBounds = false;
  private progressSpan: [number, number] | null = null;
  private spawn = Vec2.ZERO;
  private respawnWait = -1;
  private respawnSent = false;
  private finish = Finish.NONE;
  private finishFrames = 0;
  private tally: (Node & { finished: Signal }) | null = null;
  private tallyDone = false;
  private nextSent = false;

  constructor(name = 'Level') {
    super(name);
    this.addToGroup('level_root');
  }

  applyProps(p: Props): void {
    this.zoneId = p.str('zone_id', this.zoneId);
    this.artZoneId = p.str('art_zone_id', this.artZoneId);
    this.music = p.str('music', this.music);
    this.backgroundYScroll = p.num('background_y_scroll', this.backgroundYScroll);
    this.horizonHeight = p.num('horizon_height', this.horizonHeight);
    this.backgroundYOffsets = p.nums('background_y_offsets', this.backgroundYOffsets);
  }

  static find(from: Node | null): LevelRoot | null {
    const up = from?.findAncestor<LevelRoot>((n) => n instanceof LevelRoot) ?? null;
    return up ?? tree.getFirstNodeInGroup<LevelRoot>('level_root');
  }

  currentZoneId(): string {
    return SceneRouter.zoneId !== '' ? SceneRouter.zoneId : this.zoneId;
  }

  currentArtZoneId(): string {
    return this.artZoneId !== '' ? this.artZoneId : this.currentZoneId();
  }

  getBounds(): Rect2 {
    return this.bounds;
  }

  /** How far along the act x is: 0 at PlayerStart, 1 at the goal sign (clamped). */
  progressAt(x: number): number {
    if (!this.progressSpan) this.progressSpan = this.findProgressSpan();
    const [from, to] = this.progressSpan;
    const length = to - from;
    if (length <= 0) return 0;
    return Math.min(Math.max((x - from) / length, 0), 1);
  }

  private findProgressSpan(): [number, number] {
    const start = this.getNodeOrNull<Node2D>('PlayerStart');
    const from = start ? start.globalPosition.x : this.globalPosition.x;
    let to = -Infinity;
    for (const n of this.findChildren((c) => c.isInGroup('goal_sign'))) {
      if (n instanceof Node2D) to = Math.max(to, n.globalPosition.x);
    }
    if (to === -Infinity) {
      const b = this.getNodeOrNull<BoundsRect>('Bounds');
      to = b ? b.globalRect().right : from;
    }
    return [from, to];
  }

  isFinishing(): boolean {
    return this.finish !== Finish.NONE;
  }

  override ready(): void {
    this.readBounds();
    GameState.timerRunning = true;
    this.applyArtZone();
    this.addBackdrop();
    this.spawnPlayer();
    this.addCamera();
    this.addUi();
    this.playMusic();
    for (const hook of LevelHooks.afterReady) hook(this);
  }

  /** Goal reached: freeze the timer and Sproto, show the tally, then the next stage. */
  completeLevel(): void {
    if (this.finish !== Finish.NONE || this.respawnWait >= 0 || this.respawnSent) return;
    if (!this.player || this.player.state === 'dead') return;
    this.finish = Finish.BRAKE;
    this.finishFrames = 0;
    GameState.completeLevel();
    this.player.hitbox.monitorable = false;
    this.levelFinishing.emit();
  }

  override physicsProcess(): void {
    const player = this.player;
    if (!player || player.isFreed()) return;
    if (this.finish !== Finish.NONE) {
      this.finishStep(player);
      return;
    }
    if (this.hasBounds && player.state !== 'dead' && player.globalPosition.y - player.getRadii().y > this.bounds.bottom) player.kill();
    if (this.respawnWait > 0) {
      this.respawnWait -= 1;
      if (this.respawnWait === 0) this.requestRespawn();
    }
  }

  // --- Spawning -------------------------------------------------------------------

  private readBounds(): void {
    const node = this.getNodeOrNull<BoundsRect>('Bounds');
    this.hasBounds = !!node && node.rect.w > 0 && node.rect.h > 0;
    if (this.hasBounds) this.bounds = node!.globalRect();
  }

  spawnPoint(): Vec2 {
    if (GameState.checkpointPosition) return GameState.checkpointPosition;
    const start = this.getNodeOrNull<Node2D>('PlayerStart');
    return start ? start.globalPosition : this.globalPosition;
  }

  private spawnPlayer(): void {
    const player = new Player();
    this.player = player;
    this.addChild(player);
    this.spawn = this.spawnPoint();
    // Terrain is registered by now: snap onto the floor under the marker.
    const radius = Tuning.physics.height_radius;
    const hit = tree.physics.intersectRay(this.spawn.add(new Vec2(0, -8)), this.spawn.add(new Vec2(0, radius + 64)), FLOOR_MASK);
    let at = this.spawn;
    if (hit && hit.position.y < this.spawn.y + radius) at = new Vec2(at.x, hit.position.y - radius);
    player.respawnAt(at);
    player.died.connect(() => this.onPlayerDied(), { owner: this });
    this.playerSpawned.emit(player);
  }

  private onPlayerDied(): void {
    if (this.finish !== Finish.NONE || this.respawnWait >= 0 || this.respawnSent) return;
    GameState.timerRunning = false;
    this.respawnWait = RESPAWN_WAIT_FRAMES;
  }

  private requestRespawn(): void {
    if (this.respawnSent) return;
    this.respawnSent = true;
    this.respawnRequested.emit();
    if (this.useSceneRouter) SceneRouter.respawn();
  }

  // --- Goal -----------------------------------------------------------------------

  private finishStep(player: Player): void {
    this.finishFrames += 1;
    switch (this.finish) {
      case Finish.BRAKE: {
        const speed = player.grounded ? player.groundSpeed : player.velocity.x;
        if (Math.abs(speed) <= BRAKE_STOP_SPEED || this.finishFrames >= BRAKE_FRAMES) {
          if (player.grounded || this.finishFrames >= BRAKE_FRAMES * 2) {
            player.freeze(true);
            player.playPose('victory');
            this.setFinish(Finish.POSE);
          }
        } else if (player.grounded) {
          player.pushGround(speed * BRAKE_KEEP, 2);
        }
        break;
      }
      case Finish.POSE:
        if (this.finishFrames >= POSE_FRAMES) {
          this.showTally();
          this.setFinish(Finish.TALLY);
        }
        break;
      case Finish.TALLY:
        if (this.tallyDone || this.finishFrames >= TALLY_TIMEOUT_FRAMES) this.setFinish(Finish.AFTER_TALLY);
        break;
      case Finish.AFTER_TALLY:
        if (this.finishFrames >= AFTER_TALLY_FRAMES) {
          this.setFinish(Finish.DONE);
          this.requestNextStage();
        }
        break;
      default:
        break;
    }
  }

  private setFinish(phase: Finish): void {
    this.finish = phase;
    this.finishFrames = 0;
  }

  private showTally(): void {
    Audio.playMusic('act_clear');
    if (LevelHooks.tally) {
      this.tally = LevelHooks.tally(this.currentZoneId());
      this.tally.finished.once(() => (this.tallyDone = true), this);
      this.addChild(this.tally);
    } else {
      this.tallyDone = true;
    }
  }

  private requestNextStage(): void {
    if (this.nextSent) return;
    this.nextSent = true;
    this.nextStageRequested.emit();
    if (this.useSceneRouter) SceneRouter.nextStage();
  }

  // --- Camera, UI, music ----------------------------------------------------------

  private addCamera(): void {
    const camera = new GameCamera();
    this.camera = camera;
    this.addChild(camera);
    camera.setLevelBounds(this.bounds);
    if (this.player) camera.snapToTarget();
  }

  private addUi(): void {
    if (LevelHooks.hud) this.addChild(LevelHooks.hud());
  }

  private playMusic(): void {
    let track = this.music;
    if (track === '') {
      const zone = ZoneRegistry.getZone(this.currentZoneId());
      if (zone) track = SceneRouter.stage > zone.acts.length && SceneRouter.zoneId === zone.id ? 'boss' : zone.music;
    }
    if (track !== '') Audio.playMusic(track as MusicName);
  }

  // --- Art zone -------------------------------------------------------------------

  private applyArtZone(): void {
    const id = this.currentArtZoneId();
    if (id === '') return;
    for (const n of this.findChildren()) {
      if (n instanceof CurveTerrain) n.setArtZone(id);
      else if (n instanceof TerrainLoop) n.setArtZone(id);
      else if (n instanceof TileLayer) n.setArtZone(id);
    }
  }

  private addBackdrop(): void {
    if (!LevelHooks.backdrop) return;
    const backdrop = LevelHooks.backdrop(this, this.currentArtZoneId());
    this.addChild(backdrop, 0);
  }
}
