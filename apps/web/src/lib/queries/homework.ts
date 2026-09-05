import { UPCOMING_HOMEWORK_DAYS } from "@madrasti/core";
import { assignments, classGroups, classSubjects, db, enrolments, subjects } from "@madrasti/db";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

/**
 * Homework reads.
 *
 * There is no submission pipeline in v1 — homework is handed in on paper
 * (`CLAUDE.md` §3.C). These queries therefore only ever answer one question:
 * what has been set, and by when.
 */

export type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  assignedOn: string;
  dueOn: string;
  attachmentKey: string | null;
  className: string;
  classGroupId: string;
  subjectNameFr: string;
  subjectNameAr: string;
  subjectNameEn: string;
  subjectColor: string;
};

const columns = {
  id: assignments.id,
  title: assignments.title,
  description: assignments.description,
  assignedOn: assignments.assignedOn,
  dueOn: assignments.dueOn,
  attachmentKey: assignments.attachmentKey,
  className: classGroups.name,
  classGroupId: classGroups.id,
  subjectNameFr: subjects.nameFr,
  subjectNameAr: subjects.nameAr,
  subjectNameEn: subjects.nameEn,
  subjectColor: subjects.color,
};

function base() {
  return db
    .select(columns)
    .from(assignments)
    .innerJoin(classSubjects, eq(classSubjects.id, assignments.classSubjectId))
    .innerJoin(classGroups, eq(classGroups.id, classSubjects.classGroupId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .$dynamic();
}

/**
 * Everything a teacher has set for one class+subject, due date first.
 *
 * Past homework stays visible: a teacher checking what she set last week is
 * the second most common reason to open this screen.
 */
export async function listAssignments(classSubjectId: string): Promise<AssignmentRow[]> {
  return base()
    .where(and(eq(assignments.classSubjectId, classSubjectId), isNull(assignments.deletedAt)))
    .orderBy(desc(assignments.dueOn), asc(assignments.title));
}

export async function getAssignment(assignmentId: string) {
  const [row] = await db
    .select({ ...columns, classSubjectId: assignments.classSubjectId })
    .from(assignments)
    .innerJoin(classSubjects, eq(classSubjects.id, assignments.classSubjectId))
    .innerJoin(classGroups, eq(classGroups.id, classSubjects.classGroupId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(and(eq(assignments.id, assignmentId), isNull(assignments.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Homework due in the next two weeks for a set of classes, soonest first.
 *
 * Takes class ids rather than a student or guardian, so the caller has already
 * passed through the scope layer and this cannot be handed an id from a URL
 * (`docs/security-madrasti.md` §3).
 */
export async function listUpcomingHomework(
  classGroupIds: string[],
  today: string,
  days = UPCOMING_HOMEWORK_DAYS
): Promise<AssignmentRow[]> {
  if (classGroupIds.length === 0) return [];

  const horizon = new Date(`${today}T00:00:00.000Z`);
  horizon.setUTCDate(horizon.getUTCDate() + days);

  return base()
    .where(
      and(
        inArray(classSubjects.classGroupId, classGroupIds),
        isNull(assignments.deletedAt),
        gte(assignments.dueOn, today),
        lte(assignments.dueOn, horizon.toISOString().slice(0, 10))
      )
    )
    .orderBy(asc(assignments.dueOn), asc(subjects.nameFr));
}

/** Homework set for one student's class, most recently due first. */
export async function listStudentHomework(studentId: string, limit = 20) {
  const classIds = await db
    .select({ id: enrolments.classGroupId })
    .from(enrolments)
    .where(and(eq(enrolments.studentId, studentId), isNull(enrolments.leftOn)));

  if (classIds.length === 0) return [];

  return base()
    .where(
      and(
        inArray(
          classSubjects.classGroupId,
          classIds.map((row) => row.id)
        ),
        isNull(assignments.deletedAt)
      )
    )
    .orderBy(desc(assignments.dueOn))
    .limit(limit);
}

/** How many pieces of homework are still to come, per class+subject. */
export async function countUpcomingByClassSubject(classSubjectIds: string[], today: string) {
  if (classSubjectIds.length === 0) return new Map<string, number>();

  const rows = await db
    .select({
      classSubjectId: assignments.classSubjectId,
      total: sql<number>`count(*)::int`,
    })
    .from(assignments)
    .where(
      and(
        inArray(assignments.classSubjectId, classSubjectIds),
        isNull(assignments.deletedAt),
        gte(assignments.dueOn, today)
      )
    )
    .groupBy(assignments.classSubjectId);

  return new Map(rows.map((row) => [row.classSubjectId, row.total]));
}
