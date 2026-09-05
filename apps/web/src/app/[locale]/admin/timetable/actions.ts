"use server";

import { defineAction } from "@/lib/action";
import { timetableSlotSchema, updateTimetableSlotSchema, uuidSchema } from "@madrasti/core";
import { classSubjects, db, sessions, timetableSlots } from "@madrasti/db";
import {
  type Conflict,
  type SlotLike,
  blockingConflicts,
  findConflicts,
  validateSlot,
} from "@madrasti/timetable";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Timetable slots.
 *
 * Conflict detection runs **inside the transaction that writes**, against rows
 * locked for the duration. Checking first and writing after leaves a window in
 * which two admins each see a free period and both book it — unlikely with one
 * secretary, but the failure is a teacher scheduled in two rooms, discovered on
 * the first Monday of term (`docs/database-madrasti.md` §3).
 */

type ConflictError = Error & { conflicts?: Conflict[] };

function conflictError(conflicts: Conflict[]): ConflictError {
  const kinds = [...new Set(conflicts.map((c) => c.kind))];
  const error = new Error(
    kinds.includes("teacher") ? "errors.teacherBusy" : "errors.classBusy"
  ) as ConflictError;
  error.conflicts = conflicts;
  return error;
}

/**
 * Lock the slots that could clash, then read them.
 *
 * `FOR UPDATE` on the joined `class_subjects` rows serialises concurrent
 * writes touching the same teacher or class, which is exactly the set that can
 * conflict.
 */
async function lockAndReadSlots(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<SlotLike[]> {
  const rows = await tx
    .select({
      id: timetableSlots.id,
      weekday: timetableSlots.weekday,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      room: timetableSlots.room,
      teacherId: classSubjects.teacherId,
      classGroupId: classSubjects.classGroupId,
    })
    .from(timetableSlots)
    .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
    .where(eq(timetableSlots.isActive, true))
    .for("update", { of: timetableSlots });

  return rows;
}

async function partiesFor(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  classSubjectId: string
) {
  const [row] = await tx
    .select({
      classGroupId: classSubjects.classGroupId,
      teacherId: classSubjects.teacherId,
    })
    .from(classSubjects)
    .where(eq(classSubjects.id, classSubjectId))
    .limit(1);
  if (!row) throw new Error("errors.notFound");
  return row;
}

export const createSlot = defineAction({
  roles: ["admin"],
  schema: timetableSlotSchema,
  handler: async (input) => {
    const issue = validateSlot(input);
    if (issue) throw new Error(issue.code);

    const id = await db.transaction(async (tx) => {
      const parties = await partiesFor(tx, input.classSubjectId);
      const existing = await lockAndReadSlots(tx);

      const conflicts = findConflicts(
        {
          weekday: input.weekday,
          startTime: input.startTime,
          endTime: input.endTime,
          room: input.room ?? null,
          ...parties,
        },
        existing
      );

      const blocking = blockingConflicts(conflicts);
      if (blocking.length > 0) throw conflictError(blocking);

      const [row] = await tx
        .insert(timetableSlots)
        .values({
          classSubjectId: input.classSubjectId,
          weekday: input.weekday,
          startTime: input.startTime,
          endTime: input.endTime,
          room: input.room ?? null,
        })
        .returning({ id: timetableSlots.id });

      if (!row) throw new Error("insert failed");
      return row.id;
    });

    return { id };
  },
  audit: (input, data) => ({
    action: "slot.create",
    entity: "timetable_slots",
    entityId: data.id,
    payload: { weekday: input.weekday, startTime: input.startTime, endTime: input.endTime },
  }),
  revalidate: () => ["/admin/timetable"],
});

/**
 * Move or resize a slot.
 *
 * A slot with sessions already recorded against it is **not** edited in place:
 * the old row is deactivated and a new one created, so a register taken at
 * 09:00 keeps pointing at a slot that says 09:00. Editing the time under it
 * would silently rewrite history (`docs/system-design-madrasti.md` §2).
 */
export const updateSlot = defineAction({
  roles: ["admin"],
  schema: updateTimetableSlotSchema,
  handler: async (input) => {
    const issue = validateSlot(input);
    if (issue) throw new Error(issue.code);

    const id = await db.transaction(async (tx) => {
      const parties = await partiesFor(tx, input.classSubjectId);
      const existing = await lockAndReadSlots(tx);

      const conflicts = findConflicts(
        {
          id: input.id,
          weekday: input.weekday,
          startTime: input.startTime,
          endTime: input.endTime,
          room: input.room ?? null,
          ...parties,
        },
        existing
      );

      const blocking = blockingConflicts(conflicts);
      if (blocking.length > 0) throw conflictError(blocking);

      const [{ count } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sessions)
        .where(eq(sessions.slotId, input.id));

      if (count > 0) {
        // History exists: close the old slot and open a replacement.
        await tx
          .update(timetableSlots)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(timetableSlots.id, input.id));

        const [row] = await tx
          .insert(timetableSlots)
          .values({
            classSubjectId: input.classSubjectId,
            weekday: input.weekday,
            startTime: input.startTime,
            endTime: input.endTime,
            room: input.room ?? null,
          })
          .returning({ id: timetableSlots.id });

        if (!row) throw new Error("insert failed");
        return row.id;
      }

      await tx
        .update(timetableSlots)
        .set({
          weekday: input.weekday,
          startTime: input.startTime,
          endTime: input.endTime,
          room: input.room ?? null,
          updatedAt: new Date(),
        })
        .where(eq(timetableSlots.id, input.id));

      return input.id;
    });

    return { id };
  },
  audit: (input, data) => ({
    action: "slot.update",
    entity: "timetable_slots",
    entityId: data.id,
    payload: { weekday: input.weekday, startTime: input.startTime, endTime: input.endTime },
  }),
  revalidate: () => ["/admin/timetable"],
});

/**
 * Remove a slot.
 *
 * Deleted outright only while no register has ever been taken against it;
 * otherwise deactivated, because `sessions.slot_id` is `ON DELETE RESTRICT`
 * and a register must never be destroyed by a timetable edit.
 */
export const removeSlot = defineAction({
  roles: ["admin"],
  schema: z.object({ id: uuidSchema }),
  handler: async ({ id }) => {
    const deactivated = await db.transaction(async (tx) => {
      const [{ count } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sessions)
        .where(eq(sessions.slotId, id));

      if (count > 0) {
        await tx
          .update(timetableSlots)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(timetableSlots.id, id));
        return true;
      }

      await tx.delete(timetableSlots).where(eq(timetableSlots.id, id));
      return false;
    });

    return { id, deactivated };
  },
  audit: (_input, data) => ({
    action: data.deactivated ? "slot.deactivate" : "slot.delete",
    entity: "timetable_slots",
    entityId: data.id,
  }),
  revalidate: () => ["/admin/timetable"],
});

/** Copy one day's slots onto another day — the fastest way to build a week. */
export const copyDay = defineAction({
  roles: ["admin"],
  schema: z.object({
    classGroupId: uuidSchema,
    fromWeekday: z.coerce.number().int().min(1).max(6),
    toWeekday: z.coerce.number().int().min(1).max(6),
  }),
  handler: async ({ classGroupId, fromWeekday, toWeekday }) => {
    if (fromWeekday === toWeekday) throw new Error("errors.sameDay");

    const copied = await db.transaction(async (tx) => {
      const source = await tx
        .select({
          classSubjectId: timetableSlots.classSubjectId,
          startTime: timetableSlots.startTime,
          endTime: timetableSlots.endTime,
          room: timetableSlots.room,
          teacherId: classSubjects.teacherId,
          classGroupId: classSubjects.classGroupId,
        })
        .from(timetableSlots)
        .innerJoin(classSubjects, eq(classSubjects.id, timetableSlots.classSubjectId))
        .where(
          and(
            eq(timetableSlots.isActive, true),
            eq(classSubjects.classGroupId, classGroupId),
            eq(timetableSlots.weekday, fromWeekday)
          )
        );

      if (source.length === 0) throw new Error("errors.nothingToCopy");

      const existing = await lockAndReadSlots(tx);
      const accepted: typeof source = [];

      // Skip what would clash rather than refusing the whole copy: a teacher
      // busy on Wednesday should not stop the other five lessons from landing.
      for (const slot of source) {
        const candidate = {
          weekday: toWeekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: slot.room,
          teacherId: slot.teacherId,
          classGroupId: slot.classGroupId,
        };
        const blocking = blockingConflicts(
          findConflicts(candidate, [
            ...existing,
            ...accepted.map((a) => ({ ...a, weekday: toWeekday })),
          ])
        );
        if (blocking.length === 0) accepted.push(slot);
      }

      if (accepted.length === 0) throw new Error("errors.allSlotsConflict");

      await tx.insert(timetableSlots).values(
        accepted.map((slot) => ({
          classSubjectId: slot.classSubjectId,
          weekday: toWeekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: slot.room,
        }))
      );

      return { copied: accepted.length, skipped: source.length - accepted.length };
    });

    return copied;
  },
  audit: (input, data) => ({
    action: "slot.copy_day",
    entity: "timetable_slots",
    payload: { from: input.fromWeekday, to: input.toWeekday, ...data },
  }),
  revalidate: () => ["/admin/timetable"],
});
