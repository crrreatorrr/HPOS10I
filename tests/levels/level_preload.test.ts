import { describe, expect, it } from 'vitest';
import { assetExists } from '../../src/runtime/assets';
import { LevelRoot } from '../../src/levels/common/level_root';
import { TileLayer } from '../../src/levels/common/level_nodes';
import { levelArtPaths } from '../../src/levels/common/level_preload';

describe('level art preload', () => {
  it('names the zone atlas, backdrop, terrain and common sheets, all of which exist', () => {
    const root = new LevelRoot();
    root.artZoneId = 'z2_wizard_academy';
    root.backdropVariant = 'act2';
    const tiles = new TileLayer();
    tiles.tilesetId = 'z1_retro_rush_hills';
    root.addChild(tiles);
    const paths = levelArtPaths(root, 'level:z2_wizard_academy/act2');
    expect(paths).toContain('assets/tiles/z2_wizard_academy_tiles.png');
    expect(paths).toContain('assets/sprites/common/props/floor_hazards.png');
    expect(paths.some((p) => p.startsWith('assets/backgrounds/z2_wizard_academy/'))).toBe(true);
    expect(paths).toContain('assets/sprites/z2_wizard_academy/wizard_hat/wizard_hat_sheet.png');
    expect(paths.filter((p) => p.includes('/bosses/'))).toEqual([]);
    expect(paths.filter((p) => !assetExists(p) && !p.startsWith('assets/terrain/'))).toEqual([]);
  });

  it('adds the boss sheets for an arena and the remix atlas for Zone 4', () => {
    expect(levelArtPaths(new LevelRoot(), 'boss:rug_pull').filter((p) => p.includes('/bosses/'))).toHaveLength(3);
    expect(levelArtPaths(new LevelRoot(), 'level:z4_neon_rush_remix/act1')).toContain('assets/sprites/common/pills/remix_enemies.png');
  });
});
