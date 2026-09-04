"use server";

import { defineAction } from "@/lib/action";
import { type ImportPreview, previewStudentImport, uuidSchema } from "@madrasti/core";
import { db, enrolments, students } from "@madrasti/db";
import { inArray } from "drizzle-orm";
import { z } from "zod";

/**
 * Student CSV import.
 *
 * Two steps on purpose. `previewImport` writes nothing and reports exactly
 * what the file contains and what is wrong with it; `commitImport` re-parses
 * the same file server-side and inserts. Importing 300 children's records is
 * not something to do on one click, and the parsed rows are never taken from
 * the client — only the file text is.
 */

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const fileSchema = z.object({
  fileText: z
    .string()
    .min(1, { message: "errors.csvEmpty" })
    .max(MAX_FILE_BYTES, { message: "errors.csvTooLarge" }),
});

export const previewImport = defineAction({
  roles: ["admin"],
  schema: fileSchema,
  handler: async ({ fileText }): Promise<ImportPreview & { existingMassar: string[] }> => {
    const preview = previewStudentImport(fileText);

    // A code already in the database would fail the unique index mid-import.
    // Surfacing it now means the admin fixes the file rather than discovering
    // a half-finished import.
    const codes = preview.rows
      .map((row) => row.massarCode)
      .filter((code): code is string => code !== null);

    const existingMassar =
      codes.length === 0
        ? []
        : (
            await db
              .select({ massarCode: students.massarCode })
              .from(students)
              .where(inArray(students.massarCode, codes))
          )
            .map((row) => row.massarCode)
            .filter((code): code is string => code !== null);

    return { ...preview, existingMassar };
  },
  // No audit entry: nothing was written.
});

export const commitImport = defineAction({
  roles: ["admin"],
  schema: fileSchema.extend({
    classGroupId: uuidSchema.optional(),
    yearId: uuidSchema.optional(),
    enrolledOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  handler: async ({ fileText, classGroupId, yearId, enrolledOn }) => {
    // Re-parsed here rather than trusting rows from the browser: the preview
    // is a courtesy to the user, not an input to the write.
    const preview = previewStudentImport(fileText);

    if (preview.missingHeaders.length > 0) throw new Error("errors.csvMissingHeaders");
    if (preview.rows.length === 0) throw new Error("errors.csvNoValidRows");

    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(students)
        .values(
          preview.rows.map((row) => ({
            massarCode: row.massarCode,
            firstNameFr: row.firstNameFr,
            lastNameFr: row.lastNameFr,
            firstNameAr: row.firstNameAr,
            lastNameAr: row.lastNameAr,
            birthDate: row.birthDate,
            gender: row.gender,
            status: "active" as const,
            enrolledAt: enrolledOn ?? new Date().toISOString().slice(0, 10),
          }))
        )
        .returning({ id: students.id });

      // Enrolling into a class is optional: the school may import the roll
      // first and sort classes out afterwards.
      if (classGroupId && yearId) {
        await tx.insert(enrolments).values(
          rows.map((row) => ({
            studentId: row.id,
            classGroupId,
            yearId,
            enrolledOn: enrolledOn ?? new Date().toISOString().slice(0, 10),
          }))
        );
      }

      return rows.length;
    });

    return { imported: inserted, skipped: preview.errors.length };
  },
  audit: (input, data) => ({
    action: "student.import",
    entity: "students",
    // Counts only — no names, no Massar codes in the audit payload.
    payload: {
      imported: data.imported,
      skipped: data.skipped,
      enrolled: Boolean(input.classGroupId),
    },
  }),
  revalidate: () => ["/admin/students"],
});
