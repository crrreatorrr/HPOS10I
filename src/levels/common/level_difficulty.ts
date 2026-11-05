// Local difficulty for anything placed in a level: Difficulty.local(level
// root's progressAt(x)) at a node's x, so the same enemy or hazard is
// livelier near the end of an act; just Difficulty.current() without a level
// root (playgrounds, tests).

import { Difficulty } from '../../core/difficulty';
import { FPS } from '../../core/physics_constants';
import type { Node, Node2D } from '../../runtime/node';

export interface ProgressRoot extends Node {
  progressAt(x: number): number;
}

export const LevelDifficulty = {
  at(node: Node2D): number {
    const root = LevelDifficulty.levelRoot(node);
    if (root) return Difficulty.local(root.progressAt(node.globalPosition.x));
    return Difficulty.current();
  },

  levelRoot(node: Node | null): ProgressRoot | null {
    let parent = node ? node.parent : null;
    while (parent) {
      if (parent.isInGroup('level_root') && typeof (parent as Partial<ProgressRoot>).progressAt === 'function') {
        return parent as ProgressRoot;
      }
      parent = parent.parent;
    }
    return null;
  },

  intervalFrames(baseFrames: number, d: number): number {
    return Math.max(1, Math.round(baseFrames * Difficulty.intervalMult(d)));
  },

  telegraphFrames(baseSeconds: number, d: number): number {
    return Math.max(1, Math.round(Difficulty.telegraph(baseSeconds, d) * FPS));
  },
};
