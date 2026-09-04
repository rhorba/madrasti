"use server";

import { defineAction } from "@/lib/action";
import { provisionAccount, resetAccountPassword } from "@/lib/provision";
import {
  emailSchema,
  enrolmentSchema,
  guardianSchema,
  localeSchema,
  studentSchema,
  teacherSchema,
  uuidSchema,
} from "@madrasti/core";
import {
  db,
  enrolments,
  guardians,
  studentGuardians,
  students,
  teachers,
  users,
} from "@madrasti/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

/** Students, guardians, teachers, enrolment and account provisioning. */

const ADMIN = ["admin"] as const;

// --- students -------------------------------------------------------------

export const createStudent = defineAction({
  roles: [...ADMIN],
  schema: studentSchema,
  handler: async (input) => {
    const [row] = await db
      .insert(students)
      .values({
        ...input,
        // Massar codes are optional throughout: a newly-arrived student may
        // not have one, and the school may choose never to use them at all.
        massarCode: input.massarCode ?? null,
      })
      .returning();
    if (!row) throw new Error("insert failed");
    return { id: row.id };
  },
  audit: (_input, data) => ({ action: "student.create", entity: "students", entityId: data.id }),
  revalidate: () => ["/admin/students"],
});

export const updateStudent = defineAction({
  roles: [...ADMIN],
  schema: studentSchema.partial().extend({ id: uuidSchema }),
  handler: async ({ id, ...rest }) => {
    await db
      .update(students)
      .set({ ...rest, massarCode: rest.massarCode ?? null, updatedAt: new Date() })
      .where(eq(students.id, id));
    return { id };
  },
  audit: (_input, data) => ({ action: "student.update", entity: "students", entityId: data.id }),
  revalidate: (input) => ["/admin/students", `/admin/students/${input.id}`],
});

/**
 * Change a student's status.
 *
 * Nothing hard-deletes in the academic record: a student who leaves becomes
 * `transferred` or `withdrawn`, keeping their marks and registers intact and
 * attributable (`docs/ux-madrasti.md` §8.5).
 */
export const setStudentStatus = defineAction({
  roles: [...ADMIN],
  schema: z.object({
    id: uuidSchema,
    status: z.enum(["active", "transferred", "graduated", "withdrawn"]),
  }),
  handler: async ({ id, status }) => {
    await db.update(students).set({ status, updatedAt: new Date() }).where(eq(students.id, id));
    return { id, status };
  },
  audit: (input, data) => ({
    action: "student.status",
    entity: "students",
    entityId: data.id,
    payload: { status: input.status },
  }),
  revalidate: (input) => ["/admin/students", `/admin/students/${input.id}`],
});

// --- enrolment ------------------------------------------------------------

/**
 * Enrol a student into a class for the current year.
 *
 * A student may hold only one *active* enrolment per year (a partial unique
 * index), so moving them between classes closes the old row rather than
 * editing it — the history of which class they sat in is part of the record.
 */
export const enrolStudent = defineAction({
  roles: [...ADMIN],
  schema: enrolmentSchema,
  handler: async (input) => {
    const id = await db.transaction(async (tx) => {
      await tx
        .update(enrolments)
        .set({ leftOn: input.enrolledOn, updatedAt: new Date() })
        .where(
          and(
            eq(enrolments.studentId, input.studentId),
            eq(enrolments.yearId, input.yearId),
            isNull(enrolments.leftOn)
          )
        );

      const [row] = await tx.insert(enrolments).values(input).returning();
      if (!row) throw new Error("enrolment insert failed");
      return row.id;
    });
    return { id, studentId: input.studentId };
  },
  audit: (input, data) => ({
    action: "student.enrol",
    entity: "enrolments",
    entityId: data.id,
    payload: { classGroupId: input.classGroupId },
  }),
  revalidate: (input) => ["/admin/students", `/admin/students/${input.studentId}`],
});

// --- guardians ------------------------------------------------------------

export const createGuardian = defineAction({
  roles: [...ADMIN],
  schema: guardianSchema.extend({ studentId: uuidSchema.optional() }),
  handler: async ({ studentId, ...guardian }) => {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(guardians)
        .values({ ...guardian, email: guardian.email ?? null })
        .returning();
      if (!row) throw new Error("guardian insert failed");

      if (studentId) {
        await tx.insert(studentGuardians).values({
          studentId,
          guardianId: row.id,
          isPrimary: true,
        });
      }
      return row.id;
    });
    return { id, studentId };
  },
  audit: (_input, data) => ({ action: "guardian.create", entity: "guardians", entityId: data.id }),
  revalidate: (input) =>
    input.studentId
      ? ["/admin/guardians", `/admin/students/${input.studentId}`]
      : ["/admin/guardians"],
});

export const linkGuardian = defineAction({
  roles: [...ADMIN],
  schema: z.object({
    studentId: uuidSchema,
    guardianId: uuidSchema,
    isPrimary: z.coerce.boolean().default(false),
  }),
  handler: async (input) => {
    await db.insert(studentGuardians).values(input).onConflictDoNothing();
    return { studentId: input.studentId };
  },
  audit: (input) => ({
    action: "guardian.link",
    entity: "student_guardians",
    entityId: input.guardianId,
  }),
  revalidate: (input) => [`/admin/students/${input.studentId}`],
});

export const unlinkGuardian = defineAction({
  roles: [...ADMIN],
  schema: z.object({ studentId: uuidSchema, guardianId: uuidSchema }),
  handler: async (input) => {
    await db
      .delete(studentGuardians)
      .where(
        and(
          eq(studentGuardians.studentId, input.studentId),
          eq(studentGuardians.guardianId, input.guardianId)
        )
      );
    return { studentId: input.studentId };
  },
  audit: (input) => ({
    action: "guardian.unlink",
    entity: "student_guardians",
    entityId: input.guardianId,
  }),
  revalidate: (input) => [`/admin/students/${input.studentId}`],
});

// --- teachers -------------------------------------------------------------

/**
 * Create a teacher and their login together.
 *
 * A teacher without an account cannot take a register, so making these two
 * steps is an invitation to leave half the staff unable to work in September.
 */
export const createTeacher = defineAction({
  roles: [...ADMIN],
  schema: teacherSchema.extend({ email: emailSchema, locale: localeSchema.default("fr") }),
  handler: async ({ email, locale, ...teacher }) => {
    const account = await provisionAccount({ email, role: "teacher", locale });
    const [row] = await db
      .insert(teachers)
      .values({ ...teacher, userId: account.userId, phone: teacher.phone ?? null })
      .returning();
    if (!row) throw new Error("teacher insert failed");

    // The plaintext password travels back to the admin screen once and is
    // never stored, logged or audited.
    return { id: row.id, email: account.email, tempPassword: account.tempPassword };
  },
  audit: (_input, data) => ({ action: "teacher.create", entity: "teachers", entityId: data.id }),
  revalidate: () => ["/admin/teachers"],
});

// --- accounts -------------------------------------------------------------

/** Give an existing guardian a login so they can use the parent portal. */
export const createGuardianAccount = defineAction({
  roles: [...ADMIN],
  schema: z.object({
    guardianId: uuidSchema,
    email: emailSchema,
    locale: localeSchema.default("fr"),
  }),
  handler: async ({ guardianId, email, locale }) => {
    const account = await provisionAccount({ email, role: "parent", locale });
    await db
      .update(guardians)
      .set({ userId: account.userId, email, updatedAt: new Date() })
      .where(eq(guardians.id, guardianId));
    return { email: account.email, tempPassword: account.tempPassword };
  },
  audit: (input) => ({
    action: "account.provision",
    entity: "guardians",
    entityId: input.guardianId,
    payload: { role: "parent" },
  }),
  revalidate: () => ["/admin/guardians"],
});

/** Give a student a login for the student portal. */
export const createStudentAccount = defineAction({
  roles: [...ADMIN],
  schema: z.object({
    studentId: uuidSchema,
    email: emailSchema,
    locale: localeSchema.default("fr"),
  }),
  handler: async ({ studentId, email, locale }) => {
    const account = await provisionAccount({ email, role: "student", locale });
    await db
      .update(students)
      .set({ userId: account.userId, updatedAt: new Date() })
      .where(eq(students.id, studentId));
    return { email: account.email, tempPassword: account.tempPassword };
  },
  audit: (input) => ({
    action: "account.provision",
    entity: "students",
    entityId: input.studentId,
    payload: { role: "student" },
  }),
  revalidate: (input) => [`/admin/students/${input.studentId}`],
});

export const resetPassword = defineAction({
  roles: [...ADMIN],
  schema: z.object({ userId: uuidSchema }),
  handler: async ({ userId }) => {
    const tempPassword = await resetAccountPassword(userId);
    return { tempPassword };
  },
  audit: (input) => ({
    action: "account.reset_password",
    entity: "users",
    entityId: input.userId,
  }),
  revalidate: () => ["/admin/teachers", "/admin/guardians"],
});

/**
 * Enable or disable a login.
 *
 * `is_active` is re-checked on every request, so disabling a departed teacher
 * takes effect on their next click rather than when their JWT expires
 * (`docs/system-design-madrasti.md` §4).
 */
export const setAccountActive = defineAction({
  roles: [...ADMIN],
  schema: z.object({ userId: uuidSchema, isActive: z.coerce.boolean() }),
  handler: async ({ userId, isActive }) => {
    await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
    return { userId, isActive };
  },
  audit: (input) => ({
    action: input.isActive ? "account.enable" : "account.disable",
    entity: "users",
    entityId: input.userId,
  }),
  revalidate: () => ["/admin/teachers", "/admin/guardians"],
});
