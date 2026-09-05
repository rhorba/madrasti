import {
  assessments,
  classSubjects,
  db,
  enrolments,
  grades,
  students,
  subjects,
} from "@madrasti/db";
import { type Mark, generalAverage, subjectAverage } from "@madrasti/grading";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";

/**
 * Grade reads.
 *
 * Averages are computed in `@madrasti/grading`, never in SQL. The arithmetic —
 * absences excluded rather than zeroed, empty subjects dropped with their
 * coefficient, rounding applied once — is the highest-consequence logic in the
 * product and it belongs where it is unit-tested, not spread across queries
 * nobody can test in isolation (`CLAUDE.md` §5).
 *
 * What SQL does here is fetch the rows in one round trip. What it must never do
 * is `avg(score)`, which silently counts an absence as nothing at all in some
 * dialects and as zero in others, and cannot express the coefficient rules.
 */

export type AssessmentRow = {
  id: string;
  title: string;
  type: "controle" | "devoir_surveille" | "oral" | "participation";
  maxScore: string;
  coefficient: string;
  date: string;
  /** How many marks exist, so the list can show "not yet entered". */
  markCount: number;
  studentCount: number;
};

/**
 * Assessments for one class+subject in one term, most recent first.
 *
 * The two counts come from correlated subqueries rather than a join with a
 * group-by: at a dozen assessments this is one round trip either way, and the
 * subquery keeps the row shape flat.
 */
export async function listAssessments(
  classSubjectId: string,
  termId: string
): Promise<AssessmentRow[]> {
  return db
    .select({
      id: assessments.id,
      title: assessments.title,
      type: assessments.type,
      maxScore: assessments.maxScore,
      coefficient: assessments.coefficient,
      date: assessments.date,
      markCount: sql<number>`(
        select count(*)::int from grades g where g.assessment_id = ${assessments.id}
      )`,
      studentCount: sql<number>`(
        select count(*)::int from enrolments e
        where e.class_group_id = ${classSubjects.classGroupId} and e.left_on is null
      )`,
    })
    .from(assessments)
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .where(
      and(
        eq(assessments.classSubjectId, classSubjectId),
        eq(assessments.termId, termId),
        isNull(assessments.deletedAt)
      )
    )
    .orderBy(desc(assessments.date), asc(assessments.title));
}

/** One assessment, with everything the entry screen needs to name it. */
export async function getAssessment(assessmentId: string) {
  const [row] = await db
    .select({
      id: assessments.id,
      classSubjectId: assessments.classSubjectId,
      classGroupId: classSubjects.classGroupId,
      termId: assessments.termId,
      title: assessments.title,
      type: assessments.type,
      maxScore: assessments.maxScore,
      coefficient: assessments.coefficient,
      date: assessments.date,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
    })
    .from(assessments)
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)))
    .limit(1);
  return row ?? null;
}

export type MarkSheetRow = {
  studentId: string;
  firstNameFr: string;
  lastNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  /** Null when nothing has been entered for this student yet. */
  score: string | null;
  isAbsent: boolean | null;
};

/**
 * The class list with any marks already entered, in register order.
 *
 * One query, like the attendance register: a loop over students would be
 * thirty round trips on a screen a teacher uses with a stack of papers.
 */
export async function getMarkSheet(
  classGroupId: string,
  assessmentId: string
): Promise<MarkSheetRow[]> {
  return db
    .select({
      studentId: students.id,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
      score: grades.score,
      isAbsent: grades.isAbsent,
    })
    .from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .leftJoin(grades, and(eq(grades.studentId, students.id), eq(grades.assessmentId, assessmentId)))
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)))
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));
}

export type StudentSubjectAverage = {
  studentId: string;
  firstNameFr: string;
  lastNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  /** Unrounded, or null when the student has no counted mark. */
  average: number | null;
  /** Marks that counted, and absences that did not. */
  counted: number;
  absent: number;
};

/**
 * Every student's average in one subject for one term.
 *
 * Fetches every mark for the term in a single query and folds them in
 * `@madrasti/grading`. Deliberately not `avg()` in SQL: an absence is a row
 * with a null score, and `avg` would quietly average around it without ever
 * applying the assessment coefficients.
 */
export async function getSubjectAverages(
  classGroupId: string,
  classSubjectId: string,
  termId: string
): Promise<StudentSubjectAverage[]> {
  const roster = await db
    .select({
      studentId: students.id,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
    })
    .from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)))
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));

  const marks = await db
    .select({
      studentId: grades.studentId,
      score: grades.score,
      isAbsent: grades.isAbsent,
      maxScore: assessments.maxScore,
      coefficient: assessments.coefficient,
    })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .where(
      and(
        eq(assessments.classSubjectId, classSubjectId),
        eq(assessments.termId, termId),
        isNull(assessments.deletedAt)
      )
    );

  const byStudent = new Map<string, Mark[]>();
  for (const mark of marks) {
    const list = byStudent.get(mark.studentId) ?? [];
    list.push({
      score: mark.score === null ? null : Number(mark.score),
      isAbsent: mark.isAbsent,
      maxScore: Number(mark.maxScore),
      coefficient: Number(mark.coefficient),
    });
    byStudent.set(mark.studentId, list);
  }

  return roster.map((student) => {
    const own = byStudent.get(student.studentId) ?? [];
    return {
      ...student,
      average: subjectAverage(own),
      counted: own.filter((mark) => !mark.isAbsent && mark.score !== null).length,
      absent: own.filter((mark) => mark.isAbsent).length,
    };
  });
}

export type StudentTermRecord = {
  subjects: {
    classSubjectId: string;
    subjectNameFr: string;
    subjectNameAr: string;
    subjectNameEn: string;
    coefficient: number;
    average: number | null;
    counted: number;
    absent: number;
  }[];
  general: number | null;
};

/**
 * One student's whole term: every subject's average, and the general average.
 *
 * Two queries regardless of how many subjects the student takes — the marks
 * arrive in one pass and are grouped in memory. This is the shape the bulletin
 * will need in Sprint 8, which is why it lives here rather than inside a page.
 */
export async function getStudentTermRecord(
  studentId: string,
  classGroupId: string,
  termId: string
): Promise<StudentTermRecord> {
  const taught = await db
    .select({
      classSubjectId: classSubjects.id,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
      coefficient: classSubjects.coefficient,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(eq(classSubjects.classGroupId, classGroupId))
    .orderBy(asc(subjects.nameFr));

  const marks = await db
    .select({
      classSubjectId: assessments.classSubjectId,
      score: grades.score,
      isAbsent: grades.isAbsent,
      maxScore: assessments.maxScore,
      coefficient: assessments.coefficient,
    })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .where(
      and(
        eq(grades.studentId, studentId),
        eq(assessments.termId, termId),
        isNull(assessments.deletedAt)
      )
    );

  const byClassSubject = new Map<string, Mark[]>();
  for (const mark of marks) {
    const list = byClassSubject.get(mark.classSubjectId) ?? [];
    list.push({
      score: mark.score === null ? null : Number(mark.score),
      isAbsent: mark.isAbsent,
      maxScore: Number(mark.maxScore),
      coefficient: Number(mark.coefficient),
    });
    byClassSubject.set(mark.classSubjectId, list);
  }

  const rows = taught.map((subject) => {
    const own = byClassSubject.get(subject.classSubjectId) ?? [];
    return {
      ...subject,
      coefficient: Number(subject.coefficient),
      average: subjectAverage(own),
      counted: own.filter((mark) => !mark.isAbsent && mark.score !== null).length,
      absent: own.filter((mark) => mark.isAbsent).length,
    };
  });

  return { subjects: rows, general: generalAverage(rows) };
}

/** One student's marks in one subject for a term, assessment by assessment. */
export async function getStudentMarks(studentId: string, termId: string) {
  return db
    .select({
      assessmentId: assessments.id,
      title: assessments.title,
      type: assessments.type,
      date: assessments.date,
      maxScore: assessments.maxScore,
      coefficient: assessments.coefficient,
      score: grades.score,
      isAbsent: grades.isAbsent,
      subjectNameFr: subjects.nameFr,
      subjectNameAr: subjects.nameAr,
      subjectNameEn: subjects.nameEn,
    })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(
      and(
        eq(grades.studentId, studentId),
        eq(assessments.termId, termId),
        isNull(assessments.deletedAt)
      )
    )
    .orderBy(asc(subjects.nameFr), desc(assessments.date));
}

/** Does this assessment have any marks? Decides whether it may be deleted. */
export async function countAssessmentMarks(assessmentId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(grades)
    .where(eq(grades.assessmentId, assessmentId));
  return row?.total ?? 0;
}
