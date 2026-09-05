import { getClassAbsenceTotals, getRegister } from "@/lib/queries/attendance.js";
import {
  attendance,
  auditLog,
  classSubjects,
  db,
  enrolments,
  sessions,
  teachers,
  terms,
  timetableSlots,
  users,
} from "@madrasti/db";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { saveAttendance } from "./actions.js";

/**
 * The register, end to end — `docs/test-strategy-madrasti.md` §6.
 *
 * Attendance is the sprint's whole deliverable and the screen a teacher opens
 * thirty times a week, so the action is exercised for real: a real Postgres, a
 * real transaction, a real audit row. Only the three things that genuinely
 * need a Next request are stubbed — who is signed in, the request headers, and
 * cache revalidation.
 *
 * The cases below are the ones where a silent bug reaches a family: a mark
 * written against the wrong child, a stale `minutesLate` riding along, an
 * absence total that counts the wrong term.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

const signedInAs = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (signedInAs.userId ? { user: { id: signedInAs.userId } } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

/**
 * A week the seed never touches.
 *
 * The seed materialises sessions for the last three weeks only, so writing
 * here cannot collide with seeded rows or with the E2E suite. It also sits in
 * **trimestre 2** while every seeded session sits in trimestre 1 — which is
 * what makes the term boundary in `getClassAbsenceTotals` testable at all.
 */
const TEST_WEEK_MONDAY = "2026-01-05";

/** A date in the test window whose weekday matches the slot's. */
function testDate(weekday: number, weekOffset: number): string {
  const d = new Date(`${TEST_WEEK_MONDAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (weekday - 1) + weekOffset * 7);
  return d.toISOString().slice(0, 10);
}

type Status = "present" | "absent" | "late" | "excused";
type Mark = { studentId: string; status: Status; minutesLate: number | null };
type Payload = { slotId: string; date: string; marks: Mark[] };

type Fixture = {
  slotId: string;
  weekday: number;
  classGroupId: string;
  teacherUserId: string;
  /** A teacher with no claim on `slotId`. */
  otherTeacherId: string;
  otherTeacherUserId: string;
  /** The students actually enrolled in this lesson's class. */
  roster: string[];
  /** A student in a different class — the tampered-payload case. */
  outsiderId: string;
  parentUserId: string;
  termId: string;
};

let f: Fixture;

beforeAll(async () => {
  const slots = await db
    .select({
      slotId: timetableSlots.id,
      weekday: timetableSlots.weekday,
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .where(eq(timetableSlots.isActive, true));

  const mine = slots[0];
  const theirs = mine
    ? slots.find((s) => s.teacherId !== mine.teacherId && s.classGroupId !== mine.classGroupId)
    : undefined;
  if (!mine || !theirs) throw new Error("database is not seeded — run `pnpm db:setup` first");

  const teacherRows = await db
    .select({ id: teachers.id, userId: teachers.userId })
    .from(teachers)
    .where(inArray(teachers.id, [mine.teacherId, theirs.teacherId]));

  const teacherUserId = teacherRows.find((t) => t.id === mine.teacherId)?.userId;
  const otherTeacherUserId = teacherRows.find((t) => t.id === theirs.teacherId)?.userId;

  const roster = await db
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, mine.classGroupId), isNull(enrolments.leftOn)));

  const [outsider] = await db
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, theirs.classGroupId), isNull(enrolments.leftOn)))
    .limit(1);

  const [parent] = await db.select().from(users).where(eq(users.role, "parent")).limit(1);
  const [term] = await db.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);

  if (!teacherUserId || !otherTeacherUserId || !outsider || !parent || !term) {
    throw new Error("database is not seeded — run `pnpm db:setup` first");
  }
  if (roster.length < 3) throw new Error("the seeded class is too small for these tests");

  f = {
    slotId: mine.slotId,
    weekday: mine.weekday,
    classGroupId: mine.classGroupId,
    teacherUserId,
    otherTeacherId: theirs.teacherId,
    otherTeacherUserId,
    roster: roster.map((r) => r.studentId),
    outsiderId: outsider.studentId,
    parentUserId: parent.id,
    termId: term.id,
  };
});

/** Remove everything these tests materialised — the seed must stay pristine. */
afterAll(async () => {
  const written = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(gte(sessions.date, testDate(1, 0)), lte(sessions.date, testDate(6, 12))));

  const ids = written.map((row) => row.id);
  if (ids.length === 0) return;

  // Attendance cascades with the session; the audit entries do not, and a test
  // must not leave rows behind pointing at sessions that no longer exist.
  await db.delete(auditLog).where(inArray(auditLog.entityId, ids));
  await db.delete(sessions).where(inArray(sessions.id, ids));
});

/** The whole class marked present, with the named exceptions. */
function register(
  date: string,
  exceptions: Record<string, { status: Status; minutesLate?: number }> = {}
): Payload {
  return {
    slotId: f.slotId,
    date,
    marks: f.roster.map((studentId) => {
      const exception = exceptions[studentId];
      return {
        studentId,
        status: exception?.status ?? "present",
        minutesLate: exception?.minutesLate ?? null,
      };
    }),
  };
}

function marksFor(sessionId: string) {
  return db.select().from(attendance).where(eq(attendance.sessionId, sessionId));
}

function sessionsOn(date: string) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.slotId, f.slotId), eq(sessions.date, date)));
}

describe("taking the register", () => {
  it("materialises the session on first save and records every student", async () => {
    signedInAs.userId = f.teacherUserId;
    const date = testDate(f.weekday, 0);

    // Nothing exists until a teacher opens the lesson — sessions are lazy.
    expect(await sessionsOn(date)).toHaveLength(0);

    const first = f.roster[0] as string;
    const result = await saveAttendance(register(date, { [first]: { status: "absent" } }));

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.data.total).toBe(f.roster.length);
    expect(result.data.counts["absent"]).toBe(1);
    expect(await marksFor(result.data.sessionId)).toHaveLength(f.roster.length);

    // Taking the register is the record that the lesson happened.
    const [session] = await sessionsOn(date);
    expect(session?.status).toBe("held");
  });

  it("upserts a correction instead of duplicating the register", async () => {
    signedInAs.userId = f.teacherUserId;
    const date = testDate(f.weekday, 1);
    const student = f.roster[1] as string;

    const first = await saveAttendance(register(date, { [student]: { status: "absent" } }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // The mis-tap, fixed five minutes later — same screen, same action.
    const second = await saveAttendance(register(date, { [student]: { status: "excused" } }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.sessionId).toBe(first.data.sessionId);
    const rows = await marksFor(first.data.sessionId);
    expect(rows).toHaveLength(f.roster.length);
    expect(rows.find((r) => r.studentId === student)?.status).toBe("excused");
  });

  it("clears minutesLate when a student is no longer late", async () => {
    signedInAs.userId = f.teacherUserId;
    const date = testDate(f.weekday, 2);
    const student = f.roster[2] as string;

    const late = await saveAttendance(
      register(date, { [student]: { status: "late", minutesLate: 12 } })
    );
    expect(late.ok).toBe(true);
    if (!late.ok) return;

    const stored = await marksFor(late.data.sessionId);
    expect(stored.find((r) => r.studentId === student)?.minutesLate).toBe(12);

    // Re-marked present. A stale 12 riding along would put minutes on a
    // present student, which the database CHECK also refuses.
    expect((await saveAttendance(register(date))).ok).toBe(true);

    const row = (await marksFor(late.data.sessionId)).find((r) => r.studentId === student);
    expect(row?.status).toBe("present");
    expect(row?.minutesLate).toBeNull();
  });

  it("lets the recorded substitute mark a lesson the slot names someone else for", async () => {
    const date = testDate(f.weekday, 3);
    // The school records the substitution on the session itself.
    await db
      .insert(sessions)
      .values({ slotId: f.slotId, date, status: "scheduled", actualTeacherId: f.otherTeacherId });

    signedInAs.userId = f.otherTeacherUserId;
    expect(await saveAttendance(register(date))).toMatchObject({ ok: true });
  });
});

describe("the register refuses", () => {
  it("a teacher who does not teach the lesson — and materialises nothing", async () => {
    signedInAs.userId = f.otherTeacherUserId;
    const date = testDate(f.weekday, 4);

    expect(await saveAttendance(register(date))).toEqual({
      ok: false,
      error: "errors.notAuthorized",
    });

    // The session is opened before authorisation is checked, inside the same
    // transaction. A refused save must leave no trace of the lesson.
    expect(await sessionsOn(date)).toHaveLength(0);
  });

  it("a payload naming a student from another class", async () => {
    signedInAs.userId = f.teacherUserId;
    const date = testDate(f.weekday, 5);

    const before = await db.select().from(attendance).where(eq(attendance.studentId, f.outsiderId));

    // The student list comes from the browser. A tampered one must not write
    // an absence onto a child in a class this teacher has never met.
    const tampered = register(date);
    tampered.marks.push({ studentId: f.outsiderId, status: "absent", minutesLate: null });

    expect(await saveAttendance(tampered)).toEqual({ ok: false, error: "errors.notAuthorized" });

    const after = await db.select().from(attendance).where(eq(attendance.studentId, f.outsiderId));
    expect(after).toHaveLength(before.length);
    // And the rest of the register is refused with it, rather than half-written.
    expect(await sessionsOn(date)).toHaveLength(0);
  });

  it("a parent, whatever the payload says", async () => {
    signedInAs.userId = f.parentUserId;
    expect(await saveAttendance(register(testDate(f.weekday, 6)))).toEqual({
      ok: false,
      error: "errors.notAuthorized",
    });
  });

  it("nobody at all", async () => {
    signedInAs.userId = null;
    expect((await saveAttendance(register(testDate(f.weekday, 6)))).ok).toBe(false);
  });

  it("minutes of lateness on a student who is not late", async () => {
    signedInAs.userId = f.teacherUserId;
    const payload = register(testDate(f.weekday, 6));
    payload.marks = payload.marks.map((mark, index) =>
      index === 0 ? { ...mark, status: "present", minutesLate: 10 } : mark
    );

    expect(await saveAttendance(payload)).toMatchObject({
      ok: false,
      error: "errors.minutesLateOnlyForLate",
    });
  });

  it("an empty register", async () => {
    signedInAs.userId = f.teacherUserId;
    expect(
      await saveAttendance({ slotId: f.slotId, date: testDate(f.weekday, 6), marks: [] })
    ).toMatchObject({ ok: false, error: "errors.emptyRegister" });
  });
});

describe("the audit trail", () => {
  it("records the save with counts only — never a student", async () => {
    signedInAs.userId = f.teacherUserId;
    const date = testDate(f.weekday, 7);
    const student = f.roster[0] as string;

    const result = await saveAttendance(register(date, { [student]: { status: "absent" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, result.data.sessionId));

    expect(entry?.action).toBe("attendance.save");
    expect(entry?.actorId).toBe(f.teacherUserId);
    expect(entry?.payload).toMatchObject({ date, total: f.roster.length, absent: 1 });

    // The payload is readable by anyone with audit access. A student id in it
    // would make the trail a second, unprotected copy of the register.
    const serialised = JSON.stringify(entry?.payload);
    for (const studentId of f.roster) expect(serialised).not.toContain(studentId);
  });
});

describe("what the register screen reads back", () => {
  it("returns the whole roster unmarked before the lesson is opened", async () => {
    const rows = await getRegister(f.classGroupId, null);
    expect(rows).toHaveLength(f.roster.length);
    expect(rows.every((row) => row.status === null)).toBe(true);
  });

  it("returns the recorded marks once it has been taken", async () => {
    signedInAs.userId = f.teacherUserId;
    const date = testDate(f.weekday, 8);
    const student = f.roster[0] as string;

    const result = await saveAttendance(
      register(date, { [student]: { status: "late", minutesLate: 7 } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await getRegister(f.classGroupId, result.data.sessionId);
    expect(rows).toHaveLength(f.roster.length);
    const marked = rows.find((row) => row.studentId === student);
    expect(marked?.status).toBe("late");
    expect(marked?.minutesLate).toBe(7);
    // One row per student, not one per mark ever recorded for them.
    expect(new Set(rows.map((row) => row.studentId)).size).toBe(rows.length);
  });
});

describe("absence totals", () => {
  it("count only what falls inside the term", async () => {
    signedInAs.userId = f.teacherUserId;
    const student = f.roster[0] as string;

    const before = await getClassAbsenceTotals(f.classGroupId, f.termId);
    const mine = before.find((row) => row.studentId === student);
    expect(mine).toBeDefined();

    // Trimestre 2, deliberately, and a date nothing else here has touched: an
    // absence in another term must not land in this one's total, or every
    // bulletin carries the wrong number.
    const otherTerm = await saveAttendance(
      register(testDate(f.weekday, 9), { [student]: { status: "absent" } })
    );
    expect(otherTerm.ok).toBe(true);
    if (!otherTerm.ok) return;
    // The mark really was written — otherwise this test proves nothing.
    const written = await marksFor(otherTerm.data.sessionId);
    expect(written.find((row) => row.studentId === student)?.status).toBe("absent");

    const after = await getClassAbsenceTotals(f.classGroupId, f.termId);
    expect(after.find((row) => row.studentId === student)?.absent).toBe(mine?.absent);
  });

  it("return one row per enrolled student, never one per mark", async () => {
    const rows = await getClassAbsenceTotals(f.classGroupId, f.termId);
    expect(rows).toHaveLength(f.roster.length);
    for (const row of rows) {
      expect(row.absent + row.late + row.excused).toBeLessThanOrEqual(row.totalMarked);
    }
  });

  it("are empty for a term that does not exist", async () => {
    const rows = await getClassAbsenceTotals(
      f.classGroupId,
      "00000000-0000-0000-0000-0000000000ff"
    );
    expect(rows).toEqual([]);
  });
});
