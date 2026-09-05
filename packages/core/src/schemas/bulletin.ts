import { z } from "zod";
import { APPRECIATION_MAX_LENGTH } from "../constants.js";
import { uuidSchema } from "./common.js";

/** The bulletin's written parts — the per-subject appreciations. */

/**
 * One teacher's remark about one pupil in one subject.
 *
 * **Empty is a value, not a validation failure.** A teacher who clears a
 * remark she has changed her mind about is saying "no remark", and the action
 * removes the row rather than storing an empty string. That is why `text` has
 * no `min(1)` here and the database has a CHECK instead: the schema accepts
 * the erasure, and the storage layer refuses to keep the blank.
 *
 * The text is **not** translated and never will be — see `.logs/decisions.md`
 * (2026-09-05). It is a professional judgement about a named child, written in
 * whatever language the teacher teaches in, and it prints as written on a
 * bulletin in any of the three locales.
 */
export const appreciationEntrySchema = z.object({
  studentId: uuidSchema,
  text: z.string().trim().max(APPRECIATION_MAX_LENGTH, { message: "errors.appreciationTooLong" }),
});
export type AppreciationEntry = z.infer<typeof appreciationEntrySchema>;

/**
 * A whole class's remarks for one subject in one term.
 *
 * Saved as a sheet, like the mark sheet, because that is how a teacher writes
 * them: in one sitting, down the register, comparing one pupil against the
 * next. One action for entering and for correcting, so there is no second code
 * path to get subtly wrong.
 */
export const saveAppreciationsSchema = z.object({
  classSubjectId: uuidSchema,
  termId: uuidSchema,
  entries: z.array(appreciationEntrySchema).min(1, { message: "errors.noAppreciations" }),
});
export type SaveAppreciationsInput = z.infer<typeof saveAppreciationsSchema>;
