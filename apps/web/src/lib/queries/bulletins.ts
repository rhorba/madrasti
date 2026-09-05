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
  subjectAppreciations,
  subjects,
  terms,
} from "@madrasti/db";
import {
  type BulletinClassSubject,
  type BulletinLine,
  type BulletinStudentInput,
  type ComposedBulletin,
  type Mark,
  composeClassBulletins,
  roundNullable,
  subjectAverage,
} from "@madrasti/grading";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";

/**
 * Reading a class's bulletins.
 *
 * Two different things live here and the difference matters:
 *
 * - **Computed** (`computeClassBulletins`) — what the marks say *right now*.
 *   Recomputed on every call, never stored by these functions. This is what
 *   the admin reviews before publishing.
 * - **Stored** (`getStoredBulletins`, `getStudentBulletin`) — what was frozen
 *   at generation and shown to families. A later grade edit must not silently
 *   rewrite a bulletin a parent has already read (`CLAUDE.md` §6), so the two
 *   are allowed to disagree and the review screen's job is to show that they
 *   do.
 *
 * Everything is per class per term. There is no per-student generation path,
 * because a rank is a statement about a cohort.
 */

export type BulletinStudentName = {
  studentId: string;
  firstNameFr: string;
  lastNameFr: string;
  firstNameAr: string;
  lastNameAr: string;
  massarCode: string | null;
};

export type ClassSubjectRef = BulletinClassSubject & {
  nameFr: string;
  nameAr: string;
  nameEn: string;
};

/** The roster, in register order — the order every bulletin screen uses. */
async function getRoster(classGroupId: string): Promise<BulletinStudentName[]> {
  return db
    .select({
      studentId: students.id,
      firstNameFr: students.firstNameFr,
      lastNameFr: students.lastNameFr,
      firstNameAr: students.firstNameAr,
      lastNameAr: students.lastNameAr,
      massarCode: students.massarCode,
    })
    .from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .where(and(eq(enrolments.classGroupId, classGroupId), isNull(enrolments.leftOn)))
    .orderBy(asc(students.lastNameFr), asc(students.firstNameFr));
}

/**
 * The subjects taught to this class, with the coefficient from
 * `class_subjects` — never from `subjects`, where a school-wide value would
 * mis-weight every bulletin at every level that disagrees with it.
 */
async function getClassSubjects(classGroupId: string): Promise<ClassSubjectRef[]> {
  const rows = await db
    .select({
      subjectId: subjects.id,
      coefficient: classSubjects.coefficient,
      nameFr: subjects.nameFr,
      nameAr: subjects.nameAr,
      nameEn: subjects.nameEn,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(eq(classSubjects.classGroupId, classGroupId))
    .orderBy(asc(subjects.nameFr));

  return rows.map((row) => ({ ...row, coefficient: Number(row.coefficient) }));
}

/**
 * A computed line with the subject teacher's remark attached.
 *
 * The remark is joined on here rather than passed through
 * `composeClassBulletins`, which stays pure arithmetic — an appreciation is
 * not a calculation and the grading package has no business holding one.
 */
export type ComputedBulletinLine = BulletinLine & { appreciation: string | null };

export type ComputedClassBulletins = {
  subjects: ClassSubjectRef[];
  students: (BulletinStudentName &
    Omit<ComposedBulletin, "lines"> & {
      lines: ComputedBulletinLine[];
    })[];
};

/**
 * Compute every bulletin in a class for a term, from the marks as they stand.
 *
 * Four queries for the whole class, whatever its size: roster, subjects, every
 * mark for the term, and the absence totals. Nothing loops over students and
 * queries inside the loop (`CLAUDE.md` §12.9).
 *
 * The arithmetic itself is `@madrasti/grading` — no `avg()` in SQL, because an
 * absence is a row with a null score and `avg` would quietly average around it
 * without ever applying the assessment coefficients.
 */
export async function computeClassBulletins(
  classGroupId: string,
  termId: string
): Promise<ComputedClassBulletins> {
  const [roster, classSubjectList, marks, absences, appreciations] = await Promise.all([
    getRoster(classGroupId),
    getClassSubjects(classGroupId),
    getTermMarks(classGroupId, termId),
    getTermAbsenceCounts(classGroupId, termId),
    getTermAppreciations(classGroupId, termId),
  ]);

  const marksByStudent = new Map<string, Record<string, Mark[]>>();
  for (const row of marks) {
    const bySubject = marksByStudent.get(row.studentId) ?? {};
    const list = bySubject[row.subjectId] ?? [];
    list.push({
      score: row.score === null ? null : Number(row.score),
      isAbsent: row.isAbsent,
      maxScore: Number(row.maxScore),
      coefficient: Number(row.coefficient),
    });
    bySubject[row.subjectId] = list;
    marksByStudent.set(row.studentId, bySubject);
  }

  const inputs: BulletinStudentInput[] = roster.map((student) => ({
    studentId: student.studentId,
    absenceCount: absences.get(student.studentId) ?? 0,
    marksBySubject: marksByStudent.get(student.studentId) ?? {},
  }));

  const composed = composeClassBulletins(classSubjectList, inputs);

  // `composeClassBulletins` preserves input order, so this zip is safe — and
  // it is asserted in the package's own tests rather than assumed here.
  return {
    subjects: classSubjectList,
    students: roster.map((student, index) => {
      // biome-ignore lint/style/noNonNullAssertion: same length, same order.
      const bulletin = composed[index]!;
      return {
        ...student,
        ...bulletin,
        lines: bulletin.lines.map((line) => ({
          ...line,
          appreciation:
            appreciations.get(appreciationKey(student.studentId, line.subjectId)) ?? null,
        })),
      };
    }),
  };
}

/** Every mark in the class for the term, across every subject, in one query. */
async function getTermMarks(classGroupId: string, termId: string) {
  return db
    .select({
      studentId: grades.studentId,
      subjectId: classSubjects.subjectId,
      score: grades.score,
      isAbsent: grades.isAbsent,
      maxScore: assessments.maxScore,
      coefficient: assessments.coefficient,
    })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .innerJoin(
      enrolments,
      and(eq(enrolments.studentId, grades.studentId), isNull(enrolments.leftOn))
    )
    .where(
      and(
        eq(classSubjects.classGroupId, classGroupId),
        eq(enrolments.classGroupId, classGroupId),
        eq(assessments.termId, termId),
        // A soft-deleted assessment is not a mark any more.
        isNull(assessments.deletedAt)
      )
    );
}

/**
 * Absences per student for the term.
 *
 * The count is guarded on `sessions.id is not null`. Putting the term bounds
 * in the LEFT JOIN alone does not filter — an out-of-term mark keeps its
 * attendance row and arrives with a null session — and this figure prints on
 * the bulletin, so trimestre 1 carrying trimestre 2's absences is a defect a
 * parent would find before we did. Same bug as `getClassAbsenceTotals`, which
 * is where it was first caught.
 */
async function getTermAbsenceCounts(
  classGroupId: string,
  termId: string
): Promise<Map<string, number>> {
  const [term] = await db.select().from(terms).where(eq(terms.id, termId)).limit(1);
  if (!term) return new Map();

  const rows = await db
    .select({
      studentId: students.id,
      absent: sql<number>`count(${sessions.id}) filter (where ${attendance.status} = 'absent')::int`,
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
    .groupBy(students.id);

  return new Map(rows.map((row) => [row.studentId, row.absent]));
}

const appreciationKey = (studentId: string, subjectId: string) => `${studentId}:${subjectId}`;

/**
 * Every subject remark written for this class this term, in one query.
 *
 * Keyed by student and *subject*, not by class+subject: the bulletin prints one
 * line per subject and does not care which teacher wrote in it. The join back
 * through `class_subjects` is what supplies that subject id.
 */
async function getTermAppreciations(
  classGroupId: string,
  termId: string
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      studentId: subjectAppreciations.studentId,
      subjectId: classSubjects.subjectId,
      text: subjectAppreciations.text,
    })
    .from(subjectAppreciations)
    .innerJoin(classSubjects, eq(classSubjects.id, subjectAppreciations.classSubjectId))
    .where(
      and(eq(classSubjects.classGroupId, classGroupId), eq(subjectAppreciations.termId, termId))
    );

  return new Map(rows.map((row) => [appreciationKey(row.studentId, row.subjectId), row.text]));
}

/** One row of a teacher's appreciation sheet: a pupil and what is written about them. */
export type AppreciationSheetRow = BulletinStudentName & {
  text: string | null;
  /** The term average in *this* subject — the figure the remark is about. */
  average: number | null;
};

/**
 * The sheet a teacher writes on: the class roster with any existing remark.
 *
 * The subject average travels with each row on purpose. A remark written
 * without the mark in front of you is a remark about the pupil you remember
 * rather than the term they actually had, and a teacher writing thirty of
 * these in one sitting will otherwise open a second screen to check.
 */
export async function getAppreciationSheet(
  classSubjectId: string,
  termId: string
): Promise<AppreciationSheetRow[]> {
  const [target] = await db
    .select({ classGroupId: classSubjects.classGroupId, subjectId: classSubjects.subjectId })
    .from(classSubjects)
    .where(eq(classSubjects.id, classSubjectId))
    .limit(1);
  if (!target) return [];

  const [roster, written, marks] = await Promise.all([
    getRoster(target.classGroupId),
    db
      .select({ studentId: subjectAppreciations.studentId, text: subjectAppreciations.text })
      .from(subjectAppreciations)
      .where(
        and(
          eq(subjectAppreciations.classSubjectId, classSubjectId),
          eq(subjectAppreciations.termId, termId)
        )
      ),
    getTermMarks(target.classGroupId, termId),
  ]);

  const textByStudent = new Map(written.map((row) => [row.studentId, row.text]));

  // Same arithmetic as the bulletin — `subjectAverage`, not SQL `avg`, because
  // an absence is a null score that must not be averaged around.
  const marksByStudent = new Map<string, Mark[]>();
  for (const row of marks) {
    if (row.subjectId !== target.subjectId) continue;
    const list = marksByStudent.get(row.studentId) ?? [];
    list.push({
      score: row.score === null ? null : Number(row.score),
      isAbsent: row.isAbsent,
      maxScore: Number(row.maxScore),
      coefficient: Number(row.coefficient),
    });
    marksByStudent.set(row.studentId, list);
  }

  return roster.map((student) => ({
    ...student,
    text: textByStudent.get(student.studentId) ?? null,
    average: roundNullable(subjectAverage(marksByStudent.get(student.studentId) ?? [])),
  }));
}

/** The class and term, for a screen heading. Null when either does not exist. */
export async function getBulletinContext(classGroupId: string, termId: string) {
  const [row] = await db
    .select({
      className: classGroups.name,
      termLabelFr: terms.labelFr,
      termLabelAr: terms.labelAr,
      termLabelEn: terms.labelEn,
      termOrder: terms.order,
    })
    .from(classGroups)
    .innerJoin(terms, eq(terms.id, termId))
    .where(eq(classGroups.id, classGroupId))
    .limit(1);

  return row ?? null;
}
