import { roundAverage } from "./scale.js";

/**
 * Class rank.
 *
 * Two rules, both of which the obvious implementation gets wrong:
 *
 * 1. **Ties share a rank, and the next rank skips it** — 1, 2, 2, 4, not
 *    1, 2, 2, 3. Ranking by array index produces the second, and nobody
 *    notices until two families compare bulletins.
 * 2. **A student with no average is unranked, not last.** A pupil who joined
 *    in November has no marks; printing "23e sur 23" against their name is a
 *    statement about them that the school did not make.
 *
 * Ranking compares the **rounded** average, deliberately. The bulletin prints
 * 12.34; if two pupils both print 12.34 and one is ranked above the other on a
 * difference in the fourth decimal, the school cannot explain it to either
 * parent, and the parent is right to ask.
 */

export type Rankable<T> = T & {
  /** Unrounded, as `generalAverage` returns it. `null` = no marks at all. */
  average: number | null;
};

export type Ranked<T> = Rankable<T> & {
  /** 1-based. `null` when the student has no average to rank. */
  rank: number | null;
};

/**
 * Rank highest-average first.
 *
 * Returns every entry: ranked ones in rank order, then the unranked in the
 * order they arrived. Callers get one list and never have to re-join.
 */
export function rankStudents<T>(entries: Rankable<T>[]): Ranked<T>[] {
  const unranked = entries.filter((entry) => entry.average === null);
  const ranked = entries
    .filter((entry): entry is Rankable<T> & { average: number } => entry.average !== null)
    .map((entry) => ({ entry, key: roundAverage(entry.average) }))
    // Descending: the best average is 1st.
    .sort((a, b) => b.key - a.key);

  const out: Ranked<T>[] = [];
  let currentRank = 0;
  let previousKey: number | null = null;

  ranked.forEach(({ entry, key }, index) => {
    // The skip: a tie keeps the previous rank, and the next distinct average
    // takes the position it actually occupies in the list.
    if (previousKey === null || key !== previousKey) currentRank = index + 1;
    previousKey = key;
    out.push({ ...entry, rank: currentRank });
  });

  for (const entry of unranked) out.push({ ...entry, rank: null });
  return out;
}
