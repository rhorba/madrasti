import { assignments, classSubjects, db, teachers, users } from "@madrasti/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  attachmentLimits,
  createAssignment,
  deleteAssignment,
  getAttachmentUrl,
  requestAttachmentUpload,
  updateAssignment,
} from "./actions.js";

/**
 * Homework.
 *
 * The simplest module in the product, so the tests are about the two things
 * that are not simple: **who may post against a class** — the same rule as a
 * mark, because homework appears on a family's screen under a teacher's name —
 * and the attachment, which is the only place the product hands out a URL to a
 * private file.
 *
 * There is deliberately no submission flow to test: homework is handed in on
 * paper in v1 (`CLAUDE.md` §3C).
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
  adminUserId: string;
  /** The teacher who takes `mine`. */
  teacherUserId: string;
  /** A teacher who does not take it. */
  otherTeacherUserId: string;
  parentUserId: string;
  mine: string;
  /** A class+subject the first teacher does not take. */
  foreign: string;
};

let f: Fixture;
const trash: string[] = [];

beforeAll(async () => {
  const all = await db
    .select({
      id: classSubjects.id,
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(classSubjects);

  const mine = all[0];
  const foreign = mine ? all.find((cs) => cs.teacherId !== mine.teacherId) : undefined;
  if (!mine || !foreign) throw new Error("database is not seeded — run `pnpm db:setup`");

  const teacherRows = await db
    .select({ id: teachers.id, userId: teachers.userId })
    .from(teachers)
    .where(inArray(teachers.id, [mine.teacherId, foreign.teacherId]));

  const mineUser = teacherRows.find((row) => row.id === mine.teacherId)?.userId;
  const otherUser = teacherRows.find((row) => row.id === foreign.teacherId)?.userId;
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  const [parent] = await db.select({ id: users.id }).from(users).where(eq(users.role, "parent"));
  if (!mineUser || !otherUser || !admin || !parent) throw new Error("database is not seeded");

  f = {
    adminUserId: admin.id,
    teacherUserId: mineUser,
    otherTeacherUserId: otherUser,
    parentUserId: parent.id,
    mine: mine.id,
    foreign: foreign.id,
  };
  signedInAs.userId = f.teacherUserId;
});

afterEach(async () => {
  signedInAs.userId = f.teacherUserId;
  if (trash.length) await db.delete(assignments).where(inArray(assignments.id, trash.splice(0)));
});

afterAll(() => {
  signedInAs.userId = null;
});

function newHomework(classSubjectId: string) {
  return {
    classSubjectId,
    title: "Exercices 12 à 18",
    description: "Cahier page 44.",
    assignedOn: "2026-01-12",
    dueOn: "2026-01-15",
  };
}

describe("posting homework", () => {
  it("posts it against a class the teacher takes", async () => {
    const result = await createAssignment(newHomework(f.mine));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    trash.push(result.data.id);

    const [row] = await db.select().from(assignments).where(eq(assignments.id, result.data.id));
    expect(row?.title).toBe("Exercices 12 à 18");
    expect(row?.dueOn).toBe("2026-01-15");
  });

  it("accepts homework with no description — a title is often the whole of it", async () => {
    const result = await createAssignment({
      classSubjectId: f.mine,
      title: "Réviser la leçon",
      assignedOn: "2026-01-12",
      dueOn: "2026-01-13",
    });
    expect(result.ok).toBe(true);
    if (result.ok) trash.push(result.data.id);
  });

  it("accepts homework due the day it is set", async () => {
    const result = await createAssignment({
      ...newHomework(f.mine),
      assignedOn: "2026-01-12",
      dueOn: "2026-01-12",
    });
    expect(result.ok).toBe(true);
    if (result.ok) trash.push(result.data.id);
  });

  it("refuses homework due before it was set", async () => {
    const result = await createAssignment({
      ...newHomework(f.mine),
      assignedOn: "2026-01-15",
      dueOn: "2026-01-12",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.dueBeforeAssigned");
  });

  it("refuses homework with no title", async () => {
    const result = await createAssignment({ ...newHomework(f.mine), title: "   " });
    expect(result.ok).toBe(false);
  });

  it("refuses a date that does not exist", async () => {
    const result = await createAssignment({ ...newHomework(f.mine), dueOn: "2026-02-30" });
    expect(result.ok).toBe(false);
  });

  it("refuses a teacher posting against a class they do not take", async () => {
    // The rule that matters: homework shows on a family's screen under a
    // teacher's name, so the author must be the teacher of that class.
    const result = await createAssignment(newHomework(f.foreign));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("lets an admin post for any class", async () => {
    signedInAs.userId = f.adminUserId;
    const result = await createAssignment(newHomework(f.foreign));
    expect(result.ok).toBe(true);
    if (result.ok) trash.push(result.data.id);
  });

  it("is refused to a parent", async () => {
    signedInAs.userId = f.parentUserId;
    const result = await createAssignment(newHomework(f.mine));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("is refused to nobody at all", async () => {
    signedInAs.userId = null;
    const result = await createAssignment(newHomework(f.mine));
    expect(result.ok).toBe(false);
  });
});

describe("editing and withdrawing homework", () => {
  it("edits it", async () => {
    const created = await createAssignment(newHomework(f.mine));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.push(created.data.id);

    const result = await updateAssignment({
      id: created.data.id,
      classSubjectId: f.mine,
      title: "Exercices 12 à 20",
      assignedOn: "2026-01-12",
      dueOn: "2026-01-16",
    });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(assignments).where(eq(assignments.id, created.data.id));
    expect(row?.title).toBe("Exercices 12 à 20");
    expect(row?.dueOn).toBe("2026-01-16");
  });

  it("withdraws it without destroying the record", async () => {
    // §10.5: nothing hard-deletes. A family who saw the homework should be
    // able to be told what happened to it.
    const created = await createAssignment(newHomework(f.mine));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.push(created.data.id);

    const result = await deleteAssignment({ id: created.data.id });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(assignments).where(eq(assignments.id, created.data.id));
    expect(row, "the row survives").toBeDefined();
    expect(row?.deletedAt).not.toBeNull();
  });

  it("refuses another teacher's homework", async () => {
    const created = await createAssignment(newHomework(f.mine));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.push(created.data.id);

    signedInAs.userId = f.otherTeacherUserId;
    const edited = await updateAssignment({
      id: created.data.id,
      classSubjectId: f.mine,
      title: "Détourné",
      assignedOn: "2026-01-12",
      dueOn: "2026-01-16",
    });
    expect(edited.ok).toBe(false);

    const removed = await deleteAssignment({ id: created.data.id });
    expect(removed.ok).toBe(false);
  });

  it("refuses an id that is not a uuid", async () => {
    const result = await deleteAssignment({ id: "not-a-uuid" });
    expect(result.ok).toBe(false);
  });

  it("refuses homework that does not exist", async () => {
    const result = await deleteAssignment({ id: "00000000-0000-0000-0000-000000000000" });
    expect(result.ok).toBe(false);
  });
});

describe("attachments", () => {
  it("tells the client the ceiling, so a file is rejected before it uploads", async () => {
    const limits = await attachmentLimits();
    expect(limits.maxBytes).toBeGreaterThan(0);
    expect(typeof limits.enabled).toBe("boolean");
  });

  it("refuses a file type that is not on the list", async () => {
    const result = await requestAttachmentUpload({
      classSubjectId: f.mine,
      contentType: "application/x-msdownload" as never,
      contentLength: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.attachmentType");
  });

  it("refuses an empty file and one that is too large", async () => {
    const empty = await requestAttachmentUpload({
      classSubjectId: f.mine,
      contentType: "application/pdf",
      contentLength: 0,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe("errors.attachmentEmpty");

    const huge = await requestAttachmentUpload({
      classSubjectId: f.mine,
      contentType: "application/pdf",
      contentLength: 500 * 1024 * 1024,
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toBe("errors.attachmentTooLarge");
  });

  it("refuses an upload against a class the teacher does not take", async () => {
    const result = await requestAttachmentUpload({
      classSubjectId: f.foreign,
      contentType: "application/pdf",
      contentLength: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("refuses a link to homework that has no attachment", async () => {
    // Not "here is a URL to nothing": the caller is told no.
    const created = await createAssignment(newHomework(f.mine));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.push(created.data.id);

    const result = await getAttachmentUrl({ id: created.data.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("refuses a link to another class's attachment", async () => {
    // The check is on the class the homework belongs to, not merely on being
    // signed in — an attachment is a private file about a class.
    const created = await createAssignment(newHomework(f.mine));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    trash.push(created.data.id);

    await db
      .update(assignments)
      .set({ attachmentKey: "homework/fake-key.pdf" })
      .where(eq(assignments.id, created.data.id));

    signedInAs.userId = f.otherTeacherUserId;
    const result = await getAttachmentUrl({ id: created.data.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("is refused to nobody at all", async () => {
    signedInAs.userId = null;
    const result = await requestAttachmentUpload({
      classSubjectId: f.mine,
      contentType: "application/pdf",
      contentLength: 1000,
    });
    expect(result.ok).toBe(false);
  });
});
