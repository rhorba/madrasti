import {
  academicYears,
  classGroups,
  classSubjects,
  db,
  enrolments,
  levels,
  school,
  subjects,
  teachers,
  terms,
} from "@madrasti/db";
import { and, asc, count, eq, isNull } from "drizzle-orm";

/**
 * Admin reads for the academic structure.
 *
 * Every list screen here is one query. The temptation on a page like
 * "classes with their student counts" is a loop, and at eight classes nobody
 * would notice — but the same shape lands on the 300-student roster later
 * (`docs/database-madrasti.md` §5).
 */

export async function getCurrentYear() {
  const [year] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.isCurrent, true))
    .limit(1);
  return year ?? null;
}

export async function listYears() {
  return db.select().from(academicYears).orderBy(asc(academicYears.startDate));
}

export async function listTerms(yearId: string) {
  return db.select().from(terms).where(eq(terms.yearId, yearId)).orderBy(asc(terms.order));
}

export async function getCurrentTerm() {
  const [term] = await db.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
  return term ?? null;
}

export async function listLevels() {
  return db.select().from(levels).orderBy(asc(levels.order));
}

export async function listSubjects() {
  return db.select().from(subjects).orderBy(asc(subjects.nameFr));
}

export async function listTeachers() {
  return db.select().from(teachers).orderBy(asc(teachers.lastNameFr), asc(teachers.firstNameFr));
}

/** Classes for a year, with level name and live headcount — one query. */
export async function listClasses(yearId: string) {
  return db
    .select({
      id: classGroups.id,
      name: classGroups.name,
      capacity: classGroups.capacity,
      levelId: levels.id,
      levelNameFr: levels.nameFr,
      levelNameAr: levels.nameAr,
      levelNameEn: levels.nameEn,
      levelOrder: levels.order,
      studentCount: count(enrolments.id),
    })
    .from(classGroups)
    .innerJoin(levels, eq(levels.id, classGroups.levelId))
    .leftJoin(
      enrolments,
      and(eq(enrolments.classGroupId, classGroups.id), isNull(enrolments.leftOn))
    )
    .where(eq(classGroups.yearId, yearId))
    .groupBy(classGroups.id, levels.id)
    .orderBy(asc(levels.order), asc(classGroups.name));
}

export async function getClass(classGroupId: string) {
  const [row] = await db
    .select({
      id: classGroups.id,
      name: classGroups.name,
      capacity: classGroups.capacity,
      yearId: classGroups.yearId,
      mainTeacherId: classGroups.mainTeacherId,
      levelNameFr: levels.nameFr,
      levelNameAr: levels.nameAr,
      levelNameEn: levels.nameEn,
    })
    .from(classGroups)
    .innerJoin(levels, eq(levels.id, classGroups.levelId))
    .where(eq(classGroups.id, classGroupId))
    .limit(1);
  return row ?? null;
}

/** The subjects taught to a class, with teacher and coefficient. */
export async function listClassSubjects(classGroupId: string) {
  return db
    .select({
      id: classSubjects.id,
      coefficient: classSubjects.coefficient,
      subjectId: subjects.id,
      subjectCode: subjects.code,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
      subjectColor: subjects.color,
      teacherId: teachers.id,
      teacherFirstNameFr: teachers.firstNameFr,
      teacherLastNameFr: teachers.lastNameFr,
      teacherFirstNameAr: teachers.firstNameAr,
      teacherLastNameAr: teachers.lastNameAr,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .innerJoin(teachers, eq(teachers.id, classSubjects.teacherId))
    .where(eq(classSubjects.classGroupId, classGroupId))
    .orderBy(asc(subjects.nameFr));
}

export async function getSchool() {
  const [row] = await db.select().from(school).limit(1);
  return row ?? null;
}
