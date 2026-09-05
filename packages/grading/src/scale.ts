import { AVERAGE_DECIMALS, DEFAULT_GRADING_MAX } from "@madrasti/core";

/**
 * Putting marks on one scale, and rounding them exactly once.
 *
 * Two rules govern everything in this package, and both exist because the
 * output is a document a parent keeps:
 *
 * 1. **Marks are normalised before they are averaged.** A teacher marks an
 *    oral out of 10 and a contrôle out of 20; averaging the raw numbers makes
 *    the oral count half as much as the teacher intended, silently.
 * 2. **Rounding happens once, at the end, for display.** Every function here
 *    returns full precision. Rounding a subject average and then averaging the
 *    rounded values makes a general average drift by a few centièmes — enough
 *    for a parent to recompute it by hand and find a different number, which
 *    is exactly the argument the school cannot win.
 */

/**
 * A mark, expressed on the school's scale (normally /20).
 *
 * A mark above `maxScore` is **not clamped**: a bonus point is a real thing
 * teachers award, and silently capping it would misreport what was given.
 */
export function normalise(
  score: number,
  maxScore: number,
  gradingMax = DEFAULT_GRADING_MAX
): number {
  if (!Number.isFinite(score)) throw new Error("errors.scoreRequired");
  if (!Number.isFinite(maxScore) || maxScore <= 0) throw new Error("errors.maxScorePositive");
  return (score / maxScore) * gradingMax;
}

/**
 * Round half-up to two decimals, for display.
 *
 * Half-**up**, not JavaScript's `Math.round` on a negative and not banker's
 * rounding: a school rounds 12.345 to 12.35, and marks are never negative.
 * `Number.EPSILON` compensates for the binary representation — without it
 * `1.005` rounds down, because it is really 1.00499999999999989.
 */
export function roundAverage(value: number, decimals = AVERAGE_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** `roundAverage`, but `null` survives — an absent student has no average. */
export function roundNullable(value: number | null, decimals = AVERAGE_DECIMALS): number | null {
  return value === null ? null : roundAverage(value, decimals);
}
