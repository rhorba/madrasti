"use server";

import { defineAction } from "@/lib/action";
import { assertCanGradeAssessment, assertCanGradeClassSubject } from "@/lib/auth/scope";
import type { AppSession } from "@/lib/auth/session";
import {
  type AssessmentInput,
  type AssessmentUpdateInput,
  type SaveGradesInput,
  assessmentIdSchema,
  assessmentSchema,
  assessmentUpdateSchema,
  saveGradesSchema,
} from "@madrasti/core";
import { assessments, classSubjects, db, enrolments, grades } from "@madrasti/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * Assessments and marks.
 *
 * Two rules run through everything here:
 *
 * 1. **Authorisation is on the class+subject, not the class.** A class has a
 *    dozen teachers; only the one who teaches *this* subject may write its
 *    marks (`assertCanGradeClassSubject`).
 * 2. **Absent is not zero.** The schema refuses a mark that is both, the
 *    database refuses it again with a CHECK, and neither is redundant — the
 *    first gives the teacher a sentence she can act on, the second means no
 *    code path anywhere can produce the state.
 */

async function create(input: AssessmentInput, { session }: { session: AppSession }) {
  await assertCanGradeClassSubject(session, input.classSubjectId);

  const [row] = await db
    .insert(assessments)
    .values({
      classSubjectId: input.classSubjectId,
      termId: input.termId,
      title: input.title,
      type: input.type,
      maxScore: String(input.maxScore),
      coefficient: String(input.coefficient),
      date: input.date,
      createdBy: session.userId,
    })
    .returning({ id: assessments.id });

  if (!row) throw new Error("errors.unexpected");
  return row;
}

export const createAssessment = defineAction({
  roles: ["teacher", "admin"],
  schema: assessmentSchema,
  handler: create,
  audit: (input, data) => ({
    action: "assessment.create",
    entity: "assessments",
    entityId: data.id,
    payload: { title: input.title, type: input.type, coefficient: input.coefficient },
  }),
  revalidate: () => ["/teacher/grades"],
});

async function update(input: AssessmentUpdateInput, { session }: { session: AppSession }) {
  await assertCanGradeAssessment(session, input.id);

  await db
    .update(assessments)
    .set({
      title: input.title,
      type: input.type,
      maxScore: String(input.maxScore),
      coefficient: String(input.coefficient),
      date: input.date,
      updatedAt: new Date(),
    })
    .where(eq(assessments.id, input.id));

  return { id: input.id };
}

export const updateAssessment = defineAction({
  roles: ["teacher", "admin"],
  schema: assessmentUpdateSchema,
  handler: update,
  audit: (input) => ({
    action: "assessment.update",
    entity: "assessments",
    entityId: input.id,
    // The coefficient and the maximum change every average behind this
    // assessment, so both are recorded rather than just "it was edited".
    payload: { title: input.title, maxScore: input.maxScore, coefficient: input.coefficient },
  }),
  revalidate: () => ["/teacher/grades"],
});

/**
 * Soft delete.
 *
 * The marks are not touched. An assessment created by mistake vanishes from
 * every screen and every average, and the academic record it carried survives
 * — grades are records, and CLAUDE.md §10.5 forbids destroying them. Every
 * read filters on `deleted_at is null`, so nothing has to remember to exclude
 * it at the call site.
 */
async function remove(input: { id: string }, { session }: { session: AppSession }) {
  await assertCanGradeAssessment(session, input.id);

  const [row] = await db
    .update(assessments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(assessments.id, input.id), isNull(assessments.deletedAt)))
    .returning({ id: assessments.id, classSubjectId: assessments.classSubjectId });

  if (!row) throw new Error("errors.notFound");
  return row;
}

export const deleteAssessment = defineAction({
  roles: ["teacher", "admin"],
  schema: assessmentIdSchema,
  handler: remove,
  audit: (_input, data) => ({
    action: "assessment.delete",
    entity: "assessments",
    entityId: data.id,
  }),
  revalidate: () => ["/teacher/grades"],
});

/**
 * Confirm every marked student is enrolled in this assessment's class.
 *
 * The list comes from the browser, exactly as it does for the attendance
 * register. Without this a tampered payload writes a mark against a child in
 * another class, and it would then appear on that family's bulletin.
 */
async function assertStudentsBelong(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  assessmentId: string,
  studentIds: string[]
): Promise<void> {
  const enrolled = await tx
    .selectDistinct({ studentId: enrolments.studentId })
    .from(enrolments)
    .innerJoin(classSubjects, eq(classSubjects.classGroupId, enrolments.classGroupId))
    .innerJoin(assessments, eq(assessments.classSubjectId, classSubjects.id))
    .where(
      and(
        eq(assessments.id, assessmentId),
        isNull(enrolments.leftOn),
        inArray(enrolments.studentId, studentIds)
      )
    );

  if (enrolled.length !== new Set(studentIds).size) throw new Error("errors.notAuthorized");
}

/**
 * Save a whole mark sheet.
 *
 * One action for entering and for correcting, like the register: the marks are
 * upserted, so a teacher fixing a typo takes the identical code path and there
 * is no second one to get subtly wrong.
 *
 * A student left blank is **not** sent by the client — an unmarked student has
 * no row at all, which is different from an absent one and different again
 * from a zero.
 */
async function saveMarkSheet(input: SaveGradesInput, { session }: { session: AppSession }) {
  const { classSubjectId } = await assertCanGradeAssessment(session, input.assessmentId);

  return db.transaction(async (tx) => {
    await assertStudentsBelong(
      tx,
      input.assessmentId,
      input.entries.map((entry) => entry.studentId)
    );

    const now = new Date();

    await tx
      .insert(grades)
      .values(
        input.entries.map((entry) => ({
          assessmentId: input.assessmentId,
          studentId: entry.studentId,
          // Absent and scored are mutually exclusive, and the database says so
          // too. Normalising here means a client that sends both is corrected
          // rather than rejected halfway through a class's marks.
          score: entry.isAbsent || entry.score === null ? null : String(entry.score),
          isAbsent: entry.isAbsent,
          comment: entry.comment ?? null,
          recordedBy: session.userId,
          recordedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [grades.assessmentId, grades.studentId],
        set: {
          score: sql.raw("excluded.score"),
          isAbsent: sql.raw("excluded.is_absent"),
          comment: sql.raw("excluded.comment"),
          recordedBy: session.userId,
          recordedAt: now,
          updatedAt: now,
        },
      });

    return {
      assessmentId: input.assessmentId,
      classSubjectId,
      total: input.entries.length,
      absent: input.entries.filter((entry) => entry.isAbsent).length,
    };
  });
}

export const saveGrades = defineAction({
  roles: ["teacher", "admin"],
  schema: saveGradesSchema,
  handler: saveMarkSheet,
  audit: (_input, data) => ({
    action: "grades.save",
    entity: "assessments",
    entityId: data.assessmentId,
    // Counts only — never a student id and never a mark. The audit trail must
    // not become a second, unprotected copy of the mark sheet
    // (`docs/security-madrasti.md` §7).
    payload: { total: data.total, absent: data.absent },
  }),
  revalidate: () => ["/teacher/grades"],
});
