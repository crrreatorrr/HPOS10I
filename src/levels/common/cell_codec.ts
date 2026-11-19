// Compact tile cells for the web build. A level's tile layer lists every cell
// as [x, y, atlasX, atlasY] (up to 90k of them). The build stores them as one
// flat array with x and y as deltas from the previous cell, which gzips about
// 15x smaller and parses faster; the loader expands it back to the same cells,
// in the same order. The level JSON in the repository keeps the plain form.

export type Cell = [number, number, number, number];

/** [x, y, ax, ay][] -> [dx, dy, ax, ay, ...] (deltas from the previous cell; the first from 0, 0). */
export function encodeCells(cells: readonly Cell[]): number[] {
  const out: number[] = new Array(cells.length * 4);
  let px = 0;
  let py = 0;
  for (let i = 0; i < cells.length; i++) {
    const [x, y, ax, ay] = cells[i]!;
    out[i * 4] = x - px;
    out[i * 4 + 1] = y - py;
    out[i * 4 + 2] = ax;
    out[i * 4 + 3] = ay;
    px = x;
    py = y;
  }
  return out;
}

/** The inverse of encodeCells. */
export function decodeCells(flat: readonly number[]): Cell[] {
  const n = Math.floor(flat.length / 4);
  const out: Cell[] = new Array(n);
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += flat[i * 4]!;
    y += flat[i * 4 + 1]!;
    out[i] = [x, y, flat[i * 4 + 2]!, flat[i * 4 + 3]!];
  }
  return out;
}

/** True for the cells of an integer tile grid that encodeCells round-trips exactly. */
export function cellsEncodable(cells: unknown): cells is Cell[] {
  return Array.isArray(cells) && cells.every((c) => Array.isArray(c) && c.length === 4 && c.every((v) => Number.isSafeInteger(v)));
}

/** Rewrites a level JSON text with every node's `cells` as `cells_delta` (the build's level transform). */
export function packLevelJson(text: string): string {
  const data = JSON.parse(text) as { nodes?: Record<string, unknown>[] };
  for (const node of data.nodes ?? []) {
    if (!cellsEncodable(node.cells)) continue;
    node.cells_delta = encodeCells(node.cells);
    delete node.cells;
  }
  return JSON.stringify(data);
}
