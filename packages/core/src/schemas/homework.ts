import { z } from "zod";
import { BULLETIN_DECISIONS } from "../enums.js";
import { dateStringSchema, nonEmptyString, uuidSchema } from "./common.js";

/** Homework, and the bulletin actions. */

export const assignmentSchema = z
  .object({
    classSubjectId: uuidSchema,
    title: nonEmptyString(160),
    description: z.string().trim().max(4000).optional(),
    assignedOn: dateStringSchema,
    dueOn: dateStringSchema,
    attachmentKey: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dueOn < value.assignedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueOn"],
        message: "errors.dueBeforeAssigned",
      });
    }
  });
export type AssignmentInput = z.infer<typeof assignmentSchema>;

export const generateBulletinsSchema = z.object({
  classGroupId: uuidSchema,
  termId: uuidSchema,
});

/**
 * Publication is per class per term, never per student — that is how the school
 * works, and it makes partial publication (some families see marks, others do
 * not) impossible by construction (`docs/system-design-madrasti.md` §3).
 */
export const publishBulletinsSchema = z.object({
  classGroupId: uuidSchema,
  termId: uuidSchema,
});

/** Unpublishing is deliberately explicit and audited — it un-freezes records. */
export const unpublishBulletinsSchema = z.object({
  classGroupId: uuidSchema,
  termId: uuidSchema,
  reason: nonEmptyString(300),
});

export const bulletinAppreciationSchema = z.object({
  bulletinId: uuidSchema,
  subjectId: uuidSchema.nullable(),
  appreciation: z.string().trim().max(500),
});

export const bulletinDecisionSchema = z.object({
  bulletinId: uuidSchema,
  decision: z.enum(BULLETIN_DECISIONS),
  appreciation: z.string().trim().max(1000).optional(),
});
