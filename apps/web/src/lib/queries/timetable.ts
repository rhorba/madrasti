import { classGroups, classSubjects, db, subjects, teachers, timetableSlots } from "@madrasti/db";
import type { SlotLike } from "@madrasti/timetable";
import { and, asc, eq } from "drizzle-orm";

/**
 * Timetable reads.
 *
 * A slot row on its own is meaningless — it points at a `class_subject`, which
 * is where the subject, teacher and class actually live. Every query here
 * joins through to what a person needs to see, so no screen has to assemble
 * that itself.
 */

export type TimetableEntry = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  classSubjectId: string;
  classGroupId: string;
  className: string;
  subjectId: string;
  subjectNameFr: string;
  subjectNameAr: string;
  subjectNameEn: string;
  subjectColor: string;
  teacherId: string;
  teacherFirstNameFr: string;
  teacherLastNameFr: string;
  teacherFirstNameAr: string;
  teacherLastNameAr: string;
};

const ENTRY_COLUMNS = {
  id: timetableSlots.id,
  weekday: timetableSlots.weekday,
  startTime: timetableSlots.startTime,
  endTime: timetableSlots.endTime,
  room: timetableSlots.room,
  classSubjectId: classSubjects.id,
  classGroupId: classGroups.id,
  className: classGroups.name,
  subjectId: subjects.id,
  subjectNameFr: subjects.nameFr,
  subjectNameAr: subjects.nameAr,
  subjectNameEn: subjects.nameEn,
  subjectColor: subjects.color,
  teacherId: teachers.id,
  teacherFirstNameFr: teachers.firstNameFr,
  teacherLastNameFr: teachers.lastNameFr,
  teacherFirstNameAr: teachers.firstNameAr,
  teacherLastNameAr: teachers.lastNameAr,
} as const;

function baseQuery() {
  return db
    .select(ENTRY_COLUMNS)
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .innerJoin(classGroups, eq(classGroups.id, classSubjects.classGroupId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .innerJoin(teachers, eq(teachers.id, classSubjects.teacherId));
}

const ACTIVE = eq(timetableSlots.isActive, true);
const IN_ORDER = [asc(timetableSlots.weekday), asc(timetableSlots.startTime)] as const;

export async function listClassTimetable(classGroupId: string): Promise<TimetableEntry[]> {
  return baseQuery()
    .where(and(ACTIVE, eq(classSubjects.classGroupId, classGroupId)))
    .orderBy(...IN_ORDER);
}

export async function listTeacherTimetable(teacherId: string): Promise<TimetableEntry[]> {
  return baseQuery()
    .where(and(ACTIVE, eq(classSubjects.teacherId, teacherId)))
    .orderBy(...IN_ORDER);
}

/**
 * Every active slot in the school.
 *
 * Conflict detection needs the whole grid, not one class's: the point of the
 * check is that a teacher booked here is free everywhere else. At one school
 * this is a few hundred rows, so fetching them all and deciding in memory is
 * both simpler and faster than an overlap query in SQL
 * (`docs/database-madrasti.md` §3).
 */
export async function listAllSlotsForConflictCheck(): Promise<SlotLike[]> {
  const rows = await db
    .select({
      id: timetableSlots.id,
      weekday: timetableSlots.weekday,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      room: timetableSlots.room,
      teacherId: classSubjects.teacherId,
      classGroupId: classSubjects.classGroupId,
    })
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .where(ACTIVE);

  return rows;
}

/** The class and teacher a `class_subject` belongs to, for a conflict check. */
export async function getClassSubjectParties(classSubjectId: string) {
  const [row] = await db
    .select({
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
      subjectNameFr: subjects.nameFr,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(eq(classSubjects.id, classSubjectId))
    .limit(1);
  return row ?? null;
}

/** Resolve a slot id back to the parties involved, for editing. */
export async function getSlot(slotId: string) {
  const [row] = await db
    .select({
      id: timetableSlots.id,
      weekday: timetableSlots.weekday,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      room: timetableSlots.room,
      classSubjectId: timetableSlots.classSubjectId,
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .where(eq(timetableSlots.id, slotId))
    .limit(1);
  return row ?? null;
}
