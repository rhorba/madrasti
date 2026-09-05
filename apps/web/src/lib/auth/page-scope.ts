import { notFound } from "next/navigation";
import { NotAuthorizedError } from "./errors.js";
import { assertCanReachStudent } from "./scope.js";
import type { AppSession } from "./session.js";

/**
 * Scope checks for a **page**.
 *
 * The helpers in `scope.ts` throw, which is right inside a server action — the
 * action wrapper turns the throw into a translated message. In a server
 * component a throw becomes a 500 with an opaque digest, and a parent who
 * mistypes a URL should not meet an application error.
 *
 * A refused id becomes a 404, deliberately, not a 403: the holder of an id
 * they may not reach must not learn from the response whether it exists
 * (`docs/security-madrasti.md` §5). A parent probing another family's child
 * therefore sees exactly what they would see for an id that was never issued.
 */
export async function requireReachableStudent(
  session: AppSession,
  studentId: string
): Promise<void> {
  try {
    await assertCanReachStudent(session, studentId);
  } catch (error) {
    // Only authorisation collapses into a 404. A database failure is still a
    // 500 — pretending it is a missing page would hide a real outage.
    if (error instanceof NotAuthorizedError) notFound();
    throw error;
  }
}
