"use server";

import { defineAction } from "@/lib/action";
import { assertCanMarkSession } from "@/lib/auth/scope";
import type { AppSession } from "@/lib/auth/session";
import { type SaveAttendanceInput, saveAttendanceSchema } from "@madrasti/core";
import { attendance, classSubjects, db, enrolments, sessions, timetableSlots } from "@madrasti/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * Saving a register.
 *
 * One action for both taking and correcting: the session is created if it does
 * not exist, and every mark is upserted. A teacher fixing a mis-tap five
 * minutes later takes exactly the same path as the original save, so there is
 * no second code path to get subtly wrong (`docs/ux-madrasti.md` §3.7).
 */

/**
 * Find or create the session for a slot on a date.
 *
 * `ON CONFLICT DO NOTHING` then re-select, rather than select-then-insert: a
 * substitute and the titular teacher can open the same lesson at the same
 * moment, and this makes that harmless instead of a duplicate-key error in
 * front of a teacher (`docs/system-design-madrasti.md` §2).
 */
async function openSession(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  slotId: string,
  date: string
): Promise<string> {
  await tx.insert(sessions).values({ slotId, date, status: "held" }).onConflictDoNothing();

  const [row] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.slotId, slotId), eq(sessions.date, date)))
    .limit(1);

  if (!row) throw new Error("errors.unexpected");
  return row.id;
}

/**
 * Confirm every marked student is actually enrolled in this lesson's class.
 *
 * The list of students comes from the browser, so a tampered payload could
 * otherwise write a mark against a child in another class — which would then
 * surface on that family's absence record.
 */
async function assertStudentsBelong(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  slotId: string,
  studentIds: string[]
): Promise<void> {
  const enrolled = await tx
    .selectDistinct({ studentId: enrolments.studentId })
    .from(enrolments)
    .innerJoin(classSubjects, eq(classSubjects.classGroupId, enrolments.classGroupId))
    .innerJoin(timetableSlots, eq(timetableSlots.classSubjectId, classSubjects.id))
    .where(
      and(
        eq(timetableSlots.id, slotId),
        isNull(enrolments.leftOn),
        inArray(enrolments.studentId, studentIds)
      )
    );

  if (enrolled.length !== studentIds.length) throw new Error("errors.notAuthorized");
}

async function saveRegister(input: SaveAttendanceInput, { session }: { session: AppSession }) {
  return db.transaction(async (tx) => {
    const sessionId = await openSession(tx, input.slotId, input.date);

    // Authorisation is on the *session*, not the slot: a substitute recorded
    // on the session may mark it even though the slot names someone else.
    await assertCanMarkSession(session, sessionId);
    await assertStudentsBelong(
      tx,
      input.slotId,
      input.marks.map((mark) => mark.studentId)
    );

    const now = new Date();

    await tx
      .insert(attendance)
      .values(
        input.marks.map((mark) => ({
          sessionId,
          studentId: mark.studentId,
          status: mark.status,
          minutesLate: mark.status === "late" ? (mark.minutesLate ?? null) : null,
          note: mark.note ?? null,
          recordedBy: session.userId,
          recordedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [attendance.sessionId, attendance.studentId],
        set: {
          status: sqlExcluded("status"),
          minutesLate: sqlExcluded("minutes_late"),
          note: sqlExcluded("note"),
          recordedBy: session.userId,
          recordedAt: now,
          updatedAt: now,
        },
      });

    // Marking the register is what makes a lesson "held" — the register is the
    // record that it happened.
    await tx
      .update(sessions)
      .set({ status: "held", updatedAt: now })
      .where(eq(sessions.id, sessionId));

    const counts = input.marks.reduce<Record<string, number>>((acc, mark) => {
      acc[mark.status] = (acc[mark.status] ?? 0) + 1;
      return acc;
    }, {});

    return { sessionId, counts, total: input.marks.length };
  });
}

/** `excluded.<column>` — the row Postgres would have inserted. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

export const saveAttendance = defineAction({
  roles: ["teacher", "admin"],
  schema: saveAttendanceSchema,
  handler: saveRegister,
  audit: (input, data) => ({
    action: "attendance.save",
    entity: "sessions",
    entityId: data.sessionId,
    // Counts only — never a student id or a name in the audit payload
    // (`docs/security-madrasti.md` §7).
    payload: { date: input.date, total: data.total, ...data.counts },
  }),
  revalidate: () => ["/teacher"],
});
