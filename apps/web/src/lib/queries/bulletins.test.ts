import {
  assessments,
  classGroups,
  classSubjects,
  db,
  enrolments,
  grades,
  terms,
} from "@madrasti/db";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeClassBulletins, getBulletinContext } from "./bulletins.js";

/**
 * The read behind bulletin generation.
 *
 * The package tests prove the arithmetic; this proves the *gathering* — that
 * the right marks reach it, for the right term, for the right class, with the
 * coefficient that belongs to this class rather than some school-wide one.
 * Every defect this file is written against produces a plausible-looking
 * number on a document the school signs.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

type Fixture = {
  classGroupId: string;
  termId: string;
  /** A term the seed writes no marks into. */
  emptyTermId: string;
  classSubjectId: string;
  subjectId: string;
  studentIds: string[];
  /** A real user id, for the `recorded_by` / `created_by` attributions. */
  actorId: string;
};

let f: Fixture;
const createdAssessments: string[] = [];

beforeAll(async () => {
  const termRows = await db.select().from(terms).orderBy(terms.order);
  const current = termRows.find((term) => term.isCurrent) ?? termRows[0];
  const empty = termRows.find((term) => term.id !== current?.id);
  if (!current || !empty) throw new Error("database is not seeded — run `pnpm db:setup`");

  // A class that actually has marks, so the averages under test are non-trivial.
  const [graded] = await db
    .select({ classGroupId: classSubjects.classGroupId })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .where(eq(assessments.termId, current.id))
    .limit(1);
  if (!graded) throw new Error("the seed produced no marks in the current term");

  const [subject] = await db
    .select({ id: classSubjects.id, subjectId: classSubjects.subjectId })
    .from(classSubjects)
    .where(eq(classSubjects.classGroupId, graded.classGroupId))
    .limit(1);
  if (!subject) throw new Error("the class teaches no subject");

  const roster = await db
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, graded.classGroupId), isNull(enrolments.leftOn)));

  const [actor] = await db.select({ id: grades.recordedBy }).from(grades).limit(1);
  if (!actor) throw new Error("the seed produced no marks");

  f = {
    actorId: actor.id,
    classGroupId: graded.classGroupId,
    termId: current.id,
    emptyTermId: empty.id,
    classSubjectId: subject.id,
    subjectId: subject.subjectId,
    studentIds: roster.map((row) => row.studentId),
  };
});

// Per test, not per file. These fixtures share one term, so leaving them in
// place makes each test inherit the previous one's marks — which is not a
// tidiness problem but a correctness one: the averages under assertion quietly
// become averages over somebody else's fixture.
afterEach(async () => {
  for (const id of createdAssessments.splice(0)) {
    await db.delete(assessments).where(eq(assessments.id, id));
  }
});

/** An assessment with marks, cleaned up after the run. */
async function seedAssessment(
  termId: string,
  entries: { studentId: string; score: number | null; isAbsent: boolean }[],
  options: { maxScore?: number; coefficient?: number } = {}
): Promise<string> {
  const [assessment] = await db
    .insert(assessments)
    .values({
      classSubjectId: f.classSubjectId,
      termId,
      title: "Fixture",
      type: "controle",
      maxScore: String(options.maxScore ?? 20),
      coefficient: String(options.coefficient ?? 1),
      date: "2026-10-01",
      createdBy: f.actorId,
    })
    .returning({ id: assessments.id });

  if (!assessment) throw new Error("could not create the fixture assessment");
  createdAssessments.push(assessment.id);

  await db.insert(grades).values(
    entries.map((entry) => ({
      assessmentId: assessment.id,
      studentId: entry.studentId,
      score: entry.score === null ? null : String(entry.score),
      isAbsent: entry.isAbsent,
      recordedBy: f.actorId,
    }))
  );
  return assessment.id;
}

describe("computeClassBulletins", () => {
  it("returns one bulletin per enrolled student", async () => {
    const result = await computeClassBulletins(f.classGroupId, f.termId);
    expect(result.students).toHaveLength(f.studentIds.length);
    expect(new Set(result.students.map((s) => s.studentId))).toEqual(new Set(f.studentIds));
  });

  it("gives every student a line for every subject the class is taught", async () => {
    const result = await computeClassBulletins(f.classGroupId, f.termId);
    expect(result.subjects.length).toBeGreaterThan(0);
    for (const student of result.students) {
      expect(student.lines.map((line) => line.subjectId)).toEqual(
        result.subjects.map((subject) => subject.subjectId)
      );
    }
  });

  it("takes the coefficient from the class, not from the subject", async () => {
    // Maths is coefficient 4 in collège and 2 in some primaire levels. A
    // school-wide value would mis-weight every bulletin at every other level.
    const [expected] = await db
      .select({ coefficient: classSubjects.coefficient })
      .from(classSubjects)
      .where(
        and(
          eq(classSubjects.classGroupId, f.classGroupId),
          eq(classSubjects.subjectId, f.subjectId)
        )
      )
      .limit(1);

    const result = await computeClassBulletins(f.classGroupId, f.termId);
    const line = result.students[0]?.lines.find((l) => l.subjectId === f.subjectId);
    expect(line?.coefficient).toBe(Number(expected?.coefficient));
  });

  it("produces averages and ranks the class", async () => {
    const result = await computeClassBulletins(f.classGroupId, f.termId);
    const ranked = result.students.filter((s) => s.rank !== null);
    expect(ranked.length).toBeGreaterThan(0);
    // The best average takes rank 1.
    const best = ranked.reduce((a, b) =>
      (a.generalAverage ?? 0) >= (b.generalAverage ?? 0) ? a : b
    );
    expect(best.rank).toBe(1);
    // And every ranked student agrees on the denominator.
    expect(new Set(ranked.map((s) => s.classSize))).toEqual(new Set([ranked.length]));
  });

  it("keeps a term's marks out of another term's bulletin", async () => {
    // The bug this is written against is the one already caught once in the
    // absence totals: a filter that does not actually filter.
    const before = await computeClassBulletins(f.classGroupId, f.emptyTermId);
    expect(before.students.every((s) => s.generalAverage === null)).toBe(true);

    await seedAssessment(
      f.emptyTermId,
      f.studentIds.slice(0, 3).map((studentId) => ({ studentId, score: 15, isAbsent: false }))
    );

    const after = await computeClassBulletins(f.classGroupId, f.emptyTermId);
    expect(after.students.filter((s) => s.generalAverage !== null)).toHaveLength(3);
    // And the current term is untouched by a mark written into another one.
    const current = await computeClassBulletins(f.classGroupId, f.termId);
    const currentMarked = current.students.filter((s) => s.generalAverage !== null).length;
    expect(currentMarked).toBeGreaterThan(3);
  });

  it("excludes an absence from the average instead of scoring it zero", async () => {
    // The defect this product is most likely to ship: both the wrong and the
    // right answer look like a number on the screen.
    const [a, b] = f.studentIds;
    if (!a || !b) throw new Error("need two students");

    await seedAssessment(f.emptyTermId, [
      { studentId: a, score: 16, isAbsent: false },
      { studentId: b, score: 16, isAbsent: false },
    ]);
    await seedAssessment(f.emptyTermId, [
      { studentId: a, score: null, isAbsent: true },
      { studentId: b, score: 0, isAbsent: false },
    ]);

    const result = await computeClassBulletins(f.classGroupId, f.emptyTermId);
    const absentee = result.students.find((s) => s.studentId === a);
    const zeroed = result.students.find((s) => s.studentId === b);

    const absenteeLine = absentee?.lines.find((l) => l.subjectId === f.subjectId);
    const zeroedLine = zeroed?.lines.find((l) => l.subjectId === f.subjectId);

    // 16 and absent is 16. 16 and a genuine zero is 8.
    expect(absenteeLine?.average).toBe(16);
    expect(zeroedLine?.average).toBe(8);
  });

  it("ignores a soft-deleted assessment", async () => {
    const [student] = f.studentIds;
    if (!student) throw new Error("need a student");

    const id = await seedAssessment(f.emptyTermId, [
      { studentId: student, score: 2, isAbsent: false },
    ]);
    const withIt = await computeClassBulletins(f.classGroupId, f.emptyTermId);
    const before = withIt.students.find((s) => s.studentId === student)?.generalAverage;

    await db.update(assessments).set({ deletedAt: new Date() }).where(eq(assessments.id, id));
    const without = await computeClassBulletins(f.classGroupId, f.emptyTermId);
    const after = without.students.find((s) => s.studentId === student)?.generalAverage;

    expect(after).not.toBe(before);
  });

  it("returns an empty result for a class that does not exist", async () => {
    const result = await computeClassBulletins("00000000-0000-4000-8000-000000000000", f.termId);
    expect(result.students).toEqual([]);
  });
});

describe("getBulletinContext", () => {
  it("names the class and the term", async () => {
    const context = await getBulletinContext(f.classGroupId, f.termId);
    expect(context?.className).toBeTruthy();
    // Trilingual labels, all three present — §12.14.
    expect(context?.termLabelFr).toBeTruthy();
    expect(context?.termLabelAr).toBeTruthy();
    expect(context?.termLabelEn).toBeTruthy();
  });

  it("is null for a class that does not exist", async () => {
    const [row] = await db.select({ id: classGroups.id }).from(classGroups).limit(1);
    expect(row).toBeTruthy();
    expect(await getBulletinContext("00000000-0000-4000-8000-000000000000", f.termId)).toBeNull();
  });
});
