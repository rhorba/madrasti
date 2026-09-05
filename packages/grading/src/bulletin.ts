import { DEFAULT_GRADING_MAX } from "@madrasti/core";
import { type Mark, generalAverage, subjectAverage } from "./average.js";
import { rankStudents } from "./rank.js";
import { roundNullable } from "./scale.js";

/**
 * Composing a class's bulletins for one term.
 *
 * This is the last calculation in the product and the only one that leaves the
 * building on paper, signed by the school. Everything it needs already exists
 * — `subjectAverage`, `generalAverage`, `rankStudents` — and the work here is
 * assembling them into one frozen result per student, consistently across the
 * whole class.
 *
 * **The whole class is composed at once, never one student at a time.** A rank
 * is a statement about a cohort, so a function that returned one student's
 * bulletin would either have to recompute the class on every call or accept a
 * rank from its caller — and a caller that can pass in a rank is a caller that
 * can pass in the wrong one.
 */

/** One subject taught to the class, with its coefficient for *this* class. */
export type BulletinClassSubject = {
  subjectId: string;
  /** From `class_subjects` — maths is coefficient 4 in one level and 2 in another. */
  coefficient: number;
};

export type BulletinStudentInput = {
  studentId: string;
  /** Term total, already filtered to the term by the query layer. */
  absenceCount: number;
  /** Marks keyed by subject. A subject the student has no marks in may be absent. */
  marksBySubject: Record<string, Mark[]>;
};

/** One subject's row on the printed sheet. */
export type BulletinLine = {
  subjectId: string;
  /** Rounded for display and storage. `null` = no counted mark, never a zero. */
  average: number | null;
  coefficient: number;
  /** `average x coefficient` — the "points" column a parent adds up by hand. */
  weightedPoints: number | null;
  /** Position in this subject across the class. `null` when unranked. */
  rank: number | null;
};

export type ComposedBulletin = {
  studentId: string;
  generalAverage: number | null;
  rank: number | null;
  /**
   * The denominator printed as "3e sur 27".
   *
   * The number of students who *have* a rank, not the class headcount. A pupil
   * who joined in November has no marks and no rank; counting them in the
   * denominator would print "27e sur 32" against the last ranked student and
   * assert that five children did worse than them, which the school never said.
   */
  classSize: number;
  absenceCount: number;
  /** One line per subject taught to the class, in the order given. */
  lines: BulletinLine[];
};

/**
 * Compose every bulletin in a class for one term.
 *
 * Returns one result per student **in the order they were given**, so the
 * caller keeps whatever ordering it chose (register order, normally) and never
 * has to re-join on id.
 *
 * Rounding follows the rule the rest of this package is built on: subject and
 * general averages are carried at full precision through the arithmetic and
 * rounded exactly once, here, at the point of display. `weightedPoints` is
 * derived from the unrounded average for the same reason — see `scale.ts`.
 */
export function composeClassBulletins(
  subjects: BulletinClassSubject[],
  students: BulletinStudentInput[],
  gradingMax = DEFAULT_GRADING_MAX
): ComposedBulletin[] {
  // Pass 1 — every student's unrounded averages, per subject and overall.
  const computed = students.map((student) => {
    const perSubject = subjects.map((subject) => ({
      subjectId: subject.subjectId,
      coefficient: subject.coefficient,
      average: subjectAverage(student.marksBySubject[subject.subjectId] ?? [], gradingMax),
    }));

    return {
      student,
      perSubject,
      // A subject with no marks drops out entirely, coefficient included —
      // leaving it in the denominator would deflate every general average in
      // the class, invisibly.
      average: generalAverage(perSubject),
    };
  });

  // Pass 2 — rank the cohort overall, and again within each subject. Both use
  // the same comparator, so ties share a rank and the next rank skips.
  const overallRank = rankById(
    computed.map(({ student, average }) => ({ id: student.studentId, average }))
  );

  const subjectRanks = new Map<string, Map<string, number | null>>();
  for (const subject of subjects) {
    subjectRanks.set(
      subject.subjectId,
      rankById(
        computed.map(({ student, perSubject }) => ({
          id: student.studentId,
          average: perSubject.find((s) => s.subjectId === subject.subjectId)?.average ?? null,
        }))
      )
    );
  }

  const classSize = [...overallRank.values()].filter((rank) => rank !== null).length;

  // Pass 3 — round once, and assemble.
  return computed.map(({ student, perSubject, average }) => ({
    studentId: student.studentId,
    generalAverage: roundNullable(average),
    rank: overallRank.get(student.studentId) ?? null,
    classSize,
    absenceCount: student.absenceCount,
    lines: perSubject.map((subject) => ({
      subjectId: subject.subjectId,
      average: roundNullable(subject.average),
      coefficient: subject.coefficient,
      weightedPoints:
        subject.average === null ? null : roundNullable(subject.average * subject.coefficient),
      rank: subjectRanks.get(subject.subjectId)?.get(student.studentId) ?? null,
    })),
  }));
}

/** `rankStudents`, indexed by id so the callers above can look a rank up. */
function rankById(entries: { id: string; average: number | null }[]): Map<string, number | null> {
  return new Map(rankStudents(entries).map((entry) => [entry.id, entry.rank]));
}
