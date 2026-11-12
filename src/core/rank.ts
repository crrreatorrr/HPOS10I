// Act ranks. A clear's rank comes from r = time / par, where time is the
// honest attempt clock (GameState.attemptTime: never rewound by a death or a
// restart) and par is the act's par (Difficulty.parFor). A run that is not
// clean (any death or checkpoint restart) is capped at A. The same table
// gives the tally's time bonus.

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/** Best first. */
export const RANKS: readonly Rank[] = ['S', 'A', 'B', 'C', 'D'];

/** [r at or under, rank, time bonus]. Slower than the last row: rank D, no bonus. */
export const RANK_TABLE: readonly [number, Rank, number][] = [
  [0.7, 'S', 20000],
  [0.85, 'A', 12000],
  [1.0, 'B', 8000],
  [1.5, 'C', 3000],
  [2.0, 'D', 1000],
];

/** The best rank a run with a death or a restart can earn. */
export const UNCLEAN_CAP: Rank = 'A';

export interface RankResult {
  rank: Rank;
  bonus: number;
}

export function isRank(v: unknown): v is Rank {
  return typeof v === 'string' && (RANKS as readonly string[]).includes(v);
}

/** The rank and time bonus of a clear in `seconds` against `par` seconds. */
export function rankFor(seconds: number, par: number, clean = true): RankResult {
  const r = par > 0 ? seconds / par : Infinity;
  let rank: Rank = 'D';
  let bonus = 0;
  for (const [limit, rowRank, rowBonus] of RANK_TABLE) {
    if (r <= limit + 1e-9) {
      rank = rowRank;
      bonus = rowBonus;
      break;
    }
  }
  if (!clean && betterRank(rank, UNCLEAN_CAP)) {
    rank = UNCLEAN_CAP;
    bonus = RANK_TABLE.find((row) => row[1] === UNCLEAN_CAP)![2];
  }
  return { rank, bonus };
}

/** True when `a` is a strictly better rank than `b` (null = no rank yet). */
export function betterRank(a: Rank | null, b: Rank | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return RANKS.indexOf(a) < RANKS.indexOf(b);
}

/** The slowest time (seconds) that still earns `rank` against `par`. */
export function rankLimit(rank: Rank, par: number): number {
  const row = RANK_TABLE.find((r) => r[1] === rank);
  return row ? row[0] * par : Infinity;
}
