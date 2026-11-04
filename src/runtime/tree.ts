// The scene tree and main loop: a fixed 60 Hz physics tick (with catch-up
// capped so a slow tab never spirals), process() once per rendered frame,
// rendering with z order, a camera, CanvasLayers and interpolation between
// physics ticks so motion stays smooth on 120 Hz screens.

import { Color } from './color';
import { Gfx } from './gfx';
import { Input, InputEvent } from './input';
import { CanvasLayer, Node, Node2D } from './node';
import { PhysicsWorld } from './physics';
import { Transform2D } from './transform';
import { Rect2, Vec2 } from './vec2';

export const VIEW_W = 424;
export const VIEW_H = 240;
export const PHYSICS_FPS = 60;
export const PHYSICS_DT = 1 / PHYSICS_FPS;

/** Anything that can say where the view is (the game camera). */
export interface ViewProvider extends Node {
  /** Top-left of the view in world space for this frame (interpolated). */
  viewTopLeft(alpha: number): Vec2;
}

type DrawItem = { node: Node2D; t: Transform2D; z: number; alpha: number; order: number };

export class SceneTree {
  readonly root = new Node('root');
  readonly physics = new PhysicsWorld();
  currentScene: Node | null = null;
  paused = false;
  /** Engine.time_scale: slows the game clock (Time Focus). */
  timeScale = 1;
  physicsFrames = 0;
  processFrames = 0;
  /** Seconds the game clock has run. */
  time = 0;
  clearColor = Color.rgb8(18, 20, 31);
  camera: ViewProvider | null = null;
  /** Size of the screen in game pixels (fixed). */
  readonly viewSize = new Vec2(VIEW_W, VIEW_H);
  /** Fires when a scene change finished (new scene in the tree). */
  onSceneChanged: ((scene: Node) => void) | null = null;

  private deferred: (() => void)[] = [];
  private toFree: Node[] = [];
  private pendingScene: (() => Node) | null = null;
  private dirty = true;
  private ordered: Node[] = [];
  private groupCache = new Map<string, Node[]>();
  private accumulator = 0;
  private lastTime = -1;
  private running = false;
  private gfx: Gfx | null = null;
  /** Debug: physics ticks run in the last frame. */
  lastTicks = 0;

  constructor() {
    this.root._tree = this;
    this.root._readyDone = true;
  }

  // --- Structure ---------------------------------------------------------------------

  /** @internal */
  _markDirty(): void {
    this.dirty = true;
  }

  /** @internal */
  _queueFree(node: Node): void {
    this.toFree.push(node);
  }

  private refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const out: Node[] = [];
    const walk = (n: Node) => {
      out.push(n);
      for (const c of n.children) walk(c);
    };
    walk(this.root);
    this.ordered = out;
    this.groupCache.clear();
  }

  /** Every node in tree order (parents before children). */
  allNodes(): readonly Node[] {
    this.refresh();
    return this.ordered;
  }

  getNodesInGroup<T extends Node = Node>(group: string): T[] {
    this.refresh();
    let list = this.groupCache.get(group);
    if (!list) {
      list = this.ordered.filter((n) => n.isInGroup(group) && !n.isQueuedForDeletion());
      this.groupCache.set(group, list);
    }
    return list.filter((n) => n.isInsideTree()) as T[];
  }

  getFirstNodeInGroup<T extends Node = Node>(group: string): T | null {
    return (this.getNodesInGroup<T>(group)[0] as T | undefined) ?? null;
  }

  /** Adds a node that lives across scenes (autoloads), before the current scene. */
  addAutoload<T extends Node>(node: T): T {
    const index = this.currentScene ? this.root.children.indexOf(this.currentScene) : -1;
    this.root.addChild(node, index);
    return node;
  }

  callDeferred(fn: () => void): void {
    this.deferred.push(fn);
  }

  /** Replaces the current scene at the end of this frame. */
  changeScene(factory: () => Node): void {
    this.pendingScene = factory;
  }

  /** Replaces the current scene right now (tests, boot). */
  changeSceneNow(factory: () => Node): Node {
    this.pendingScene = factory;
    this.flush();
    return this.currentScene!;
  }

  private flush(): void {
    let guard = 0;
    while ((this.deferred.length || this.toFree.length || this.pendingScene) && guard++ < 16) {
      const calls = this.deferred;
      this.deferred = [];
      for (const fn of calls) fn();
      const frees = this.toFree;
      this.toFree = [];
      for (const n of frees) n._doFree();
      if (this.pendingScene) {
        const factory = this.pendingScene;
        this.pendingScene = null;
        if (this.currentScene) {
          this.currentScene._doFree();
          this.currentScene = null;
        }
        this.camera = null;
        const scene = factory();
        this.currentScene = scene;
        this.root.addChild(scene);
        this.onSceneChanged?.(scene);
      }
    }
  }

  // --- Ticks -------------------------------------------------------------------------

  /** One fixed physics tick (1/60 s of game time). */
  physicsStep(): void {
    this.refresh();
    Input.beginPhysicsTick();
    this.physicsFrames++;
    const dt = PHYSICS_DT;
    // Interpolation: remember where everything was at the start of the tick.
    for (const n of this.ordered) {
      if (n instanceof Node2D) {
        n._prevPosition = n.position;
        n._interpReset = false;
      }
    }
    Input.inPhysics = true;
    try {
      const nodes = this.ordered.slice();
      for (const n of nodes) {
        if (n.isInsideTree() && !n.isQueuedForDeletion() && n.canProcess()) n.physicsProcess(dt);
      }
      this.physics.step();
    } finally {
      Input.inPhysics = false;
    }
    this.time += dt;
    this.flush();
  }

  /** One rendered frame's process() pass and input dispatch. */
  processStep(delta: number): void {
    this.refresh();
    this.processFrames++;
    const events = Input.beginProcessFrame();
    for (const ev of events) this.dispatchInput(ev);
    const nodes = this.ordered.slice();
    for (const n of nodes) {
      if (n.isInsideTree() && !n.isQueuedForDeletion() && n.canProcess()) n.process(delta);
    }
    this.flush();
  }

  /** Delivers an input event to nodes, last in tree order first, until handled. */
  dispatchInput(ev: InputEvent): void {
    this.refresh();
    const nodes = this.ordered.slice();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]!;
      if (!n.isInsideTree() || !n.canProcess()) continue;
      n.input(ev);
      if (ev.handled) break;
    }
  }

  /** Runs `ticks` physics ticks plus a process pass after each (tests, bots). */
  advance(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.physicsStep();
      this.processStep(PHYSICS_DT);
    }
  }

  // --- Main loop ---------------------------------------------------------------------

  start(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.gfx = new Gfx(ctx);
    this.running = true;
    const frame = (now: number) => {
      if (!this.running) return;
      const t = now / 1000;
      let real = this.lastTime < 0 ? PHYSICS_DT : t - this.lastTime;
      this.lastTime = t;
      // A hidden tab or a breakpoint: don't try to catch up minutes of game.
      if (real > 0.25) real = 0.25;
      this.accumulator += real * this.timeScale;
      let ticks = 0;
      while (this.accumulator >= PHYSICS_DT && ticks < 8) {
        this.physicsStep();
        this.accumulator -= PHYSICS_DT;
        ticks++;
      }
      if (ticks === 8) this.accumulator = 0;
      this.lastTicks = ticks;
      this.processStep(real);
      this.render(Math.min(1, this.accumulator / PHYSICS_DT));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }

  // --- Rendering ---------------------------------------------------------------------

  render(alpha: number): void {
    const g = this.gfx;
    if (!g) return;
    this.refresh();
    const ctx = g.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.clearColor.css();
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const cam = this.camera && this.camera.isInsideTree() ? this.camera.viewTopLeft(alpha) : Vec2.ZERO;
    const camX = Math.round(cam.x);
    const camY = Math.round(cam.y);
    const view = new Transform2D(1, 0, 0, 1, -camX, -camY);
    const viewRect = new Rect2(camX, camY, VIEW_W, VIEW_H);

    // World canvas and canvas layers.
    const layers: { layer: number; root: CanvasLayer }[] = [];
    const world: DrawItem[] = [];
    let order = 0;
    const collect = (n: Node, parentT: Transform2D, parentZ: number, parentAlpha: number, out: DrawItem[], interp: boolean) => {
      if (n instanceof CanvasLayer) {
        if (n.visible) layers.push({ layer: n.layer, root: n });
        return;
      }
      let t = parentT;
      let z = parentZ;
      let a = parentAlpha;
      if (n instanceof Node2D) {
        if (!n.visible) return;
        let pos = n.position;
        if (interp && !n._interpReset) {
          const p = n._prevPosition;
          if (p.x !== pos.x || p.y !== pos.y) {
            const dx = pos.x - p.x;
            const dy = pos.y - p.y;
            // A big jump in one tick is a teleport: don't smear it.
            if (dx * dx + dy * dy < 128 * 128) pos = new Vec2(p.x + dx * alpha, p.y + dy * alpha);
          }
        }
        const local = Transform2D.from(pos, n.rotation, n.scale);
        t = parentT.mul(local);
        z = n.zAsRelative ? parentZ + n.zIndex : n.zIndex;
        a = parentAlpha * n.modulate.a;
        if (a <= 0) return;
        const item: DrawItem = { node: n, t, z, alpha: a * n.selfModulate.a, order: 0 };
        for (const c of n.children) {
          if (c instanceof Node2D && c.showBehindParent) collect(c, t, z, a, out, interp);
        }
        item.order = order++;
        out.push(item);
        for (const c of n.children) {
          if (!(c instanceof Node2D && c.showBehindParent)) collect(c, t, z, a, out, interp);
        }
        return;
      }
      for (const c of n.children) collect(c, t, z, a, out, interp);
    };
    for (const c of this.root.children) collect(c, view, 0, 1, world, true);

    const drawList = (items: DrawItem[], cull: Rect2 | null) => {
      items.sort((p, q) => p.z - q.z || p.order - q.order);
      for (const it of items) {
        const n = it.node;
        let t = it.t;
        if (n.snapToPixel) t = t.withOrigin(new Vec2(Math.round(t.tx), Math.round(t.ty)));
        if (cull) {
          const r = (n as Node2D & { cullRect?: () => Rect2 | null }).cullRect?.();
          if (r) {
            const x = t.tx + r.x - (-camX);
            const y = t.ty + r.y - (-camY);
            if (x + r.w < camX || y + r.h < camY || x > camX + VIEW_W || y > camY + VIEW_H) continue;
          }
        }
        g._begin(t, it.alpha);
        n.draw(g);
      }
    };

    const below = layers.filter((l) => l.layer < 0).sort((p, q) => p.layer - q.layer);
    const above = layers.filter((l) => l.layer >= 0).sort((p, q) => p.layer - q.layer);
    for (const l of below) drawList(this.collectLayer(l.root, collect), null);
    drawList(world, viewRect);
    for (const l of above) drawList(this.collectLayer(l.root, collect), null);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  private collectLayer(
    layer: CanvasLayer,
    collect: (n: Node, t: Transform2D, z: number, a: number, out: DrawItem[], interp: boolean) => void,
  ): DrawItem[] {
    const out: DrawItem[] = [];
    const t = new Transform2D(1, 0, 0, 1, layer.offset.x, layer.offset.y);
    for (const c of layer.children) collect(c, t, 0, 1, out, false);
    return out;
  }
}

export const tree = new SceneTree();
