import type { UserRole } from "@madrasti/core";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  NotAuthenticatedError,
  NotAuthorizedError,
  PasswordChangeRequiredError,
} from "./errors.js";
import { type AppSession, homePathFor, requireSession } from "./session.js";

/**
 * The session, for a **page**.
 *
 * `requireSession` throws, which is right inside a server action — the action
 * wrapper catches it and returns a translated error. In a server component a
 * throw becomes a 500 with an opaque digest, which is the wrong answer to
 * "your session is stale": the user should simply be sent back to the login
 * page.
 *
 * That case is not hypothetical. A JWT outlives the row it points at — after a
 * database reset, or once an account is deleted — and the holder of such a
 * cookie would otherwise meet an application error on every route.
 */
export async function requirePageSession(options?: {
  allowPasswordChange?: boolean;
  roles?: UserRole[];
}): Promise<AppSession> {
  const locale = await getLocale();

  let session: AppSession;
  try {
    session = await requireSession(
      options?.allowPasswordChange ? { allowPasswordChange: true } : undefined
    );
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect(`/${locale}/change-password`);
    }
    if (error instanceof NotAuthenticatedError || error instanceof NotAuthorizedError) {
      redirect(`/${locale}/login`);
    }
    throw error;
  }

  // Wrong role for this route: send them to their own home rather than
  // refusing outright — they are signed in, just in the wrong place.
  if (options?.roles && !options.roles.includes(session.role)) {
    redirect(`/${locale}${homePathFor(session.role)}`);
  }

  return session;
}
