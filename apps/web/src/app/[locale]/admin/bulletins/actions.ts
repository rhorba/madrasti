"use server";

import { defineAction } from "@/lib/action";
import { assertCanReachClass } from "@/lib/auth/scope";
import type { AppSession } from "@/lib/auth/session";
import { computeClassBulletins } from "@/lib/queries/bulletins";
import {
  type PublishBulletinsInput,
  type SaveBulletinReviewInput,
  type UnpublishBulletinsInput,
  publishBulletinsSchema,
  saveBulletinReviewSchema,
  unpublishBulletinsSchema,
} from "@madrasti/core";
import { bulletinLines, bulletins, db, enrolments } from "@madrasti/db";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

/**
 * Publishing a class's bulletins.
 *
 * This is the moment a set of numbers stops being a working figure and becomes
 * a document the school has signed and handed to a family. Three rules follow,
 * and none of them is a detail:
 *
 * 1. **Per class per term, never per student.** A rank is a statement about a
 *    cohort. Publishing half a class would print "5e sur 14" on a sheet whose
 *    class holds 32 pupils, and the school could not explain either number.
 * 2. **Publication freezes.** The figures are computed once, here, and written
 *    into `bulletins` and `bulletin_lines`. Everything afterwards reads the
 *    frozen rows. A mark corrected in March moves the live average and must
 *    leave January's paper alone (`CLAUDE.md` §6, threat T6).
 * 3. **The way back is explicit and audited.** `unpublishBulletins` takes the
 *    document back with a stated reason and reopens the term. A school that
 *    cannot correct a genuine mistake would simply stop using the software, so
 *    the answer is a deliberate act by the person answerable for the paperwork
 *    — not an edit that quietly rewrites what a parent already read.
 *
 * Admin only, throughout. A teacher owns their marks; the school owns the
 * document (`CLAUDE.md` §7).
 */

/**
 * Save the council's remarks and decisions as a draft.
 *
 * A `bulletins` row with a null `published_at` **is** the draft: it holds the
 * two written fields and no figures, because the figures stay live until
 * publication. A draft row carrying a stale average would be a second source
 * of truth with nothing to say which one was current.
 */
async function saveReview(input: SaveBulletinReviewInput, { session }: { session: AppSession }) {
  await assertCanReachClass(session, input.classGroupId);

  return db.transaction(async (tx) => {
    await assertStudentsBelong(
      tx,
      input.classGroupId,
      input.entries.map((entry) => entry.studentId)
    );

    // Editing the remark on a bulletin a family already holds is the same
    // rewrite the freeze exists to prevent, so the draft is refused too.
    await assertNoneArePublished(tx, input.classGroupId, input.termId);

    const now = new Date();

    await tx
      .insert(bulletins)
      .values(
        input.entries.map((entry) => ({
          studentId: entry.studentId,
          termId: input.termId,
          appreciation: entry.appreciation.length > 0 ? entry.appreciation : null,
          decision: entry.decision ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: [bulletins.studentId, bulletins.termId],
        set: {
          appreciation: sql.raw("excluded.appreciation"),
          decision: sql.raw("excluded.decision"),
          updatedAt: now,
        },
      });

    return {
      classGroupId: input.classGroupId,
      termId: input.termId,
      written: input.entries.filter((entry) => entry.appreciation.length > 0).length,
      decided: input.entries.filter((entry) => entry.decision != null).length,
    };
  });
}

export const saveBulletinReview = defineAction({
  roles: ["admin"],
  schema: saveBulletinReviewSchema,
  handler: saveReview,
  audit: (_input, data) => ({
    action: "bulletins.review",
    entity: "class_groups",
    entityId: data.classGroupId,
    // Counts only — the remark is a judgement about a named child and does not
    // belong in a second, less-protected copy (`CLAUDE.md` §11).
    payload: { termId: data.termId, written: data.written, decided: data.decided },
  }),
  revalidate: () => ["/admin/bulletins"],
});

/**
 * Publish: compute once, freeze, stamp.
 *
 * The whole class is written in one transaction. A partial publication is the
 * one outcome that must be impossible — some families able to see a term's
 * marks and others not, with ranks computed over a cohort that no longer
 * matches the sheet.
 */
async function publish(input: PublishBulletinsInput, { session }: { session: AppSession }) {
  await assertCanReachClass(session, input.classGroupId);

  // Computed outside the transaction: it is a read of four queries and holding
  // a write transaction open across them buys nothing.
  const composed = await computeClassBulletins(input.classGroupId, input.termId);
  if (composed.students.length === 0) throw new Error("errors.noStudents");

  return db.transaction(async (tx) => {
    await assertNoneArePublished(tx, input.classGroupId, input.termId);

    const now = new Date();

    // The draft row already exists for anyone the council wrote about; this
    // upsert adds the rest and stamps the figures onto all of them.
    const rows = await tx
      .insert(bulletins)
      .values(
        composed.students.map((student) => ({
          studentId: student.studentId,
          termId: input.termId,
          generalAverage: student.generalAverage === null ? null : String(student.generalAverage),
          rank: student.rank,
          classSize: student.classSize,
          absenceCount: student.absenceCount,
          publishedAt: now,
          publishedBy: session.userId,
        }))
      )
      .onConflictDoUpdate({
        target: [bulletins.studentId, bulletins.termId],
        set: {
          generalAverage: sql.raw("excluded.general_average"),
          rank: sql.raw("excluded.rank"),
          classSize: sql.raw("excluded.class_size"),
          absenceCount: sql.raw("excluded.absence_count"),
          publishedAt: now,
          publishedBy: session.userId,
          updatedAt: now,
          // `appreciation` and `decision` are deliberately absent: the draft
          // the council wrote is what gets published, not an empty overwrite.
        },
      })
      .returning({ id: bulletins.id, studentId: bulletins.studentId });

    const bulletinIdByStudent = new Map(rows.map((row) => [row.studentId, row.id]));

    // Republishing after an unpublish must not double the lines. Cleared and
    // rewritten, inside the same transaction, so no reader ever sees a
    // bulletin with none.
    await tx.delete(bulletinLines).where(
      inArray(
        bulletinLines.bulletinId,
        rows.map((row) => row.id)
      )
    );

    const lines = composed.students.flatMap((student) => {
      const bulletinId = bulletinIdByStudent.get(student.studentId);
      if (!bulletinId) return [];
      return student.lines.map((line) => ({
        bulletinId,
        subjectId: line.subjectId,
        average: line.average === null ? null : String(line.average),
        coefficient: String(line.coefficient),
        weightedPoints: line.weightedPoints === null ? null : String(line.weightedPoints),
        rank: line.rank,
        // The subject teacher's remark, frozen with the figure it sits beside.
        appreciation: line.appreciation,
      }));
    });

    if (lines.length > 0) await tx.insert(bulletinLines).values(lines);

    return {
      classGroupId: input.classGroupId,
      termId: input.termId,
      published: rows.length,
      lines: lines.length,
    };
  });
}

export const publishBulletins = defineAction({
  roles: ["admin"],
  schema: publishBulletinsSchema,
  handler: publish,
  audit: (_input, data) => ({
    action: "bulletins.publish",
    entity: "class_groups",
    entityId: data.classGroupId,
    payload: { termId: data.termId, published: data.published, lines: data.lines },
  }),
  revalidate: () => ["/admin/bulletins", "/parent", "/student"],
});

/**
 * Unpublish: take the document back, on the record.
 *
 * The frozen figures and lines are **kept**. Only `published_at` is cleared, so
 * the school can still see exactly what it handed out in January even while it
 * corrects the marks behind it — which is the whole point of being able to
 * answer a parent holding the paper copy. Publishing again overwrites them with
 * the corrected figures.
 */
async function unpublish(input: UnpublishBulletinsInput, { session }: { session: AppSession }) {
  await assertCanReachClass(session, input.classGroupId);

  const studentIds = await enrolledStudentIds(db, input.classGroupId);
  if (studentIds.length === 0) throw new Error("errors.noStudents");

  const rows = await db
    .update(bulletins)
    .set({ publishedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(bulletins.termId, input.termId),
        inArray(bulletins.studentId, studentIds),
        isNotNull(bulletins.publishedAt)
      )
    )
    .returning({ id: bulletins.id });

  if (rows.length === 0) throw new Error("errors.notPublished");

  return {
    classGroupId: input.classGroupId,
    termId: input.termId,
    unpublished: rows.length,
    reason: input.reason,
  };
}

export const unpublishBulletins = defineAction({
  roles: ["admin"],
  schema: unpublishBulletinsSchema,
  handler: unpublish,
  audit: (_input, data) => ({
    action: "bulletins.unpublish",
    entity: "class_groups",
    entityId: data.classGroupId,
    // The reason *is* recorded, unlike an appreciation: it is a statement about
    // the school's own paperwork, not about a child, and it is the only thing
    // that can answer "why did this average change" a year later.
    payload: { termId: data.termId, unpublished: data.unpublished, reason: data.reason },
  }),
  revalidate: () => ["/admin/bulletins", "/parent", "/student"],
});

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every pupil currently enrolled in the class. */
async function enrolledStudentIds(tx: Executor, classGroupId: string): Promise<string[]> {
  const rows = await tx
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)));
  return rows.map((row) => row.studentId);
}

/**
 * Confirm every named pupil is enrolled in this class.
 *
 * The list comes from the browser. Without this a tampered payload writes a
 * council decision — "redouble" — against a child in another class.
 */
async function assertStudentsBelong(
  tx: Executor,
  classGroupId: string,
  studentIds: string[]
): Promise<void> {
  const enrolled = await enrolledStudentIds(tx, classGroupId);
  const set = new Set(enrolled);
  if (studentIds.some((id) => !set.has(id))) throw new Error("errors.notAuthorized");
}

/** Refuse to touch a term this class has already published. */
async function assertNoneArePublished(
  tx: Executor,
  classGroupId: string,
  termId: string
): Promise<void> {
  const studentIds = await enrolledStudentIds(tx, classGroupId);
  if (studentIds.length === 0) return;

  const [row] = await tx
    .select({ id: bulletins.id })
    .from(bulletins)
    .where(
      and(
        eq(bulletins.termId, termId),
        inArray(bulletins.studentId, studentIds),
        isNotNull(bulletins.publishedAt)
      )
    )
    .limit(1);

  if (row) throw new Error("errors.bulletinPublished");
}
