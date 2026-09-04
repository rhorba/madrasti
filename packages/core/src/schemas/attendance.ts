import { z } from "zod";
import { ATTENDANCE_STATUSES } from "../enums.js";
import { dateStringSchema, uuidSchema } from "./common.js";

/** Attendance is taken per session (per subject-hour), not per day. */

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

export const attendanceMarkSchema = z
  .object({
    studentId: uuidSchema,
    status: attendanceStatusSchema,
    minutesLate: z.coerce.number().int().min(1).max(240).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    // Mirrors the database CHECK. Minutes only mean something for `late`, and
    // allowing them elsewhere would produce absence reports nobody can explain.
    if (value.minutesLate != null && value.status !== "late") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minutesLate"],
        message: "errors.minutesLateOnlyForLate",
      });
    }
  });
export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;

/**
 * A whole register, saved in one action.
 *
 * The teacher marks the class and saves once — there is no per-row autosave
 * (`docs/ux-madrasti.md` §3.5), so the action receives every student at once
 * and upserts them in a single transaction.
 */
export const saveAttendanceSchema = z.object({
  slotId: uuidSchema,
  date: dateStringSchema,
  marks: z.array(attendanceMarkSchema).min(1, { message: "errors.emptyRegister" }),
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;

export const attendanceHistoryQuerySchema = z.object({
  studentId: uuidSchema,
  termId: uuidSchema.optional(),
});
