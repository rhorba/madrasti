import { getStudentTermRecord, getSubjectAverages, listAssessments } from "@/lib/queries/grades.js";
import {
  assessments,
  auditLog,
  classSubjects,
  db,
  enrolments,
  grades,
  students,
  teachers,
  terms,
  users,
} from "@madrasti/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAssessment, deleteAssessment, saveGrades, updateAssessment } from "./actions.js";

/**
 * Marks, end to end — `docs/test-strategy-madrasti.md` §5 and §6.
 *
 * `@madrasti/grading` proves the arithmetic in isolation. This file proves the
 * two things it cannot: that only the right teacher can write a mark, and that
 * an absence survives the round trip through Postgres as an absence rather
 * than arriving back as a zero.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

const signedInAs = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (signedInAs.userId ? { user: { id: signedInAs.userId } } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

type Fixture = {
  classSubjectId: string;
  classGroupId: string;
  teacherUserId: string;
  /** Another subject in the SAME class, taught by someone else. */
  siblingClassSubjectId: string;
  siblingTeacherUserId: string;
  /** A class+subject with no connection to `teacherUserId` at all. */
  foreignClassSubjectId: string;
  roster: string[];
  /** A student in a different class — the tampered-payload case. */
  outsiderId: string;
  parentUserId: string;
  termId: string;
  /** A term the seed puts no marks in, so an average can be asserted exactly. */
  emptyTermId: string;
};

let f: Fixture;
const created: string[] = [];

beforeAll(async () => {
  const all = await db
    .select({
      id: classSubjects.id,
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(classSubjects);

  const mine = all[0];
  // The case that matters: the same class, a different subject, a different
  // teacher. A maths teacher must not be able to touch the French marks.
  const sibling = mine
    ? all.find((cs) => cs.classGroupId === mine.classGroupId && cs.teacherId !== mine.teacherId)
    : undefined;
  const foreign = mine
    ? all.find((cs) => cs.classGroupId !== mine.classGroupId && cs.teacherId !== mine.teacherId)
    : undefined;
  if (!mine || !sibling || !foreign)
    throw new Error("database is not seeded — run `pnpm db:setup`");

  const teacherRows = await db
    .select({ id: teachers.id, userId: teachers.userId })
    .from(teachers)
    .where(inArray(teachers.id, [mine.teacherId, sibling.teacherId]));

  const teacherUserId = teacherRows.find((t) => t.id === mine.teacherId)?.userId;
  const siblingTeacherUserId = teacherRows.find((t) => t.id === sibling.teacherId)?.userId;

  const roster = await db
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, mine.classGroupId), isNull(enrolments.leftOn)));

  const [outsider] = await db
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, foreign.classGroupId), isNull(enrolments.leftOn)))
    .limit(1);

  const [parent] = await db.select().from(users).where(eq(users.role, "parent")).limit(1);
  const [term] = await db.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
  // Everything the seed writes lands in the current term, so the arithmetic
  // assertions below use a later one and start from nothing.
  const [emptyTerm] = await db.select().from(terms).where(eq(terms.isCurrent, false)).limit(1);

  if (!teacherUserId || !siblingTeacherUserId || !outsider || !parent || !term || !emptyTerm) {
    throw new Error("database is not seeded — run `pnpm db:setup` first");
  }
  if (roster.length < 3) throw new Error("the seeded class is too small for these tests");

  f = {
    classSubjectId: mine.id,
    classGroupId: mine.classGroupId,
    teacherUserId,
    siblingClassSubjectId: sibling.id,
    siblingTeacherUserId,
    foreignClassSubjectId: foreign.id,
    roster: roster.map((row) => row.studentId),
    outsiderId: outsider.studentId,
    parentUserId: parent.id,
    termId: term.id,
    emptyTermId: emptyTerm.id,
  };
});

/** Remove every assessment these tests created. Grades cascade with them. */
afterAll(async () => {
  if (created.length === 0) return;
  await db.delete(auditLog).where(inArray(auditLog.entityId, created));
  await db.delete(assessments).where(inArray(assessments.id, created));
});

/** Create an assessment as the subject's own teacher and remember to clean it. */
async function newAssessment(over: Record<string, unknown> = {}): Promise<string> {
  signedInAs.userId = f.teacherUserId;
  const result = await createAssessment({
    classSubjectId: f.classSubjectId,
    termId: f.termId,
    title: "Test assessment",
    type: "controle",
    maxScore: 20,
    coefficient: 1,
    date: "2026-01-05",
    ...over,
  });
  if (!result.ok) throw new Error(`fixture setup failed: ${result.error}`);
  created.push(result.data.id);
  return result.data.id;
}

describe("creating an assessment", () => {
  it("is allowed for the teacher of that subject", async () => {
    const id = await newAssessment({ title: "Contrôle n°1" });

    const listed = await listAssessments(f.classSubjectId, f.termId);
    const row = listed.find((entry) => entry.id === id);
    expect(row?.title).toBe("Contrôle n°1");
    expect(row?.markCount).toBe(0);
    expect(row?.studentCount).toBe(f.roster.length);
  });

  it("is REFUSED for a teacher of the same class but a different subject", async () => {
    // The most plausible internal misuse in the product: two teachers share a
    // class, and only one of them owns each subject's marks.
    signedInAs.userId = f.siblingTeacherUserId;
    expect(
      await createAssessment({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        title: "Not mine",
        type: "controle",
        maxScore: 20,
        coefficient: 1,
        date: "2026-01-05",
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
  });

  it("is REFUSED for a parent", async () => {
    signedInAs.userId = f.parentUserId;
    expect(
      await createAssessment({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        title: "Not mine",
        type: "controle",
        maxScore: 20,
        coefficient: 1,
        date: "2026-01-05",
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
  });

  it("refuses a coefficient of zero", async () => {
    signedInAs.userId = f.teacherUserId;
    expect(
      await createAssessment({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        title: "Weightless",
        type: "controle",
        maxScore: 20,
        coefficient: 0,
        date: "2026-01-05",
      })
    ).toMatchObject({ ok: false, error: "errors.coefficientPositive" });
  });
});

describe("entering marks", () => {
  it("records a mark, an absence and a genuine zero, and keeps them apart", async () => {
    const id = await newAssessment();
    const [marked, missing, zeroed] = f.roster as [string, string, string];

    const result = await saveGrades({
      assessmentId: id,
      entries: [
        { studentId: marked, score: 14, isAbsent: false },
        { studentId: missing, score: null, isAbsent: true },
        { studentId: zeroed, score: 0, isAbsent: false },
      ],
    });
    expect(result).toMatchObject({ ok: true });

    const rows = await db.select().from(grades).where(eq(grades.assessmentId, id));
    expect(rows).toHaveLength(3);

    const absent = rows.find((row) => row.studentId === missing);
    expect(absent?.isAbsent).toBe(true);
    // Null, not "0.00". This is the distinction the whole module turns on.
    expect(absent?.score).toBeNull();

    const zero = rows.find((row) => row.studentId === zeroed);
    expect(zero?.isAbsent).toBe(false);
    expect(Number(zero?.score)).toBe(0);
  });

  it("leaves an unmarked student with no row at all", async () => {
    const id = await newAssessment();
    const [first] = f.roster as [string];

    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: first, score: 12, isAbsent: false }],
        })
      ).ok
    ).toBe(true);

    // "Not yet marked" is a third state, distinct from absent and from zero,
    // and it is represented by the absence of a row.
    const rows = await db.select().from(grades).where(eq(grades.assessmentId, id));
    expect(rows).toHaveLength(1);
  });

  it("upserts a correction rather than duplicating the mark", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];

    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: student, score: 8, isAbsent: false }],
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: student, score: 15.5, isAbsent: false }],
        })
      ).ok
    ).toBe(true);

    const rows = await db.select().from(grades).where(eq(grades.assessmentId, id));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.score)).toBe(15.5);
  });

  it("clears the score when a student is changed to absent", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];

    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: student, score: 11, isAbsent: false }],
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: student, score: null, isAbsent: true }],
        })
      ).ok
    ).toBe(true);

    const [row] = await db.select().from(grades).where(eq(grades.assessmentId, id));
    // A stale 11 riding along would be a mark for an assessment the student
    // did not sit — and the database CHECK refuses that state outright.
    expect(row?.score).toBeNull();
    expect(row?.isAbsent).toBe(true);
  });

  it("accepts a bonus mark above the maximum", async () => {
    const id = await newAssessment({ maxScore: 20 });
    const [student] = f.roster as [string];

    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: student, score: 21, isAbsent: false }],
        })
      ).ok
    ).toBe(true);
    const [row] = await db.select().from(grades).where(eq(grades.assessmentId, id));
    expect(Number(row?.score)).toBe(21);
  });

  it("refuses a mark that is both absent and scored", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];

    expect(
      await saveGrades({
        assessmentId: id,
        entries: [{ studentId: student, score: 12, isAbsent: true }],
      })
    ).toMatchObject({ ok: false, error: "errors.absentCannotHaveScore" });
  });

  it("refuses a negative mark", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];
    expect(
      await saveGrades({
        assessmentId: id,
        entries: [{ studentId: student, score: -1, isAbsent: false }],
      })
    ).toMatchObject({ ok: false, error: "errors.scoreNegative" });
  });

  it("refuses an empty mark sheet", async () => {
    const id = await newAssessment();
    expect(await saveGrades({ assessmentId: id, entries: [] })).toMatchObject({
      ok: false,
      error: "errors.noGrades",
    });
  });

  it("REFUSES a teacher who does not teach that subject", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];

    signedInAs.userId = f.siblingTeacherUserId;
    expect(
      await saveGrades({
        assessmentId: id,
        entries: [{ studentId: student, score: 20, isAbsent: false }],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });

    expect(await db.select().from(grades).where(eq(grades.assessmentId, id))).toHaveLength(0);
  });

  it("REFUSES a payload naming a student from another class", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];

    const before = await db.select().from(grades).where(eq(grades.studentId, f.outsiderId));

    signedInAs.userId = f.teacherUserId;
    expect(
      await saveGrades({
        assessmentId: id,
        entries: [
          { studentId: student, score: 12, isAbsent: false },
          { studentId: f.outsiderId, score: 3, isAbsent: false },
        ],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });

    const after = await db.select().from(grades).where(eq(grades.studentId, f.outsiderId));
    expect(after).toHaveLength(before.length);
    // And the legitimate half is refused with it, rather than half-written.
    expect(await db.select().from(grades).where(eq(grades.assessmentId, id))).toHaveLength(0);
  });

  it("records the save in the audit trail, with counts only", async () => {
    const id = await newAssessment();
    const [a, b] = f.roster as [string, string];

    signedInAs.userId = f.teacherUserId;
    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [
            { studentId: a, score: 13, isAbsent: false },
            { studentId: b, score: null, isAbsent: true },
          ],
        })
      ).ok
    ).toBe(true);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "grades.save")));

    expect(entry?.payload).toMatchObject({ total: 2, absent: 1 });
    // Never a student id and never a mark: the trail must not become a second,
    // unprotected copy of the mark sheet.
    const serialised = JSON.stringify(entry?.payload);
    expect(serialised).not.toContain(a);
    expect(serialised).not.toContain("13");
  });
});

describe("editing and withdrawing an assessment", () => {
  it("updates the coefficient, which moves every average behind it", async () => {
    const id = await newAssessment({ coefficient: 1 });
    signedInAs.userId = f.teacherUserId;

    expect(
      (
        await updateAssessment({
          id,
          title: "Contrôle n°1 (révisé)",
          type: "devoir_surveille",
          maxScore: 20,
          coefficient: 3,
          date: "2026-01-12",
        })
      ).ok
    ).toBe(true);

    const row = (await listAssessments(f.classSubjectId, f.termId)).find(
      (entry) => entry.id === id
    );
    expect(row?.title).toBe("Contrôle n°1 (révisé)");
    expect(Number(row?.coefficient)).toBe(3);
  });

  it("withdraws it from every screen WITHOUT destroying its marks", async () => {
    const id = await newAssessment();
    const [student] = f.roster as [string];

    signedInAs.userId = f.teacherUserId;
    expect(
      (
        await saveGrades({
          assessmentId: id,
          entries: [{ studentId: student, score: 17, isAbsent: false }],
        })
      ).ok
    ).toBe(true);
    expect((await deleteAssessment({ id })).ok).toBe(true);

    // Gone from the list…
    expect((await listAssessments(f.classSubjectId, f.termId)).some((e) => e.id === id)).toBe(
      false
    );
    // …but the academic record survives, which is the point of a soft delete.
    expect(await db.select().from(grades).where(eq(grades.assessmentId, id))).toHaveLength(1);
    // …and it can no longer be written to.
    expect(
      await saveGrades({
        assessmentId: id,
        entries: [{ studentId: student, score: 1, isAbsent: false }],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
  });

  it("is REFUSED to a teacher of another subject", async () => {
    const id = await newAssessment();
    signedInAs.userId = f.siblingTeacherUserId;
    expect(await deleteAssessment({ id })).toEqual({ ok: false, error: "errors.notAuthorized" });
  });
});

describe("averages computed from what was actually stored", () => {
  it("excludes an absence instead of averaging it as a zero", async () => {
    // The end-to-end version of the grading package's central test: the same
    // marks, but written to Postgres and read back through the query layer.
    const term = f.emptyTermId;
    const first = await newAssessment({ title: "A", coefficient: 1, termId: term });
    const second = await newAssessment({ title: "B", coefficient: 1, termId: term });
    const third = await newAssessment({ title: "C", coefficient: 1, termId: term });
    const [student] = f.roster as [string];

    signedInAs.userId = f.teacherUserId;
    await saveGrades({
      assessmentId: first,
      entries: [{ studentId: student, score: 14, isAbsent: false }],
    });
    await saveGrades({
      assessmentId: second,
      entries: [{ studentId: student, score: null, isAbsent: true }],
    });
    await saveGrades({
      assessmentId: third,
      entries: [{ studentId: student, score: 16, isAbsent: false }],
    });

    const averages = await getSubjectAverages(f.classGroupId, f.classSubjectId, term);
    const row = averages.find((entry) => entry.studentId === student);

    // 15, never 10.
    expect(row?.average).toBe(15);
    expect(row?.counted).toBe(2);
    expect(row?.absent).toBe(1);
  });

  it("normalises an assessment marked out of something other than 20", async () => {
    const outOfTen = await newAssessment({
      title: "Oral",
      type: "oral",
      maxScore: 10,
      termId: f.emptyTermId,
    });
    const student = f.roster[1] as string;

    signedInAs.userId = f.teacherUserId;
    await saveGrades({
      assessmentId: outOfTen,
      entries: [{ studentId: student, score: 5, isAbsent: false }],
    });

    const averages = await getSubjectAverages(f.classGroupId, f.classSubjectId, f.emptyTermId);
    const row = averages.find((entry) => entry.studentId === student);
    // 5/10 is 10/20, not 5.
    expect(row?.average).toBe(10);
  });

  it("gives a student with no mark a null average, never a zero", async () => {
    const untouched = f.roster.at(-1) as string;

    const record = await getStudentTermRecord(untouched, f.classGroupId, f.emptyTermId);
    const subject = record.subjects.find((entry) => entry.classSubjectId === f.classSubjectId);

    expect(subject?.counted).toBe(0);
    // Silence, not a zero. A zero here would be an accusation.
    expect(subject?.average).toBeNull();
    // And a student with nothing anywhere has no general average either.
    expect(record.general).toBeNull();
  });

  it("keeps a withdrawn assessment out of the averages", async () => {
    const student = f.roster[2] as string;
    const before = (await getSubjectAverages(f.classGroupId, f.classSubjectId, f.termId)).find(
      (row) => row.studentId === student
    );

    const id = await newAssessment({ title: "Withdrawn", coefficient: 5 });
    signedInAs.userId = f.teacherUserId;
    await saveGrades({
      assessmentId: id,
      entries: [{ studentId: student, score: 0, isAbsent: false }],
    });
    await deleteAssessment({ id });

    const after = (await getSubjectAverages(f.classGroupId, f.classSubjectId, f.termId)).find(
      (row) => row.studentId === student
    );
    expect(after?.average).toBe(before?.average);
    expect(after?.counted).toBe(before?.counted);
  });
});

describe("the student list", () => {
  it("only ever contains students enrolled in the class", async () => {
    const averages = await getSubjectAverages(f.classGroupId, f.classSubjectId, f.termId);
    expect(averages).toHaveLength(f.roster.length);
    expect(averages.every((row) => f.roster.includes(row.studentId))).toBe(true);

    const known = await db
      .select({ id: students.id })
      .from(students)
      .where(inArray(students.id, [f.outsiderId]));
    expect(known).toHaveLength(1);
    expect(averages.some((row) => row.studentId === f.outsiderId)).toBe(false);
  });
});
