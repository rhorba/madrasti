/**
 * Domain enums.
 *
 * These are the single source of truth: `packages/db` builds its PostgreSQL
 * enums from these arrays, and the Zod schemas validate against them. Adding a
 * value here and nowhere else is a compile error at the db layer, which is the
 * intent — the database and the validation layer cannot drift apart.
 */

export const LOCALES = ["ar", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Arabic is the only RTL locale we ship. */
export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export const USER_ROLES = ["admin", "teacher", "parent", "student"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const GENDERS = ["m", "f"] as const;
export type Gender = (typeof GENDERS)[number];

export const STUDENT_STATUSES = ["active", "transferred", "graduated", "withdrawn"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const GUARDIAN_RELATIONS = ["father", "mother", "tutor"] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Everyone starts present; the teacher only touches the exceptions (UX §3). */
export const DEFAULT_ATTENDANCE_STATUS: AttendanceStatus = "present";

export const ASSESSMENT_TYPES = ["controle", "devoir_surveille", "oral", "participation"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const SESSION_STATUSES = ["scheduled", "held", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const BULLETIN_DECISIONS = [
  "admis",
  "admis_avec_felicitations",
  "encouragements",
  "avertissement",
  "redouble",
] as const;
export type BulletinDecision = (typeof BULLETIN_DECISIONS)[number];

/**
 * Weekdays, Monday = 1 through Saturday = 6.
 *
 * Saturday is a teaching day in Moroccan schools — the week is Mon–Sat, not
 * Mon–Fri. Sunday (7) is deliberately absent rather than merely unused.
 */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_MIN = 1;
export const WEEKDAY_MAX = 6;
