import { assessments, bulletins, classSubjects, db, enrolments } from "@madrasti/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

/**
 * The freeze.
 *
 * Once a class's bulletins are published for a term, the marks and remarks
 * behind them stop being editable. This is the rule `CLAUDE.md` §6 states and
 * `docs/security-madrasti.md` calls threat T6: a parent is handed a paper
 * bulletin in January, a teacher corrects a mark in March, and the school can
 * no longer explain why its own records disagree with the document it signed.
 *
 * Two properties are deliberate:
 *
 * 1. **The guard is on the term and the class, not the student.** A whole
 *    class is published at once because a rank is a statement about a cohort,
 *    so the unit that freezes is the same unit that published.
 * 2. **It refuses rather than silently ignoring.** The teacher is told the
 *    bulletins are published and that an admin must withdraw them — a sentence
 *    she can act on, in her own language. A save that appeared to succeed and
 *    changed nothing would be far worse than a refusal.
 *
 * The way back is `unpublishBulletins`: an admin takes the document back, with
 * a reason, and the term reopens. That is a deliberate, audited act by the
 * person answerable for the paperwork — not something a mark entry does by
 * accident.
 */

/** True when any bulletin in this class is published for this term. */
export async function isClassTermPublished(
  classGroupId: string,
  termId: string,
  executor: Executor = db
): Promise<boolean> {
  const [row] = await executor
    .select({ id: bulletins.id })
    .from(bulletins)
    .innerJoin(
      enrolments,
      and(eq(enrolments.studentId, bulletins.studentId), isNull(enrolments.leftOn))
    )
    .where(
      and(
        eq(enrolments.classGroupId, classGroupId),
        eq(bulletins.termId, termId),
        isNotNull(bulletins.publishedAt)
      )
    )
    .limit(1);

  return Boolean(row);
}

/** A connection or an open transaction — see `lib/auth/scope.ts`. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Refuse a write that would change a published bulletin, by class and term.
 *
 * Throws a translation key, which `defineAction` passes straight through to
 * the user's language — never a Postgres or Zod sentence (§10.6).
 */
export async function assertTermOpen(
  classGroupId: string,
  termId: string,
  executor: Executor = db
): Promise<void> {
  if (await isClassTermPublished(classGroupId, termId, executor)) {
    throw new Error("errors.bulletinPublished");
  }
}

/** The same guard, for a write addressed by class+subject. */
export async function assertTermOpenForClassSubject(
  classSubjectId: string,
  termId: string,
  executor: Executor = db
): Promise<void> {
  const [row] = await executor
    .select({ classGroupId: classSubjects.classGroupId })
    .from(classSubjects)
    .where(eq(classSubjects.id, classSubjectId))
    .limit(1);

  // An unknown class+subject is not this guard's business to report — the
  // authorisation check in front of it has already refused it.
  if (!row) return;
  await assertTermOpen(row.classGroupId, termId, executor);
}

/**
 * The same guard, for a write addressed by assessment.
 *
 * The assessment carries its own term, so nothing here trusts a term id from
 * the caller: a payload naming an open term while editing a marked assessment
 * in a published one would otherwise walk straight through.
 */
export async function assertTermOpenForAssessment(
  assessmentId: string,
  executor: Executor = db
): Promise<void> {
  const [row] = await executor
    .select({
      classGroupId: classSubjects.classGroupId,
      termId: assessments.termId,
    })
    .from(assessments)
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!row) return;
  await assertTermOpen(row.classGroupId, row.termId, executor);
}
