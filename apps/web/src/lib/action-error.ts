import { isAuthError } from "./auth/errors.js";

/**
 * Map a thrown error to a translation key.
 *
 * Exported for its own unit tests. It had none, which is why a driver upgrade
 * that moved the constraint name into `error.cause` degraded ten user-facing
 * messages to "an unexpected error" without a single test going red.
 *
 * Nothing from the database or the driver is ever passed through: a raw
 * Postgres message would leak column and constraint names to a parent, and it
 * is meaningless to the person reading it either way.
 */
export function toErrorKey(error: unknown): string {
  if (isAuthError(error)) return "errors.notAuthorized";

  const message = errorText(error);

  // Domain code throws errors whose message *is* the translation key —
  // `validateSlot` and the conflict checks do this. Pass those straight
  // through rather than flattening them to a generic failure.
  if (message.startsWith("errors.")) return message;

  // Constraint names are stable and map to something a user can act on.
  if (message.includes("users_email_unique")) return "errors.emailTaken";
  if (message.includes("students_massar_unique")) return "errors.massarTaken";
  if (message.includes("class_groups_year_name_unique")) return "errors.classNameTaken";
  if (message.includes("subjects_code_unique") || message.includes("subjects_code_key")) {
    return "errors.subjectCodeTaken";
  }
  if (message.includes("terms_year_order_unique")) return "errors.termOrderTaken";
  if (message.includes("academic_years_one_current")) return "errors.oneCurrentYear";
  if (message.includes("terms_one_current")) return "errors.oneCurrentTerm";
  if (message.includes("enrolments_one_active_per_year")) return "errors.alreadyEnrolled";
  if (message.includes("class_subjects_class_subject_unique"))
    return "errors.subjectAlreadyInClass";
  if (message.includes("violates foreign key constraint")) return "errors.stillInUse";

  console.error("[action] unhandled error:", error);
  return "errors.unexpected";
}

/**
 * An error's own message plus every message in its `cause` chain.
 *
 * Drizzle 0.45 wraps a driver error: the thrown `message` became
 * `"Failed query: insert into ..."` and the Postgres detail carrying the
 * constraint name moved to `error.cause`. Matching only the top-level message
 * silently degraded ten user-facing messages to "an unexpected error" — a
 * duplicate email stopped saying it was a duplicate email. Nothing failed
 * loudly, which is why this reads the chain rather than either one level.
 *
 * The joined text is only ever matched against; it is never shown to anyone.
 */
function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  // A chain is short by nature; the bound is only to stop a cycle.
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join("\n");
}
