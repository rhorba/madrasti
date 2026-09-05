import {
  assessments,
  attendance,
  classGroups,
  classSubjects,
  db,
  enrolments,
  grades,
  sessions,
  students,
  subjects,
  timetableSlots,
} from "@madrasti/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * Family reads — the parent and student portals.
 *
 * Every function here takes a **list** of student ids and returns a map keyed
 * by student, rather than answering for one child at a time. A parent home
 * with three children would otherwise be three queries per card, and the same
 * shape lands on the admin's 300-student screens later (`CLAUDE.md` §12.9).
 *
 * None of them checks authorisation. They are handed ids that have already
 * been through `reachableStudentIds` or `requireReachableStudent`, and taking
 * a list makes that hard to get wrong: there is no single id here that could
 * have come straight from a URL.
 */

export type ChildRow = {
  id: string;
  firstNameFr: string;
  lastNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  massarCode: string | null;
  classGroupId: string | null;
  className: string | null;
};

/**
 * The children themselves, with the class each is enrolled in this year.
 *
 * A left join, not an inner one: a child who has been registered but not yet
 * put in a class still has to appear on their parent's home, otherwise the
 * parent sees an empty portal and phones the school.
 */
export async function listChildren(studentIds: string[]): Promise<ChildRow[]> {
  if (studentIds.length === 0) return [];

  return db
    .select({
      id: students.id,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
      massarCode: students.massarCode,
      classGroupId: classGroups.id,
      className: classGroups.name,
    })
    .from(students)
    .leftJoin(enrolments, and(eq(enrolments.studentId, students.id), isNull(enrolments.leftOn)))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(inArray(students.id, studentIds))
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));
}

export type DayMark = {
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
  minutesLate: number | null;
  startTime: string;
  subjectNameFr: string;
  subjectNameAr: string;
  subjectNameEn: string;
};

/**
 * Today's register entries for these children, in lesson order.
 *
 * Presents are included, unlike `getStudentAbsences`. On this screen the
 * question is "was my child in school today", and a card that can only ever
 * say "absent" or nothing at all cannot distinguish a present child from a
 * lesson where the register was never taken. The page needs both.
 */
export async function listDayMarks(studentIds: string[], date: string): Promise<DayMark[]> {
  if (studentIds.length === 0) return [];

  return db
    .select({
      studentId: attendance.studentId,
      status: attendance.status,
      minutesLate: attendance.minutesLate,
      startTime: timetableSlots.startTime,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
    })
    .from(attendance)
    .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .innerJoin(timetableSlots, eq(timetableSlots.id, sessions.slotId))
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(and(inArray(attendance.studentId, studentIds), eq(sessions.date, date)))
    .orderBy(asc(timetableSlots.startTime));
}

export type LatestMark = {
  studentId: string;
  assessmentId: string;
  title: string;
  date: string;
  score: string | null;
  isAbsent: boolean;
  maxScore: string;
  subjectNameFr: string;
  subjectNameAr: string;
  subjectNameEn: string;
};

/**
 * The most recent mark each child has been given.
 *
 * `distinct on` rather than a correlated subquery or a fetch-then-fold: the
 * grade table is the largest in the product and this must not grow with the
 * number of marks, only with the number of children.
 */
export async function listLatestMarks(studentIds: string[]): Promise<LatestMark[]> {
  if (studentIds.length === 0) return [];

  return (
    db
      .selectDistinctOn([grades.studentId], {
        studentId: grades.studentId,
        assessmentId: assessments.id,
        title: assessments.title,
        date: assessments.date,
        score: grades.score,
        isAbsent: grades.isAbsent,
        maxScore: assessments.maxScore,
        subjectNameFr: subjects.nameFr,
        subjectNameAr: subjects.nameAr,
        subjectNameEn: subjects.nameEn,
      })
      .from(grades)
      .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
      .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
      .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .where(and(inArray(grades.studentId, studentIds), isNull(assessments.deletedAt)))
      // The distinct-on column has to lead the ordering; the rest picks which
      // row of each group survives — the newest assessment, and among marks
      // recorded on the same day the one entered last.
      .orderBy(asc(grades.studentId), desc(assessments.date), desc(grades.recordedAt))
  );
}

/**
 * Absence totals for these children over one term, in one query.
 *
 * The class version of this lives in `queries/attendance.ts` and is aggregated
 * the same way, including the guard that cost a debugging session: every count
 * is on `sessions.id`, because a mark outside the term keeps its attendance
 * row and arrives with a null session, which `count(*)` would happily count
 * (`.logs/issues.md`, 2026-09-05).
 */
export async function getTermAbsenceTotals(
  studentIds: string[],
  termStart: string,
  termEnd: string
): Promise<Map<string, { absent: number; late: number; excused: number }>> {
  const totals = new Map<string, { absent: number; late: number; excused: number }>();
  if (studentIds.length === 0) return totals;

  const rows = await db
    .select({
      studentId: attendance.studentId,
      absent: sql<number>`count(${sessions.id}) filter (where ${attendance.status} = 'absent')::int`,
      late: sql<number>`count(${sessions.id}) filter (where ${attendance.status} = 'late')::int`,
      excused: sql<number>`count(${sessions.id}) filter (where ${attendance.status} = 'excused')::int`,
    })
    .from(attendance)
    .innerJoin(
      sessions,
      and(
        eq(sessions.id, attendance.sessionId),
        sql`${sessions.date} between ${termStart} and ${termEnd}`
      )
    )
    .where(inArray(attendance.studentId, studentIds))
    .groupBy(attendance.studentId);

  for (const row of rows) {
    totals.set(row.studentId, { absent: row.absent, late: row.late, excused: row.excused });
  }
  return totals;
}

/** Group any of the lists above by student, so a card can read its own slice. */
export function groupByStudent<T extends { studentId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(row.studentId);
    if (list) list.push(row);
    else out.set(row.studentId, [row]);
  }
  return out;
}
