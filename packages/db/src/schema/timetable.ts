import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { classSubjects } from "./academic.js";
import { sessionStatusEnum } from "./enums.js";
import { teachers } from "./identity.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * A recurring weekly slot: this class has this subject with this teacher at
 * this time on this weekday.
 *
 * Weekday is 1=Monday … 6=Saturday. **Saturday is a teaching day** in Moroccan
 * schools; a Mon–Fri week would silently drop a sixth of the timetable.
 *
 * Overlap conflicts (a teacher or class double-booked) are *not* expressible as
 * a unique constraint — they are a range-overlap test. They are validated in
 * `packages/timetable` inside the inserting transaction, with a row lock on the
 * affected teacher and class. Exclusion constraints over `btree_gist` would be
 * race-proof and are the upgrade path if concurrent editing ever appears; for a
 * single-secretary school they are not worth the extension
 * (`docs/database-madrasti.md` §3).
 */
export const timetableSlots = pgTable(
  "timetable_slots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    classSubjectId: uuid("class_subject_id")
      .notNull()
      .references(() => classSubjects.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    room: varchar("room", { length: 40 }),
    /**
     * Slots are deactivated, never deleted, once sessions exist against them.
     * Editing a slot's time closes the old row and creates a new one, so past
     * registers keep pointing at the times they were actually taken at.
     */
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    byClassSubject: index("timetable_slots_class_subject_idx").on(t.classSubjectId),
    byWeekday: index("timetable_slots_weekday_idx").on(t.weekday).where(sql`${t.isActive}`),
    weekdayRange: check("timetable_slots_weekday_range", sql`${t.weekday} between 1 and 6`),
    timesOrdered: check("timetable_slots_times_ordered", sql`${t.endTime} > ${t.startTime}`),
  })
);

/**
 * A slot on a concrete date.
 *
 * Materialised **lazily** — created the first time a teacher opens it to mark
 * attendance, not by a nightly job. Pre-generating a year would be ~50 000
 * mostly-unused rows, and every timetable edit would then require reconciling
 * future sessions, including ones that already hold attendance
 * (`docs/system-design-madrasti.md` §2).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slotId: uuid("slot_id")
      .notNull()
      // RESTRICT, not CASCADE: deleting a slot must never take a register with
      // it. A slot with materialised sessions is deactivated instead.
      .references(() => timetableSlots.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    /** Set when someone other than the titular teacher takes the class. */
    actualTeacherId: uuid("actual_teacher_id").references(() => teachers.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    ...timestamps,
  },
  (t) => ({
    // Makes lazy creation idempotent: a substitute and the titular teacher can
    // open the same session concurrently without producing two rows.
    slotPerDate: unique("sessions_slot_date_unique").on(t.slotId, t.date),
    byDate: index("sessions_date_idx").on(t.date),
  })
);

export const timetableSlotsRelations = relations(timetableSlots, ({ one, many }) => ({
  classSubject: one(classSubjects, {
    fields: [timetableSlots.classSubjectId],
    references: [classSubjects.id],
  }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  slot: one(timetableSlots, { fields: [sessions.slotId], references: [timetableSlots.id] }),
  actualTeacher: one(teachers, { fields: [sessions.actualTeacherId], references: [teachers.id] }),
}));
