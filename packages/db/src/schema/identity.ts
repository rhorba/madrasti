import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  genderEnum,
  guardianRelationEnum,
  localeEnum,
  studentStatusEnum,
  userRoleEnum,
} from "./enums.js";

/**
 * `citext` — case-insensitive text, used for email.
 *
 * School staff will not be careful about capitalisation when creating twenty
 * accounts, and `Fatima@…` must be the same account as `fatima@…`. Doing this
 * at the column level means no call site can forget to lower-case.
 */
const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: citext("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    locale: localeEnum("locale").notNull().default("fr"),
    isActive: boolean("is_active").notNull().default(true),
    /** Set on every account the admin provisions; cleared at first login. */
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    // Admin listings filter by role among active accounts.
    activeByRole: index("users_active_role_idx").on(t.role).where(sql`${t.isActive}`),
  })
);

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "restrict" }),
  firstNameFr: text("first_name_fr").notNull(),
  lastNameFr: text("last_name_fr").notNull(),
  firstNameAr: text("first_name_ar").notNull(),
  lastNameAr: text("last_name_ar").notNull(),
  phone: varchar("phone", { length: 30 }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const guardians = pgTable("guardians", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  /**
   * Nullable on purpose. The school records both parents, but often only one
   * wants a login — forcing an account per guardian would mean inventing email
   * addresses for people who will never use them.
   */
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "set null" }),
  firstNameFr: text("first_name_fr").notNull(),
  lastNameFr: text("last_name_fr").notNull(),
  firstNameAr: text("first_name_ar").notNull(),
  lastNameAr: text("last_name_ar").notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  email: citext("email"),
  relation: guardianRelationEnum("relation").notNull(),
  ...timestamps,
});

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    /**
     * The Moroccan national student code. Unique when present, but nullable —
     * a newly-arrived student may not have one yet and must still be
     * enrollable. Postgres permits many NULLs under a unique constraint, which
     * is exactly the behaviour wanted.
     */
    massarCode: varchar("massar_code", { length: 16 }),
    firstNameFr: text("first_name_fr").notNull(),
    lastNameFr: text("last_name_fr").notNull(),
    firstNameAr: text("first_name_ar").notNull(),
    lastNameAr: text("last_name_ar").notNull(),
    birthDate: date("birth_date").notNull(),
    gender: genderEnum("gender").notNull(),
    /**
     * R2 **object key**, never a URL. URLs are minted as short-lived presigned
     * links at render time; storing one would either leak a public object or
     * bake in an expiry that goes stale in the database.
     */
    photoKey: text("photo_key"),
    status: studentStatusEnum("status").notNull().default("active"),
    enrolledAt: date("enrolled_at").notNull(),
    ...timestamps,
  },
  (t) => ({
    massarUnique: uniqueIndex("students_massar_unique").on(t.massarCode),
    byStatus: index("students_status_idx").on(t.status),
    byName: index("students_name_idx").on(t.lastNameFr, t.firstNameFr),
  })
);

/**
 * The parent-scoping boundary.
 *
 * Every query a parent makes is intersected through this table. It is the
 * single control that keeps one family out of another family's records
 * (`docs/security-madrasti.md` §3), so both directions are indexed.
 */
export const studentGuardians = pgTable(
  "student_guardians",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.guardianId] }),
    byGuardian: index("student_guardians_guardian_idx").on(t.guardianId),
  })
);

export const usersRelations = relations(users, ({ one }) => ({
  teacher: one(teachers, { fields: [users.id], references: [teachers.userId] }),
  guardian: one(guardians, { fields: [users.id], references: [guardians.userId] }),
  student: one(students, { fields: [users.id], references: [students.userId] }),
}));

export const teachersRelations = relations(teachers, ({ one }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] }),
}));

export const guardiansRelations = relations(guardians, ({ one, many }) => ({
  user: one(users, { fields: [guardians.userId], references: [users.id] }),
  students: many(studentGuardians),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] }),
  guardians: many(studentGuardians),
}));

export const studentGuardiansRelations = relations(studentGuardians, ({ one }) => ({
  student: one(students, { fields: [studentGuardians.studentId], references: [students.id] }),
  guardian: one(guardians, { fields: [studentGuardians.guardianId], references: [guardians.id] }),
}));
