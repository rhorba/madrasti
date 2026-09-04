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
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { localeEnum } from "./enums.js";
import { students, teachers } from "./identity.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Single settings row. One school per deployment (`CLAUDE.md` §2). */
export const school = pgTable("school", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  logoKey: text("logo_key"),
  address: text("address"),
  phone: varchar("phone", { length: 30 }),
  email: text("email"),
  defaultLocale: localeEnum("default_locale").notNull().default("fr"),
  gradingMax: numeric("grading_max", { precision: 4, scale: 2 }).notNull().default("20"),
  ...timestamps,
});

export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    label: varchar("label", { length: 20 }).notNull().unique(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    /**
     * Exactly one current year, enforced by the database rather than by
     * application logic. Two current years would corrupt every "current year"
     * default in the product, and that is not a check to leave to a code path
     * somebody forgets.
     */
    onlyOneCurrent: uniqueIndex("academic_years_one_current")
      .on(sql`(true)`)
      .where(sql`${t.isCurrent}`),
    datesOrdered: check("academic_years_dates_ordered", sql`${t.endDate} > ${t.startDate}`),
  })
);

export const terms = pgTable(
  "terms",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    yearId: uuid("year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    labelFr: text("label_fr").notNull(),
    labelAr: text("label_ar").notNull(),
    labelEn: text("label_en").notNull(),
    order: smallint("order").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    orderPerYear: unique("terms_year_order_unique").on(t.yearId, t.order),
    onlyOneCurrent: uniqueIndex("terms_one_current").on(sql`(true)`).where(sql`${t.isCurrent}`),
    orderRange: check("terms_order_range", sql`${t.order} between 1 and 3`),
    datesOrdered: check("terms_dates_ordered", sql`${t.endDate} > ${t.startDate}`),
  })
);

export const levels = pgTable("levels", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  order: smallint("order").notNull().unique(),
  ...timestamps,
});

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  color: varchar("color", { length: 7 }).notNull().default("#2F6B43"),
  ...timestamps,
});

/**
 * Classes are **per year**: "5ème A" in 2026-2027 is a different row from
 * "5ème A" in 2025-2026. This is what makes year rollover a matter of creating
 * rows rather than mutating history.
 */
export const classGroups = pgTable(
  "class_groups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    yearId: uuid("year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 60 }).notNull(),
    mainTeacherId: uuid("main_teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    capacity: smallint("capacity").notNull().default(35),
    ...timestamps,
  },
  (t) => ({
    namePerYear: unique("class_groups_year_name_unique").on(t.yearId, t.name),
    byYear: index("class_groups_year_idx").on(t.yearId),
  })
);

/**
 * A subject taught to a class by a teacher — **and the coefficient**.
 *
 * The coefficient lives here rather than on `subjects` because the same subject
 * carries different weights at different levels: Mathematics is coefficient 4
 * in collège and 2 in some primaire levels. A school-wide value would silently
 * mis-weight every bulletin at every other level, and nothing would look wrong.
 * This is the highest-consequence modelling decision in the schema.
 */
export const classSubjects = pgTable(
  "class_subjects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    classGroupId: uuid("class_group_id")
      .notNull()
      .references(() => classGroups.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    coefficient: numeric("coefficient", { precision: 3, scale: 1 }).notNull().default("1"),
    ...timestamps,
  },
  (t) => ({
    subjectPerClass: unique("class_subjects_class_subject_unique").on(t.classGroupId, t.subjectId),
    // Drives "my classes" on every teacher screen — the hottest lookup here.
    byTeacher: index("class_subjects_teacher_idx").on(t.teacherId),
    coefficientPositive: check("class_subjects_coefficient_positive", sql`${t.coefficient} > 0`),
  })
);

/**
 * A student's class, per year. A row rather than a column on `students`,
 * because the relationship changes every September and the history matters.
 */
export const enrolments = pgTable(
  "enrolments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classGroupId: uuid("class_group_id")
      .notNull()
      .references(() => classGroups.id, { onDelete: "restrict" }),
    yearId: uuid("year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    enrolledOn: date("enrolled_on").notNull(),
    leftOn: date("left_on"),
    ...timestamps,
  },
  (t) => ({
    /** One *active* enrolment per student per year; past ones stay. */
    oneActivePerYear: uniqueIndex("enrolments_one_active_per_year")
      .on(t.studentId, t.yearId)
      .where(sql`${t.leftOn} is null`),
    /** The class roster query, run on every attendance and grade screen. */
    activeByClass: index("enrolments_active_class_idx")
      .on(t.classGroupId)
      .where(sql`${t.leftOn} is null`),
  })
);

export const academicYearsRelations = relations(academicYears, ({ many }) => ({
  terms: many(terms),
  classGroups: many(classGroups),
}));

export const termsRelations = relations(terms, ({ one }) => ({
  year: one(academicYears, { fields: [terms.yearId], references: [academicYears.id] }),
}));

export const classGroupsRelations = relations(classGroups, ({ one, many }) => ({
  year: one(academicYears, { fields: [classGroups.yearId], references: [academicYears.id] }),
  level: one(levels, { fields: [classGroups.levelId], references: [levels.id] }),
  mainTeacher: one(teachers, { fields: [classGroups.mainTeacherId], references: [teachers.id] }),
  classSubjects: many(classSubjects),
  enrolments: many(enrolments),
}));

export const classSubjectsRelations = relations(classSubjects, ({ one }) => ({
  classGroup: one(classGroups, {
    fields: [classSubjects.classGroupId],
    references: [classGroups.id],
  }),
  subject: one(subjects, { fields: [classSubjects.subjectId], references: [subjects.id] }),
  teacher: one(teachers, { fields: [classSubjects.teacherId], references: [teachers.id] }),
}));

export const enrolmentsRelations = relations(enrolments, ({ one }) => ({
  student: one(students, { fields: [enrolments.studentId], references: [students.id] }),
  classGroup: one(classGroups, {
    fields: [enrolments.classGroupId],
    references: [classGroups.id],
  }),
}));
