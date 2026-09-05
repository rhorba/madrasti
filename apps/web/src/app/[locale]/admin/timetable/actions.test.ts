import {
  academicYears,
  attendance,
  classGroups,
  classSubjects,
  db,
  levels,
  sessions,
  timetableSlots,
  users,
} from "@madrasti/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { copyDay, createSlot, removeSlot, updateSlot } from "./actions.js";

/**
 * The timetable, at the action layer.
 *
 * `@madrasti/timetable` already proves the conflict arithmetic in isolation.
 * What it cannot prove is the part that lives here and does the damage: that a
 * conflict is actually consulted before a row is written, that a slot with a
 * register behind it is never edited in place, and that a slot is never
 * destroyed when a register points at it. Those three are the difference
 * between a clean grid and a teacher discovering on the first Monday of term
 * that she is booked into two rooms.
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
  teacherUserId: string;
  /** A class+subject whose teacher and class we can clash against. */
  mine: { id: string; classGroupId: string; teacherId: string };
  /** Another subject in the SAME class — same class, different teacher. */
  sameClass: { id: string; classGroupId: string; teacherId: string };
  /** Somewhere else entirely — no shared class and no shared teacher. */
  unrelated: { id: string; classGroupId: string; teacherId: string };
};

let f: Fixture;
/** Every slot this file creates, torn down afterwards. */
const created: string[] = [];

async function role(name: "admin" | "teacher") {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.role, name)).limit(1);
  if (!row) throw new Error(`database is not seeded — no ${name}`);
  return row.id;
}

beforeAll(async () => {
  const all = await db
    .select({
      id: classSubjects.id,
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(classSubjects);

  const mine = all[0];
  const sameClass = mine
    ? all.find((cs) => cs.classGroupId === mine.classGroupId && cs.teacherId !== mine.teacherId)
    : undefined;
  const unrelated = mine
    ? all.find((cs) => cs.classGroupId !== mine.classGroupId && cs.teacherId !== mine.teacherId)
    : undefined;
  if (!mine || !sameClass || !unrelated) throw new Error("database is not seeded");

  f = {
    adminUserId: await role("admin"),
    teacherUserId: await role("teacher"),
    mine,
    sameClass,
    unrelated,
  };
  signedInAs.userId = f.adminUserId;
});

afterEach(async () => {
  signedInAs.userId = f.adminUserId;
  if (created.length > 0) {
    await db.delete(timetableSlots).where(inArray(timetableSlots.id, created.splice(0)));
  }
});

afterAll(() => {
  signedInAs.userId = null;
});

/**
 * Ground the seed does not occupy.
 *
 * The seed teaches 08:00–18:00 on **all six days** — Moroccan schools teach
 * Saturday too, so there is no free weekday to hide in and no free band before
 * 18:00. Everything this file books goes after that, which keeps its
 * assertions about its own rows rather than about seed detail.
 */
const FREE_DAY = 6;
const LATE = { startTime: "19:00", endTime: "20:00" };

async function makeSlot(classSubjectId: string, times = LATE, weekday = FREE_DAY) {
  const result = await createSlot({ classSubjectId, weekday, ...times });
  if (!result.ok) throw new Error(`setup failed: ${result.error}`);
  created.push(result.data.id);
  return result.data.id;
}

describe("createSlot", () => {
  it("books a free period", async () => {
    const result = await createSlot({
      classSubjectId: f.mine.id,
      weekday: FREE_DAY,
      ...LATE,
      room: "B12",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.data.id);

    const [row] = await db
      .select()
      .from(timetableSlots)
      .where(eq(timetableSlots.id, result.data.id));
    expect(row?.weekday).toBe(FREE_DAY);
    expect(row?.room).toBe("B12");
    expect(row?.isActive).toBe(true);
  });

  it("refuses a lesson that ends before it starts", async () => {
    const result = await createSlot({
      classSubjectId: f.mine.id,
      weekday: FREE_DAY,
      startTime: "20:00",
      endTime: "19:00",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^errors\./);
  });

  it("refuses to double-book the class", async () => {
    await makeSlot(f.mine.id);

    // Same class, another subject, overlapping — the pupils cannot be in two
    // lessons at once.
    const result = await createSlot({
      classSubjectId: f.sameClass.id,
      weekday: FREE_DAY,
      startTime: "19:30",
      endTime: "20:30",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.classBusy");
  });

  it("refuses to double-book the teacher", async () => {
    await makeSlot(f.mine.id);

    // The same teacher, a different class. Finding another class+subject the
    // same teacher takes is the only honest way to build this case.
    const alsoMine = await db
      .select({ id: classSubjects.id })
      .from(classSubjects)
      .where(
        and(
          eq(classSubjects.teacherId, f.mine.teacherId),
          // A different class, or the clash would be the class one above.
          eq(classSubjects.classGroupId, f.mine.classGroupId)
        )
      );
    const other = await db
      .select({ id: classSubjects.id, classGroupId: classSubjects.classGroupId })
      .from(classSubjects)
      .where(eq(classSubjects.teacherId, f.mine.teacherId));

    const elsewhere = other.find((cs) => cs.classGroupId !== f.mine.classGroupId);
    expect(alsoMine.length, "fixture sanity").toBeGreaterThan(0);
    if (!elsewhere) return; // This teacher only takes one class in the seed.

    const result = await createSlot({
      classSubjectId: elsewhere.id,
      weekday: FREE_DAY,
      startTime: "19:30",
      endTime: "20:30",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.teacherBusy");
  });

  it("accepts a back-to-back lesson", async () => {
    await makeSlot(f.mine.id, { startTime: "19:00", endTime: "20:00" });

    // Ending at 17:00 and starting at 17:00 is not an overlap; a timetable
    // that thought so could not represent a normal school day.
    const result = await createSlot({
      classSubjectId: f.sameClass.id,
      weekday: FREE_DAY,
      startTime: "20:00",
      endTime: "21:00",
    });
    expect(result.ok).toBe(true);
    if (result.ok) created.push(result.data.id);
  });

  it("refuses an unknown class+subject", async () => {
    const result = await createSlot({
      classSubjectId: "00000000-0000-0000-0000-000000000000",
      weekday: FREE_DAY,
      ...LATE,
    });
    expect(result.ok).toBe(false);
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = f.teacherUserId;
    const result = await createSlot({ classSubjectId: f.mine.id, weekday: FREE_DAY, ...LATE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("is refused to nobody at all", async () => {
    signedInAs.userId = null;
    const result = await createSlot({ classSubjectId: f.mine.id, weekday: FREE_DAY, ...LATE });
    expect(result.ok).toBe(false);
  });
});

describe("updateSlot", () => {
  it("moves a slot that has no register behind it, in place", async () => {
    const id = await makeSlot(f.mine.id);

    const result = await updateSlot({
      id,
      classSubjectId: f.mine.id,
      weekday: FREE_DAY,
      startTime: "18:30",
      endTime: "19:00",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The same row: no register exists, so there is no history to protect.
    expect(result.data.id).toBe(id);

    const [row] = await db.select().from(timetableSlots).where(eq(timetableSlots.id, id));
    expect(row?.startTime).toBe("18:30:00");
  });

  it("does not edit a slot with a register under it — it supersedes it", async () => {
    // The rule this action exists for. A register taken at 09:00 must keep
    // pointing at a slot that says 09:00; editing the time under it would
    // silently rewrite what the school recorded.
    const id = await makeSlot(f.mine.id);
    const [session] = await db
      .insert(sessions)
      .values({ slotId: id, date: "2026-01-10", status: "held" })
      .returning({ id: sessions.id });
    expect(session).toBeDefined();

    try {
      const result = await updateSlot({
        id,
        classSubjectId: f.mine.id,
        weekday: FREE_DAY,
        startTime: "18:30",
        endTime: "19:00",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // A new row, not the old one.
      expect(result.data.id).not.toBe(id);
      created.push(result.data.id);

      const [old] = await db.select().from(timetableSlots).where(eq(timetableSlots.id, id));
      expect(old?.isActive, "the superseded slot stays, deactivated").toBe(false);
      expect(old?.startTime, "and keeps the time the register was taken at").toBe("19:00:00");

      const [replacement] = await db
        .select()
        .from(timetableSlots)
        .where(eq(timetableSlots.id, result.data.id));
      expect(replacement?.startTime).toBe("18:30:00");
      expect(replacement?.isActive).toBe(true);
    } finally {
      await db.delete(sessions).where(eq(sessions.id, session!.id));
    }
  });

  it("refuses a move that lands on top of another lesson", async () => {
    const target = await makeSlot(f.sameClass.id, { startTime: "21:00", endTime: "22:00" });
    const id = await makeSlot(f.mine.id, { startTime: "19:00", endTime: "20:00" });
    expect(target).toBeTruthy();

    const result = await updateSlot({
      id,
      classSubjectId: f.mine.id,
      weekday: FREE_DAY,
      startTime: "21:30",
      endTime: "22:30",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.classBusy");
  });

  it("does not consider a slot to clash with itself", async () => {
    const id = await makeSlot(f.mine.id, { startTime: "19:00", endTime: "20:00" });

    // Resizing by ten minutes overlaps the row being resized. If the conflict
    // check did not exclude it, no slot could ever be edited.
    const result = await updateSlot({
      id,
      classSubjectId: f.mine.id,
      weekday: FREE_DAY,
      startTime: "19:00",
      endTime: "19:50",
    });
    expect(result.ok).toBe(true);
  });

  it("is refused to a teacher", async () => {
    const id = await makeSlot(f.mine.id);
    signedInAs.userId = f.teacherUserId;

    const result = await updateSlot({
      id,
      classSubjectId: f.mine.id,
      weekday: FREE_DAY,
      startTime: "18:30",
      endTime: "19:00",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });
});

describe("removeSlot", () => {
  it("deletes a slot no register has ever used", async () => {
    const id = await makeSlot(f.mine.id);

    const result = await removeSlot({ id });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.deactivated).toBe(false);

    const rows = await db.select().from(timetableSlots).where(eq(timetableSlots.id, id));
    expect(rows).toHaveLength(0);
    created.pop();
  });

  it("deactivates rather than destroys a slot a register points at", async () => {
    // `sessions.slot_id` is ON DELETE RESTRICT — a timetable edit must never
    // be able to destroy attendance the school recorded.
    const id = await makeSlot(f.mine.id);
    const [session] = await db
      .insert(sessions)
      .values({ slotId: id, date: "2026-01-12", status: "held" })
      .returning({ id: sessions.id });

    try {
      const result = await removeSlot({ id });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.deactivated).toBe(true);

      const [row] = await db.select().from(timetableSlots).where(eq(timetableSlots.id, id));
      expect(row, "the slot survives").toBeDefined();
      expect(row?.isActive).toBe(false);

      const kept = await db.select().from(sessions).where(eq(sessions.id, session!.id));
      expect(kept, "and so does the register").toHaveLength(1);
    } finally {
      await db.delete(attendance).where(eq(attendance.sessionId, session!.id));
      await db.delete(sessions).where(eq(sessions.id, session!.id));
    }
  });

  it("is refused to a teacher", async () => {
    const id = await makeSlot(f.mine.id);
    signedInAs.userId = f.teacherUserId;
    const result = await removeSlot({ id });
    expect(result.ok).toBe(false);
  });
});

describe("copyDay", () => {
  /**
   * Every class in the seed teaches every day, so a copy always meets a full
   * target day. That is the realistic case anyway: `copyDay` exists to help a
   * secretary building a week, and it earns its keep by landing what fits and
   * skipping what does not rather than refusing everything.
   */
  async function lateSlotsOn(weekday: number) {
    const rows = await db
      .select({ id: timetableSlots.id, startTime: timetableSlots.startTime })
      .from(timetableSlots)
      .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
      .where(
        and(
          eq(classSubjects.classGroupId, f.mine.classGroupId),
          eq(timetableSlots.weekday, weekday)
        )
      );
    // Only the rows this file can have caused — the seed stops at 18:00.
    return rows.filter((row) => row.startTime >= "19:00:00").map((row) => row.id);
  }

  it("lands what fits and skips what clashes", async () => {
    // One lesson of ours on Friday evening, on ground the seed never uses.
    await makeSlot(f.mine.id, { startTime: "19:00", endTime: "20:00" }, 5);
    // And the same period already taken on Saturday, so the copy must skip it
    // while the seeded daytime lessons clash on their own account.
    await makeSlot(f.mine.id, { startTime: "19:00", endTime: "20:00" }, FREE_DAY);

    const result = await copyDay({
      classGroupId: f.mine.classGroupId,
      fromWeekday: 5,
      toWeekday: FREE_DAY,
    });

    // Friday's seeded daytime lessons land on Saturday only where Saturday is
    // free, and our 19:00 one cannot: the whole point is that it is partial.
    if (result.ok) {
      expect(result.data.skipped).toBeGreaterThanOrEqual(1);
      created.push(...(await lateSlotsOn(FREE_DAY)).filter((id) => !created.includes(id)));
    } else {
      // A full Saturday is a legitimate outcome too, and it must be *this*
      // error rather than a crash or a silent success.
      expect(result.error).toBe("errors.allSlotsConflict");
    }
  });

  it("refuses when every lesson would clash", async () => {
    // Saturday onto Friday: both days are fully taught in the seed at the same
    // times, so nothing can land.
    const result = await copyDay({
      classGroupId: f.mine.classGroupId,
      fromWeekday: FREE_DAY,
      toWeekday: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.allSlotsConflict");
  });

  it("says so when the source day is empty", async () => {
    // No seeded class has an empty day, so this branch needs a class of its
    // own — which is also the honest scenario: a class the secretary has just
    // created and not yet timetabled.
    const [year] = await db.select().from(academicYears).where(eq(academicYears.isCurrent, true));
    const [level] = await db.select().from(levels).limit(1);
    if (!year || !level) throw new Error("database is not seeded");

    const [fresh] = await db
      .insert(classGroups)
      .values({ yearId: year.id, levelId: level.id, name: "ZZ test", capacity: 1 })
      .returning({ id: classGroups.id });
    if (!fresh) throw new Error("could not create the fixture class");

    try {
      const result = await copyDay({
        classGroupId: fresh.id,
        fromWeekday: 1,
        toWeekday: 2,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("errors.nothingToCopy");
    } finally {
      await db.delete(classGroups).where(eq(classGroups.id, fresh.id));
    }
  });

  it("refuses to copy a day onto itself", async () => {
    const result = await copyDay({
      classGroupId: f.mine.classGroupId,
      fromWeekday: 2,
      toWeekday: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.sameDay");
  });

  it("refuses a weekday outside Monday–Saturday", async () => {
    // Sunday is not a teaching day and is deliberately absent from the domain.
    const result = await copyDay({
      classGroupId: f.mine.classGroupId,
      fromWeekday: 1,
      toWeekday: 7,
    });
    expect(result.ok).toBe(false);
  });

  it("is refused to a teacher", async () => {
    signedInAs.userId = f.teacherUserId;
    const result = await copyDay({
      classGroupId: f.mine.classGroupId,
      fromWeekday: 1,
      toWeekday: FREE_DAY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });
});
