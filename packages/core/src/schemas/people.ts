import { z } from "zod";
import { MASSAR_CODE_MAX_LENGTH, MASSAR_CODE_PATTERN } from "../constants.js";
import { GENDERS, GUARDIAN_RELATIONS, STUDENT_STATUSES } from "../enums.js";
import {
  bilingualNameSchema,
  dateStringSchema,
  emailSchema,
  phoneSchema,
  uuidSchema,
} from "./common.js";

/** Students, guardians, teachers. */

/**
 * The Moroccan national student code. Optional: a newly-arrived student may not
 * have one yet, and the school should not be blocked from enrolling them.
 * Unique when present.
 */
export const massarCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(MASSAR_CODE_MAX_LENGTH)
  .regex(MASSAR_CODE_PATTERN, { message: "errors.invalidMassarCode" });

export const studentSchema = bilingualNameSchema.extend({
  massarCode: massarCodeSchema.nullable().optional(),
  birthDate: dateStringSchema,
  gender: z.enum(GENDERS),
  status: z.enum(STUDENT_STATUSES).default("active"),
  enrolledAt: dateStringSchema,
});
export type StudentInput = z.infer<typeof studentSchema>;

export const updateStudentSchema = studentSchema.partial().extend({ id: uuidSchema });

export const guardianSchema = bilingualNameSchema.extend({
  // Required: the school must be able to reach a guardian, and in Morocco that
  // means a phone. Email is optional because many families do not use one.
  phone: phoneSchema,
  email: emailSchema.optional(),
  relation: z.enum(GUARDIAN_RELATIONS),
});
export type GuardianInput = z.infer<typeof guardianSchema>;

export const linkGuardianSchema = z.object({
  studentId: uuidSchema,
  guardianId: uuidSchema,
  isPrimary: z.boolean().default(false),
});

export const teacherSchema = bilingualNameSchema.extend({
  phone: phoneSchema.optional(),
});
export type TeacherInput = z.infer<typeof teacherSchema>;
