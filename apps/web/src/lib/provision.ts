import { randomInt } from "node:crypto";
import { type Locale, TEMP_PASSWORD_LENGTH, type UserRole } from "@madrasti/core";
import { db, users } from "@madrasti/db";
import { hash } from "argon2";
import { eq } from "drizzle-orm";

/**
 * Account provisioning.
 *
 * The school creates every account; there is no public sign-up
 * (`CLAUDE.md` §15). The temporary password is shown to the admin **once**, at
 * creation, and is never emailed, re-displayed, or written to a log — the
 * school hands it over in person or by SMS.
 */

/**
 * Alphabet for temporary passwords.
 *
 * Deliberately excludes `0/O`, `1/l/I` and similar look-alikes: these get read
 * off a screen, written on a slip of paper, and typed by a parent on a phone.
 * A password that cannot be transcribed reliably generates a support call, and
 * the entropy lost is bought back by the length below.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** ~71 bits at length 12 — ample for a credential that must be changed on use. */
export function generateTempPassword(length = TEMP_PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    // randomInt is a CSPRNG and rejection-samples, so no modulo bias.
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export type ProvisionedAccount = { userId: string; email: string; tempPassword: string };

/**
 * Create a login.
 *
 * Returns the plaintext password to the caller so the admin screen can show it
 * once. It is never persisted in plaintext and never audited.
 */
export async function provisionAccount(input: {
  email: string;
  role: UserRole;
  locale?: Locale | undefined;
}): Promise<ProvisionedAccount> {
  const tempPassword = generateTempPassword();

  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: await hash(tempPassword),
      role: input.role,
      locale: input.locale ?? "fr",
      // Forced change on first login, enforced in middleware and again in
      // requireSession so a missed route pattern still refuses.
      mustChangePassword: true,
    })
    .returning({ id: users.id, email: users.email });

  if (!row) throw new Error("account insert failed");
  return { userId: row.id, email: row.email, tempPassword };
}

/** Issue a new temporary password for an existing account. */
export async function resetAccountPassword(userId: string): Promise<string> {
  const tempPassword = generateTempPassword();
  await db
    .update(users)
    .set({
      passwordHash: await hash(tempPassword),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return tempPassword;
}
