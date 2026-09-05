import { classGroups, classSubjects, db, students, timetableSlots } from "@madrasti/db";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getClass,
  getCurrentTerm,
  getCurrentYear,
  getSchool,
  listClassSubjects,
  listClasses,
  listLevels,
  listSubjects,
  listTeachers,
  listTerms,
  listYears,
} from "./academic.js";
import {
  countStudents,
  getStudent,
  getStudentEnrolment,
  listClassRoster,
  listGuardians,
  listStudentGuardians,
  listStudents,
  listTeachersWithAccounts,
} from "./students.js";
import {
  getClassSubjectParties,
  getSlot,
  listAllSlotsForConflictCheck,
  listClassTimetable,
  listTeacherTimetable,
} from "./timetable.js";

/**
 * The read layer the admin screens are built on.
 *
 * These are plain queries, so what is worth asserting is not that SQL runs but
 * the three things a list screen gets wrong: that a **missing** row returns
 * null rather than throwing at a server component, that search matches the
 * Arabic spelling of a name as readily as the French, and that a list which
 * joins does not quietly drop rows or duplicate them (`CLAUDE.md` §12.9).
 *
 * Read-only throughout — nothing here writes, so nothing needs cleaning up.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

const MISSING = "00000000-0000-0000-0000-000000000000";

let yearId: string;
let classGroupId: string;
let studentId: string;

beforeAll(async () => {
  const year = await getCurrentYear();
  const [group] = await db.select({ id: classGroups.id }).from(classGroups).limit(1);
  const [pupil] = await db.select({ id: students.id }).from(students).limit(1);
  if (!year || !group || !pupil) throw new Error("database is not seeded — run `pnpm db:setup`");
  yearId = year.id;
  classGroupId = group.id;
  studentId = pupil.id;
});

describe("the academic structure", () => {
  it("has exactly one current year and one current term", async () => {
    // Two current years and every screen picks one arbitrarily.
    const year = await getCurrentYear();
    const term = await getCurrentTerm();
    expect(year).not.toBeNull();
    expect(term).not.toBeNull();
    expect(year?.isCurrent).toBe(true);
    expect(term?.isCurrent).toBe(true);
  });

  it("lists years, terms, levels and subjects", async () => {
    expect((await listYears()).length).toBeGreaterThan(0);
    expect((await listTerms(yearId)).length).toBeGreaterThan(0);
    expect((await listLevels()).length).toBeGreaterThan(0);
    expect((await listSubjects()).length).toBeGreaterThan(0);
    expect((await listTeachers()).length).toBeGreaterThan(0);
  });

  it("names everything in all three languages", async () => {
    // DoD 14 at the data layer: a subject with an empty Arabic name prints as
    // a blank cell on an Arabic bulletin, and nothing else would catch it.
    for (const subject of await listSubjects()) {
      expect(subject.nameFr.trim(), subject.code).not.toBe("");
      expect(subject.nameAr.trim(), subject.code).not.toBe("");
      expect(subject.nameEn.trim(), subject.code).not.toBe("");
    }
    for (const level of await listLevels()) {
      expect(level.nameAr.trim()).not.toBe("");
    }
    for (const term of await listTerms(yearId)) {
      expect(term.labelAr.trim()).not.toBe("");
    }
  });

  it("orders terms by their place in the year, not by insertion", async () => {
    const orders = (await listTerms(yearId)).map((term) => term.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("orders classes by level, then by name", async () => {
    const rows = await listClasses(yearId);
    const keys = rows.map((row) => `${String(row.levelOrder).padStart(3, "0")}|${row.name}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("counts a class's pupils without a query per class", async () => {
    // The N+1 this list screen would otherwise have (§12.9): the count comes
    // back on the row.
    const rows = await listClasses(yearId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.studentCount).toBe("number");
    }
    expect(rows.some((row) => row.studentCount > 0)).toBe(true);
  });

  it("returns null for a class that does not exist", async () => {
    // A server component that threw here would show a parent a 500.
    expect(await getClass(MISSING)).toBeNull();
  });

  it("lists a class's subjects with the coefficient for that class", async () => {
    const rows = await listClassSubjects(classGroupId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Number(row.coefficient)).toBeGreaterThan(0);
    }
  });

  it("has a school settings row", async () => {
    const settings = await getSchool();
    expect(settings).not.toBeNull();
    expect(settings?.nameAr.trim()).not.toBe("");
  });
});

describe("students", () => {
  it("lists and counts them", async () => {
    const page = await listStudents();
    const total = await countStudents();
    expect(page.students.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(page.students.length);
  });

  it("pages, and a page past the end is empty rather than an error", async () => {
    const first = await listStudents({ page: 1 });
    const beyond = await listStudents({ page: 9999 });
    expect(first.students.length).toBeGreaterThan(0);
    // 300 pupils in the seed, so there is a second page and it says so rather
    // than making the screen run a COUNT on every keystroke.
    expect(first.hasMore).toBe(true);
    expect(beyond.students).toHaveLength(0);
    expect(beyond.hasMore).toBe(false);
  });

  it("finds a pupil by the Arabic spelling of their name", async () => {
    // The reason both spellings are stored. A secretary working in Arabic
    // must not have to know the French transliteration to find a child.
    const [pupil] = await db
      .select({ lastNameAr: students.lastNameAr, lastNameFr: students.lastNameFr })
      .from(students)
      .limit(1);
    if (!pupil) throw new Error("database is not seeded");

    const byArabic = await listStudents({ query: pupil.lastNameAr });
    const byFrench = await listStudents({ query: pupil.lastNameFr });
    expect(byArabic.students.length).toBeGreaterThan(0);
    expect(byFrench.students.length).toBeGreaterThan(0);
  });

  it("finds a pupil by Massar code, which is how the office actually searches", async () => {
    const [pupil] = await db.select({ massarCode: students.massarCode }).from(students).limit(1);
    if (!pupil?.massarCode) return;
    const found = await listStudents({ query: pupil.massarCode });
    expect(found.students.length).toBeGreaterThan(0);
  });

  it("matches case-insensitively and ignores surrounding space", async () => {
    const [pupil] = await db.select({ lastNameFr: students.lastNameFr }).from(students).limit(1);
    if (!pupil) throw new Error("database is not seeded");
    const found = await listStudents({ query: `  ${pupil.lastNameFr.toUpperCase()}  ` });
    expect(found.students.length).toBeGreaterThan(0);
  });

  it("returns nothing, not everything, for a search that matches nobody", async () => {
    // The dangerous failure: an unmatched filter falling through to the whole
    // school's records.
    const found = await listStudents({ query: "zzzzz-no-such-pupil-zzzzz" });
    expect(found.students).toHaveLength(0);
  });

  it("returns null for a pupil who does not exist", async () => {
    expect(await getStudent(MISSING)).toBeNull();
    expect(await getStudentEnrolment(MISSING, yearId)).toBeNull();
  });

  it("reads a class roster and the enrolment behind it", async () => {
    const roster = await listClassRoster(classGroupId);
    expect(roster.length).toBeGreaterThan(0);

    const first = roster[0];
    if (!first) return;
    const enrolment = await getStudentEnrolment(first.id, yearId);
    expect(enrolment?.classGroupId).toBe(classGroupId);
  });

  it("reads a pupil's guardians, and an empty list is not an error", async () => {
    expect(Array.isArray(await listStudentGuardians(studentId))).toBe(true);
    expect(await listStudentGuardians(MISSING)).toHaveLength(0);
  });

  it("lists guardians and teachers for the admin screens", async () => {
    expect((await listGuardians()).length).toBeGreaterThan(0);
    expect(await listGuardians({ query: "zzzzz-nobody" })).toHaveLength(0);
    expect((await listTeachersWithAccounts()).length).toBeGreaterThan(0);
  });
});

describe("the timetable", () => {
  it("reads a class's week", async () => {
    const rows = await listClassTimetable(classGroupId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Monday to Saturday. Sunday is deliberately not a teaching day.
      expect(row.weekday).toBeGreaterThanOrEqual(1);
      expect(row.weekday).toBeLessThanOrEqual(6);
    }
  });

  it("reads a teacher's week", async () => {
    const [assignment] = await db
      .select({ teacherId: classSubjects.teacherId })
      .from(classSubjects)
      .limit(1);
    if (!assignment) throw new Error("database is not seeded");

    const rows = await listTeacherTimetable(assignment.teacherId);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("returns an empty week for a class that does not exist, not an error", async () => {
    expect(await listClassTimetable(MISSING)).toHaveLength(0);
  });

  it("reads every active slot once, for the conflict check", async () => {
    const rows = await listAllSlotsForConflictCheck();
    expect(rows.length).toBeGreaterThan(0);
    // Duplicated rows would make the conflict detector report phantom clashes.
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("reads one slot, and null for one that is gone", async () => {
    const [slot] = await db.select({ id: timetableSlots.id }).from(timetableSlots).limit(1);
    if (!slot) throw new Error("database is not seeded");
    expect(await getSlot(slot.id)).not.toBeNull();
    expect(await getSlot(MISSING)).toBeNull();
  });

  it("reads the class and teacher a lesson belongs to", async () => {
    const [assignment] = await db.select({ id: classSubjects.id }).from(classSubjects).limit(1);
    if (!assignment) throw new Error("database is not seeded");

    const parties = await getClassSubjectParties(assignment.id);
    expect(parties?.classGroupId).toBeTruthy();
    expect(parties?.teacherId).toBeTruthy();
    expect(await getClassSubjectParties(MISSING)).toBeNull();
  });
});
