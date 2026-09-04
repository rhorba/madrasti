"use server";

import { defineAction } from "@/lib/action";
import {
  academicYearSchema,
  classGroupSchema,
  classSubjectSchema,
  levelSchema,
  schoolSettingsSchema,
  subjectSchema,
  termSchema,
  uuidSchema,
} from "@madrasti/core";
import {
  academicYears,
  classGroups,
  classSubjects,
  db,
  levels,
  school,
  subjects,
  terms,
} from "@madrasti/db";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";

/**
 * Academic structure: year, terms, levels, subjects, classes.
 *
 * Every action here goes through `defineAction`, which fixes the order
 * authenticate → authorise → validate → mutate → audit → revalidate. See
 * `lib/action.ts`.
 */

const ADMIN = ["admin"] as const;

// --- academic year --------------------------------------------------------

export const createYear = defineAction({
  roles: [...ADMIN],
  schema: academicYearSchema,
  handler: async (input) => {
    const [row] = await db.insert(academicYears).values(input).returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id };
  },
  audit: (input, data) => ({
    action: "year.create",
    entity: "academic_years",
    entityId: data.id,
    payload: { label: input.label },
  }),
  revalidate: () => ["/admin"],
});

/**
 * Make a year current.
 *
 * The database allows only one current year (a partial unique index), so the
 * previous one must be cleared in the *same* transaction — otherwise the
 * insert trips the constraint and the admin sees a failure for something that
 * should just work.
 */
export const setCurrentYear = defineAction({
  roles: [...ADMIN],
  schema: z.object({ yearId: uuidSchema }),
  handler: async ({ yearId }) => {
    await db.transaction(async (tx) => {
      await tx.update(academicYears).set({ isCurrent: false }).where(ne(academicYears.id, yearId));
      await tx
        .update(academicYears)
        .set({ isCurrent: true, updatedAt: new Date() })
        .where(eq(academicYears.id, yearId));
    });
    return { id: yearId };
  },
  audit: (_input, data) => ({
    action: "year.set_current",
    entity: "academic_years",
    entityId: data.id,
  }),
  revalidate: () => ["/admin"],
});

// --- terms ----------------------------------------------------------------

export const createTerm = defineAction({
  roles: [...ADMIN],
  schema: termSchema,
  handler: async (input) => {
    const [row] = await db.insert(terms).values(input).returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id };
  },
  audit: (input, data) => ({
    action: "term.create",
    entity: "terms",
    entityId: data.id,
    payload: { order: input.order },
  }),
  revalidate: () => ["/admin"],
});

export const setCurrentTerm = defineAction({
  roles: [...ADMIN],
  schema: z.object({ termId: uuidSchema }),
  handler: async ({ termId }) => {
    // Same one-current invariant as the year above.
    await db.transaction(async (tx) => {
      await tx.update(terms).set({ isCurrent: false }).where(ne(terms.id, termId));
      await tx
        .update(terms)
        .set({ isCurrent: true, updatedAt: new Date() })
        .where(eq(terms.id, termId));
    });
    return { id: termId };
  },
  audit: (_input, data) => ({ action: "term.set_current", entity: "terms", entityId: data.id }),
  revalidate: () => ["/admin"],
});

// --- levels ---------------------------------------------------------------

export const createLevel = defineAction({
  roles: [...ADMIN],
  schema: levelSchema,
  handler: async (input) => {
    const [row] = await db.insert(levels).values(input).returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id };
  },
  audit: (input, data) => ({
    action: "level.create",
    entity: "levels",
    entityId: data.id,
    payload: { nameFr: input.nameFr },
  }),
  revalidate: () => ["/admin"],
});

export const updateLevel = defineAction({
  roles: [...ADMIN],
  schema: levelSchema.extend({ id: uuidSchema }),
  handler: async ({ id, ...rest }) => {
    await db
      .update(levels)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(levels.id, id));
    return { id };
  },
  audit: (_input, data) => ({ action: "level.update", entity: "levels", entityId: data.id }),
  revalidate: () => ["/admin"],
});

// --- subjects -------------------------------------------------------------

export const createSubject = defineAction({
  roles: [...ADMIN],
  schema: subjectSchema,
  handler: async (input) => {
    const [row] = await db.insert(subjects).values(input).returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id };
  },
  audit: (input, data) => ({
    action: "subject.create",
    entity: "subjects",
    entityId: data.id,
    payload: { code: input.code },
  }),
  revalidate: () => ["/admin"],
});

export const updateSubject = defineAction({
  roles: [...ADMIN],
  schema: subjectSchema.extend({ id: uuidSchema }),
  handler: async ({ id, ...rest }) => {
    await db
      .update(subjects)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(subjects.id, id));
    return { id };
  },
  audit: (_input, data) => ({ action: "subject.update", entity: "subjects", entityId: data.id }),
  revalidate: () => ["/admin"],
});

// --- classes --------------------------------------------------------------

export const createClass = defineAction({
  roles: [...ADMIN],
  schema: classGroupSchema,
  handler: async (input) => {
    const [row] = await db
      .insert(classGroups)
      .values({
        yearId: input.yearId,
        levelId: input.levelId,
        name: input.name,
        capacity: input.capacity,
        mainTeacherId: input.mainTeacherId ?? null,
      })
      .returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id };
  },
  audit: (input, data) => ({
    action: "class.create",
    entity: "class_groups",
    entityId: data.id,
    payload: { name: input.name },
  }),
  revalidate: () => ["/admin"],
});

export const updateClass = defineAction({
  roles: [...ADMIN],
  schema: classGroupSchema.partial().extend({ id: uuidSchema }),
  handler: async ({ id, ...rest }) => {
    await db
      .update(classGroups)
      .set({ ...rest, mainTeacherId: rest.mainTeacherId ?? null, updatedAt: new Date() })
      .where(eq(classGroups.id, id));
    return { id };
  },
  audit: (_input, data) => ({ action: "class.update", entity: "class_groups", entityId: data.id }),
  revalidate: () => ["/admin"],
});

/**
 * Attach a subject to a class, with its teacher and **its coefficient**.
 *
 * The coefficient is per class, not per subject: maths weighs 4 in primaire
 * and 5 in collège here. Setting it on the subject instead would silently
 * mis-weight every bulletin at every other level (`CLAUDE.md` §6).
 */
export const addClassSubject = defineAction({
  roles: [...ADMIN],
  schema: classSubjectSchema,
  handler: async (input) => {
    const [row] = await db
      .insert(classSubjects)
      .values({ ...input, coefficient: String(input.coefficient) })
      .returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id, classGroupId: input.classGroupId };
  },
  audit: (input, data) => ({
    action: "class_subject.add",
    entity: "class_subjects",
    entityId: data.id,
    payload: { coefficient: input.coefficient },
  }),
  revalidate: (input) => [`/admin/classes/${input.classGroupId}`],
});

export const updateClassSubject = defineAction({
  roles: [...ADMIN],
  schema: z.object({
    id: uuidSchema,
    classGroupId: uuidSchema,
    teacherId: uuidSchema,
    coefficient: z.coerce.number().positive({ message: "errors.coefficientPositive" }).max(10),
  }),
  handler: async ({ id, teacherId, coefficient }) => {
    await db
      .update(classSubjects)
      .set({ teacherId, coefficient: String(coefficient), updatedAt: new Date() })
      .where(eq(classSubjects.id, id));
    return { id };
  },
  audit: (input, data) => ({
    action: "class_subject.update",
    entity: "class_subjects",
    entityId: data.id,
    // A coefficient change rewrites every average in that subject, so the old
    // and new values belong in the audit trail.
    payload: { coefficient: input.coefficient, teacherId: input.teacherId },
  }),
  revalidate: (input) => [`/admin/classes/${input.classGroupId}`],
});

export const removeClassSubject = defineAction({
  roles: [...ADMIN],
  schema: z.object({ id: uuidSchema, classGroupId: uuidSchema }),
  handler: async ({ id }) => {
    // Refused by a foreign key if assessments or timetable slots exist, which
    // surfaces as `errors.stillInUse` rather than destroying marks.
    await db.delete(classSubjects).where(eq(classSubjects.id, id));
    return { id };
  },
  audit: (_input, data) => ({
    action: "class_subject.remove",
    entity: "class_subjects",
    entityId: data.id,
  }),
  revalidate: (input) => [`/admin/classes/${input.classGroupId}`],
});

// --- school settings ------------------------------------------------------

export const updateSchool = defineAction({
  roles: [...ADMIN],
  schema: schoolSettingsSchema.extend({ id: uuidSchema }),
  handler: async ({ id, gradingMax, ...rest }) => {
    await db
      .update(school)
      .set({ ...rest, gradingMax: String(gradingMax), updatedAt: new Date() })
      .where(eq(school.id, id));
    return { id };
  },
  audit: (_input, data) => ({ action: "school.update", entity: "school", entityId: data.id }),
  revalidate: () => ["/admin"],
});
