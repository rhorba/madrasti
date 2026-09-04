import { z } from "zod";
import { DEFAULT_GRADING_MAX, TERMS_PER_YEAR } from "../constants.js";
import {
  dateStringSchema,
  localeSchema,
  nonEmptyString,
  trilingualLabelSchema,
  trilingualNameSchema,
  uuidSchema,
  withOrderedDates,
} from "./common.js";

/** Academic structure: year, terms, levels, classes, subjects, assignments of teachers. */

export const academicYearSchema = withOrderedDates(
  z.object({
    label: nonEmptyString(20).regex(/^\d{4}-\d{4}$/, { message: "errors.invalidYearLabel" }),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
);
export type AcademicYearInput = z.infer<typeof academicYearSchema>;

export const termSchema = withOrderedDates(
  trilingualLabelSchema.extend({
    yearId: uuidSchema,
    order: z.coerce.number().int().min(1).max(TERMS_PER_YEAR),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
);
export type TermInput = z.infer<typeof termSchema>;

export const levelSchema = trilingualNameSchema.extend({
  order: z.coerce.number().int().min(1).max(20),
});
export type LevelInput = z.infer<typeof levelSchema>;

export const subjectSchema = trilingualNameSchema.extend({
  code: nonEmptyString(20).regex(/^[A-Z0-9_]+$/, { message: "errors.invalidCode" }),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, { message: "errors.invalidColor" })
    .default("#2F6B43"),
});
export type SubjectInput = z.infer<typeof subjectSchema>;

export const classGroupSchema = z.object({
  yearId: uuidSchema,
  levelId: uuidSchema,
  name: nonEmptyString(60),
  mainTeacherId: uuidSchema.nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(80).default(35),
});
export type ClassGroupInput = z.infer<typeof classGroupSchema>;

/**
 * Teaching assignment for one subject in one class — and the coefficient.
 *
 * The coefficient belongs here, not on `subject`. Mathematics is coefficient 4
 * in collège and 2 in some primaire levels; a school-wide value would silently
 * mis-weight every bulletin at every other level. This is the highest-
 * consequence modelling decision in the schema (`docs/database-madrasti.md`).
 */
export const classSubjectSchema = z.object({
  classGroupId: uuidSchema,
  subjectId: uuidSchema,
  teacherId: uuidSchema,
  coefficient: z.coerce
    .number()
    .positive({ message: "errors.coefficientPositive" })
    .max(10)
    .default(1),
});
export type ClassSubjectInput = z.infer<typeof classSubjectSchema>;

export const enrolmentSchema = z.object({
  studentId: uuidSchema,
  classGroupId: uuidSchema,
  yearId: uuidSchema,
  enrolledOn: dateStringSchema,
});
export type EnrolmentInput = z.infer<typeof enrolmentSchema>;

export const schoolSettingsSchema = trilingualNameSchema.extend({
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional(),
  defaultLocale: localeSchema.default("fr"),
  gradingMax: z.coerce.number().positive().max(100).default(DEFAULT_GRADING_MAX),
});
export type SchoolSettingsInput = z.infer<typeof schoolSettingsSchema>;
