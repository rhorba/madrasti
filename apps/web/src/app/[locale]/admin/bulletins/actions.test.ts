import { assertTermOpen, isClassTermPublished } from "@/lib/bulletin-freeze.js";
import {
  computeClassBulletins,
  getPublicationState,
  getStoredBulletins,
  getStudentBulletin,
} from "@/lib/queries/bulletins.js";
import {
  assessments,
  auditLog,
  bulletinLines,
  bulletins,
  classGroups,
  classSubjects,
  db,
  enrolments,
  grades,
  students,
  subjectAppreciations,
  teachers,
  terms,
  users,
} from "@madrasti/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { saveAppreciations } from "../../teacher/appreciations/actions.js";
import { saveGrades } from "../../teacher/grades/actions.js";
import { publishBulletins, saveBulletinReview, unpublishBulletins } from "./actions.js";

/**
 * Publishing, freezing and taking it back — story 8.3.
 *
 * This is the file that has to be right. Publication is the moment a set of
 * working figures becomes a document a school has signed and a family is
 * holding, and the two failures it can have are both silent:
 *
 * - a mark edited afterwards quietly rewrites January's paper (threat T6), or
 * - the freeze is so absolute the school cannot fix a genuine mistake and
 *   stops using the software.
 *
 * So every test here is about one of those two. The arithmetic is
 * `@madrasti/grading`'s job and is not re-proved.
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
  classGroupId: string;
  /** A different class, to prove publishing one does not freeze the other. */
  otherClassGroupId: string;
  classSubjectId: string;
  teacherUserId: string;
  adminUserId: string;
  parentUserId: string;
  roster: string[];
  termId: string;
  /** A term the class has not published — it must stay editable throughout. */
  otherTermId: string;
};

let f: Fixture;

beforeAll(async () => {
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const [parent] = await db.select().from(users).where(eq(users.role, "parent")).limit(1);

  // A class that actually has marks, so the published figures are non-trivial.
  const [graded] = await db
    .select({ classGroupId: classSubjects.classGroupId, classSubjectId: classSubjects.id })
    .from(grades)
    .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
    .innerJoin(classSubjects, eq(classSubjects.id, assessments.classSubjectId))
    .limit(1);
  if (!graded || !admin || !parent) throw new Error("database is not seeded — run `pnpm db:setup`");

  const [other] = await db
    .select({ id: classGroups.id })
    .from(classGroups)
    .where(eq(classGroups.id, classGroups.id))
    .limit(2)
    .then((rows) => rows.filter((row) => row.id !== graded.classGroupId));

  const [teacher] = await db
    .select({ userId: teachers.userId })
    .from(classSubjects)
    .innerJoin(teachers, eq(teachers.id, classSubjects.teacherId))
    .where(eq(classSubjects.id, graded.classSubjectId))
    .limit(1);

  const roster = await db
    .select({ studentId: enrolments.studentId })
    .from(enrolments)
    .where(and(eq(enrolments.classGroupId, graded.classGroupId), isNull(enrolments.leftOn)));

  const termRows = await db.select().from(terms).orderBy(terms.order);
  const term = termRows.find((row) => row.isCurrent) ?? termRows[0];
  const otherTerm = termRows.find((row) => row.id !== term?.id);

  if (!teacher || !other || !term || !otherTerm) {
    throw new Error("database is not seeded — run `pnpm db:setup` first");
  }
  if (roster.length < 3) throw new Error("the seeded class is too small for these tests");

  f = {
    classGroupId: graded.classGroupId,
    otherClassGroupId: other.id,
    classSubjectId: graded.classSubjectId,
    teacherUserId: teacher.userId,
    adminUserId: admin.id,
    parentUserId: parent.id,
    roster: roster.map((row) => row.studentId),
    termId: term.id,
    otherTermId: otherTerm.id,
  };
});

/**
 * Every bulletin these tests touch is removed, for both classes and both
 * terms. The seed writes none, so this leaves the database as it found it —
 * and running it *after* each test rather than before means a failure never
 * leaves a published class behind to freeze the next file's marks.
 */
/** Set by the one test that edits a seeded mark, so it can put it back. */
let restoreGrade: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (restoreGrade) {
    await restoreGrade();
    restoreGrade = null;
  }
  await db.delete(bulletins).where(inArray(bulletins.termId, [f.termId, f.otherTermId]));
  await db
    .delete(auditLog)
    .where(
      inArray(auditLog.action, ["bulletins.publish", "bulletins.unpublish", "bulletins.review"])
    );
});

afterAll(async () => {
  await db
    .delete(auditLog)
    .where(
      inArray(auditLog.action, ["bulletins.publish", "bulletins.unpublish", "bulletins.review"])
    );
});

async function publishAsAdmin(classGroupId = f.classGroupId, termId = f.termId) {
  signedInAs.userId = f.adminUserId;
  const result = await publishBulletins({ classGroupId, termId });
  if (!result.ok) throw new Error(`publish failed: ${result.error}`);
  return result.data;
}

describe("publishing", () => {
  it("writes one bulletin per enrolled pupil, with a line per subject", async () => {
    const live = await computeClassBulletins(f.classGroupId, f.termId);
    const data = await publishAsAdmin();

    expect(data.published).toBe(f.roster.length);
    expect(data.lines).toBe(f.roster.length * live.subjects.length);

    const stored = await getStoredBulletins(f.classGroupId, f.termId);
    expect(stored).toHaveLength(f.roster.length);
    expect(stored[0]?.lines).toHaveLength(live.subjects.length);
  });

  it("freezes the figures that were live at the moment of publication", async () => {
    const live = await computeClassBulletins(f.classGroupId, f.termId);
    await publishAsAdmin();

    const stored = await getStoredBulletins(f.classGroupId, f.termId);
    for (const bulletin of stored) {
      const computed = live.students.find((row) => row.studentId === bulletin.studentId);
      expect(bulletin.generalAverage).toBe(computed?.generalAverage ?? null);
      expect(bulletin.rank).toBe(computed?.rank ?? null);
      expect(bulletin.classSize).toBe(computed?.classSize ?? null);
      expect(bulletin.absenceCount).toBe(computed?.absenceCount ?? 0);
    }
  });

  it("carries the subject teacher's remark onto the frozen line", async () => {
    const text = "Des progrès constants ce trimestre.";
    signedInAs.userId = f.teacherUserId;
    const saved = await saveAppreciations({
      classSubjectId: f.classSubjectId,
      termId: f.termId,
      entries: [{ studentId: f.roster[0] as string, text }],
    });
    expect(saved).toMatchObject({ ok: true });

    await publishAsAdmin();

    const [subject] = await db
      .select({ id: classSubjects.subjectId })
      .from(classSubjects)
      .where(eq(classSubjects.id, f.classSubjectId));

    const stored = await getStoredBulletins(f.classGroupId, f.termId);
    const line = stored
      .find((row) => row.studentId === f.roster[0])
      ?.lines.find((entry) => entry.subjectId === subject?.id);
    expect(line?.appreciation).toBe(text);

    // Cleaned up here rather than in afterEach: the appreciation belongs to a
    // teacher's sheet, not to the bulletins this file creates.
    await db
      .delete(subjectAppreciations)
      .where(
        and(
          eq(subjectAppreciations.classSubjectId, f.classSubjectId),
          eq(subjectAppreciations.termId, f.termId)
        )
      );
  });

  it("keeps the council's draft remark and decision through publication", async () => {
    signedInAs.userId = f.adminUserId;
    const [first] = f.roster as [string];

    await saveBulletinReview({
      classGroupId: f.classGroupId,
      termId: f.termId,
      entries: [{ studentId: first, appreciation: "Trimestre solide.", decision: "admis" }],
    });
    await publishAsAdmin();

    const stored = await getStoredBulletins(f.classGroupId, f.termId);
    const row = stored.find((entry) => entry.studentId === first);
    // Publication must not blank what the council wrote.
    expect(row?.appreciation).toBe("Trimestre solide.");
    expect(row?.decision).toBe("admis");
  });

  it("REFUSES a second publication while the first stands", async () => {
    await publishAsAdmin();
    signedInAs.userId = f.adminUserId;
    expect(await publishBulletins({ classGroupId: f.classGroupId, termId: f.termId })).toEqual({
      ok: false,
      error: "errors.bulletinPublished",
    });
  });

  it("REFUSES a teacher and a parent", async () => {
    for (const userId of [f.teacherUserId, f.parentUserId]) {
      signedInAs.userId = userId;
      expect(await publishBulletins({ classGroupId: f.classGroupId, termId: f.termId })).toEqual({
        ok: false,
        error: "errors.notAuthorized",
      });
    }
    expect(await isClassTermPublished(f.classGroupId, f.termId)).toBe(false);
  });

  it("records the publication in the audit log", async () => {
    await publishAsAdmin();
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "bulletins.publish"));

    expect(entry?.entityId).toBe(f.classGroupId);
    expect(entry?.payload).toMatchObject({ published: f.roster.length });
  });
});

describe("the freeze", () => {
  it("REFUSES a mark in a published term", async () => {
    const [assessment] = await db
      .select({ id: assessments.id })
      .from(assessments)
      .where(
        and(eq(assessments.classSubjectId, f.classSubjectId), eq(assessments.termId, f.termId))
      )
      .limit(1);
    if (!assessment) throw new Error("the seed produced no assessment for this class+subject");

    await publishAsAdmin();

    signedInAs.userId = f.teacherUserId;
    expect(
      await saveGrades({
        assessmentId: assessment.id,
        entries: [{ studentId: f.roster[0] as string, score: 19, isAbsent: false }],
      })
    ).toEqual({ ok: false, error: "errors.bulletinPublished" });
  });

  it("REFUSES an appreciation in a published term", async () => {
    // The same document, so the same rule. A freeze that covered the figures
    // and left the sentences editable would be a freeze in name only.
    await publishAsAdmin();

    signedInAs.userId = f.teacherUserId;
    expect(
      await saveAppreciations({
        classSubjectId: f.classSubjectId,
        termId: f.termId,
        entries: [{ studentId: f.roster[0] as string, text: "Trop tard." }],
      })
    ).toEqual({ ok: false, error: "errors.bulletinPublished" });
  });

  it("REFUSES editing the council's draft once published", async () => {
    await publishAsAdmin();
    signedInAs.userId = f.adminUserId;
    expect(
      await saveBulletinReview({
        classGroupId: f.classGroupId,
        termId: f.termId,
        entries: [
          { studentId: f.roster[0] as string, appreciation: "Réécriture.", decision: "redouble" },
        ],
      })
    ).toEqual({ ok: false, error: "errors.bulletinPublished" });
  });

  it("leaves the OTHER term of the same class editable", async () => {
    await publishAsAdmin(f.classGroupId, f.termId);
    // Publishing trimestre 1 must not stop a teacher entering trimestre 2.
    await expect(assertTermOpen(f.classGroupId, f.otherTermId)).resolves.toBeUndefined();
  });

  it("leaves the OTHER class of the same term editable", async () => {
    await publishAsAdmin(f.classGroupId, f.termId);
    await expect(assertTermOpen(f.otherClassGroupId, f.termId)).resolves.toBeUndefined();
  });
});

describe("unpublishing", () => {
  it("reopens the term and keeps the frozen figures", async () => {
    await publishAsAdmin();
    const before = await getStoredBulletins(f.classGroupId, f.termId);

    signedInAs.userId = f.adminUserId;
    const result = await unpublishBulletins({
      classGroupId: f.classGroupId,
      termId: f.termId,
      reason: "Une note de français saisie sur la mauvaise colonne.",
    });
    expect(result).toMatchObject({ ok: true });

    // The marks are editable again…
    expect(await isClassTermPublished(f.classGroupId, f.termId)).toBe(false);
    // …and no family can reach the document any more…
    expect(await getStoredBulletins(f.classGroupId, f.termId)).toHaveLength(0);
    expect(await getStudentBulletin(f.roster[0] as string, f.termId)).toBeNull();

    // …but what was handed out is still on file, so the school can answer a
    // parent holding the paper copy.
    const rows = await db
      .select({ generalAverage: bulletins.generalAverage })
      .from(bulletins)
      .where(
        and(
          eq(bulletins.termId, f.termId),
          inArray(
            bulletins.studentId,
            before.map((row) => row.studentId)
          )
        )
      );
    expect(rows).toHaveLength(before.length);

    const [line] = await db
      .select({ id: bulletinLines.id })
      .from(bulletinLines)
      .where(eq(bulletinLines.bulletinId, before[0]?.bulletinId ?? ""));
    expect(line).toBeTruthy();
  });

  it("requires a reason, and records it", async () => {
    await publishAsAdmin();
    signedInAs.userId = f.adminUserId;

    expect(
      await unpublishBulletins({ classGroupId: f.classGroupId, termId: f.termId, reason: "  " })
    ).toMatchObject({ ok: false });

    await unpublishBulletins({
      classGroupId: f.classGroupId,
      termId: f.termId,
      reason: "Erreur de saisie en mathématiques.",
    });

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "bulletins.unpublish"));
    // Unlike an appreciation, the reason IS recorded: it is a statement about
    // the school's paperwork, not about a child.
    expect(JSON.stringify(entry?.payload)).toContain("mathématiques");
  });

  it("REFUSES a teacher", async () => {
    await publishAsAdmin();
    signedInAs.userId = f.teacherUserId;
    expect(
      await unpublishBulletins({
        classGroupId: f.classGroupId,
        termId: f.termId,
        reason: "Je voudrais corriger une note.",
      })
    ).toEqual({ ok: false, error: "errors.notAuthorized" });
    expect(await isClassTermPublished(f.classGroupId, f.termId)).toBe(true);
  });

  it("refuses when nothing was published", async () => {
    signedInAs.userId = f.adminUserId;
    expect(
      await unpublishBulletins({
        classGroupId: f.classGroupId,
        termId: f.otherTermId,
        reason: "Rien à retirer.",
      })
    ).toEqual({ ok: false, error: "errors.notPublished" });
  });

  it("republishes with the corrected figures, without doubling the lines", async () => {
    const [assessment] = await db
      .select({ id: assessments.id })
      .from(assessments)
      .where(
        and(eq(assessments.classSubjectId, f.classSubjectId), eq(assessments.termId, f.termId))
      )
      .limit(1);
    if (!assessment) throw new Error("the seed produced no assessment for this class+subject");

    await publishAsAdmin();
    const first = await getStoredBulletins(f.classGroupId, f.termId);
    const lineCount = first[0]?.lines.length ?? 0;

    signedInAs.userId = f.adminUserId;
    await unpublishBulletins({
      classGroupId: f.classGroupId,
      termId: f.termId,
      reason: "Correction d'une note.",
    });

    // The whole point of unpublishing: the mark can now be fixed. The seeded
    // mark is put back afterwards — this file must not leave the demo data
    // holding a 20 that nobody earned.
    signedInAs.userId = f.teacherUserId;
    const [student] = f.roster as [string];
    const [before] = await db
      .select({ score: grades.score, isAbsent: grades.isAbsent })
      .from(grades)
      .where(and(eq(grades.assessmentId, assessment.id), eq(grades.studentId, student)));

    const corrected = await saveGrades({
      assessmentId: assessment.id,
      entries: [{ studentId: student, score: 20, isAbsent: false }],
    });
    expect(corrected).toMatchObject({ ok: true });

    restoreGrade = async () => {
      if (!before) return;
      await db
        .update(grades)
        .set({ score: before.score, isAbsent: before.isAbsent })
        .where(and(eq(grades.assessmentId, assessment.id), eq(grades.studentId, student)));
    };

    await publishAsAdmin();
    const second = await getStoredBulletins(f.classGroupId, f.termId);

    expect(second).toHaveLength(first.length);
    expect(second[0]?.lines).toHaveLength(lineCount);
    expect(await getPublicationState(f.classGroupId, f.termId)).not.toBeNull();
  });
});

describe("what a family can reach", () => {
  it("gives nothing for a term that was never published", async () => {
    expect(await getStudentBulletin(f.roster[0] as string, f.termId)).toBeNull();
    expect(await getPublicationState(f.classGroupId, f.termId)).toBeNull();
  });

  it("gives nothing for a draft the council has started but not published", async () => {
    signedInAs.userId = f.adminUserId;
    await saveBulletinReview({
      classGroupId: f.classGroupId,
      termId: f.termId,
      entries: [
        {
          studentId: f.roster[0] as string,
          appreciation: "En cours de rédaction.",
          decision: null,
        },
      ],
    });

    // A draft is not a bulletin. A family must never see a half-written one.
    expect(await getStudentBulletin(f.roster[0] as string, f.termId)).toBeNull();
    expect(await getStoredBulletins(f.classGroupId, f.termId)).toHaveLength(0);
  });

  it("gives the pupil's own frozen bulletin once published", async () => {
    await publishAsAdmin();
    const [first] = f.roster as [string];

    const bulletin = await getStudentBulletin(first, f.termId);
    expect(bulletin?.studentId).toBe(first);
    expect(bulletin?.lines.length).toBeGreaterThan(0);
    // Both scripts, for the paperwork the school issues in each (§6).
    const [student] = await db
      .select({ ar: students.firstNameAr })
      .from(students)
      .where(eq(students.id, first));
    expect(bulletin?.firstNameAr).toBe(student?.ar);
  });
});
