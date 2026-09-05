import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { loadRootEnv, requireDatabaseUrl } from "./env.js";
import * as s from "./schema/index.js";

/**
 * Integrity tests — `docs/test-strategy-madrasti.md` §6.
 *
 * These assert that the database **refuses** what the application must never
 * write. They exist because a constraint declared in the Drizzle schema and a
 * constraint actually present in the applied migration are two different
 * things, and they drift silently: someone edits the schema, forgets to
 * generate, and the guarantee quietly disappears while the types still claim it.
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

loadRootEnv();
const client = postgres(requireDatabaseUrl(), { max: 2 });
const db = drizzle(client, { schema: s });

afterAll(async () => {
  await client.end();
});

/** Run `fn` in a transaction that is always rolled back. */
async function inRollback(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>
) {
  const marker = new Error("rollback");
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw marker;
    });
  } catch (err) {
    if (err === marker) return;
    // Drizzle 0.45 wraps the driver error: the thrown message became
    // "Failed query: ..." and the Postgres detail naming the violated
    // constraint moved to `cause`. Every assertion in this file is about the
    // constraint, so the chain is flattened here rather than teaching sixteen
    // tests about an ORM's error shape. The same wrapping degraded ten
    // user-facing messages in `lib/action.ts` — see `.logs/issues.md`.
    throw new Error(flattenCauses(err), { cause: err });
  }
}

/** An error's message plus every message in its `cause` chain. */
function flattenCauses(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.length > 0 ? parts.join("\n") : String(error);
}

async function seededIds() {
  const [year] = await db.select().from(s.academicYears).where(eq(s.academicYears.isCurrent, true));
  const [term] = await db.select().from(s.terms).where(eq(s.terms.isCurrent, true));
  const [student] = await db.select().from(s.students).limit(1);
  const [user] = await db.select().from(s.users).where(eq(s.users.role, "admin"));
  const [assessment] = await db.select().from(s.assessments).limit(1);
  const [session] = await db.select().from(s.sessions).limit(1);
  const [slot] = await db.select().from(s.timetableSlots).limit(1);
  const [enrolment] = await db.select().from(s.enrolments).limit(1);
  if (!year || !term || !student || !user || !assessment || !session || !slot || !enrolment) {
    throw new Error("database is not seeded — run `pnpm db:setup` first");
  }
  return { year, term, student, user, assessment, session, slot, enrolment };
}

describe("grades: absent is not a zero", () => {
  it("rejects a grade that is both absent and scored", async () => {
    const { assessment, user } = await seededIds();
    const [other] = await db.select().from(s.students).limit(1).offset(50);
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.grades).values({
          assessmentId: assessment.id,
          studentId: other!.id,
          score: "12.00",
          isAbsent: true,
          recordedBy: user.id,
        });
      })
    ).rejects.toThrow(/grades_absent_xor_score/);
  });

  it("rejects a grade that is present but unscored", async () => {
    const { assessment, user } = await seededIds();
    const [other] = await db.select().from(s.students).limit(1).offset(51);
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.grades).values({
          assessmentId: assessment.id,
          studentId: other!.id,
          score: null,
          isAbsent: false,
          recordedBy: user.id,
        });
      })
    ).rejects.toThrow(/grades_absent_xor_score/);
  });

  it("rejects a negative score", async () => {
    const { assessment, user } = await seededIds();
    const [other] = await db.select().from(s.students).limit(1).offset(52);
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.grades).values({
          assessmentId: assessment.id,
          studentId: other!.id,
          score: "-1.00",
          isAbsent: false,
          recordedBy: user.id,
        });
      })
    ).rejects.toThrow(/grades_score_non_negative/);
  });

  it("accepts a genuine zero", async () => {
    const { assessment, user } = await seededIds();
    const [other] = await db.select().from(s.students).limit(1).offset(53);
    // A zero is a mark the student earned; it must be storable and must count.
    await expect(
      inRollback(async (tx) => {
        await tx
          .insert(s.grades)
          .values({
            assessmentId: assessment.id,
            studentId: other!.id,
            score: "0.00",
            isAbsent: false,
            recordedBy: user.id,
          })
          .onConflictDoUpdate({
            target: [s.grades.assessmentId, s.grades.studentId],
            set: { score: "0.00", isAbsent: false },
          });
      })
    ).resolves.toBeUndefined();
  });

  it("keeps both a genuine zero and an absence in the seeded fixture", async () => {
    // The grading package's tests depend on this: a fixture containing only
    // one of the two lets a wrong implementation pass.
    const [row] = await db
      .select({
        zeros: sql<number>`count(*) filter (where ${s.grades.score} = 0)`,
        absences: sql<number>`count(*) filter (where ${s.grades.isAbsent})`,
      })
      .from(s.grades);
    expect(Number(row?.zeros ?? 0)).toBeGreaterThan(0);
    expect(Number(row?.absences ?? 0)).toBeGreaterThan(0);
  });
});

describe("attendance", () => {
  it("rejects minutes_late on a status that is not 'late'", async () => {
    const { session, user } = await seededIds();
    const [other] = await db.select().from(s.students).limit(1).offset(54);
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.attendance).values({
          sessionId: session.id,
          studentId: other!.id,
          status: "present",
          minutesLate: 10,
          recordedBy: user.id,
        });
      })
    ).rejects.toThrow(/attendance_minutes_only_when_late/);
  });

  it("upserts rather than duplicating when a register is re-saved", async () => {
    const { session, user } = await seededIds();
    const [existing] = await db
      .select()
      .from(s.attendance)
      .where(eq(s.attendance.sessionId, session.id))
      .limit(1);
    if (!existing) throw new Error("no seeded attendance");

    await inRollback(async (tx) => {
      await tx
        .insert(s.attendance)
        .values({
          sessionId: session.id,
          studentId: existing.studentId,
          status: "absent",
          recordedBy: user.id,
        })
        .onConflictDoUpdate({
          target: [s.attendance.sessionId, s.attendance.studentId],
          // `minutes_late` is cleared with the status, exactly as the register
          // action does it. Setting the status alone passed or failed on the
          // luck of which row the seed happened to put first: if that pupil was
          // marked *late*, the update left their minutes behind on an `absent`
          // row and the CHECK — correctly — refused it. The application never
          // writes that state; only this test did.
          set: { status: "absent", minutesLate: null },
        });

      const rows = await tx
        .select()
        .from(s.attendance)
        .where(
          and(
            eq(s.attendance.sessionId, session.id),
            eq(s.attendance.studentId, existing.studentId)
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("absent");
      expect(rows[0]?.minutesLate).toBeNull();
    });
  });
});

describe("one-current invariants", () => {
  it("refuses a second current academic year", async () => {
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.academicYears).values({
          label: "2099-2100",
          startDate: "2099-09-01",
          endDate: "2100-06-30",
          isCurrent: true,
        });
      })
    ).rejects.toThrow(/academic_years_one_current/);
  });

  it("refuses a second current term", async () => {
    const { year } = await seededIds();
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.terms).values({
          yearId: year.id,
          order: 2,
          labelFr: "x",
          labelAr: "x",
          labelEn: "x",
          startDate: "2099-09-01",
          endDate: "2099-12-01",
          isCurrent: true,
        });
      })
      // Would corrupt every "current term" default in the product.
    ).rejects.toThrow(/terms_one_current|terms_year_order_unique/);
  });

  it("refuses a term ending before it starts", async () => {
    const { year } = await seededIds();
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.terms).values({
          yearId: year.id,
          order: 3,
          labelFr: "x",
          labelAr: "x",
          labelEn: "x",
          startDate: "2099-12-01",
          endDate: "2099-09-01",
          isCurrent: false,
        });
      })
    ).rejects.toThrow(/terms_dates_ordered|terms_year_order_unique/);
  });
});

describe("enrolments", () => {
  it("refuses two active enrolments for one student in one year", async () => {
    const { enrolment } = await seededIds();
    const [otherClass] = await db
      .select()
      .from(s.classGroups)
      .where(sql`${s.classGroups.id} <> ${enrolment.classGroupId}`)
      .limit(1);
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.enrolments).values({
          studentId: enrolment.studentId,
          classGroupId: otherClass!.id,
          yearId: enrolment.yearId,
          enrolledOn: "2026-09-01",
        });
      })
    ).rejects.toThrow(/enrolments_one_active_per_year/);
  });

  it("allows a second enrolment once the first is closed", async () => {
    // Transferring a student mid-year must remain possible.
    const { enrolment } = await seededIds();
    const [otherClass] = await db
      .select()
      .from(s.classGroups)
      .where(sql`${s.classGroups.id} <> ${enrolment.classGroupId}`)
      .limit(1);
    await inRollback(async (tx) => {
      await tx
        .update(s.enrolments)
        .set({ leftOn: "2026-10-01" })
        .where(eq(s.enrolments.id, enrolment.id));
      await tx.insert(s.enrolments).values({
        studentId: enrolment.studentId,
        classGroupId: otherClass!.id,
        yearId: enrolment.yearId,
        enrolledOn: "2026-10-02",
      });
      const active = await tx
        .select()
        .from(s.enrolments)
        .where(and(eq(s.enrolments.studentId, enrolment.studentId), isNull(s.enrolments.leftOn)));
      expect(active).toHaveLength(1);
    });
  });
});

describe("timetable", () => {
  it("refuses a weekday outside Monday–Saturday", async () => {
    const { slot } = await seededIds();
    await expect(
      inRollback(async (tx) => {
        // 7 = Sunday. Moroccan schools teach Mon–Sat; Sunday is not a slot.
        await tx.insert(s.timetableSlots).values({
          classSubjectId: slot.classSubjectId,
          weekday: 7,
          startTime: "08:00",
          endTime: "09:00",
        });
      })
    ).rejects.toThrow(/timetable_slots_weekday_range/);
  });

  it("refuses a slot that ends before it starts", async () => {
    const { slot } = await seededIds();
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.timetableSlots).values({
          classSubjectId: slot.classSubjectId,
          weekday: 1,
          startTime: "10:00",
          endTime: "09:00",
        });
      })
    ).rejects.toThrow(/timetable_slots_times_ordered/);
  });

  it("refuses to delete a slot that already has sessions", async () => {
    // Deleting a slot must never take a register with it — the slot is
    // deactivated instead (`docs/system-design-madrasti.md` §2).
    const [session] = await db.select().from(s.sessions).limit(1);
    await expect(
      inRollback(async (tx) => {
        await tx.delete(s.timetableSlots).where(eq(s.timetableSlots.id, session!.slotId));
      })
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  it("refuses two sessions for the same slot on the same date", async () => {
    const [session] = await db.select().from(s.sessions).limit(1);
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.sessions).values({ slotId: session!.slotId, date: session!.date });
      })
    ).rejects.toThrow(/sessions_slot_date_unique/);
  });
});

describe("coefficients", () => {
  it("lets one subject carry different coefficients at different levels", async () => {
    // The load-bearing property of the whole schema: if the coefficient had
    // been modelled on `subjects`, this query would return a single value and
    // every collège bulletin would be silently mis-weighted.
    const rows = await db
      .select({
        code: s.subjects.code,
        coefficient: s.classSubjects.coefficient,
      })
      .from(s.classSubjects)
      .innerJoin(s.subjects, eq(s.subjects.id, s.classSubjects.subjectId))
      .where(eq(s.subjects.code, "MAT"));

    const distinct = new Set(rows.map((r) => r.coefficient));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("refuses a non-positive coefficient", async () => {
    const { slot } = await seededIds();
    const [cs] = await db
      .select()
      .from(s.classSubjects)
      .where(eq(s.classSubjects.id, slot.classSubjectId));
    await expect(
      inRollback(async (tx) => {
        await tx
          .update(s.classSubjects)
          .set({ coefficient: "0" })
          .where(eq(s.classSubjects.id, cs!.id));
      })
    ).rejects.toThrow(/class_subjects_coefficient_positive/);
  });
});

describe("users", () => {
  it("treats email as case-insensitive", async () => {
    // School staff will not be careful about capitalisation.
    const [admin] = await db.select().from(s.users).where(eq(s.users.role, "admin"));
    const upper = admin!.email.toUpperCase();
    const found = await db.select().from(s.users).where(eq(s.users.email, upper));
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(admin!.id);
  });

  it("refuses a duplicate email differing only in case", async () => {
    const [admin] = await db.select().from(s.users).where(eq(s.users.role, "admin"));
    await expect(
      inRollback(async (tx) => {
        await tx.insert(s.users).values({
          email: admin!.email.toUpperCase(),
          passwordHash: "x",
          role: "teacher",
        });
      })
    ).rejects.toThrow(/users_email_unique/);
  });
});

describe("audit log", () => {
  it("survives deletion of the acting user", async () => {
    // No FK to `users`: the record of who entered a mark must outlive the
    // account (`docs/security-madrasti.md` §7).
    await inRollback(async (tx) => {
      const [row] = await tx
        .insert(s.auditLog)
        .values({
          actorId: "00000000-0000-0000-0000-000000000000",
          action: "grade.update",
          entity: "grades",
        })
        .returning();
      expect(row?.id).toBeDefined();
    });
  });
});
