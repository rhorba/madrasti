import { getAppreciationSheet } from "@/lib/queries/bulletins.js";
import {
  auditLog,
  classSubjects,
  db,
  enrolments,
  students,
  subjectAppreciations,
  teachers,
  terms,
  users,
} from "@madrasti/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAppreciations } from "./actions.js";

/**
 * Subject appreciations, end to end.
 *
 * The remark is the one field on a bulletin that is a named adult's written
 * opinion of a named child, so this file is written against the two ways that
 * can go wrong: the **wrong author** (a teacher of the same class but another
 * subject, or of another class entirely) and the **wrong pupil** — and against
 * the third thing the schema alone cannot prove, that an Arabic sentence
 * survives the round trip through Postgres unchanged.
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
  teacherUserId: string;
  /** Another subject in the SAME class, taught by someone else. */
  siblingClassSubjectId: string;
  siblingTeacherUserId: string;
  roster: string[];
  /** A student in a different class — the tampered-payload case. */
  outsiderId: string;
  parentUserId: string;
  termId: string;
  /** A second term, to prove a remark does not leak across the trimestre. */
  otherTermId: string;
};

let f: Fixture;

beforeAll(async () => {
  const all = await db
    .select({
      id: classSubjects.id,
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(classSubjects);

  const mine = all[0];
  const sibling = mine
    ? all.find((cs) => cs.classGroupId === mine.classGroupId && cs.teacherId !== mine.teacherId)
    : undefined;
  const foreign = mine ? all.find((cs) => cs.classGroupId !== mine.classGroupId) : undefined;
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
  const termRows = await db.select().from(terms).orderBy(terms.order);
  const term = termRows.find((row) => row.isCurrent) ?? termRows[0];
  const otherTerm = termRows.find((row) => row.id !== term?.id);

  if (!teacherUserId || !siblingTeacherUserId || !outsider || !parent || !term || !otherTerm) {
    throw new Error("database is not seeded — run `pnpm db:setup` first");
  }
  if (roster.length < 3) throw new Error("the seeded class is too small for these tests");

  f = {
    classSubjectId: mine.id,
    teacherUserId,
    siblingClassSubjectId: sibling.id,
    siblingTeacherUserId,
    roster: roster.map((row) => row.studentId),
    outsiderId: outsider.studentId,
    parentUserId: parent.id,
    termId: term.id,
    otherTermId: otherTerm.id,
  };
});

/**
 * The seed writes appreciations of its own, so the sheet is cleared **before**
 * each test rather than after. Cleaning up afterwards is not enough: the very
 * first test would then run against the seed's own rows and count them as its
 * own — which is how a test that asserts "one remark was written" passes while
 * the write does nothing at all.
 */
beforeEach(async () => {
  await db
    .delete(subjectAppreciations)
    .where(
      inArray(subjectAppreciations.classSubjectId, [f.classSubjectId, f.siblingClassSubjectId])
    );
  await db.delete(auditLog).where(eq(auditLog.action, "appreciations.save"));
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.action, "appreciations.save"));
});

/** What is actually stored for this class+subject and term. */
async function stored(classSubjectId = f.classSubjectId, termId = f.termId) {
  return db
    .select({ studentId: subjectAppreciations.studentId, text: subjectAppreciations.text })
    .from(subjectAppreciations)
    .where(
      and(
        eq(subjectAppreciations.classSubjectId, classSubjectId),
        eq(subjectAppreciations.termId, termId)
      )
    );
}

describe("writing a sheet", () => {
  it("is allowed for the teacher of that subject, and stores what was written", async () => {
    signedInAs.userId = f.teacherUserId;
    const [first, second] = f.roster as [string, string];

    const result = await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [
        { studentId: first, text: "Élève sérieux, doit participer davantage." },
        { studentId: second, text: "" },
      ],
    });

    expect(result).toMatchObject({ ok: true });
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      studentId: first,
      text: "Élève sérieux, doit participer davantage.",
    });
  });

  it("stores an Arabic remark byte for byte", async () => {
    // The one field in the product deliberately exempt from §12.14: it is
    // shown as written, so a mangled round trip would print mojibake on a
    // document the school signs.
    signedInAs.userId = f.teacherUserId;
    const text = "تلميذ مجتهد، مستواه في تحسن مستمر. عليه المشاركة أكثر داخل القسم.";
    const [first] = f.roster as [string];

    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: first, text }],
    });

    expect((await stored())[0]?.text).toBe(text);
  });

  it("overwrites on a second save rather than adding a second remark", async () => {
    signedInAs.userId = f.teacherUserId;
    const [first] = f.roster as [string];
    const sheet = (text: string) => ({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: first, text }],
    });

    await saveAppreciations(sheet("Premier jet."));
    await saveAppreciations(sheet("Version corrigée."));

    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("Version corrigée.");
  });

  it("removes the row when a remark is cleared", async () => {
    // Not an empty string: a blank row would print an empty line on the
    // bulletin where the subject was meant to say nothing at all.
    signedInAs.userId = f.teacherUserId;
    const [first] = f.roster as [string];

    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: first, text: "À supprimer." }],
    });
    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: first, text: "   " }],
    });

    expect(await stored()).toHaveLength(0);
  });

  it("keeps the terms apart", async () => {
    signedInAs.userId = f.teacherUserId;
    const [first] = f.roster as [string];

    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: first, text: "Trimestre 1." }],
    });
    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.otherTermId,
      entries: [{ studentId: first, text: "Trimestre 2." }],
    });

    expect((await stored(f.classSubjectId, f.termId))[0]?.text).toBe("Trimestre 1.");
    expect((await stored(f.classSubjectId, f.otherTermId))[0]?.text).toBe("Trimestre 2.");

    await db.delete(subjectAppreciations).where(eq(subjectAppreciations.termId, f.otherTermId));
  });
});

describe("who may write", () => {
  it("REFUSES a teacher of the same class but a different subject", async () => {
    // The most plausible internal misuse: two teachers share a class, and the
    // remark that prints in the French column is the French teacher's alone.
    signedInAs.userId = f.siblingTeacherUserId;
    const [first] = f.roster as [string];

    expect(
      await saveAppreciations({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        entries: [{ studentId: first, text: "Pas la mienne." }],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
    expect(await stored()).toHaveLength(0);
  });

  it("REFUSES a parent", async () => {
    signedInAs.userId = f.parentUserId;
    const [first] = f.roster as [string];

    expect(
      await saveAppreciations({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        entries: [{ studentId: first, text: "Mon enfant est excellent." }],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
    expect(await stored()).toHaveLength(0);
  });

  it("REFUSES a signed-out caller", async () => {
    signedInAs.userId = null;
    const [first] = f.roster as [string];

    expect(
      await saveAppreciations({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        entries: [{ studentId: first, text: "Anonyme." }],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
  });

  it("REFUSES a remark about a pupil in another class, and writes none of the sheet", async () => {
    // A tampered payload. Unlike a stray mark, this one would print on another
    // family's bulletin as the opinion of a teacher who never taught them.
    signedInAs.userId = f.teacherUserId;
    const [first] = f.roster as [string];

    expect(
      await saveAppreciations({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        entries: [
          { studentId: first, text: "Légitime." },
          { studentId: f.outsiderId, text: "Pas mon élève." },
        ],
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });

    // The whole sheet is one transaction: the legitimate row must not survive.
    expect(await stored()).toHaveLength(0);
  });
});

describe("the audit trail", () => {
  it("records the save with counts and never the text", async () => {
    signedInAs.userId = f.teacherUserId;
    const [first, second] = f.roster as [string, string];

    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [
        { studentId: first, text: "Bon trimestre." },
        { studentId: second, text: "" },
      ],
    });

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "appreciations.save"));

    expect(entry?.entityId).toBe(f.classSubjectId);
    expect(entry?.payload).toMatchObject({ written: 1, cleared: 1 });

    // The log must not become a second, less-protected copy of the most
    // sensitive sentence in the product (`CLAUDE.md` §11).
    const serialised = JSON.stringify(entry?.payload);
    expect(serialised).not.toContain("Bon trimestre");
    expect(serialised).not.toContain(first);
  });
});

describe("the sheet a teacher opens", () => {
  it("lists the whole class with the remark and the subject average", async () => {
    signedInAs.userId = f.teacherUserId;
    const [first] = f.roster as [string];

    await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: first, text: "Des progrès constants." }],
    });

    const sheet = await getAppreciationSheet(f.classSubjectId, f.termId);
    expect(sheet).toHaveLength(f.roster.length);

    const row = sheet.find((entry) => entry.studentId === first);
    expect(row?.text).toBe("Des progrès constants.");
    // The mark the remark is about travels with the row, so the teacher is not
    // writing from memory.
    expect(row?.average === null || typeof row?.average === "number").toBe(true);

    // Everyone else is present and blank — a pupil with no remark is still a
    // pupil to write about.
    expect(sheet.filter((entry) => entry.text === null)).toHaveLength(f.roster.length - 1);
  });

  it("carries the pupil's name in both scripts", async () => {
    const sheet = await getAppreciationSheet(f.classSubjectId, f.termId);
    const [row] = sheet;
    if (!row) throw new Error("the seeded class is empty");

    const [student] = await db
      .select({ ar: students.firstNameAr })
      .from(students)
      .where(eq(students.id, row.studentId));

    expect(row.firstNameAr).toBe(student?.ar);
    expect(row.firstNameFr.length).toBeGreaterThan(0);
  });

  it("is empty for a class+subject that does not exist", async () => {
    expect(
      await getAppreciationSheet("00000000-0000-0000-0000-000000000000", f.termId)
    ).toHaveLength(0);
  });
});
