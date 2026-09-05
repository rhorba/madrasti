import {
  academicYears,
  auditLog,
  classGroups,
  classSubjects,
  db,
  levels,
  school,
  subjects,
  terms,
  users,
} from "@madrasti/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addClassSubject,
  createClass,
  createLevel,
  createSubject,
  createTerm,
  createYear,
  removeClassSubject,
  setCurrentTerm,
  setCurrentYear,
  updateClass,
  updateClassSubject,
  updateLevel,
  updateSchool,
  updateSubject,
} from "./actions.js";

/**
 * The school's own structure: years, terms, levels, classes, subjects.
 *
 * These are the writes a secretary makes once and then lives with for a year,
 * which is exactly why they are worth testing: a mistake here is not noticed
 * until it has corrupted something downstream. Two of them do real damage —
 * "only one year is current" and "the coefficient lives on `class_subjects`" —
 * and both are asserted below rather than assumed from the schema.
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
let currentYearId: string;
let currentTermId: string;

/** Rows this file creates, removed afterwards so the seed is left as found. */
const trash = {
  years: [] as string[],
  terms: [] as string[],
  levels: [] as string[],
  subjects: [] as string[],
  classes: [] as string[],
  classSubjects: [] as string[],
};

async function role(name: "admin" | "teacher") {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.role, name)).limit(1);
  if (!row) throw new Error(`database is not seeded — no ${name}`);
  return row.id;
}

/** A suffix that keeps every run's rows distinct from the last one's. */
const tag = () => `ZZ${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`;

beforeAll(async () => {
  adminUserId = await role("admin");
  teacherUserId = await role("teacher");

  const [year] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.isCurrent, true));
  const [term] = await db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true));
  if (!year || !term) throw new Error("database is not seeded");
  currentYearId = year.id;
  currentTermId = term.id;

  signedInAs.userId = adminUserId;
});

afterEach(async () => {
  signedInAs.userId = adminUserId;
  if (trash.classSubjects.length)
    await db.delete(classSubjects).where(inArray(classSubjects.id, trash.classSubjects.splice(0)));
  if (trash.classes.length)
    await db.delete(classGroups).where(inArray(classGroups.id, trash.classes.splice(0)));
  if (trash.subjects.length)
    await db.delete(subjects).where(inArray(subjects.id, trash.subjects.splice(0)));
  if (trash.levels.length)
    await db.delete(levels).where(inArray(levels.id, trash.levels.splice(0)));
  if (trash.terms.length) await db.delete(terms).where(inArray(terms.id, trash.terms.splice(0)));
  if (trash.years.length)
    await db.delete(academicYears).where(inArray(academicYears.id, trash.years.splice(0)));
});

afterAll(async () => {
  // The seed's own current year and term must be exactly as they were found:
  // every other test file reads them.
  await db
    .update(academicYears)
    .set({ isCurrent: true })
    .where(eq(academicYears.id, currentYearId));
  await db
    .update(academicYears)
    .set({ isCurrent: false })
    .where(ne(academicYears.id, currentYearId));
  await db.update(terms).set({ isCurrent: true }).where(eq(terms.id, currentTermId));
  await db.update(terms).set({ isCurrent: false }).where(ne(terms.id, currentTermId));
  signedInAs.userId = null;
});

describe("academic years", () => {
  it("creates one", async () => {
    const result = await createYear({
      label: "2044-2045",
      startDate: "2044-09-01",
      endDate: "2045-06-30",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    trash.years.push(result.data.id);

    const [row] = await db.select().from(academicYears).where(eq(academicYears.id, result.data.id));
    expect(row?.label).toBe("2044-2045");
  });

  it("refuses a label that is not a school year", async () => {
    const result = await createYear({
      label: "2044",
      startDate: "2044-09-01",
      endDate: "2045-06-30",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.invalidYearLabel");
  });

  it("refuses a year that ends before it starts", async () => {
    const result = await createYear({
      label: "2045-2046",
      startDate: "2046-06-30",
      endDate: "2045-09-01",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a date that does not exist", async () => {
    // 31 February rolls over silently in `Date.parse`; the schema must not.
    const result = await createYear({
      label: "2046-2047",
      startDate: "2046-02-31",
      endDate: "2047-06-30",
    });
    expect(result.ok).toBe(false);
  });

  it("moving the current year leaves exactly one current", async () => {
    // The constraint that matters: two current years and every screen in the
    // product picks one of them arbitrarily.
    const created = await createYear({
      label: "2047-2048",
      startDate: "2047-09-01",
      endDate: "2048-06-30",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.years.push(created.data.id);

    const result = await setCurrentYear({ yearId: created.data.id });
    expect(result.ok).toBe(true);

    const current = await db
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.isCurrent, true));
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(created.data.id);

    // Put it back before the row is deleted underneath the seed.
    await setCurrentYear({ yearId: currentYearId });
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await createYear({
      label: "2048-2049",
      startDate: "2048-09-01",
      endDate: "2049-06-30",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });
});

describe("terms", () => {
  it("creates one, trilingually", async () => {
    const result = await createTerm({
      yearId: currentYearId,
      order: 3,
      labelFr: `T3 ${tag()}`,
      labelAr: "الدورة الثالثة",
      labelEn: "Third term",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
    });
    // Order 3 may already exist in the seed; either outcome is correct, and
    // the one that must not happen is a silent duplicate.
    if (result.ok) {
      trash.terms.push(result.data.id);
      const [row] = await db.select().from(terms).where(eq(terms.id, result.data.id));
      expect(row?.labelAr).toBe("الدورة الثالثة");
    } else {
      expect(result.error).toBe("errors.termOrderTaken");
    }
  });

  it("refuses a fourth trimestre", async () => {
    // A Moroccan year has three. The schema, not a comment, is what enforces it.
    const result = await createTerm({
      yearId: currentYearId,
      order: 4,
      labelFr: "T4",
      labelAr: "الدورة الرابعة",
      labelEn: "Fourth term",
      startDate: "2026-07-01",
      endDate: "2026-08-30",
    });
    expect(result.ok).toBe(false);
  });

  it("moving the current term leaves exactly one current", async () => {
    const all = await db
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.yearId, currentYearId));
    const other = all.find((row) => row.id !== currentTermId);
    if (!other) return;

    const result = await setCurrentTerm({ termId: other.id });
    expect(result.ok).toBe(true);

    const current = await db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true));
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(other.id);

    await setCurrentTerm({ termId: currentTermId });
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await setCurrentTerm({ termId: currentTermId });
    expect(result.ok).toBe(false);
  });
});

describe("levels", () => {
  it("creates and renames one", async () => {
    const created = await createLevel({
      nameFr: `Niveau ${tag()}`,
      nameAr: "مستوى",
      nameEn: "Level",
      order: 19,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.levels.push(created.data.id);

    const renamed = await updateLevel({
      id: created.data.id,
      nameFr: "Niveau corrigé",
      nameAr: "مستوى مصحح",
      nameEn: "Corrected level",
      order: 19,
    });
    expect(renamed.ok).toBe(true);

    const [row] = await db.select().from(levels).where(eq(levels.id, created.data.id));
    expect(row?.nameFr).toBe("Niveau corrigé");
    expect(row?.nameAr).toBe("مستوى مصحح");
  });

  it("refuses a level with a missing translation", async () => {
    // DoD 14: a level named only in French prints as an empty cell on an
    // Arabic bulletin.
    const result = await createLevel({
      nameFr: "Sans arabe",
      nameAr: "",
      nameEn: "No Arabic",
      order: 18,
    });
    expect(result.ok).toBe(false);
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await createLevel({ nameFr: "X", nameAr: "س", nameEn: "X", order: 17 });
    expect(result.ok).toBe(false);
  });
});

describe("subjects", () => {
  it("creates and edits one", async () => {
    const code = tag();
    const created = await createSubject({
      nameFr: "Matière test",
      nameAr: "مادة",
      nameEn: "Test subject",
      code,
      color: "#2F6B43",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.subjects.push(created.data.id);

    const edited = await updateSubject({
      id: created.data.id,
      nameFr: "Matière corrigée",
      nameAr: "مادة مصححة",
      nameEn: "Corrected",
      code,
      color: "#B3392B",
    });
    expect(edited.ok).toBe(true);

    const [row] = await db.select().from(subjects).where(eq(subjects.id, created.data.id));
    expect(row?.color).toBe("#B3392B");
  });

  it("refuses a duplicate code, and says which problem it is", async () => {
    const code = tag();
    const first = await createSubject({
      nameFr: "A",
      nameAr: "أ",
      nameEn: "A",
      code,
      color: "#2F6B43",
    });
    expect(first.ok).toBe(true);
    if (first.ok) trash.subjects.push(first.data.id);

    const second = await createSubject({
      nameFr: "B",
      nameAr: "ب",
      nameEn: "B",
      code,
      color: "#2F6B43",
    });
    expect(second.ok).toBe(false);
    // Not "an unexpected error": the secretary can act on this one.
    if (!second.ok) expect(second.error).toBe("errors.subjectCodeTaken");
  });

  it("refuses a code that is not a code, and a colour that is not a colour", async () => {
    const lower = await createSubject({
      nameFr: "A",
      nameAr: "أ",
      nameEn: "A",
      code: "maths",
      color: "#2F6B43",
    });
    expect(lower.ok).toBe(false);
    if (!lower.ok) expect(lower.error).toBe("errors.invalidCode");

    const colour = await createSubject({
      nameFr: "A",
      nameAr: "أ",
      nameEn: "A",
      code: tag(),
      color: "green",
    });
    expect(colour.ok).toBe(false);
    if (!colour.ok) expect(colour.error).toBe("errors.invalidColor");
  });
});

describe("classes and their subjects", () => {
  async function aLevel() {
    const [row] = await db.select({ id: levels.id }).from(levels).limit(1);
    if (!row) throw new Error("database is not seeded");
    return row.id;
  }

  it("creates a class and edits it", async () => {
    const created = await createClass({
      yearId: currentYearId,
      levelId: await aLevel(),
      name: `Classe ${tag()}`,
      capacity: 30,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.classes.push(created.data.id);

    const edited = await updateClass({ id: created.data.id, capacity: 28 });
    expect(edited.ok).toBe(true);

    const [row] = await db.select().from(classGroups).where(eq(classGroups.id, created.data.id));
    expect(row?.capacity).toBe(28);
  });

  it("refuses two classes with the same name in one year", async () => {
    const levelId = await aLevel();
    const name = `Classe ${tag()}`;

    const first = await createClass({ yearId: currentYearId, levelId, name, capacity: 30 });
    expect(first.ok).toBe(true);
    if (first.ok) trash.classes.push(first.data.id);

    const second = await createClass({ yearId: currentYearId, levelId, name, capacity: 30 });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("errors.classNameTaken");
  });

  it("refuses a capacity no room could hold", async () => {
    const result = await createClass({
      yearId: currentYearId,
      levelId: await aLevel(),
      name: `Classe ${tag()}`,
      capacity: 500,
    });
    expect(result.ok).toBe(false);
  });

  it("carries the coefficient on the assignment, not on the subject", async () => {
    // The bug this guards against corrupts every bulletin silently: maths is
    // coefficient 4 in one level and 2 in another (`CLAUDE.md` §6).
    const levelId = await aLevel();
    const [subject] = await db.select({ id: subjects.id }).from(subjects).limit(1);
    const [teacher] = await db
      .select({ teacherId: classSubjects.teacherId })
      .from(classSubjects)
      .limit(1);
    if (!subject || !teacher) throw new Error("database is not seeded");

    const classA = await createClass({
      yearId: currentYearId,
      levelId,
      name: `A ${tag()}`,
      capacity: 30,
    });
    const classB = await createClass({
      yearId: currentYearId,
      levelId,
      name: `B ${tag()}`,
      capacity: 30,
    });
    expect(classA.ok && classB.ok).toBe(true);
    if (!classA.ok || !classB.ok) return;
    trash.classes.push(classA.data.id, classB.data.id);

    const four = await addClassSubject({
      classGroupId: classA.data.id,
      subjectId: subject.id,
      teacherId: teacher.teacherId,
      coefficient: 4,
    });
    const two = await addClassSubject({
      classGroupId: classB.data.id,
      subjectId: subject.id,
      teacherId: teacher.teacherId,
      coefficient: 2,
    });
    expect(four.ok).toBe(true);
    expect(two.ok).toBe(true);
    if (!four.ok || !two.ok) return;
    trash.classSubjects.push(four.data.id, two.data.id);

    const rows = await db
      .select({ id: classSubjects.id, coefficient: classSubjects.coefficient })
      .from(classSubjects)
      .where(inArray(classSubjects.id, [four.data.id, two.data.id]));

    // The same subject, two coefficients, at the same time.
    expect(new Set(rows.map((row) => Number(row.coefficient)))).toEqual(new Set([4, 2]));
  });

  it("refuses the same subject twice in one class", async () => {
    const [existing] = await db
      .select({
        classGroupId: classSubjects.classGroupId,
        subjectId: classSubjects.subjectId,
        teacherId: classSubjects.teacherId,
      })
      .from(classSubjects)
      .limit(1);
    if (!existing) throw new Error("database is not seeded");

    const result = await addClassSubject({
      classGroupId: existing.classGroupId,
      subjectId: existing.subjectId,
      teacherId: existing.teacherId,
      coefficient: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.subjectAlreadyInClass");
  });

  it("refuses a coefficient of zero", async () => {
    // A zero coefficient removes a subject from the average without removing
    // it from the sheet — the reader cannot see why the numbers do not add up.
    const [existing] = await db
      .select({
        id: classSubjects.id,
        classGroupId: classSubjects.classGroupId,
        teacherId: classSubjects.teacherId,
      })
      .from(classSubjects)
      .limit(1);
    if (!existing) throw new Error("database is not seeded");

    const result = await updateClassSubject({
      id: existing.id,
      classGroupId: existing.classGroupId,
      teacherId: existing.teacherId,
      coefficient: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.coefficientPositive");
  });

  it("changes a coefficient and puts it back", async () => {
    const [existing] = await db
      .select({
        id: classSubjects.id,
        classGroupId: classSubjects.classGroupId,
        coefficient: classSubjects.coefficient,
        teacherId: classSubjects.teacherId,
      })
      .from(classSubjects)
      .limit(1);
    if (!existing) throw new Error("database is not seeded");

    const result = await updateClassSubject({
      id: existing.id,
      classGroupId: existing.classGroupId,
      coefficient: 3,
      teacherId: existing.teacherId,
    });
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ coefficient: classSubjects.coefficient })
      .from(classSubjects)
      .where(eq(classSubjects.id, existing.id));
    expect(Number(row?.coefficient)).toBe(3);

    await db
      .update(classSubjects)
      .set({ coefficient: existing.coefficient })
      .where(eq(classSubjects.id, existing.id));
  });

  it("removes an assignment nothing depends on", async () => {
    const levelId = await aLevel();
    const [subject] = await db.select({ id: subjects.id }).from(subjects).limit(1);
    const [teacher] = await db
      .select({ teacherId: classSubjects.teacherId })
      .from(classSubjects)
      .limit(1);
    if (!subject || !teacher) throw new Error("database is not seeded");

    const group = await createClass({
      yearId: currentYearId,
      levelId,
      name: `C ${tag()}`,
      capacity: 30,
    });
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    trash.classes.push(group.data.id);

    const added = await addClassSubject({
      classGroupId: group.data.id,
      subjectId: subject.id,
      teacherId: teacher.teacherId,
      coefficient: 2,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const removed = await removeClassSubject({
      id: added.data.id,
      classGroupId: group.data.id,
    });
    expect(removed.ok).toBe(true);

    const rows = await db.select().from(classSubjects).where(eq(classSubjects.id, added.data.id));
    expect(rows).toHaveLength(0);
  });

  it("refuses to remove an assignment that marks depend on", async () => {
    // ON DELETE RESTRICT: a class list edit must never destroy a mark.
    const [existing] = await db
      .select({ id: classSubjects.id, classGroupId: classSubjects.classGroupId })
      .from(classSubjects)
      .limit(1);
    if (!existing) throw new Error("database is not seeded");

    const result = await removeClassSubject({
      id: existing.id,
      classGroupId: existing.classGroupId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.stillInUse");
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = teacherUserId;
    const result = await createClass({
      yearId: currentYearId,
      levelId: await aLevel(),
      name: "X",
      capacity: 30,
    });
    expect(result.ok).toBe(false);
  });
});

describe("school settings", () => {
  it("edits the school's own details and puts them back", async () => {
    const [before] = await db.select().from(school).limit(1);
    if (!before) throw new Error("database is not seeded");

    const result = await updateSchool({
      id: before.id,
      nameFr: "École de test",
      nameAr: "مدرسة الاختبار",
      nameEn: "Test School",
      address: "1 rue du Test, Rabat",
      phone: "+212600000000",
      email: "test@example.ma",
      defaultLocale: "ar",
      gradingMax: 20,
    });
    expect(result.ok).toBe(true);

    const [after] = await db.select().from(school).where(eq(school.id, before.id));
    expect(after?.nameAr).toBe("مدرسة الاختبار");
    expect(after?.defaultLocale).toBe("ar");

    await db
      .update(school)
      .set({
        nameFr: before.nameFr,
        nameAr: before.nameAr,
        nameEn: before.nameEn,
        address: before.address,
        phone: before.phone,
        email: before.email,
        defaultLocale: before.defaultLocale,
        gradingMax: before.gradingMax,
      })
      .where(eq(school.id, before.id));
  });

  it("refuses a grading maximum that is not a mark scale", async () => {
    const [row] = await db.select({ id: school.id }).from(school).limit(1);
    if (!row) throw new Error("database is not seeded");

    const result = await updateSchool({
      id: row.id,
      nameFr: "A",
      nameAr: "أ",
      nameEn: "A",
      defaultLocale: "fr",
      gradingMax: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("is refused to a teacher", async () => {
    const [row] = await db.select({ id: school.id }).from(school).limit(1);
    if (!row) throw new Error("database is not seeded");
    signedInAs.userId = teacherUserId;

    const result = await updateSchool({
      id: row.id,
      nameFr: "A",
      nameAr: "أ",
      nameEn: "A",
      defaultLocale: "fr",
      gradingMax: 20,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });
});

describe("an unknown class+subject id", () => {
  it("is refused rather than silently doing nothing", async () => {
    const result = await updateClassSubject({
      id: "00000000-0000-0000-0000-000000000000",
      classGroupId: "00000000-0000-0000-0000-000000000000",
      coefficient: 2,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an id that is not a uuid at all", async () => {
    const result = await removeClassSubject({ id: "not-a-uuid", classGroupId: "nope" });
    expect(result.ok).toBe(false);
  });
});

describe("the audit trail", () => {
  it("records who changed the school's structure", async () => {
    // §3 cross-cutting: every write is attributed. A year later this is the
    // only account of why a coefficient changed.
    const created = await createLevel({
      nameFr: `Audité ${tag()}`,
      nameAr: "مدقق",
      nameEn: "Audited",
      order: 16,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.levels.push(created.data.id);

    const [entry] = await db
      .select({ actorId: auditLog.actorId, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, created.data.id), eq(auditLog.entity, "levels")))
      .limit(1);

    expect(entry?.actorId).toBe(adminUserId);
    expect(entry?.action).toContain("level");
  });
});
