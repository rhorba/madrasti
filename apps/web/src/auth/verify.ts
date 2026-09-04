import { randomBytes } from "node:crypto";
import type { Locale, SignInInput, UserRole } from "@madrasti/core";
import { db, users } from "@madrasti/db";
import { hash, verify } from "argon2";
import { eq } from "drizzle-orm";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  locale: Locale;
  mustChangePassword: boolean;
};

/**
 * A real argon2 hash of a random secret, verified against when no user exists.
 *
 * Without this, a request for an unknown email returns in microseconds while
 * one for a known email takes the full argon2 duration — which lets anyone
 * enumerate who has an account. For a single school, that list is the staff
 * and the families, so it is itself sensitive.
 *
 * It has to be a *genuine* hash: a fabricated string makes `verify` throw
 * immediately, which reintroduces exactly the timing gap it was meant to close.
 * Computed once, lazily, and reused.
 */
let dummyHashPromise: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

/**
 * Verify an email and password against the database.
 *
 * Returns `null` for every failure — wrong email, wrong password, disabled
 * account — with no indication of which. Distinguishing them would tell an
 * attacker which addresses are real.
 */
export async function verifyCredentials(input: SignInInput): Promise<AuthenticatedUser | null> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!user) {
    // Spend the same time as a real verification would.
    await verify(await getDummyHash(), input.password).catch(() => false);
    return null;
  }

  const ok = await verify(user.passwordHash, input.password).catch(() => false);
  if (!ok) return null;

  // Checked here *and* on every request in `requireSession()` — a disabled
  // account must lose access immediately, not when its JWT expires.
  if (!user.isActive) return null;

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    mustChangePassword: user.mustChangePassword,
  };
}
