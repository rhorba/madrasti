import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { classSubjects, subjects, terms } from "./academic.js";
import { assessmentTypeEnum, attendanceStatusEnum, bulletinDecisionEnum } from "./enums.js";
import { students, users } from "./identity.js";
import { sessions } from "./timetable.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** One student's presence at one session. */
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    minutesLate: smallint("minutes_late"),
    note: text("note"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    // Lets a correction take the same code path as the original register:
    // `ON CONFLICT (session_id, student_id) DO UPDATE`.
    onePerStudentPerSession: unique("attendance_session_student_unique").on(
      t.sessionId,
      t.studentId
    ),
    // Feeds per-student history and the bulletin absence total.
    byStudent: index("attendance_student_idx").on(t.studentId, t.recordedAt),
    byStatus: index("attendance_status_idx").on(t.status),
    minutesOnlyWhenLate: check(
      "attendance_minutes_only_when_late",
      sql`${t.minutesLate} is null or ${t.status} = 'late'`
    ),
  })
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    classSubjectId: uuid("class_subject_id")
      .notNull()
      .references(() => classSubjects.id, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    type: assessmentTypeEnum("type").notNull(),
    maxScore: numeric("max_score", { precision: 5, scale: 2 }).notNull().default("20"),
    /** Weights this assessment within its subject for the term. */
    coefficient: numeric("coefficient", { precision: 3, scale: 1 }).notNull().default("1"),
    date: date("date").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => ({
    byClassSubjectTerm: index("assessments_class_subject_term_idx").on(t.classSubjectId, t.termId),
    maxScorePositive: check("assessments_max_score_positive", sql`${t.maxScore} > 0`),
    coefficientPositive: check("assessments_coefficient_positive", sql`${t.coefficient} > 0`),
  })
);

/**
 * One student's mark for one assessment.
 *
 * **Absent is not zero.** A zero is a mark a student earned and it pulls the
 * average down; an absence is the absence of a mark and is excluded from the
 * average entirely. The CHECK below makes the two states mutually exclusive so
 * the distinction cannot be lost by a careless write — it is the most common
 * way a school system silently produces wrong averages.
 *
 * The *upper* bound is not enforced here: a row-level CHECK cannot reach
 * `assessments.max_score`. It is validated in the Zod schema and the action.
 * That is deliberate anyway — a bonus mark above the maximum is a real thing
 * teachers do, so a hard ceiling would be wrong (`docs/database-madrasti.md`).
 */
export const grades = pgTable(
  "grades",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }),
    isAbsent: boolean("is_absent").notNull().default(false),
    comment: text("comment"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    onePerStudentPerAssessment: unique("grades_assessment_student_unique").on(
      t.assessmentId,
      t.studentId
    ),
    byStudent: index("grades_student_idx").on(t.studentId),
    absentXorScore: check(
      "grades_absent_xor_score",
      sql`(${t.isAbsent} = true and ${t.score} is null) or (${t.isAbsent} = false and ${t.score} is not null)`
    ),
    scoreNonNegative: check(
      "grades_score_non_negative",
      sql`${t.score} is null or ${t.score} >= 0`
    ),
  })
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    classSubjectId: uuid("class_subject_id")
      .notNull()
      .references(() => classSubjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assignedOn: date("assigned_on").notNull(),
    dueOn: date("due_on").notNull(),
    /** R2 object key, never a URL. */
    attachmentKey: text("attachment_key"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => ({
    byClassSubjectDue: index("assignments_class_subject_due_idx").on(t.classSubjectId, t.dueOn),
    dueAfterAssigned: check("assignments_due_after_assigned", sql`${t.dueOn} >= ${t.assignedOn}`),
  })
);

/**
 * A student's report card for a term.
 *
 * Figures are **frozen at publication**. Before publishing, the staff preview is
 * recomputed live from `grades` so late marks are picked up; publishing writes
 * `bulletin_lines` and stamps `published_at`. After that, a grade edit that
 * would feed this bulletin is refused — otherwise a parent's January document
 * silently changes in March and the school cannot explain the difference
 * against the paper copy it handed out (threat T6).
 */
export const bulletins = pgTable(
  "bulletins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    generalAverage: numeric("general_average", { precision: 5, scale: 2 }),
    rank: smallint("rank"),
    classSize: smallint("class_size"),
    absenceCount: smallint("absence_count").notNull().default(0),
    appreciation: text("appreciation"),
    decision: bulletinDecisionEnum("decision"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    onePerStudentPerTerm: unique("bulletins_student_term_unique").on(t.studentId, t.termId),
    published: index("bulletins_published_idx")
      .on(t.termId)
      .where(sql`${t.publishedAt} is not null`),
  })
);

/** One subject line on a bulletin — the frozen snapshot of a computed average. */
export const bulletinLines = pgTable(
  "bulletin_lines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bulletinId: uuid("bulletin_id")
      .notNull()
      .references(() => bulletins.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    average: numeric("average", { precision: 5, scale: 2 }),
    coefficient: numeric("coefficient", { precision: 3, scale: 1 }).notNull(),
    weightedPoints: numeric("weighted_points", { precision: 6, scale: 2 }),
    rank: smallint("rank"),
    appreciation: text("appreciation"),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    onePerSubject: unique("bulletin_lines_bulletin_subject_unique").on(t.bulletinId, t.subjectId),
  })
);

export const attendanceRelations = relations(attendance, ({ one }) => ({
  session: one(sessions, { fields: [attendance.sessionId], references: [sessions.id] }),
  student: one(students, { fields: [attendance.studentId], references: [students.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  classSubject: one(classSubjects, {
    fields: [assessments.classSubjectId],
    references: [classSubjects.id],
  }),
  term: one(terms, { fields: [assessments.termId], references: [terms.id] }),
  grades: many(grades),
}));

export const gradesRelations = relations(grades, ({ one }) => ({
  assessment: one(assessments, { fields: [grades.assessmentId], references: [assessments.id] }),
  student: one(students, { fields: [grades.studentId], references: [students.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  classSubject: one(classSubjects, {
    fields: [assignments.classSubjectId],
    references: [classSubjects.id],
  }),
}));

export const bulletinsRelations = relations(bulletins, ({ one, many }) => ({
  student: one(students, { fields: [bulletins.studentId], references: [students.id] }),
  term: one(terms, { fields: [bulletins.termId], references: [terms.id] }),
  lines: many(bulletinLines),
}));

export const bulletinLinesRelations = relations(bulletinLines, ({ one }) => ({
  bulletin: one(bulletins, { fields: [bulletinLines.bulletinId], references: [bulletins.id] }),
  subject: one(subjects, { fields: [bulletinLines.subjectId], references: [subjects.id] }),
}));
