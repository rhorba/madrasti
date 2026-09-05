import { z } from "zod";
import { WEEKDAY_MAX, WEEKDAY_MIN } from "../enums.js";
import { dateStringSchema, timeStringSchema, uuidSchema } from "./common.js";

/** Timetable slots and the sessions materialised from them. */

export const weekdaySchema = z.coerce
  .number()
  .int()
  .min(WEEKDAY_MIN, { message: "errors.invalidWeekday" })
  .max(WEEKDAY_MAX, { message: "errors.invalidWeekday" });

/**
 * The fields of a slot, before the ordering rule is applied.
 *
 * Kept separate because `.superRefine` produces a `ZodEffects`, which cannot be
 * `.extend()`ed — so an "update" variant that adds an `id` has to be built from
 * the plain object and re-refined, not from the refined schema.
 */
const timetableSlotFields = z.object({
  classSubjectId: uuidSchema,
  weekday: weekdaySchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  room: z.string().trim().max(40).nullable().optional(),
});

/** End must be strictly after start; the error attaches to `endTime`. */
function withOrderedTimes<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: { startTime: string; endTime: string }, ctx) => {
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "errors.endBeforeStart",
      });
    }
  });
}

export const timetableSlotSchema = withOrderedTimes(timetableSlotFields);
export type TimetableSlotInput = z.infer<typeof timetableSlotSchema>;

export const updateTimetableSlotSchema = withOrderedTimes(
  timetableSlotFields.extend({ id: uuidSchema })
);
export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;

/** Just the room, for a quick inline edit that cannot change the timing. */
export const slotRoomSchema = z.object({
  id: uuidSchema,
  room: z.string().trim().max(40).nullable().optional(),
});

/**
 * Open (and lazily create) the session for a slot on a date.
 *
 * Sessions are materialised on first open rather than pre-generated for the
 * year — see `docs/system-design-madrasti.md` §2 for why.
 */
export const openSessionSchema = z.object({
  slotId: uuidSchema,
  date: dateStringSchema,
});
export type OpenSessionInput = z.infer<typeof openSessionSchema>;

export const cancelSessionSchema = z.object({
  sessionId: uuidSchema,
  note: z.string().trim().max(300).optional(),
});
