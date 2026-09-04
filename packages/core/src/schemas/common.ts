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

/** `YYYY-MM-DD`. Postgres `date` columns; no timezone involved. */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.invalidDate" })
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "errors.invalidDate" });

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

/** Moroccan numbers, tolerant of the ways people actually type them. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+212|0)[\s.-]?[5-7](\d[\s.-]?){8}$/, { message: "errors.invalidPhone" });

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
