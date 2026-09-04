/**
 * Authorisation failures.
 *
 * These are thrown, never returned. A helper that returned an empty list on
 * refusal would be indistinguishable from a legitimate empty result, and a
 * caller would render "no students" instead of refusing — which is how a
 * missing check survives review (`docs/security-madrasti.md` §3).
 */

export class NotAuthenticatedError extends Error {
  readonly key = "errors.notAuthorized";
  constructor() {
    super("not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

export class NotAuthorizedError extends Error {
  readonly key = "errors.notAuthorized";
  constructor(detail: string) {
    // The detail is for the server log only. It names the resource, so it must
    // never be shown to the user — the UI renders `key` instead.
    super(`not authorized: ${detail}`);
    this.name = "NotAuthorizedError";
  }
}

export class PasswordChangeRequiredError extends Error {
  constructor() {
    super("password change required");
    this.name = "PasswordChangeRequiredError";
  }
}

export function isAuthError(
  error: unknown
): error is NotAuthenticatedError | NotAuthorizedError | PasswordChangeRequiredError {
  return (
    error instanceof NotAuthenticatedError ||
    error instanceof NotAuthorizedError ||
    error instanceof PasswordChangeRequiredError
  );
}
