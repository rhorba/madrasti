import {
  classGroups,
  classSubjects,
  db,
  enrolments,
  sessions,
  studentGuardians,
  timetableSlots,
} from "@madrasti/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NotAuthorizedError } from "./errors.js";
import type { AppSession } from "./session.js";

/**
 * Reachability.
 *
 * Every read or write that touches a student, a class or a session goes through
 * one of these. They are the whole of the authorisation model, deliberately
 * concentrated in one small file so a reviewer can audit the rules here and
 * then only has to check the call sites.
 *
 * Three properties, all deliberate:
 *
 * 1. **Reach is a join, never a claim.** A parent's children come from
 *    `student_guardians`; a teacher's classes from `class_subjects.teacher_id`.
 *    Nothing is read from the JWT, so authority cannot go stale.
 * 2. **Deny by default.** These throw. There is no empty-list fallback a caller
 *    could mistake for a legitimate result.
 * 3. **Admin is explicit.** The `admin` short-circuit is written once per
 *    function, in view of the rule it bypasses.
 */

/** Can this session see this student's records? */
export async function assertCanReachStudent(session: AppSession, studentId: string): Promise<void> {
  if (session.role === "admin") return;

  if (session.role === "student") {
    if (session.studentId && session.studentId === studentId) return;
    throw new NotAuthorizedError(`student ${session.userId} -> student ${studentId}`);
  }

  if (session.role === "parent") {
    if (!session.guardianId) throw new NotAuthorizedError("parent without guardian record");
    const [link] = await db
      .select({ studentId: studentGuardians.studentId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.guardianId, session.guardianId),
          eq(studentGuardians.studentId, studentId)
        )
      )
      .limit(1);
    if (link) return;
    throw new NotAuthorizedError(`guardian ${session.guardianId} -> student ${studentId}`);
  }

  if (session.role === "teacher") {
    if (!session.teacherId) throw new NotAuthorizedError("teacher without teacher record");
    // A teacher reaches a student only through a class they actually teach.
    const [row] = await db
      .select({ id: enrolments.id })
      .from(enrolments)
      .innerJoin(classSubjects, eq(classSubjects.classGroupId, enrolments.classGroupId))
      .where(
        and(
          eq(enrolments.studentId, studentId),
          isNull(enrolments.leftOn),
          eq(classSubjects.teacherId, session.teacherId)
        )
      )
      .limit(1);
    if (row) return;
    throw new NotAuthorizedError(`teacher ${session.teacherId} -> student ${studentId}`);
  }

  throw new NotAuthorizedError(`role ${session.role} -> student ${studentId}`);
}

/** Can this session see this class? */
export async function assertCanReachClass(
  session: AppSession,
  classGroupId: string
): Promise<void> {
  if (session.role === "admin") return;

  if (session.role === "teacher") {
    if (!session.teacherId) throw new NotAuthorizedError("teacher without teacher record");
    const [row] = await db
      .select({ id: classSubjects.id })
      .from(classSubjects)
      .where(
        and(
          eq(classSubjects.classGroupId, classGroupId),
          eq(classSubjects.teacherId, session.teacherId)
        )
      )
      .limit(1);
    if (row) return;
    throw new NotAuthorizedError(`teacher ${session.teacherId} -> class ${classGroupId}`);
  }

  // A parent or student reaches a class only via their own enrolment — enough
  // to view a timetable, never enough to see the class's other students.
  const ownStudentIds = await reachableStudentIds(session);
  if (ownStudentIds.length > 0) {
    const [row] = await db
      .select({ id: enrolments.id })
      .from(enrolments)
      .where(
        and(
          eq(enrolments.classGroupId, classGroupId),
          isNull(enrolments.leftOn),
          inArray(enrolments.studentId, ownStudentIds)
        )
      )
      .limit(1);
    if (row) return;
  }

  throw new NotAuthorizedError(`role ${session.role} -> class ${classGroupId}`);
}

/**
 * A connection or an open transaction.
 *
 * Every other check here reads committed data, so it can use the pool. Marking
 * a register cannot: the session is materialised inside the caller's
 * transaction and is invisible from any other connection until it commits, so
 * the check has to run on the same transaction or it would refuse every first
 * save (`.logs/issues.md`, 2026-09-05).
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Can this session take or amend the register for this session?
 *
 * Stricter than reading: only the teacher who teaches that slot, the recorded
 * substitute, or an admin.
 */
export async function assertCanMarkSession(
  session: AppSession,
  sessionId: string,
  executor: Executor = db
): Promise<void> {
  if (session.role === "admin") return;
  if (session.role !== "teacher" || !session.teacherId) {
    throw new NotAuthorizedError(`role ${session.role} -> mark session ${sessionId}`);
  }

  const [row] = await executor
    .select({
      titularTeacherId: classSubjects.teacherId,
      actualTeacherId: sessions.actualTeacherId,
    })
    .from(sessions)
    .innerJoin(timetableSlots, eq(timetableSlots.id, sessions.slotId))
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) throw new NotAuthorizedError(`session ${sessionId} not found`);
  if (row.actualTeacherId === session.teacherId) return;
  if (row.actualTeacherId === null && row.titularTeacherId === session.teacherId) return;

  throw new NotAuthorizedError(`teacher ${session.teacherId} -> mark session ${sessionId}`);
}

/**
 * Every student this session may reach.
 *
 * Use this to *build* a query rather than to filter one after the fact —
 * fetching a class and then removing rows leaks the count, and it is easy to
 * forget the filter on a second code path.
 */
export async function reachableStudentIds(session: AppSession): Promise<string[]> {
  switch (session.role) {
    case "admin": {
      const rows = await db
        .select({ id: enrolments.studentId })
        .from(enrolments)
        .where(isNull(enrolments.leftOn));
      return rows.map((r) => r.id);
    }
    case "student":
      return session.studentId ? [session.studentId] : [];
    case "parent": {
      if (!session.guardianId) return [];
      const rows = await db
        .select({ id: studentGuardians.studentId })
        .from(studentGuardians)
        .where(eq(studentGuardians.guardianId, session.guardianId));
      return rows.map((r) => r.id);
    }
    case "teacher": {
      if (!session.teacherId) return [];
      const rows = await db
        .selectDistinct({ id: enrolments.studentId })
        .from(enrolments)
        .innerJoin(classSubjects, eq(classSubjects.classGroupId, enrolments.classGroupId))
        .where(and(isNull(enrolments.leftOn), eq(classSubjects.teacherId, session.teacherId)));
      return rows.map((r) => r.id);
    }
  }
}

/** Every class this session may reach, with its name. */
export async function reachableClasses(
  session: AppSession
): Promise<{ id: string; name: string }[]> {
  if (session.role === "admin") {
    return db.select({ id: classGroups.id, name: classGroups.name }).from(classGroups);
  }

  if (session.role === "teacher") {
    if (!session.teacherId) return [];
    return db
      .selectDistinct({ id: classGroups.id, name: classGroups.name })
      .from(classGroups)
      .innerJoin(classSubjects, eq(classSubjects.classGroupId, classGroups.id))
      .where(eq(classSubjects.teacherId, session.teacherId));
  }

  const studentIds = await reachableStudentIds(session);
  if (studentIds.length === 0) return [];

  return db
    .selectDistinct({ id: classGroups.id, name: classGroups.name })
    .from(classGroups)
    .innerJoin(enrolments, eq(enrolments.classGroupId, classGroups.id))
    .where(and(isNull(enrolments.leftOn), inArray(enrolments.studentId, studentIds)));
}
