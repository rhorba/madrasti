import {
  classGroups,
  classSubjects,
  db,
  enrolments,
  guardians,
  studentGuardians,
  students,
  teachers,
  users,
} from "@madrasti/db";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";

/**
 * Student and guardian reads.
 *
 * The list screen carries a search box because the school has ~300 students
 * and the secretary looks people up by name, not by scrolling. Searching both
 * scripts matters: staff type "Kabbaj" or "قباج" depending on which keyboard
 * is in front of them.
 */

const PAGE_SIZE = 50;

export async function listStudents(options?: { query?: string; page?: number }) {
  const term = options?.query?.trim();
  const page = Math.max(1, options?.page ?? 1);

  const search = term
    ? or(
        ilike(students.lastNameFr, `%${term}%`),
        ilike(students.firstNameFr, `%${term}%`),
        ilike(students.lastNameAr, `%${term}%`),
        ilike(students.firstNameAr, `%${term}%`),
        ilike(students.massarCode, `%${term}%`)
      )
    : undefined;

  const rows = await db
    .select({
      id: students.id,
      massarCode: students.massarCode,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
      birthDate: students.birthDate,
      gender: students.gender,
      status: students.status,
      className: classGroups.name,
      classGroupId: classGroups.id,
    })
    .from(students)
    .leftJoin(enrolments, and(eq(enrolments.studentId, students.id), isNull(enrolments.leftOn)))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(search)
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  // One extra row is fetched to know whether a next page exists, which avoids
  // a second COUNT query on every keystroke.
  return { students: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function countStudents() {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(students);
  return row?.total ?? 0;
}

export async function getStudent(studentId: string) {
  const [row] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  return row ?? null;
}

/** The class roster, in register order. */
export async function listClassRoster(classGroupId: string) {
  return db
    .select({
      id: students.id,
      massarCode: students.massarCode,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
    })
    .from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)))
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));
}

export async function getStudentEnrolment(studentId: string, yearId: string) {
  const [row] = await db
    .select({
      id: enrolments.id,
      classGroupId: enrolments.classGroupId,
      className: classGroups.name,
      enrolledOn: enrolments.enrolledOn,
    })
    .from(enrolments)
    .innerJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(
      and(
        eq(enrolments.studentId, studentId),
        eq(enrolments.yearId, yearId),
        isNull(enrolments.leftOn)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Guardians linked to a student, with whether they hold a login. */
export async function listStudentGuardians(studentId: string) {
  return db
    .select({
      id: guardians.id,
      firstNameFr: guardians.firstNameFr,
      lastNameFr: guardians.lastNameFr,
      firstNameAr: guardians.firstNameAr,
      lastNameAr: guardians.lastNameAr,
      phone: guardians.phone,
      email: guardians.email,
      relation: guardians.relation,
      isPrimary: studentGuardians.isPrimary,
      userId: guardians.userId,
      userEmail: users.email,
      isActive: users.isActive,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .leftJoin(users, eq(users.id, guardians.userId))
    .where(eq(studentGuardians.studentId, studentId))
    .orderBy(asc(guardians.lastNameFr));
}

export async function listGuardians(options?: { query?: string }) {
  const term = options?.query?.trim();
  const search = term
    ? or(
        ilike(guardians.lastNameFr, `%${term}%`),
        ilike(guardians.firstNameFr, `%${term}%`),
        ilike(guardians.lastNameAr, `%${term}%`),
        ilike(guardians.phone, `%${term}%`)
      )
    : undefined;

  return db
    .select({
      id: guardians.id,
      firstNameFr: guardians.firstNameFr,
      lastNameFr: guardians.lastNameFr,
      firstNameAr: guardians.firstNameAr,
      lastNameAr: guardians.lastNameAr,
      phone: guardians.phone,
      email: guardians.email,
      relation: guardians.relation,
      userId: guardians.userId,
      userEmail: users.email,
      isActive: users.isActive,
      childCount: sql<number>`(
        select count(*)::int from student_guardians sg
        where sg.guardian_id = ${guardians.id}
      )`,
    })
    .from(guardians)
    .leftJoin(users, eq(users.id, guardians.userId))
    .where(search)
    .orderBy(asc(guardians.lastNameFr), asc(guardians.firstNameFr))
    .limit(100);
}

/** Teachers with their account state and how many classes they teach. */
export async function listTeachersWithAccounts() {
  return db
    .select({
      id: teachers.id,
      firstNameFr: teachers.firstNameFr,
      lastNameFr: teachers.lastNameFr,
      firstNameAr: teachers.firstNameAr,
      lastNameAr: teachers.lastNameAr,
      phone: teachers.phone,
      isActive: teachers.isActive,
      userId: users.id,
      email: users.email,
      accountActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      classCount: sql<number>`count(distinct ${classSubjects.classGroupId})::int`,
    })
    .from(teachers)
    .innerJoin(users, eq(users.id, teachers.userId))
    .leftJoin(classSubjects, eq(classSubjects.teacherId, teachers.id))
    .groupBy(teachers.id, users.id)
    .orderBy(asc(teachers.lastNameFr), asc(teachers.firstNameFr));
}
