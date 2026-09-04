/** Domain constants. Values that appear in more than one place live here. */

/** Moroccan schools mark out of 20. Overridable per school via `school.gradingMax`. */
export const DEFAULT_GRADING_MAX = 20;

/** Three trimestres per academic year. */
export const TERMS_PER_YEAR = 3;

/**
 * Averages are rounded half-up to 2 decimals, and only ever at the very end of
 * a calculation. Rounding intermediate values makes averages drift — see
 * `docs/test-strategy-madrasti.md` §3.
 */
export const AVERAGE_DECIMALS = 2;

/** Minimum password length. No composition rules — see security doc §4. */
export const PASSWORD_MIN_LENGTH = 10;

/** Length of a generated temporary password, shown to the admin exactly once. */
export const TEMP_PASSWORD_LENGTH = 12;

/** Session lifetime: one school day. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Presigned URLs for student photos and attachments are short-lived. */
export const PRESIGNED_URL_TTL_SECONDS = 5 * 60;

/** Moroccan Massar student codes are short alphanumeric strings, e.g. "R130012345". */
export const MASSAR_CODE_MAX_LENGTH = 16;
export const MASSAR_CODE_PATTERN = /^[A-Za-z0-9]{4,16}$/;

/** Upload limits, enforced server-side before a presigned URL is issued. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

/**
 * The school's timezone. Morocco shifts to and from UTC+0 around Ramadan, so
 * every timestamp is `timestamptz` and local days are resolved through this
 * zone — never by storing a naive local time.
 */
export const SCHOOL_TIMEZONE = "Africa/Casablanca";

/** Homework horizon shown on the student and parent home screens. */
export const UPCOMING_HOMEWORK_DAYS = 14;
