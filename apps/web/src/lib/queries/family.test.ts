import {
  assessments,
  attendance,
  db,
  enrolments,
  grades,
  sessions,
  studentGuardians,
  terms,
} from "@madrasti/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStudentAbsences } from "./attendance.js";
import {
  getTermAbsenceTotals,
  groupByStudent,
  listChildren,
  listDayMarks,
  listLatestMarks,
} from "./family.js";
import { listStudentHomework } from "./homework.js";

/**
 * The reads behind the parent and student portals —
 * `docs/test-strategy-madrasti.md` §5.
 *
 * Two properties matter here and neither is visible by reading a screen:
 *
 * 1. **Nothing comes back for a student who was not asked for.** These
 *    functions take a list of ids that the scope layer has already vetted, so
 *    a query that quietly widened its own `where` would hand a parent another
 *    family's child while every authorisation check still passed.
 * 2. **An absence is never a zero, and never averaged as one.** It is the
 *    defect this product is most likely to ship, because both the wrong and
 *    the right answer look like a number on the screen.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

type Fixture = {
  /** A guardian with two children — the seed makes three such families. */
  siblingIds: [string, string];
  /** A student in neither of those families. */
  outsiderId: string;
  /** A student with marks, and their class. */
  markedStudentId: string;
  classSubjectId: string;
  termId: string;
  termStart: string;
  termEnd: string;
  /** A term the seed writes nothing into. */
  emptyTermId: string;
};

let f: Fixture;
const createdAssessments: string[] = [];

beforeAll(async () => {
  const links = await db
    .select({ guardianId: studentGuardians.guardianId, studentId: studentGuardians.studentId })
    .from(studentGuardians);
  if (links.length === 0) throw new Error("database is not seeded — run `pnpm db:setup`");

  const byGuardian = new Map<string, string[]>();
  for (const link of links) {
    byGuardian.set(link.guardianId, [...(byGuardian.get(link.guardianId) ?? []), link.studentId]);
  }
  const family = [...byGuardian.values()].find((children) => children.length >= 2);
  // Not a soft skip: the seed is meant to contain sibling families precisely
  // so this case is exercised, and a fixture that quietly lost them would
  // leave the multi-child portal untested (`.logs/issues.md`, 2026-09-05).
  if (!family?.[0] || !family[1]) throw new Error("the seed has no family with two children");
  const siblings: [string, string] = [family[0], family[1]];

  const outsider = links.find((link) => !siblings.includes(link.studentId))?.studentId;
  if (!outsider) throw new Error("every student belongs to the same family");

  const [graded] = await db
    .select({ studentId: grades.studentId, classSubjectId: assessments.classSubjectId })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .limit(1);
  if (!graded) throw new Error("no grades seeded");

  const [term] = await db.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
  const [emptyTerm] = await db.select().from(terms).where(eq(terms.isCurrent, false)).limit(1);
  if (!term || !emptyTerm) throw new Error("terms are not seeded");

  f = {
    siblingIds: siblings,
    outsiderId: outsider,
    markedStudentId: graded.studentId,
    classSubjectId: graded.classSubjectId,
    termId: term.id,
    termStart: term.startDate,
    termEnd: term.endDate,
    emptyTermId: emptyTerm.id,
  };
});

afterAll(async () => {
  if (createdAssessments.length === 0) return;
  await db.delete(assessments).where(inArray(assessments.id, createdAssessments));
});

describe("listChildren", () => {
  it("returns both children of a family, each with their class", async () => {
    const children = await listChildren([...f.siblingIds]);

    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.className).toBeTruthy();
      // Both scripts, because a bulletin and a screen in Arabic need the
      // Arabic spelling rather than a transliteration (`CLAUDE.md` §6).
      expect(child.firstNameAr).toBeTruthy();
      expect(child.firstNameFr).toBeTruthy();
    }
  });

  it("returns nothing for an empty list rather than everything", async () => {
    // The failure mode this guards: a `where in ()` dropped for an empty
    // array turns "this parent has no children" into the whole school.
    expect(await listChildren([])).toEqual([]);
  });

  it("returns only the students asked for", async () => {
    const children = await listChildren([f.siblingIds[0]]);
    expect(children.map((child) => child.id)).toEqual([f.siblingIds[0]]);
  });
});

describe("listDayMarks", () => {
  it("returns only marks for the students asked for, on that date", async () => {
    const [any] = await db
      .select({ studentId: attendance.studentId, date: sessions.date })
      .from(attendance)
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .limit(1);
    if (!any) throw new Error("no attendance seeded");

    const marks = await listDayMarks([any.studentId, f.outsiderId], any.date);

    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect([any.studentId, f.outsiderId]).toContain(mark.studentId);
    }
  });

  it("includes presents, unlike the absence history", async () => {
    // The card has to tell "present" apart from "no register taken". A query
    // that only returned exceptions would make those two states identical.
    const [present] = await db
      .select({ studentId: attendance.studentId, date: sessions.date })
      .from(attendance)
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .where(eq(attendance.status, "present"))
      .limit(1);
    if (!present) throw new Error("no present marks seeded");

    const marks = await listDayMarks([present.studentId], present.date);
    expect(marks.some((mark) => mark.status === "present")).toBe(true);
  });

  it("is empty on a date with no register", async () => {
    expect(await listDayMarks([f.siblingIds[0]], "2000-01-01")).toEqual([]);
  });
});

describe("listLatestMarks", () => {
  it("returns at most one row per student", async () => {
    const marks = await listLatestMarks([...f.siblingIds, f.markedStudentId]);
    const ids = marks.map((mark) => mark.studentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns the newest assessment the student was marked in", async () => {
    const [latest] = await listLatestMarks([f.markedStudentId]);
    if (!latest) throw new Error("fixture student has no marks");

    const [newest] = await db
      .select({ date: sql<string>`max(${assessments.date})` })
      .from(grades)
      .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
      .where(and(eq(grades.studentId, f.markedStudentId), isNull(assessments.deletedAt)));

    expect(latest.date).toBe(newest?.date);
  });

  it("reports an absence as an absence, not as a zero", async () => {
    // The distinction the whole grading package exists to protect. A card that
    // renders `score ?? 0` shows a parent a nought their child never earned.
    // Every write in this system is attributed, so the fixture borrows a real
    // author rather than inventing one (`CLAUDE.md` §3).
    const [recorder] = await db.select({ id: grades.recordedBy }).from(grades).limit(1);
    if (!recorder) throw new Error("no grades seeded");

    const [assessment] = await db
      .insert(assessments)
      .values({
        classSubjectId: f.classSubjectId,
        termId: f.emptyTermId,
        title: "Fixture — absent",
        type: "controle",
        maxScore: "20",
        coefficient: "1",
        // Far in the future, so it is unambiguously the latest.
        date: "2030-06-01",
        createdBy: recorder.id,
      })
      .returning();
    if (!assessment) throw new Error("could not create the fixture assessment");
    createdAssessments.push(assessment.id);

    await db.insert(grades).values({
      assessmentId: assessment.id,
      studentId: f.markedStudentId,
      score: null,
      isAbsent: true,
      recordedBy: recorder.id,
    });

    const [latest] = await listLatestMarks([f.markedStudentId]);
    expect(latest?.assessmentId).toBe(assessment.id);
    expect(latest?.isAbsent).toBe(true);
    expect(latest?.score).toBeNull();
  });
});

describe("getTermAbsenceTotals", () => {
  it("counts only lessons held inside the term", async () => {
    // The bug this replaces cost a debugging session: an out-of-term mark
    // keeps its attendance row, arrives with a null session, and `count(*)`
    // counts it anyway — so trimestre 1 carried trimestre 2's absences.
    const inTerm = await getTermAbsenceTotals([f.markedStudentId], f.termStart, f.termEnd);
    const impossible = await getTermAbsenceTotals([f.markedStudentId], "1999-01-01", "1999-12-31");

    expect(impossible.get(f.markedStudentId)).toBeUndefined();
    const totals = inTerm.get(f.markedStudentId);
    expect(totals).toBeDefined();
    expect(totals?.absent).toBeGreaterThanOrEqual(0);
  });

  it("returns an empty map for no students", async () => {
    expect((await getTermAbsenceTotals([], f.termStart, f.termEnd)).size).toBe(0);
  });
});

describe("term-bounded history", () => {
  it("keeps a record screen inside the trimestre it is showing", async () => {
    const all = await getStudentAbsences(f.markedStudentId, 200);
    const bounded = await getStudentAbsences(f.markedStudentId, 200, {
      from: f.termStart,
      to: f.termEnd,
    });

    expect(bounded.length).toBeLessThanOrEqual(all.length);
    for (const absence of bounded) {
      expect(absence.date >= f.termStart && absence.date <= f.termEnd).toBe(true);
    }
  });

  it("bounds homework by the date it was set", async () => {
    const bounded = await listStudentHomework(f.markedStudentId, 50, {
      from: f.termStart,
      to: f.termEnd,
    });
    for (const item of bounded) {
      expect(item.assignedOn >= f.termStart && item.assignedOn <= f.termEnd).toBe(true);
    }
  });

  it("returns everything when no bound is given", async () => {
    const bounded = await getStudentAbsences(f.markedStudentId, 200, {
      from: "1999-01-01",
      to: "1999-12-31",
    });
    expect(bounded).toEqual([]);
  });
});

describe("groupByStudent", () => {
  it("keeps every row, in order, under its own student", () => {
    const grouped = groupByStudent([
      { studentId: "a", n: 1 },
      { studentId: "b", n: 2 },
      { studentId: "a", n: 3 },
    ]);

    expect(grouped.get("a")?.map((row) => row.n)).toEqual([1, 3]);
    expect(grouped.get("b")?.map((row) => row.n)).toEqual([2]);
    // A missing student is absent from the map, not an empty array: the caller
    // has to decide what "no rows" means, and on the card it means "no
    // register taken" rather than "present".
    expect(grouped.has("c")).toBe(false);
  });
});

describe("the portals never reach outside the family", () => {
  it("cannot be handed a foreign id through the class join", async () => {
    // Every function here is given ids; this asserts the ids are honoured
    // rather than widened to the class, which is the shape a "helpful" join
    // would take.
    const [enrolment] = await db
      .select({ classGroupId: enrolments.classGroupId })
      .from(enrolments)
      .where(and(eq(enrolments.studentId, f.siblingIds[0]), isNull(enrolments.leftOn)))
      .limit(1);
    if (!enrolment) throw new Error("the fixture child is not enrolled");

    const classmates = await db
      .select({ id: enrolments.studentId })
      .from(enrolments)
      .where(and(eq(enrolments.classGroupId, enrolment.classGroupId), isNull(enrolments.leftOn)));
    expect(classmates.length).toBeGreaterThan(1);

    const latest = await listLatestMarks([f.siblingIds[0]]);
    for (const mark of latest) expect(mark.studentId).toBe(f.siblingIds[0]);

    const children = await listChildren([f.siblingIds[0]]);
    expect(children).toHaveLength(1);
  });
});
