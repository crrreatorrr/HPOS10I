// The scene graph: a light stand-in for the node tree the game was written
// against. Nodes have children, groups, and process/physics hooks called by
// the SceneTree in tree order (parents first). Node2D adds a transform, z
// order, visibility and a draw() hook. CanvasLayer draws its subtree in screen
// space (HUD, menus).

import { Color } from './color';
import { Signal } from './signal';
import { Transform2D } from './transform';
import { Vec2 } from './vec2';
import type { Gfx } from './gfx';
import type { SceneTree } from './tree';

export enum ProcessMode {
  INHERIT,
  PAUSABLE,
  WHEN_PAUSED,
  ALWAYS,
  DISABLED,
}

let nextId = 1;

export class Node {
  readonly id = nextId++;
  name: string;
  parent: Node | null = null;
  readonly children: Node[] = [];
  processMode = ProcessMode.INHERIT;

  readonly treeEntered = new Signal();
  readonly treeExiting = new Signal();
  readonly readySignal = new Signal();

  /** @internal */ _tree: SceneTree | null = null;
  /** @internal */ _readyDone = false;
  private _freed = false;
  private _queuedFree = false;
  private _groups: Set<string> | null = null;
  private _meta: Map<string, unknown> | null = null;

  constructor(name?: string) {
    this.name = name ?? this.constructor.name;
  }

  // --- Hooks (override) -----------------------------------------------------

  /** Called when the node enters the tree (parents before children). */
  enterTree(): void {}
  /** Called once, after all children are ready (children before parents). */
  ready(): void {}
  /** Called when the node is about to leave the tree. */
  exitTree(): void {}
  /** Every rendered frame. */
  process(_delta: number): void {}
  /** Every fixed 60 Hz tick. */
  physicsProcess(_delta: number): void {}
  /** Raw input events, before gameplay reads actions (menus, pause). */
  input(_event: InputEventLike): void {}

  // --- Tree -----------------------------------------------------------------

  get tree(): SceneTree {
    if (this._tree === null) throw new Error(`${this.name} is not inside the tree`);
    return this._tree;
  }

  isInsideTree(): boolean {
    return this._tree !== null;
  }

  isFreed(): boolean {
    return this._freed;
  }

  isQueuedForDeletion(): boolean {
    return this._queuedFree || this._freed;
  }

  isReady(): boolean {
    return this._readyDone;
  }

  addChild<T extends Node>(child: T, index = -1): T {
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    if (index < 0 || index >= this.children.length) this.children.push(child);
    else this.children.splice(index, 0, child);
    if (this._tree) {
      this._tree._markDirty();
      child._propagateEnter(this._tree);
      child._propagateReady();
    }
    return child;
  }

  removeChild(child: Node): void {
    const i = this.children.indexOf(child);
    if (i < 0) return;
    if (child._tree) child._propagateExit();
    this.children.splice(i, 1);
    child.parent = null;
    this._tree?._markDirty();
  }

  moveChild(child: Node, index: number): void {
    const i = this.children.indexOf(child);
    if (i < 0) return;
    this.children.splice(i, 1);
    const at = index < 0 ? this.children.length : Math.min(index, this.children.length);
    this.children.splice(at, 0, child);
    this._tree?._markDirty();
  }

  getIndex(): number {
    return this.parent ? this.parent.children.indexOf(this) : 0;
  }

  getChild<T extends Node = Node>(index: number): T {
    return this.children[index < 0 ? this.children.length + index : index] as T;
  }

  getChildCount(): number {
    return this.children.length;
  }

  /** Child path like "Hitbox" or "Terrain/Decor". Null when missing. */
  getNodeOrNull<T extends Node = Node>(path: string): T | null {
    let node: Node | null = this;
    for (const part of path.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        node = node.parent;
      } else {
        node = node.children.find((c) => c.name === part) ?? null;
      }
      if (node === null) return null;
    }
    return node as T;
  }

  getNode<T extends Node = Node>(path: string): T {
    const node = this.getNodeOrNull<T>(path);
    if (node === null) throw new Error(`${this.name}: no node at "${path}"`);
    return node;
  }

  /** Every descendant (depth-first, pre-order) for which `pred` is true. */
  findChildren<T extends Node = Node>(pred: (n: Node) => boolean = () => true, recursive = true): T[] {
    const out: T[] = [];
    const walk = (n: Node) => {
      for (const c of n.children) {
        if (pred(c)) out.push(c as T);
        if (recursive) walk(c);
      }
    };
    walk(this);
    return out;
  }

  findChildOfType<T extends Node>(ctor: abstract new (...args: never[]) => T): T | null {
    return (this.findChildren((n) => n instanceof ctor)[0] as T | undefined) ?? null;
  }

  /** Nearest ancestor (or self) matching `pred`. */
  findAncestor<T extends Node = Node>(pred: (n: Node) => boolean): T | null {
    let n: Node | null = this;
    while (n) {
      if (pred(n)) return n as T;
      n = n.parent;
    }
    return null;
  }

  queueFree(): void {
    if (this._queuedFree || this._freed) return;
    this._queuedFree = true;
    if (this._tree) this._tree._queueFree(this);
    else this._doFree();
  }

  /** Frees now (removes from the parent). Prefer queueFree() during a tick. */
  free(): void {
    this._doFree();
  }

  /** @internal */
  _doFree(): void {
    if (this._freed) return;
    if (this.parent) this.parent.removeChild(this);
    this._markFreed();
  }

  private _markFreed(): void {
    this._freed = true;
    for (const c of this.children) c._markFreed();
  }

  // --- Groups and meta ----------------------------------------------------------

  addToGroup(group: string): void {
    (this._groups ??= new Set()).add(group);
    this._tree?._markDirty();
  }

  removeFromGroup(group: string): void {
    this._groups?.delete(group);
    this._tree?._markDirty();
  }

  isInGroup(group: string): boolean {
    return this._groups?.has(group) ?? false;
  }

  get groups(): ReadonlySet<string> {
    return this._groups ?? EMPTY_SET;
  }

  setMeta(key: string, value: unknown): void {
    (this._meta ??= new Map()).set(key, value);
  }

  getMeta<T = unknown>(key: string, fallback?: T): T {
    return (this._meta?.has(key) ? this._meta.get(key) : fallback) as T;
  }

  hasMeta(key: string): boolean {
    return this._meta?.has(key) ?? false;
  }

  // --- Processing ---------------------------------------------------------------

  /** True when this node processes given the tree's pause state. */
  canProcess(): boolean {
    const tree = this._tree;
    if (!tree) return false;
    let mode = this.processMode;
    let n: Node | null = this.parent;
    while (mode === ProcessMode.INHERIT && n) {
      mode = n.processMode;
      n = n.parent;
    }
    if (mode === ProcessMode.INHERIT) mode = ProcessMode.PAUSABLE;
    switch (mode) {
      case ProcessMode.DISABLED:
        return false;
      case ProcessMode.ALWAYS:
        return true;
      case ProcessMode.WHEN_PAUSED:
        return tree.paused;
      default:
        return !tree.paused;
    }
  }

  // --- Internals ------------------------------------------------------------------

  /** @internal */
  _propagateEnter(tree: SceneTree): void {
    this._tree = tree;
    this.enterTree();
    this.treeEntered.emit();
    for (const c of this.children.slice()) {
      if (c.parent === this) c._propagateEnter(tree);
    }
  }

  /** @internal */
  _propagateReady(): void {
    for (const c of this.children.slice()) {
      if (c.parent === this && c._tree) c._propagateReady();
    }
    if (!this._readyDone && this._tree) {
      this._readyDone = true;
      this.ready();
      this.readySignal.emit();
    }
  }

  /** @internal */
  _propagateExit(): void {
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.children[i]?._propagateExit();
    }
    this.treeExiting.emit();
    this.exitTree();
    this._tree = null;
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/** The shape of the input events Node.input() receives. */
export interface InputEventLike {
  readonly action: string | null;
  readonly pressed: boolean;
  readonly echo: boolean;
  /** Set by a handler to stop other nodes from seeing it. */
  handled: boolean;
  /** Keyboard code (KeyboardEvent.code) when the event came from a key. */
  readonly code: string | null;
  /** Pointer position in viewport pixels for pointer events. */
  readonly pointer: Vec2 | null;
  readonly kind: 'key' | 'pad' | 'pointer' | 'virtual';
}

export class Node2D extends Node {
  position: Vec2 = Vec2.ZERO;
  rotation = 0;
  scale: Vec2 = Vec2.ONE;
  zIndex = 0;
  zAsRelative = true;
  visible = true;
  /** Multiplies this node's and its children's drawing. */
  modulate: Color = Color.WHITE;
  /** Multiplies only this node's own drawing. */
  selfModulate: Color = Color.WHITE;
  /** Drawn before the parent instead of after it. */
  showBehindParent = false;
  /** Round the drawn position to whole pixels (crisp pixel art). */
  snapToPixel = true;

  /** @internal position at the start of the last physics tick (interpolation). */
  _prevPosition: Vec2 = Vec2.ZERO;
  /** @internal */ _interpReset = true;

  /** Draw this node (local coordinates). */
  draw(_g: Gfx): void {}

  /** Kept for API parity: every visible node is redrawn each frame. */
  queueRedraw(): void {}

  get transform(): Transform2D {
    return Transform2D.from(this.position, this.rotation, this.scale);
  }

  get globalTransform(): Transform2D {
    const parent = this.parentNode2D();
    const local = this.transform;
    return parent ? parent.globalTransform.mul(local) : local;
  }

  get globalPosition(): Vec2 {
    const parent = this.parentNode2D();
    if (!parent) return this.position;
    return parent.globalTransform.xform(this.position);
  }

  set globalPosition(p: Vec2) {
    const parent = this.parentNode2D();
    this.position = parent ? parent.globalTransform.affineInverse().xform(p) : p;
  }

  get globalRotation(): number {
    const parent = this.parentNode2D();
    return (parent ? parent.globalRotation : 0) + this.rotation;
  }

  toLocal(globalPoint: Vec2): Vec2 {
    return this.globalTransform.affineInverse().xform(globalPoint);
  }

  toGlobal(localPoint: Vec2): Vec2 {
    return this.globalTransform.xform(localPoint);
  }

  isVisibleInTree(): boolean {
    let n: Node | null = this;
    while (n) {
      if (n instanceof Node2D && !n.visible) return false;
      if (n instanceof CanvasLayer && !n.visible) return false;
      n = n.parent;
    }
    return true;
  }

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  /** Teleported: draw at the new place right away (no interpolation). */
  resetPhysicsInterpolation(): void {
    this._interpReset = true;
    for (const c of this.children) if (c instanceof Node2D) c.resetPhysicsInterpolation();
  }

  /** The nearest Node2D ancestor, stopping at a CanvasLayer. */
  parentNode2D(): Node2D | null {
    let n = this.parent;
    while (n) {
      if (n instanceof Node2D) return n;
      if (n instanceof CanvasLayer) return null;
      n = n.parent;
    }
    return null;
  }
}

/** Draws its subtree in screen space, above (or below) the world by `layer`. */
export class CanvasLayer extends Node {
  layer = 1;
  visible = true;
  /** Screen-space offset. */
  offset: Vec2 = Vec2.ZERO;
}
