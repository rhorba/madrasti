import { z } from "zod";
import { APPRECIATION_MAX_LENGTH } from "../constants.js";
import { BULLETIN_DECISIONS } from "../enums.js";
import { nonEmptyString, uuidSchema } from "./common.js";

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

/**
 * The head teacher's overall remark and the council's decision.
 *
 * These belong to the bulletin as a whole rather than to a subject, and they
 * are the admin's to write — a subject teacher writes about their subject.
 * Both are optional: a school that does not record a decision leaves the line
 * off the printed sheet rather than printing an empty label.
 */
export const bulletinReviewEntrySchema = z.object({
  studentId: uuidSchema,
  appreciation: z.string().trim().max(APPRECIATION_MAX_LENGTH, {
    message: "errors.appreciationTooLong",
  }),
  decision: z.enum(BULLETIN_DECISIONS).nullable().optional(),
});
export type BulletinReviewEntry = z.infer<typeof bulletinReviewEntrySchema>;

/** A whole class's overall remarks and decisions for one term, saved as a draft. */
export const saveBulletinReviewSchema = z.object({
  classGroupId: uuidSchema,
  termId: uuidSchema,
  entries: z.array(bulletinReviewEntrySchema).min(1, { message: "errors.noBulletins" }),
});
export type SaveBulletinReviewInput = z.infer<typeof saveBulletinReviewSchema>;

/**
 * Publishing, and unpublishing.
 *
 * Both are per class per term and never per student — that is how the school
 * works, and it makes partial publication (some families see marks, others do
 * not) impossible by construction (`docs/system-design-madrasti.md` §3). It is
 * also what the rank requires: half a published class would print "5e sur 14"
 * on a sheet whose class has 32 pupils in it.
 */
export const publishBulletinsSchema = z.object({
  classGroupId: uuidSchema,
  termId: uuidSchema,
});
export type PublishBulletinsInput = z.infer<typeof publishBulletinsSchema>;

/** Unpublishing is deliberately explicit and audited — it un-freezes records. */
export const unpublishBulletinsSchema = publishBulletinsSchema.extend({
  /**
   * Why the school is taking a document back.
   *
   * Required, and not a formality: unpublishing reopens marks a family has
   * already been shown, and the audit trail has to be able to answer "why did
   * this child's average change between January and March" a year later.
   */
  reason: nonEmptyString(300),
});
export type UnpublishBulletinsInput = z.infer<typeof unpublishBulletinsSchema>;
