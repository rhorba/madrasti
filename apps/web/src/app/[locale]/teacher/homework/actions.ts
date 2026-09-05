"use server";

import { defineAction } from "@/lib/action";
import { NotAuthorizedError } from "@/lib/auth/errors";
import { assertCanGradeClassSubject } from "@/lib/auth/scope";
import { reachableClassSubjects } from "@/lib/auth/scope";
import type { AppSession } from "@/lib/auth/session";
import {
  isStorageConfigured,
  presignAttachmentDownload,
  presignAttachmentUpload,
} from "@/lib/storage";
import {
  type AssignmentInput,
  type AssignmentUpdateInput,
  MAX_ATTACHMENT_BYTES,
  assignmentIdSchema,
  assignmentSchema,
  assignmentUpdateSchema,
  attachmentRequestSchema,
} from "@madrasti/core";
import { assignments, classSubjects, db } from "@madrasti/db";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Homework.
 *
 * There is no submission pipeline — homework is handed in on paper
 * (`CLAUDE.md` §3.C), so these actions only ever set, amend or withdraw what
 * the teacher posted. Authorisation is the same rule as for marks: the teacher
 * of *this* subject in *this* class, or an admin.
 */

/** Resolve the class+subject behind an assignment, refusing anything else. */
async function assertCanEditAssignment(session: AppSession, assignmentId: string) {
  const [row] = await db
    .select({ classSubjectId: assignments.classSubjectId })
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), isNull(assignments.deletedAt)))
    .limit(1);

  // Unknown or already withdrawn is refused rather than reported as missing:
  // the caller is holding an id it should not be able to learn anything from.
  if (!row) throw new NotAuthorizedError(`assignment ${assignmentId} not found`);
  await assertCanGradeClassSubject(session, row.classSubjectId);
  return row;
}

async function create(input: AssignmentInput, { session }: { session: AppSession }) {
  await assertCanGradeClassSubject(session, input.classSubjectId);

  const [row] = await db
    .insert(assignments)
    .values({
      classSubjectId: input.classSubjectId,
      title: input.title,
      description: input.description ?? null,
      assignedOn: input.assignedOn,
      dueOn: input.dueOn,
      attachmentKey: input.attachmentKey ?? null,
      createdBy: session.userId,
    })
    .returning({ id: assignments.id });

  if (!row) throw new Error("errors.unexpected");
  return row;
}

export const createAssignment = defineAction({
  roles: ["teacher", "admin"],
  schema: assignmentSchema,
  handler: create,
  audit: (input, data) => ({
    action: "assignment.create",
    entity: "assignments",
    entityId: data.id,
    payload: { dueOn: input.dueOn, hasAttachment: Boolean(input.attachmentKey) },
  }),
  revalidate: () => ["/teacher/homework"],
});

async function update(input: AssignmentUpdateInput, { session }: { session: AppSession }) {
  await assertCanEditAssignment(session, input.id);

  await db
    .update(assignments)
    .set({
      title: input.title,
      description: input.description ?? null,
      assignedOn: input.assignedOn,
      dueOn: input.dueOn,
      // Undefined means "leave it alone"; explicit null clears the file.
      ...(input.attachmentKey === undefined ? {} : { attachmentKey: input.attachmentKey }),
      updatedAt: new Date(),
    })
    .where(eq(assignments.id, input.id));

  return { id: input.id };
}

export const updateAssignment = defineAction({
  roles: ["teacher", "admin"],
  schema: assignmentUpdateSchema,
  handler: update,
  audit: (input) => ({
    action: "assignment.update",
    entity: "assignments",
    entityId: input.id,
    payload: { dueOn: input.dueOn },
  }),
  revalidate: () => ["/teacher/homework"],
});

/**
 * Withdraw a piece of homework.
 *
 * Soft, like an assessment: it leaves every family's list, and the record of
 * what was set and when survives. A parent who saw it yesterday and asks about
 * it today must be answerable.
 */
async function remove(input: { id: string }, { session }: { session: AppSession }) {
  await assertCanEditAssignment(session, input.id);

  const [row] = await db
    .update(assignments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(assignments.id, input.id), isNull(assignments.deletedAt)))
    .returning({ id: assignments.id });

  if (!row) throw new Error("errors.notFound");
  return row;
}

export const deleteAssignment = defineAction({
  roles: ["teacher", "admin"],
  schema: assignmentIdSchema,
  handler: remove,
  audit: (_input, data) => ({
    action: "assignment.delete",
    entity: "assignments",
    entityId: data.id,
  }),
  revalidate: () => ["/teacher/homework"],
});

/**
 * Issue a presigned PUT so the browser can upload straight to R2.
 *
 * The size and the content type are validated here and then *signed into* the
 * URL, so the limits hold even against a client that ignores them. The bytes
 * never pass through this server.
 */
async function requestUpload(
  input: { classSubjectId: string; contentType: string; contentLength: number },
  { session }: { session: AppSession }
) {
  await assertCanGradeClassSubject(session, input.classSubjectId);
  if (!isStorageConfigured()) throw new Error("errors.uploadsUnavailable");

  return presignAttachmentUpload(input);
}

export const requestAttachmentUpload = defineAction({
  roles: ["teacher", "admin"],
  schema: attachmentRequestSchema,
  handler: requestUpload,
  audit: (input) => ({
    action: "assignment.attachmentRequested",
    entity: "class_subjects",
    entityId: input.classSubjectId,
    payload: { contentType: input.contentType, bytes: input.contentLength },
  }),
});

/**
 * A short-lived link to an attachment.
 *
 * Deliberately an action rather than a public route: the URL is minted only
 * after the session has been checked against the class the homework belongs
 * to, and it expires in minutes. Anyone who may see the homework may see its
 * attachment — which from Sprint 7 includes the family, so the check is
 * `reachableClassSubjects` rather than the stricter grading rule.
 */
async function attachmentUrl(input: { id: string }, { session }: { session: AppSession }) {
  const [row] = await db
    .select({
      attachmentKey: assignments.attachmentKey,
      classSubjectId: assignments.classSubjectId,
    })
    .from(assignments)
    .innerJoin(classSubjects, eq(classSubjects.id, assignments.classSubjectId))
    .where(and(eq(assignments.id, input.id), isNull(assignments.deletedAt)))
    .limit(1);

  if (!row?.attachmentKey) throw new NotAuthorizedError(`assignment ${input.id} has no attachment`);

  const reachable = await reachableClassSubjects(session);
  if (!reachable.some((entry) => entry.id === row.classSubjectId)) {
    throw new NotAuthorizedError(`session -> assignment ${input.id}`);
  }

  return { url: await presignAttachmentDownload(row.attachmentKey) };
}

export const getAttachmentUrl = defineAction({
  roles: ["teacher", "admin", "parent", "student"],
  schema: assignmentIdSchema,
  handler: attachmentUrl,
  audit: (input) => ({
    action: "assignment.attachmentRead",
    entity: "assignments",
    entityId: input.id,
  }),
});

/** The client needs the ceiling to reject a file before it starts uploading. */
export async function attachmentLimits() {
  return { enabled: isStorageConfigured(), maxBytes: MAX_ATTACHMENT_BYTES };
}
