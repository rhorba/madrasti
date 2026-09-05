import {
  academicYears,
  auditLog,
  classGroups,
  db,
  enrolments,
  guardians,
  studentGuardians,
  students,
  teachers,
  users,
} from "@madrasti/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createGuardian,
  createGuardianAccount,
  createStudent,
  createStudentAccount,
  createTeacher,
  enrolStudent,
  linkGuardian,
  resetPassword,
  setAccountActive,
  setStudentStatus,
  unlinkGuardian,
  updateStudent,
} from "./people-actions.js";

/**
 * Students, guardians, teachers, and the accounts the school hands out.
 *
 * This is the most sensitive file in the product: it creates the records of
 * minors and the logins that reach them. So it is written against the four
 * things that would actually hurt — a temporary password reaching the audit
 * log, an enrolment history rewritten instead of appended to, a pupil deleted
 * rather than marked as having left, and any of it reachable by a teacher.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

const signedInAs = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (signedInAs.userId ? { user: { id: signedInAs.userId } } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

let adminUserId: string;
let teacherUserId: string;
let yearId: string;
let classGroupId: string;

const trash = {
  students: [] as string[],
  guardians: [] as string[],
  teachers: [] as string[],
  users: [] as string[],
};

const tag = () => `zz${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10000)}`;

function newStudent() {
  return {
    firstNameFr: "Test",
    lastNameFr: `Pupil${tag()}`,
    firstNameAr: "اختبار",
    lastNameAr: "تلميذ",
    birthDate: "2015-03-14",
    gender: "f" as const,
    enrolledAt: "2025-09-01",
  };
}

beforeAll(async () => {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  const [teacher] = await db.select({ id: users.id }).from(users).where(eq(users.role, "teacher"));
  const [year] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.isCurrent, true));
  const [group] = await db.select({ id: classGroups.id }).from(classGroups).limit(1);
  if (!admin || !teacher || !year || !group) throw new Error("database is not seeded");

  adminUserId = admin.id;
  teacherUserId = teacher.id;
  yearId = year.id;
  classGroupId = group.id;
  signedInAs.userId = adminUserId;
});

afterEach(async () => {
  signedInAs.userId = adminUserId;
  if (trash.students.length) {
    const ids = trash.students.splice(0);
    await db.delete(studentGuardians).where(inArray(studentGuardians.studentId, ids));
    await db.delete(enrolments).where(inArray(enrolments.studentId, ids));
    await db.delete(students).where(inArray(students.id, ids));
  }
  if (trash.guardians.length) {
    const ids = trash.guardians.splice(0);
    await db.delete(studentGuardians).where(inArray(studentGuardians.guardianId, ids));
    await db.delete(guardians).where(inArray(guardians.id, ids));
  }
  if (trash.teachers.length)
    await db.delete(teachers).where(inArray(teachers.id, trash.teachers.splice(0)));
  if (trash.users.length) await db.delete(users).where(inArray(users.id, trash.users.splice(0)));
});

afterAll(() => {
  signedInAs.userId = null;
});

describe("students", () => {
  it("creates one with both spellings of the name", async () => {
    const result = await createStudent(newStudent());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    trash.students.push(result.data.id);

    const [row] = await db.select().from(students).where(eq(students.id, result.data.id));
    // Both are captured at enrolment because Moroccan paperwork is issued in
    // both, and a proper noun cannot be translated later (`CLAUDE.md` §6).
    expect(row?.firstNameAr).toBe("اختبار");
    expect(row?.firstNameFr).toBe("Test");
    expect(row?.status).toBe("active");
  });

  it("accepts a pupil with no Massar code yet", async () => {
    // A newly-arrived child may not have one, and the school must not be
    // blocked from enrolling them.
    const result = await createStudent({ ...newStudent(), massarCode: null });
    expect(result.ok).toBe(true);
    if (result.ok) trash.students.push(result.data.id);
  });

  it("refuses a Massar code that is not one", async () => {
    const result = await createStudent({ ...newStudent(), massarCode: "nope!" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.invalidMassarCode");
  });

  it("refuses a duplicate Massar code, and says which problem it is", async () => {
    const code = `R${Date.now().toString().slice(-9)}`;
    const first = await createStudent({ ...newStudent(), massarCode: code });
    expect(first.ok).toBe(true);
    if (first.ok) trash.students.push(first.data.id);

    const second = await createStudent({ ...newStudent(), massarCode: code });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("errors.massarTaken");
  });

  it("refuses a birth date that does not exist", async () => {
    const result = await createStudent({ ...newStudent(), birthDate: "2015-02-30" });
    expect(result.ok).toBe(false);
  });

  it("refuses a pupil named only in French", async () => {
    const result = await createStudent({ ...newStudent(), firstNameAr: "", lastNameAr: "" });
    expect(result.ok).toBe(false);
  });

  it("edits one without touching what was not sent", async () => {
    const created = await createStudent(newStudent());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.students.push(created.data.id);

    const result = await updateStudent({ id: created.data.id, firstNameFr: "Corrigé" });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(students).where(eq(students.id, created.data.id));
    expect(row?.firstNameFr).toBe("Corrigé");
    expect(row?.firstNameAr, "the Arabic name survives a French-only edit").toBe("اختبار");
  });

  it("marks a pupil as having left rather than deleting them", async () => {
    // §10.5: nothing hard-deletes. A transferred pupil's marks and absences
    // are still the school's record of a real year.
    const created = await createStudent(newStudent());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.students.push(created.data.id);

    const result = await setStudentStatus({ id: created.data.id, status: "transferred" });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(students).where(eq(students.id, created.data.id));
    expect(row, "the row survives").toBeDefined();
    expect(row?.status).toBe("transferred");
  });

  it("refuses a status that is not one of the four", async () => {
    const result = await setStudentStatus({
      id: "00000000-0000-0000-0000-000000000000",
      status: "expelled" as never,
    });
    expect(result.ok).toBe(false);
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await createStudent(newStudent());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });
});

describe("enrolment", () => {
  it("enrols a pupil into a class", async () => {
    const created = await createStudent(newStudent());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.students.push(created.data.id);

    const result = await enrolStudent({
      studentId: created.data.id,
      classGroupId,
      yearId,
      enrolledOn: "2025-09-01",
    });
    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(enrolments)
      .where(and(eq(enrolments.studentId, created.data.id), isNull(enrolments.leftOn)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.classGroupId).toBe(classGroupId);
  });

  it("moving a pupil closes the old enrolment instead of editing it", async () => {
    // Which class a child sat in is part of the record, so a move appends.
    const created = await createStudent(newStudent());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.students.push(created.data.id);

    const groups = await db.select({ id: classGroups.id }).from(classGroups).limit(2);
    const [first, second] = groups;
    if (!first || !second) throw new Error("database is not seeded");

    await enrolStudent({
      studentId: created.data.id,
      classGroupId: first.id,
      yearId,
      enrolledOn: "2025-09-01",
    });
    const moved = await enrolStudent({
      studentId: created.data.id,
      classGroupId: second.id,
      yearId,
      enrolledOn: "2026-01-15",
    });
    expect(moved.ok).toBe(true);

    const all = await db.select().from(enrolments).where(eq(enrolments.studentId, created.data.id));
    expect(all, "both enrolments are kept").toHaveLength(2);

    const active = all.filter((row) => row.leftOn === null);
    expect(active, "and only one is active").toHaveLength(1);
    expect(active[0]?.classGroupId).toBe(second.id);

    const closed = all.find((row) => row.leftOn !== null);
    expect(closed?.leftOn).toBe("2026-01-15");
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await enrolStudent({
      studentId: "00000000-0000-0000-0000-000000000000",
      classGroupId,
      yearId,
      enrolledOn: "2025-09-01",
    });
    expect(result.ok).toBe(false);
  });
});

describe("guardians", () => {
  function newGuardian() {
    return {
      firstNameFr: "Parent",
      lastNameFr: `Test${tag()}`,
      firstNameAr: "ولي",
      lastNameAr: "أمر",
      phone: "0612345678",
      relation: "mother" as const,
    };
  }

  it("creates one, and links them to a pupil in the same step", async () => {
    const pupil = await createStudent(newStudent());
    expect(pupil.ok).toBe(true);
    if (!pupil.ok) return;
    trash.students.push(pupil.data.id);

    const result = await createGuardian({ ...newGuardian(), studentId: pupil.data.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    trash.guardians.push(result.data.id);

    const links = await db
      .select()
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, pupil.data.id));
    expect(links).toHaveLength(1);
  });

  it("accepts a Moroccan phone number written the way people write it", async () => {
    // 06 12 34 56 78, +212 6 12 34 56 78 — both are the same number.
    for (const phone of ["0612345678", "+212612345678", "06 12 34 56 78"]) {
      const result = await createGuardian({ ...newGuardian(), phone });
      expect(result.ok, phone).toBe(true);
      if (result.ok) trash.guardians.push(result.data.id);
    }
  });

  it("links and unlinks a guardian", async () => {
    const pupil = await createStudent(newStudent());
    const guardian = await createGuardian(newGuardian());
    expect(pupil.ok && guardian.ok).toBe(true);
    if (!pupil.ok || !guardian.ok) return;
    trash.students.push(pupil.data.id);
    trash.guardians.push(guardian.data.id);

    const linked = await linkGuardian({
      studentId: pupil.data.id,
      guardianId: guardian.data.id,
      isPrimary: true,
    });
    expect(linked.ok).toBe(true);

    let links = await db
      .select()
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, pupil.data.id));
    expect(links).toHaveLength(1);
    expect(links[0]?.isPrimary).toBe(true);

    const unlinked = await unlinkGuardian({
      studentId: pupil.data.id,
      guardianId: guardian.data.id,
    });
    expect(unlinked.ok).toBe(true);

    links = await db
      .select()
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, pupil.data.id));
    expect(links).toHaveLength(0);
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await createGuardian(newGuardian());
    expect(result.ok).toBe(false);
  });
});

describe("teachers", () => {
  it("creates one with a login", async () => {
    const email = `${tag()}@almassira.example.ma`;
    const result = await createTeacher({
      firstNameFr: "Prof",
      lastNameFr: `Test${tag()}`,
      firstNameAr: "أستاذ",
      lastNameAr: "اختبار",
      email,
      locale: "ar",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [account] = await db.select().from(users).where(eq(users.email, email));
    expect(account?.role).toBe("teacher");
    expect(account?.locale).toBe("ar");
    // Provisioned accounts must change their password on first use (§15).
    expect(account?.mustChangePassword).toBe(true);

    const [row] = await db.select().from(teachers).where(eq(teachers.userId, account!.id));
    if (row) trash.teachers.push(row.id);
    if (account) trash.users.push(account.id);
  });

  it("refuses an email already in use", async () => {
    const [existing] = await db.select({ email: users.email }).from(users).limit(1);
    if (!existing) throw new Error("database is not seeded");

    const result = await createTeacher({
      firstNameFr: "Prof",
      lastNameFr: "Duplicate",
      firstNameAr: "أستاذ",
      lastNameAr: "مكرر",
      email: existing.email,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.emailTaken");
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await createTeacher({
      firstNameFr: "A",
      lastNameFr: "B",
      firstNameAr: "ا",
      lastNameAr: "ب",
      email: `${tag()}@example.ma`,
    });
    expect(result.ok).toBe(false);
  });
});

describe("the accounts the school hands out", () => {
  it("provisions a parent login and returns the temporary password once", async () => {
    const guardian = await createGuardian({
      firstNameFr: "Parent",
      lastNameFr: `Acct${tag()}`,
      firstNameAr: "ولي",
      lastNameAr: "أمر",
      phone: "0612345678",
      relation: "father",
    });
    expect(guardian.ok).toBe(true);
    if (!guardian.ok) return;
    trash.guardians.push(guardian.data.id);

    const email = `${tag()}@example.ma`;
    const result = await createGuardianAccount({
      guardianId: guardian.data.id,
      email,
      locale: "fr",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.tempPassword.length).toBeGreaterThan(8);

    const [account] = await db.select().from(users).where(eq(users.email, email));
    expect(account?.role).toBe("parent");
    expect(account?.mustChangePassword).toBe(true);
    // Never stored in the clear.
    expect(account?.passwordHash).not.toContain(result.data.tempPassword);
    expect(account?.passwordHash.startsWith("$argon2")).toBe(true);
    if (account) trash.users.push(account.id);
  });

  it("never writes a temporary password into the audit log", async () => {
    // §11: the audit log is a second, less-protected copy of whatever goes in
    // it. A credential must never be in there.
    const pupil = await createStudent(newStudent());
    expect(pupil.ok).toBe(true);
    if (!pupil.ok) return;
    trash.students.push(pupil.data.id);

    const email = `${tag()}@example.ma`;
    const result = await createStudentAccount({ studentId: pupil.data.id, email, locale: "fr" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entries = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(eq(auditLog.entityId, pupil.data.id));

    const serialised = JSON.stringify(entries);
    expect(serialised).not.toContain(result.data.tempPassword);
    expect(serialised.toLowerCase()).not.toContain("password");

    const [account] = await db.select().from(users).where(eq(users.email, email));
    if (account) trash.users.push(account.id);
  });

  it("resets a password to a new temporary one and forces a change", async () => {
    const email = `${tag()}@example.ma`;
    const guardian = await createGuardian({
      firstNameFr: "Parent",
      lastNameFr: `Reset${tag()}`,
      firstNameAr: "ولي",
      lastNameAr: "أمر",
      phone: "0612345678",
      relation: "tutor",
    });
    expect(guardian.ok).toBe(true);
    if (!guardian.ok) return;
    trash.guardians.push(guardian.data.id);

    const provisioned = await createGuardianAccount({
      guardianId: guardian.data.id,
      email,
      locale: "fr",
    });
    expect(provisioned.ok).toBe(true);
    if (!provisioned.ok) return;

    const [account] = await db.select().from(users).where(eq(users.email, email));
    if (!account) throw new Error("account was not created");
    trash.users.push(account.id);

    const before = account.passwordHash;
    const reset = await resetPassword({ userId: account.id });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.data.tempPassword).not.toBe(provisioned.data.tempPassword);

    const [after] = await db.select().from(users).where(eq(users.id, account.id));
    expect(after?.passwordHash).not.toBe(before);
    expect(after?.mustChangePassword).toBe(true);
  });

  it("disables and re-enables a login without deleting it", async () => {
    const email = `${tag()}@example.ma`;
    const guardian = await createGuardian({
      firstNameFr: "Parent",
      lastNameFr: `Toggle${tag()}`,
      firstNameAr: "ولي",
      lastNameAr: "أمر",
      phone: "0612345678",
      relation: "mother",
    });
    expect(guardian.ok).toBe(true);
    if (!guardian.ok) return;
    trash.guardians.push(guardian.data.id);

    await createGuardianAccount({ guardianId: guardian.data.id, email, locale: "fr" });
    const [account] = await db.select().from(users).where(eq(users.email, email));
    if (!account) throw new Error("account was not created");
    trash.users.push(account.id);

    expect((await setAccountActive({ userId: account.id, isActive: false })).ok).toBe(true);
    let [row] = await db.select().from(users).where(eq(users.id, account.id));
    expect(row?.isActive).toBe(false);

    expect((await setAccountActive({ userId: account.id, isActive: true })).ok).toBe(true);
    [row] = await db.select().from(users).where(eq(users.id, account.id));
    expect(row?.isActive).toBe(true);
  });

  it("is all refused to a teacher", async () => {
    const [account] = await db.select({ id: users.id }).from(users).limit(1);
    if (!account) throw new Error("database is not seeded");
    signedInAs.userId = teacherUserId;

    expect((await resetPassword({ userId: account.id })).ok).toBe(false);
    expect((await setAccountActive({ userId: account.id, isActive: false })).ok).toBe(false);
    expect(
      (
        await createStudentAccount({
          studentId: "00000000-0000-0000-0000-000000000000",
          email: `${tag()}@example.ma`,
          locale: "fr",
        })
      ).ok
    ).toBe(false);
  });

  it("is refused to nobody at all", async () => {
    signedInAs.userId = null;
    const [account] = await db.select({ id: users.id }).from(users).limit(1);
    if (!account) throw new Error("database is not seeded");
    expect((await resetPassword({ userId: account.id })).ok).toBe(false);
  });
});
