import { z } from "zod";
import { WEEKDAY_MAX, WEEKDAY_MIN } from "../enums.js";
import { dateStringSchema, timeStringSchema, uuidSchema } from "./common.js";

/** Timetable slots and the sessions materialised from them. */

export const weekdaySchema = z.coerce
  .number()
  .int()
  .min(WEEKDAY_MIN, { message: "errors.invalidWeekday" })
  .max(WEEKDAY_MAX, { message: "errors.invalidWeekday" });

export const timetableSlotSchema = z
  .object({
    classSubjectId: uuidSchema,
    weekday: weekdaySchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    room: z.string().trim().max(40).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "errors.endBeforeStart",
      });
    }
  });
export type TimetableSlotInput = z.infer<typeof timetableSlotSchema>;

export const updateTimetableSlotSchema = z.object({
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
