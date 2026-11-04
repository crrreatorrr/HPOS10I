// Scene registry: every screen, level and playground by id. Factories may be
// async (levels load their data on demand), so a missing or unbuilt stage is
// simply absent here, and the router falls back to the dev menu.

import type { Node } from '../runtime/node';

export type SceneFactory = () => Node | Promise<Node>;

const registry = new Map<string, SceneFactory>();

export const Scenes = {
  register(id: string, factory: SceneFactory): void {
    registry.set(id, factory);
  },

  exists(id: string): boolean {
    return id !== '' && registry.has(id);
  },

  factory(id: string): SceneFactory | null {
    return registry.get(id) ?? null;
  },

  ids(): string[] {
    return [...registry.keys()];
  },
};

export const MAIN_SCENE = 'main';
export const TITLE_SCENE = 'title';
export const ZONE_SELECT_SCENE = 'zone_select';
export const GAME_OVER_SCENE = 'game_over';
export const ENDING_SCENE = 'ending';
export const MENU_SCENES: readonly string[] = [MAIN_SCENE, TITLE_SCENE, ZONE_SELECT_SCENE, GAME_OVER_SCENE, ENDING_SCENE];
