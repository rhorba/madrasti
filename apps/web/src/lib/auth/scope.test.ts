import {
  classGroups,
  classSubjects,
  db,
  enrolments,
  sessions,
  studentGuardians,
  timetableSlots,
} from "@madrasti/db";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { NotAuthorizedError } from "./errors.js";
import {
  assertCanMarkSession,
  assertCanReachClass,
  assertCanReachStudent,
  reachableClasses,
  reachableStudentIds,
} from "./scope.js";
import type { AppSession } from "./session.js";

/**
 * The authorisation suite — `docs/test-strategy-madrasti.md` §5.
 *
 * **This is the gate.** The system holds records about minors, and the failure
 * most likely to actually happen is not an external compromise but an
 * authenticated parent changing an ID in a URL and receiving another family's
 * child. Every case below asserts both directions: the permitted read
 * succeeds, and the forbidden one *throws* rather than returning an empty
 * result a caller could mistake for a legitimate one.
 *
 * Requires a seeded database (`pnpm db:setup`).
 */

function session(partial: Partial<AppSession> & Pick<AppSession, "role">): AppSession {
  return {
    userId: "00000000-0000-0000-0000-0000000000ff",
    email: "test@example.ma",
    locale: "fr",
    teacherId: null,
    guardianId: null,
    studentId: null,
    ...partial,
  };
}

type Fixture = {
  admin: AppSession;
  parentA: AppSession;
  childOfA: string;
  childOfB: string;
  studentSelf: AppSession;
  studentSelfId: string;
  teacher: AppSession;
  taughtClassId: string;
  taughtStudentId: string;
  untaughtClassId: string;
  untaughtStudentId: string;
  markableSessionId: string;
  unmarkableSessionId: string;
};

let f: Fixture;

beforeAll(async () => {
  // --- two guardians with different children ---
  const links = await db
    .select({ guardianId: studentGuardians.guardianId, studentId: studentGuardians.studentId })
    .from(studentGuardians)
    .limit(200);

  const first = links[0];
  const other = links.find((l) => l.guardianId !== first?.guardianId);
  if (!first || !other) throw new Error("database is not seeded — run `pnpm db:setup`");

  // --- a teacher, plus a class they teach and one they do not ---
  const [assignment] = await db
    .select({ teacherId: classSubjects.teacherId, classGroupId: classSubjects.classGroupId })
    .from(classSubjects)
    .limit(1);
  if (!assignment) throw new Error("no class_subjects seeded");

  const taughtClassIds = new Set(
    (
      await db
        .select({ id: classSubjects.classGroupId })
        .from(classSubjects)
        .where(eq(classSubjects.teacherId, assignment.teacherId))
    ).map((r) => r.id)
  );

  const untaughtClassId = (await db.select({ id: classGroups.id }).from(classGroups)).find(
    (r) => !taughtClassIds.has(r.id)
  )?.id;
  if (!untaughtClassId) throw new Error("every class is taught by the same teacher");

  const [taughtStudent] = await db
    .select({ id: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, assignment.classGroupId), isNull(enrolments.leftOn)))
    .limit(1);
  const [untaughtStudent] = await db
    .select({ id: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, untaughtClassId), isNull(enrolments.leftOn)))
    .limit(1);
  if (!taughtStudent || !untaughtStudent) throw new Error("classes have no students");

  // --- a session this teacher may mark, and one belonging to someone else ---
  // Walks sessions -> slot -> class_subject, which is the same path
  // `assertCanMarkSession` takes.
  const sessionRows = await db
    .select({ id: sessions.id, teacherId: classSubjects.teacherId })
    .from(sessions)
    .innerJoin(timetableSlots, eq(timetableSlots.id, sessions.slotId))
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .limit(500);

  const mine = sessionRows.find((r) => r.teacherId === assignment.teacherId);
  const theirs = sessionRows.find((r) => r.teacherId !== assignment.teacherId);
  if (!mine || !theirs) throw new Error("could not resolve session fixtures");

  // A student whose own record we can treat as "self" for the student role.
  const selfId = taughtStudent.id;

  f = {
    admin: session({ role: "admin" }),
    parentA: session({ role: "parent", guardianId: first.guardianId }),
    childOfA: first.studentId,
    childOfB: other.studentId,
    studentSelf: session({ role: "student", studentId: selfId }),
    studentSelfId: selfId,
    teacher: session({ role: "teacher", teacherId: assignment.teacherId }),
    taughtClassId: assignment.classGroupId,
    taughtStudentId: taughtStudent.id,
    untaughtClassId,
    untaughtStudentId: untaughtStudent.id,
    markableSessionId: mine.id,
    unmarkableSessionId: theirs.id,
  };
});

describe("parent", () => {
  it("reaches their own child", async () => {
    await expect(assertCanReachStudent(f.parentA, f.childOfA)).resolves.toBeUndefined();
  });

  it("is REFUSED another family's child", async () => {
    // The single most important assertion in the suite.
    await expect(assertCanReachStudent(f.parentA, f.childOfB)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("refuses rather than returning an empty result", async () => {
    // A helper that returned [] on refusal would render "no records" instead
    // of denying, and a missing check would survive review.
    await expect(assertCanReachStudent(f.parentA, f.childOfB)).rejects.toThrow(/not authorized/);
  });

  it("sees only their own children in the reachable set", async () => {
    const ids = await reachableStudentIds(f.parentA);
    expect(ids).toContain(f.childOfA);
    expect(ids).not.toContain(f.childOfB);
  });

  it("is refused a class none of their children attend", async () => {
    const own = await reachableClasses(f.parentA);
    const ownIds = new Set(own.map((c) => c.id));
    const [foreign] = await db
      .select({ id: classGroups.id })
      .from(classGroups)
      .limit(20)
      .then((rows) => rows.filter((r) => !ownIds.has(r.id)));
    if (!foreign) return;
    await expect(assertCanReachClass(f.parentA, foreign.id)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("has no guardian record => reaches nothing", async () => {
    const orphan = session({ role: "parent", guardianId: null });
    await expect(assertCanReachStudent(orphan, f.childOfA)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
    expect(await reachableStudentIds(orphan)).toEqual([]);
  });

  it("cannot mark a register", async () => {
    await expect(assertCanMarkSession(f.parentA, f.markableSessionId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });
});

describe("student", () => {
  it("reaches their own record", async () => {
    await expect(assertCanReachStudent(f.studentSelf, f.studentSelfId)).resolves.toBeUndefined();
  });

  it("is REFUSED another student's record", async () => {
    const otherId = f.studentSelfId === f.childOfB ? f.childOfA : f.childOfB;
    expect(otherId).not.toBe(f.studentSelfId);
    await expect(assertCanReachStudent(f.studentSelf, otherId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("has no write path at all — cannot mark a register", async () => {
    await expect(assertCanMarkSession(f.studentSelf, f.markableSessionId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("reaches exactly one student: themselves", async () => {
    expect(await reachableStudentIds(f.studentSelf)).toEqual([f.studentSelfId]);
  });
});

describe("teacher", () => {
  it("reaches a class they teach", async () => {
    await expect(assertCanReachClass(f.teacher, f.taughtClassId)).resolves.toBeUndefined();
  });

  it("is REFUSED a class they do not teach", async () => {
    await expect(assertCanReachClass(f.teacher, f.untaughtClassId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("reaches a student in a class they teach", async () => {
    await expect(assertCanReachStudent(f.teacher, f.taughtStudentId)).resolves.toBeUndefined();
  });

  it("is REFUSED a student they do not teach", async () => {
    await expect(assertCanReachStudent(f.teacher, f.untaughtStudentId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("may mark their own session", async () => {
    await expect(assertCanMarkSession(f.teacher, f.markableSessionId)).resolves.toBeUndefined();
  });

  it("is REFUSED marking another teacher's session", async () => {
    await expect(assertCanMarkSession(f.teacher, f.unmarkableSessionId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("has no teacher record => reaches nothing", async () => {
    const orphan = session({ role: "teacher", teacherId: null });
    await expect(assertCanReachClass(orphan, f.taughtClassId)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
    expect(await reachableStudentIds(orphan)).toEqual([]);
  });
});

describe("admin", () => {
  it("reaches any student", async () => {
    await expect(assertCanReachStudent(f.admin, f.childOfA)).resolves.toBeUndefined();
    await expect(assertCanReachStudent(f.admin, f.childOfB)).resolves.toBeUndefined();
  });

  it("reaches any class and may mark any session", async () => {
    await expect(assertCanReachClass(f.admin, f.untaughtClassId)).resolves.toBeUndefined();
    await expect(assertCanMarkSession(f.admin, f.unmarkableSessionId)).resolves.toBeUndefined();
  });
});

describe("unknown session ids", () => {
  const missing = "00000000-0000-0000-0000-00000000dead";

  it("refuses a non-existent student for a non-admin", async () => {
    await expect(assertCanReachStudent(f.parentA, missing)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });

  it("refuses a non-existent session", async () => {
    await expect(assertCanMarkSession(f.teacher, missing)).rejects.toBeInstanceOf(
      NotAuthorizedError
    );
  });
});
