// Collision layer bits (docs/CONTRACTS.md). Use these instead of literal numbers.
export const Layers = {
  TERRAIN_SOLID: 1 << 0,
  TERRAIN_PATH_A: 1 << 1,
  TERRAIN_PATH_B: 1 << 2,
  TERRAIN_TOP_ONLY: 1 << 3,
  PLAYER: 1 << 4,
  ENEMIES: 1 << 5,
  OBJECTS: 1 << 6,
  HAZARDS: 1 << 7,
  BOSS: 1 << 8,
} as const;
