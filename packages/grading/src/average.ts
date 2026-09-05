import { DEFAULT_GRADING_MAX } from "@madrasti/core";
import { normalise } from "./scale.js";

/**
 * Averages.
 *
 * Every function returns **full precision or `null`** — never a zero standing
 * in for "no mark". The distinction is the whole point of this file:
 *
 * - A **zero** is a mark a student earned. It counts, and it hurts.
 * - An **absence** is the absence of a mark. It is excluded entirely.
 * - A **subject with no marks at all** is excluded from the general average
 *   *including its coefficient*. Leaving the coefficient in the denominator
 *   while contributing nothing to the numerator deflates every general average
 *   in the class, and does it invisibly (`docs/test-strategy-madrasti.md` §3).
 */

/** One student's mark for one assessment, as an average needs it. */
export type Mark = {
  /** `null` when the student was absent. Never a stand-in for zero. */
  score: number | null;
  isAbsent: boolean;
  /** The assessment's maximum — marks are normalised onto one scale first. */
  maxScore: number;
  /** How much this assessment weighs *within* its subject for the term. */
  coefficient: number;
};

/** A mark counts unless the student was absent for it. */
function counts(mark: Mark): boolean {
  return !mark.isAbsent && mark.score !== null;
}

/**
 * A weighted mean, or `null` when nothing counts.
 *
 * A total weight of zero cannot happen through the schemas — every coefficient
 * is `> 0` in Zod and in a database CHECK — but dividing by it would produce
 * `NaN`, and a `NaN` average silently poisons the general average, the rank and
 * the bulletin. It is refused here rather than propagated.
 */
function weightedMean(values: { value: number; weight: number }[]): number | null {
  if (values.length === 0) return null;

  let weighted = 0;
  let total = 0;
  for (const { value, weight } of values) {
    if (!(weight > 0)) throw new Error("errors.coefficientPositive");
    weighted += value * weight;
    total += weight;
  }
  return total > 0 ? weighted / total : null;
}

/**
 * One student's average in one subject for one term.
 *
 * `null` when the student has no counted mark — they were absent for every
 * assessment, or none has been marked yet. That is not a zero and must never
 * be rendered as one.
 */
export function subjectAverage(marks: Mark[], gradingMax = DEFAULT_GRADING_MAX): number | null {
  return weightedMean(
    marks.filter(counts).map((mark) => ({
      // `counts` has already established the score is not null.
      value: normalise(mark.score as number, mark.maxScore, gradingMax),
      weight: mark.coefficient,
    }))
  );
}

/** One subject's contribution to a general average. */
export type SubjectResult = {
  /** Unrounded, as `subjectAverage` returns it. `null` = no marks. */
  average: number | null;
  /** From `class_subjects` — maths is coefficient 4 in one level and 2 in another. */
  coefficient: number;
};

/**
 * One student's general average for a term.
 *
 * Subjects with no marks drop out entirely, coefficient included. `null` when
 * the student has no marks in any subject.
 */
export function generalAverage(subjects: SubjectResult[]): number | null {
  return weightedMean(
    subjects
      .filter((subject): subject is SubjectResult & { average: number } => subject.average !== null)
      .map((subject) => ({ value: subject.average, weight: subject.coefficient }))
  );
}

/** What the grade-entry screen shows about the class while the teacher types. */
export type AssessmentStats = {
  /** Marks entered, absences excluded. */
  marked: number;
  absent: number;
  /** Students with nothing recorded yet. */
  missing: number;
  /** Unrounded mean of the counted marks, on the assessment's own scale. */
  average: number | null;
  lowest: number | null;
  highest: number | null;
};

/**
 * The live summary under a register of marks.
 *
 * On the assessment's own scale rather than normalised: the teacher is looking
 * at the column she just typed, and rescaling a /10 oral to /20 under her
 * fingers would read as an error in the software.
 */
export function assessmentStats(
  entries: { score: number | null; isAbsent: boolean }[]
): AssessmentStats {
  const scores: number[] = [];
  let absent = 0;
  let missing = 0;

  for (const entry of entries) {
    if (entry.isAbsent) absent += 1;
    else if (entry.score === null) missing += 1;
    else scores.push(entry.score);
  }

  return {
    marked: scores.length,
    absent,
    missing,
    average: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    lowest: scores.length > 0 ? Math.min(...scores) : null,
    highest: scores.length > 0 ? Math.max(...scores) : null,
  };
}
