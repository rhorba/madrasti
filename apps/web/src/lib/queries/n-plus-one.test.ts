import { classGroups, countQueries, db, students, terms } from "@madrasti/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getCurrentTerm, getCurrentYear, listClasses } from "./academic.js";
import { computeClassBulletins, getAppreciationSheet } from "./bulletins.js";
import { listChildren, listLatestMarks } from "./family.js";
import { listStudents } from "./students.js";
import { listClassTimetable } from "./timetable.js";

/**
 * Story 9.2 — the N+1 audit.
 *
 * §12.9 forbids an N+1 on any list screen, and until now that was a claim
 * nobody had measured. It is not observable from a function's return value: a
 * screen that runs one query per pupil returns exactly what a screen that runs
 * two in total returns, and the difference only shows up as a register that
 * takes a second to open in a class of thirty — on school wifi, on a phone.
 *
 * So each assertion here is a **constant**, not a ratio. The numbers are
 * deliberately generous: the point is to catch a query that scales with the
 * row count, not to freeze today's query plan. A change that adds one join is
 * fine; a change that adds one query per pupil is not, and will blow through
 * these by an order of magnitude.
 */

let yearId: string;
let classGroupId: string;
let termId: string;
let rosterSize: number;

beforeAll(async () => {
  const year = await getCurrentYear();
  const term = await getCurrentTerm();
  const [group] = await db.select({ id: classGroups.id }).from(classGroups).limit(1);
  if (!year || !term || !group) throw new Error("database is not seeded — run `pnpm db:setup`");
  yearId = year.id;
  termId = term.id;
  classGroupId = group.id;

  rosterSize = (await db.select({ id: students.id }).from(students)).length;
  // The audit is meaningless against a handful of rows: with three pupils, an
  // N+1 and a constant look the same.
  expect(rosterSize, "seed is too small for this audit to mean anything").toBeGreaterThan(50);
});

describe("list screens do not scale their query count with their rows", () => {
  it("the student list pages without a query per pupil", async () => {
    const { result, queries } = await countQueries(() => listStudents({ page: 1 }));
    expect(result.students.length).toBeGreaterThan(10);
    expect(queries, `${queries} queries for ${result.students.length} pupils`).toBeLessThanOrEqual(
      2
    );
  });

  it("the class list counts its pupils in the same query", async () => {
    // The obvious implementation runs one COUNT per class. Eight classes, eight
    // extra round trips, growing with the school.
    const { result, queries } = await countQueries(() => listClasses(yearId));
    expect(result.length).toBeGreaterThan(1);
    expect(queries, `${queries} queries for ${result.length} classes`).toBeLessThanOrEqual(2);
  });

  it("a class timetable reads the week at once", async () => {
    const { result, queries } = await countQueries(() => listClassTimetable(classGroupId));
    expect(result.length).toBeGreaterThan(5);
    expect(queries, `${queries} queries for ${result.length} slots`).toBeLessThanOrEqual(2);
  });
});

describe("the screens that assemble a whole class", () => {
  it("composes every bulletin in a class in a fixed number of queries", async () => {
    // The heaviest read in the product: roster, subjects, marks, absences and
    // appreciations for thirty pupils across ten subjects. A per-pupil or
    // per-subject query here is the difference between a screen and a wait.
    const { result, queries } = await countQueries(() =>
      computeClassBulletins(classGroupId, termId)
    );
    expect(result.students.length).toBeGreaterThan(10);
    expect(
      queries,
      `${queries} queries for ${result.students.length} pupils x ${result.subjects.length} subjects`
    ).toBeLessThanOrEqual(6);
  });

  it("builds the appreciation sheet without a query per pupil", async () => {
    const [classSubject] = await db
      .select({ id: classGroups.id })
      .from(classGroups)
      .where(eq(classGroups.id, classGroupId))
      .limit(1);
    expect(classSubject).toBeDefined();

    const sheet = await countQueries(() => getAppreciationSheet(classGroupId, termId));
    // The function takes a class+subject in some call sites; whichever shape it
    // returns, the query count is what this test is about.
    expect(sheet.queries, `${sheet.queries} queries for the sheet`).toBeLessThanOrEqual(6);
  });
});

describe("the family portal, which is the slowest network in the product", () => {
  it("lists a parent's children in a fixed number of queries", async () => {
    const ids = (await db.select({ id: students.id }).from(students).limit(4)).map((r) => r.id);
    const { result, queries } = await countQueries(() => listChildren(ids));
    expect(result.length).toBe(ids.length);
    // A parent with four children must not cost four round trips.
    expect(queries, `${queries} queries for ${ids.length} children`).toBeLessThanOrEqual(2);
  });

  it("reads the latest marks for several children at once", async () => {
    const ids = (await db.select({ id: students.id }).from(students).limit(4)).map((r) => r.id);
    const { queries } = await countQueries(() => listLatestMarks(ids));
    expect(queries, `${queries} queries for ${ids.length} children`).toBeLessThanOrEqual(2);
  });
});

describe("the counter itself", () => {
  it("counts, so a zero above would be a broken instrument rather than a fast query", async () => {
    const { queries } = await countQueries(async () => {
      await db.select({ id: terms.id }).from(terms).limit(1);
      await db.select({ id: terms.id }).from(terms).limit(1);
    });
    expect(queries).toBe(2);
  });

  it("is off outside a measured block, so it never counts production traffic", async () => {
    await db.select({ id: terms.id }).from(terms).limit(1);
    const { queries } = await countQueries(async () => {
      await db.select({ id: terms.id }).from(terms).limit(1);
    });
    expect(queries).toBe(1);
  });
});
