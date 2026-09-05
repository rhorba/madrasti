"use server";

import { defineAction } from "@/lib/action";
import { assertCanGradeClassSubject } from "@/lib/auth/scope";
import type { AppSession } from "@/lib/auth/session";
import { assertTermOpenForClassSubject } from "@/lib/bulletin-freeze";
import { type SaveAppreciationsInput, saveAppreciationsSchema } from "@madrasti/core";
import { classSubjects, db, enrolments, subjectAppreciations } from "@madrasti/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * The written half of the bulletin.
 *
 * Two rules, both carried over from the mark sheet because the same misuse is
 * available here:
 *
 * 1. **Authorisation is on the class+subject, not the class.** The remark that
 *    prints in the French column is written by the French teacher and by
 *    nobody else — `assertCanGradeClassSubject`, exactly as for a mark.
 * 2. **Nothing about the child goes in the audit log.** The entry records that
 *    a sheet was written and how many rows it touched. The text itself is a
 *    judgement about a named minor; copying it into `audit_log` would make a
 *    second, less-protected copy of the most sensitive sentence in the product
 *    (`CLAUDE.md` §11, `docs/security-madrasti.md` §7).
 *
 * And the same freeze as the marks: an appreciation prints on the bulletin, so
 * once that bulletin is published the remark is part of a document the family
 * holds and stops being editable. It is the same document, so it is the same
 * rule — a freeze that covered the figures and left the sentences editable
 * would be a freeze in name only.
 */

/**
 * Confirm every named pupil is enrolled in this class+subject's class.
 *
 * The list comes from the browser. Without this a tampered payload writes a
 * remark against a child in another class — and unlike a mark, that remark
 * would print on the family's bulletin as the professional opinion of a
 * teacher who has never taught them.
 */
async function assertStudentsBelong(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  classSubjectId: string,
  studentIds: string[]
): Promise<void> {
  if (studentIds.length === 0) return;

  const enrolled = await tx
    .selectDistinct({ studentId: enrolments.studentId })
    .from(enrolments)
    .innerJoin(classSubjects, eq(classSubjects.classGroupId, enrolments.classGroupId))
    .where(
      and(
        eq(classSubjects.id, classSubjectId),
        isNull(enrolments.leftOn),
        inArray(enrolments.studentId, studentIds)
      )
    );

  if (enrolled.length !== new Set(studentIds).size) throw new Error("errors.notAuthorized");
}

/**
 * Save a whole appreciation sheet.
 *
 * A cleared remark **deletes its row** rather than storing an empty string.
 * The two are not the same thing: a row means "the teacher wrote about this
 * pupil", and an empty one would print a blank line on the bulletin where the
 * subject was meant to say nothing at all.
 */
async function saveSheet(input: SaveAppreciationsInput, { session }: { session: AppSession }) {
  await assertCanGradeClassSubject(session, input.classSubjectId);

  return db.transaction(async (tx) => {
    await assertTermOpenForClassSubject(input.classSubjectId, input.termId, tx);
    await assertStudentsBelong(
      tx,
      input.classSubjectId,
      input.entries.map((entry) => entry.studentId)
    );

    const written = input.entries.filter((entry) => entry.text.length > 0);
    const cleared = input.entries.filter((entry) => entry.text.length === 0);
    const now = new Date();

    if (cleared.length > 0) {
      await tx.delete(subjectAppreciations).where(
        and(
          eq(subjectAppreciations.classSubjectId, input.classSubjectId),
          eq(subjectAppreciations.termId, input.termId),
          inArray(
            subjectAppreciations.studentId,
            cleared.map((entry) => entry.studentId)
          )
        )
      );
    }

    if (written.length > 0) {
      await tx
        .insert(subjectAppreciations)
        .values(
          written.map((entry) => ({
            classSubjectId: input.classSubjectId,
            studentId: entry.studentId,
            termId: input.termId,
            text: entry.text,
            recordedBy: session.userId,
            recordedAt: now,
          }))
        )
        .onConflictDoUpdate({
          target: [
            subjectAppreciations.classSubjectId,
            subjectAppreciations.studentId,
            subjectAppreciations.termId,
          ],
          set: {
            text: sql.raw("excluded.text"),
            recordedBy: session.userId,
            recordedAt: now,
            updatedAt: now,
          },
        });
    }

    return {
      classSubjectId: input.classSubjectId,
      termId: input.termId,
      written: written.length,
      cleared: cleared.length,
    };
  });
}

export const saveAppreciations = defineAction({
  roles: ["teacher", "admin"],
  schema: saveAppreciationsSchema,
  handler: saveSheet,
  audit: (_input, data) => ({
    action: "appreciations.save",
    entity: "class_subjects",
    entityId: data.classSubjectId,
    // Counts only — never a student id and never a word of the text.
    payload: { termId: data.termId, written: data.written, cleared: data.cleared },
  }),
  revalidate: () => ["/teacher/appreciations"],
});
