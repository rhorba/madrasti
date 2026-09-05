import { z } from "zod";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "../constants.js";
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

/** Editing homework. The class+subject cannot change; that is a new devoir. */
export const assignmentUpdateSchema = z
  .object({
    id: uuidSchema,
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
export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;

export const assignmentIdSchema = z.object({ id: uuidSchema });

/**
 * Asking for a presigned upload URL.
 *
 * The type and the size are validated here and then signed into the URL, so a
 * client that ignores them cannot upload anyway. Validating only in the
 * browser would leave an unauthenticated-in-effect write against the bucket.
 */
export const attachmentRequestSchema = z.object({
  classSubjectId: uuidSchema,
  contentType: z.enum(ALLOWED_ATTACHMENT_TYPES, { message: "errors.attachmentType" }),
  contentLength: z.coerce
    .number()
    .int()
    .positive({ message: "errors.attachmentEmpty" })
    .max(MAX_ATTACHMENT_BYTES, { message: "errors.attachmentTooLarge" }),
});
export type AttachmentRequest = z.infer<typeof attachmentRequestSchema>;

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
