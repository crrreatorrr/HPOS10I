// Builds a level's node tree from its JSON (converted from the original
// scenes). Each node is made by the type registered for its original scene
// or script path (src/levels/registry.ts), falling back to a plain Node2D, and
// then gets its generic properties (position, z index, visibility...) and its
// own exported properties (applyProps). Child overrides inside instanced
// pieces (a loop's switchers) are applied to the children the piece made.

import { Color } from '../../runtime/color';
import { Node, Node2D } from '../../runtime/node';
import { CollisionObject2D, Area2D } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';
import { BoundsRect, DecorRect, loadTileset, Marker, TileLayer, tilesetIdFromPath } from './level_nodes';
import { isConfigurable, Props, type RawProps } from './props';

export interface LevelNodeData {
  name: string;
  parent: string | null;
  type: string | null;
  scene?: string;
  script?: string;
  groups?: string[];
  props: RawProps;
  cells?: [number, number, number, number][];
}

export interface LevelData {
  source: string;
  nodes: LevelNodeData[];
}

type Factory = () => Node;
const factories = new Map<string, Factory>();

export const LevelTypes = {
  /** Registers a node type by its original scene or script path ("res://levels/enemies/walker.tscn"). */
  register(key: string, factory: Factory): void {
    factories.set(key, factory);
  },
  has(key: string): boolean {
    return factories.has(key);
  },
  keys(): string[] {
    return [...factories.keys()];
  },
};

/** Keys seen in levels with no registered type (reported once). */
export const missingTypes = new Set<string>();

function make(n: LevelNodeData): Node {
  for (const key of [n.scene, n.script]) {
    if (key && factories.has(key)) return factories.get(key)!();
  }
  for (const key of [n.scene, n.script]) {
    if (key && !missingTypes.has(key)) {
      missingTypes.add(key);
      console.warn(`[LevelLoader] no type registered for ${key}; using a plain node`);
    }
  }
  switch (n.type) {
    case 'TileMapLayer':
      return new TileLayer(n.name);
    case 'ColorRect':
      return new DecorRect(n.name);
    case 'ReferenceRect':
      return new BoundsRect(n.name);
    case 'Marker2D':
      return new Marker(n.name);
    default:
      return new Node2D(n.name);
  }
}

function applyGeneric(node: Node, p: Props): void {
  if (node instanceof Node2D) {
    if (p.has('position')) node.position = p.vec('position', node.position);
    if (p.has('z_index')) node.zIndex = p.int('z_index', node.zIndex);
    if (p.has('z_as_relative')) node.zAsRelative = p.bool('z_as_relative', true);
    if (p.has('visible')) node.visible = p.bool('visible', true);
    if (p.has('rotation')) node.rotation = p.num('rotation', 0);
    if (p.has('scale')) node.scale = p.vec('scale', Vec2.ONE);
    if (p.has('modulate')) node.modulate = p.color('modulate', Color.WHITE);
    if (p.has('show_behind_parent')) node.showBehindParent = p.bool('show_behind_parent', false);
  }
  if (node instanceof CollisionObject2D) {
    if (p.has('collision_layer')) node.collisionLayer = p.int('collision_layer', node.collisionLayer);
    if (p.has('collision_mask')) node.collisionMask = p.int('collision_mask', node.collisionMask);
  }
  if (node instanceof Area2D && p.has('monitorable')) node.monitorable = p.bool('monitorable', true);
}

/**
 * Builds the tree. The root node comes from the factory registered for the
 * root's script (LevelRoot); tile layers load their tileset first.
 */
export async function buildLevel(data: LevelData): Promise<Node> {
  const byPath = new Map<string, Node>();
  let root: Node | null = null;
  const tileJobs: Promise<void>[] = [];
  for (const n of data.nodes) {
    const parentPath = n.parent === null ? null : n.parent === '.' ? '' : n.parent;
    const path = parentPath === null ? '' : parentPath === '' ? n.name : `${parentPath}/${n.name}`;
    const parent = parentPath === null ? null : byPath.get(parentPath) ?? null;
    let node = byPath.get(path) ?? (parent ? parent.getNodeOrNull(n.name) : null);
    const props = new Props(n.props);
    if (!node) {
      node = make(n);
      node.name = n.name;
    }
    applyGeneric(node, props);
    if (isConfigurable(node)) node.applyProps(props);
    for (const g of n.groups ?? []) node.addToGroup(g);
    if (node instanceof TileLayer && n.cells) {
      const layer = node;
      const cells = n.cells;
      const id = layer.tilesetId || tilesetIdFromPath(String(n.props.tile_set ?? ''));
      tileJobs.push(
        loadTileset(id).then((ts) => {
          if (ts) layer.build(ts, cells);
        }),
      );
    }
    if (parentPath === null) {
      root = node;
    } else if (parent && node.parent !== parent) {
      parent.addChild(node);
    }
    byPath.set(path, node);
  }
  await Promise.all(tileJobs);
  if (!root) throw new Error(`${data.source}: no root node`);
  return root;
}
