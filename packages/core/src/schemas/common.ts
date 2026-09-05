import { z } from "zod";
import { LOCALES } from "../enums.js";

/**
 * Shared primitives.
 *
 * Error messages are **translation keys**, not sentences. The UI resolves them
 * in the user's language — a raw Zod message must never reach a teacher
 * (`CLAUDE.md` §10.6).
 */

export const uuidSchema = z.string().uuid({ message: "errors.invalidId" });

export const localeSchema = z.enum(LOCALES);

/**
 * True only for a date that exists in the calendar.
 *
 * `Date.parse` is not enough and was the original bug here: it *rolls over*
 * rather than refusing, so `2026-02-31` parsed happily as 3 March and
 * `2025-02-29` as 1 March. A birth date or an enrolment date typed one digit
 * wrong was accepted and silently stored as a different day. The round trip
 * through UTC is what actually rejects it.
 */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** `YYYY-MM-DD`. Postgres `date` columns; no timezone involved. */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.invalidDate" })
  .refine(isRealCalendarDate, { message: "errors.invalidDate" });

/** `HH:MM` or `HH:MM:SS`, 24-hour. Postgres `time` columns. */
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: "errors.invalidTime" });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "errors.invalidEmail" })
  .max(255);

/**
 * Moroccan numbers, tolerant of the ways people actually type them.
 *
 * Separators are stripped before validation rather than woven into the
 * pattern. The pattern that tried to do both accepted only `0612345678` and
 * `+212612345678` and refused `06 12 34 56 78` — which is how the number is
 * written on every form in the country. A guardian's phone is required, so
 * that refusal stopped a secretary enrolling a pupil.
 *
 * The stripped form is what is stored: two secretaries typing the same number
 * differently must not produce two different rows.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s.()-]/g, ""))
  .refine((v) => /^(\+212|0)[5-7]\d{8}$/.test(v), { message: "errors.invalidPhone" });

export const nonEmptyString = (max: number) => z.string().trim().min(1, "errors.required").max(max);

/**
 * A name captured in both scripts.
 *
 * Both are required. Moroccan school paperwork — bulletins, Massar exports,
 * official lists — is issued in Arabic *and* French, and a proper noun cannot
 * be machine-translated at render time (`CLAUDE.md` §6).
 */
export const bilingualNameSchema = z.object({
  firstNameFr: nonEmptyString(100),
  lastNameFr: nonEmptyString(100),
  firstNameAr: nonEmptyString(100),
  lastNameAr: nonEmptyString(100),
});

/** A label in all three UI languages. Used for terms, levels, subjects. */
export const trilingualLabelSchema = z.object({
  labelFr: nonEmptyString(120),
  labelAr: nonEmptyString(120),
  labelEn: nonEmptyString(120),
});

export const trilingualNameSchema = z.object({
  nameFr: nonEmptyString(120),
  nameAr: nonEmptyString(120),
  nameEn: nonEmptyString(120),
});

/**
 * A closed date range. Applied with `.superRefine` so the error attaches to
 * `endDate` rather than to the object as a whole.
 */
export function withOrderedDates<T extends { startDate: string; endDate: string }>(
  schema: z.ZodType<T>
) {
  return schema.superRefine((value, ctx) => {
    if (value.endDate <= value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "errors.endBeforeStart",
      });
    }
  });
}

/** Discriminated result returned by every server action (architecture §4). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
