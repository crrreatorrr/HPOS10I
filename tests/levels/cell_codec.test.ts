import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCells, encodeCells, packLevelJson } from '../../src/levels/common/cell_codec';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { TileLayer } from '../../src/levels/common/level_nodes';
import { registerCoreTypes } from '../../src/levels/scenes';

const LEVELS = readdirSync('src/levels/data', { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'tilesets')
  .flatMap((d) => readdirSync(`src/levels/data/${d.name}`).map((f) => `src/levels/data/${d.name}/${f}`));

describe('compact tile cells', () => {
  it('round-trips every level exactly, in order', () => {
    let layers = 0;
    for (const file of LEVELS) {
      const text = readFileSync(file, 'utf8');
      const plain = JSON.parse(text) as LevelData;
      const packed = JSON.parse(packLevelJson(text)) as LevelData;
      plain.nodes.forEach((n, i) => {
        const p = packed.nodes[i]!;
        if (!n.cells) {
          expect(p).toEqual(n);
          return;
        }
        layers++;
        expect(p.cells).toBeUndefined();
        expect(decodeCells(p.cells_delta!)).toEqual(n.cells);
        expect({ ...p, cells_delta: undefined }).toEqual({ ...n, cells: undefined });
      });
    }
    expect(layers).toBeGreaterThan(5);
  });

  it('handles negative coordinates and an empty layer', () => {
    const cells: [number, number, number, number][] = [[-3, 5, 0, 1], [-2, 5, 1, 1], [10, -4, 2, 0]];
    expect(decodeCells(encodeCells(cells))).toEqual(cells);
    expect(decodeCells(encodeCells([]))).toEqual([]);
  });

  it('builds the same tile layer from the packed form, with the same cells array on a rebuild', async () => {
    registerCoreTypes();
    const text = readFileSync('src/levels/data/z1_retro_rush_hills/act1.json', 'utf8');
    const plain = JSON.parse(text) as LevelData;
    const packed = JSON.parse(packLevelJson(text)) as LevelData;
    const tiles = async (d: LevelData) => (await buildLevel(d)).findChildren<TileLayer>((n) => n instanceof TileLayer)[0]!;
    const a = await tiles(plain);
    const b = await tiles(packed);
    const c = await tiles(packed);
    expect(b.cells).toEqual(a.cells);
    expect(c.cells).toBe(b.cells);
  });
});
