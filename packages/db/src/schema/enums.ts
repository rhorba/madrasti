import {
  ASSESSMENT_TYPES,
  ATTENDANCE_STATUSES,
  BULLETIN_DECISIONS,
  GENDERS,
  GUARDIAN_RELATIONS,
  LOCALES,
  SESSION_STATUSES,
  STUDENT_STATUSES,
  USER_ROLES,
} from "@madrasti/core";
import { pgEnum } from "drizzle-orm/pg-core";

/**
 * PostgreSQL enums, built from the `@madrasti/core` arrays.
 *
 * Deriving them rather than restating them is the point: the database, the Zod
 * schemas and the TypeScript types cannot drift apart, and adding a value in
 * one place without the other is a compile error rather than a runtime
 * surprise months later.
 *
 * Native enums rather than lookup tables because these are compared in nearly
 * every `WHERE` clause — a lookup table would add a join to most queries for no
 * benefit at this scale.
 */

export const localeEnum = pgEnum("locale", LOCALES);
export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const genderEnum = pgEnum("gender", GENDERS);
export const studentStatusEnum = pgEnum("student_status", STUDENT_STATUSES);
export const guardianRelationEnum = pgEnum("guardian_relation", GUARDIAN_RELATIONS);
export const attendanceStatusEnum = pgEnum("attendance_status", ATTENDANCE_STATUSES);
export const assessmentTypeEnum = pgEnum("assessment_type", ASSESSMENT_TYPES);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const bulletinDecisionEnum = pgEnum("bulletin_decision", BULLETIN_DECISIONS);
