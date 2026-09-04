"use server";

import { signOut } from "@/auth";
import { redirect } from "next/navigation";

/**
 * End the session and return to the login page **in the user's language**.
 *
 * Deliberately not `signOut({ redirectTo })`: Auth.js resolves that against
 * `AUTH_URL`, which sends the browser to a fixed origin rather than the one it
 * is actually on, and it would hard-code a single locale — so an Arabic-
 * speaking teacher would sign out and land on a French page. Clearing the
 * session and redirecting ourselves keeps both correct.
 */
export async function signOutAction(locale: string): Promise<never> {
  await signOut({ redirect: false });
  redirect(`/${locale}/login`);
}
