import { z } from "zod";
import { DEFAULT_GRADING_MAX } from "../constants.js";
import { ASSESSMENT_TYPES } from "../enums.js";
import { dateStringSchema, nonEmptyString, uuidSchema } from "./common.js";

/** Assessments and the marks recorded against them. */

export const assessmentSchema = z.object({
  classSubjectId: uuidSchema,
  termId: uuidSchema,
  title: nonEmptyString(160),
  type: z.enum(ASSESSMENT_TYPES),
  maxScore: z.coerce
    .number()
    .positive({ message: "errors.maxScorePositive" })
    .max(100)
    .default(DEFAULT_GRADING_MAX),
  /** Weights this assessment *within* its subject for the term. */
  coefficient: z.coerce
    .number()
    .positive({ message: "errors.coefficientPositive" })
    .max(10)
    .default(1),
  date: dateStringSchema,
});
export type AssessmentInput = z.infer<typeof assessmentSchema>;

/**
 * Editing an assessment.
 *
 * The class+subject and the term are deliberately absent: moving an assessment
 * to another class would carry its marks with it, and moving it to another term
 * would silently rewrite two bulletins. Those are a delete and a re-create,
 * which is a decision the teacher should have to make out loud.
 */
export const assessmentUpdateSchema = assessmentSchema
  .omit({ classSubjectId: true, termId: true })
  .extend({ id: uuidSchema });
export type AssessmentUpdateInput = z.infer<typeof assessmentUpdateSchema>;

/** Soft-deleting an assessment — see `assessments.deleted_at`. */
export const assessmentIdSchema = z.object({ id: uuidSchema });

/**
 * One student's mark.
 *
 * **Absent is not zero.** A zero is a mark a student earned; an absence is the
 * absence of a mark, and it is excluded from the average entirely. Encoding
 * this as two mutually exclusive states — rather than a nullable score alone —
 * makes the distinction impossible to lose, and it is mirrored by a CHECK
 * constraint in the database (`CLAUDE.md` §6).
 */
export const gradeEntrySchema = z
  .object({
    studentId: uuidSchema,
    score: z.coerce.number().min(0, { message: "errors.scoreNegative" }).nullable(),
    isAbsent: z.boolean().default(false),
    comment: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isAbsent && value.score !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "errors.absentCannotHaveScore",
      });
    }
    if (!value.isAbsent && value.score === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "errors.scoreRequired",
      });
    }
  });
export type GradeEntry = z.infer<typeof gradeEntrySchema>;

/**
 * A whole class's marks for one assessment.
 *
 * `maxScore` is carried so the upper bound can be checked against *this*
 * assessment — a row-level CHECK cannot reach another table, so the ceiling is
 * enforced here and in the action (`docs/database-madrasti.md` §4).
 *
 * Note the bound is checked but marks above it are *warned*, not rejected: a
 * bonus mark above the maximum is a real thing teachers do. The action decides;
 * this schema refuses only what is nonsensical.
 */
export const saveGradesSchema = z.object({
  assessmentId: uuidSchema,
  entries: z.array(gradeEntrySchema).min(1, { message: "errors.noGrades" }),
});
export type SaveGradesInput = z.infer<typeof saveGradesSchema>;

/** True when a mark exceeds its assessment's maximum — surfaced as a warning. */
export function isAboveMax(score: number | null, maxScore: number): boolean {
  return score !== null && score > maxScore;
}
