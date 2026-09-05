import {
  attendance,
  classGroups,
  classSubjects,
  db,
  enrolments,
  sessions,
  students,
  subjects,
  teachers,
  terms,
  timetableSlots,
} from "@madrasti/db";
import { and, asc, count, eq, gte, isNull, lte, sql } from "drizzle-orm";

/**
 * Attendance reads.
 *
 * The register screen is the most-used in the product and the one with the
 * tightest budget, so both of its queries return everything in one round trip:
 * the roster and any marks already recorded arrive together, never one query
 * per student (`docs/database-madrasti.md` §5).
 */

export type TodaySession = {
  slotId: string;
  /** Null until the register is opened — sessions are materialised lazily. */
  sessionId: string | null;
  startTime: string;
  endTime: string;
  room: string | null;
  classGroupId: string;
  className: string;
  subjectNameFr: string;
  subjectNameAr: string;
  subjectNameEn: string;
  subjectColor: string;
  /** How many marks exist, so the screen can show "already taken". */
  markCount: number;
};

/**
 * What this teacher is teaching on this date.
 *
 * The left join onto `sessions` is what makes "already taken?" answerable
 * without a second query — an unopened lesson simply has no session row.
 */
export async function listTeacherDay(
  teacherId: string,
  date: string,
  weekday: number
): Promise<TodaySession[]> {
  return db
    .select({
      slotId: timetableSlots.id,
      sessionId: sessions.id,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      room: timetableSlots.room,
      classGroupId: classGroups.id,
      className: classGroups.name,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
      subjectColor: subjects.color,
      markCount: sql<number>`(
        select count(*)::int from attendance a where a.session_id = ${sessions.id}
      )`,
    })
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .innerJoin(classGroups, eq(classGroups.id, classSubjects.classGroupId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .leftJoin(sessions, and(eq(sessions.slotId, timetableSlots.id), eq(sessions.date, date)))
    .where(
      and(
        eq(timetableSlots.isActive, true),
        eq(timetableSlots.weekday, weekday),
        eq(classSubjects.teacherId, teacherId)
      )
    )
    .orderBy(asc(timetableSlots.startTime));
}

export type RegisterRow = {
  studentId: string;
  firstNameFr: string;
  lastNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  massarCode: string | null;
  /** Null when this student has not been marked yet. */
  status: "present" | "absent" | "late" | "excused" | null;
  minutesLate: number | null;
};

/**
 * The class roster with any marks already recorded, in register order.
 *
 * One query. A loop over students here would be thirty round trips on the
 * screen that has the tightest time budget in the product.
 */
export async function getRegister(
  classGroupId: string,
  sessionId: string | null
): Promise<RegisterRow[]> {
  return db
    .select({
      studentId: students.id,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
      massarCode: students.massarCode,
      status: attendance.status,
      minutesLate: attendance.minutesLate,
    })
    .from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .leftJoin(
      attendance,
      and(
        eq(attendance.studentId, students.id),
        // A null sessionId means the register has never been opened, so the
        // join matches nothing and every student comes back unmarked.
        sessionId ? eq(attendance.sessionId, sessionId) : sql`false`
      )
    )
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)))
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));
}

/** Everything the register screen needs to identify the lesson it is showing. */
export async function getSessionContext(slotId: string, date: string) {
  const [row] = await db
    .select({
      slotId: timetableSlots.id,
      sessionId: sessions.id,
      date: sessions.date,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      room: timetableSlots.room,
      classGroupId: classGroups.id,
      className: classGroups.name,
      teacherId: classSubjects.teacherId,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
    })
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .innerJoin(classGroups, eq(classGroups.id, classSubjects.classGroupId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .leftJoin(sessions, and(eq(sessions.slotId, timetableSlots.id), eq(sessions.date, date)))
    .where(eq(timetableSlots.id, slotId))
    .limit(1);
  return row ?? null;
}

export type AbsenceTotals = {
  studentId: string;
  firstNameFr: string;
  lastNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  absent: number;
  late: number;
  excused: number;
  totalMarked: number;
};

/**
 * Per-student absence totals for a class over a term.
 *
 * Aggregated in SQL rather than by loading every mark: at 30 students × 26
 * lessons a week × a 16-week term this is tens of thousands of rows, and the
 * screen only ever shows four numbers per student.
 */
export async function getClassAbsenceTotals(
  classGroupId: string,
  termId: string
): Promise<AbsenceTotals[]> {
  const [term] = await db.select().from(terms).where(eq(terms.id, termId)).limit(1);
  if (!term) return [];

  return db
    .select({
      studentId: students.id,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
      absent: sql<number>`count(*) filter (where ${attendance.status} = 'absent')::int`,
      late: sql<number>`count(*) filter (where ${attendance.status} = 'late')::int`,
      excused: sql<number>`count(*) filter (where ${attendance.status} = 'excused')::int`,
      totalMarked: sql<number>`count(${attendance.id})::int`,
    })
    .from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .leftJoin(attendance, eq(attendance.studentId, students.id))
    .leftJoin(
      sessions,
      and(
        eq(sessions.id, attendance.sessionId),
        gte(sessions.date, term.startDate),
        lte(sessions.date, term.endDate)
      )
    )
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)))
    .groupBy(students.id)
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));
}

/** A single student's absence history, most recent first. */
export async function getStudentAbsences(studentId: string, limit = 100) {
  return db
    .select({
      id: attendance.id,
      date: sessions.date,
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
    .where(
      and(
        eq(attendance.studentId, studentId),
        // Only the exceptions: a list of "present" is not an absence record.
        sql`${attendance.status} <> 'present'`
      )
    )
    .orderBy(sql`${sessions.date} desc`, asc(timetableSlots.startTime))
    .limit(limit);
}

/** How many of today's lessons this teacher has already marked. */
export async function countTeacherMarkedToday(teacherId: string, date: string) {
  const [row] = await db
    .select({ total: count(sessions.id) })
    .from(sessions)
    .innerJoin(timetableSlots, eq(timetableSlots.id, sessions.slotId))
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .where(
      and(
        eq(sessions.date, date),
        eq(classSubjects.teacherId, teacherId),
        eq(sessions.status, "held")
      )
    );
  return row?.total ?? 0;
}

/** The teacher row behind a user, used to resolve "my" lessons. */
export async function getTeacherByUserId(userId: string) {
  const [row] = await db
    .select({ id: teachers.id })
    .from(teachers)
    .where(eq(teachers.userId, userId))
    .limit(1);
  return row ?? null;
}
