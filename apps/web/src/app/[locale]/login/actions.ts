"use server";

import { signIn } from "@/auth";
import { checkLoginAllowed, clearLoginAttempts, recordFailedLogin } from "@/lib/rate-limit";
import { type ActionResult, signInSchema } from "@madrasti/core";
import { db, users } from "@madrasti/db";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

/**
 * Client IP.
 *
 * Behind Railway's proxy the socket address is the proxy, so the forwarded
 * header is the only signal available. It is spoofable by a direct caller,
 * which is why rate limiting counts against the **email** as well — an
 * attacker rotating a header still burns the per-account budget.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type SignInResult = ActionResult<{ role: string; mustChangePassword: boolean }>;

export async function signInAction(formData: FormData): Promise<SignInResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "errors.invalidCredentials" };
  }

  const ip = await clientIp();
  const limit = checkLoginAllowed(ip, parsed.data.email);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "errors.tooManyAttempts",
      fieldErrors: { minutes: [String(limit.retryAfterMinutes)] },
    };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch {
    recordFailedLogin(ip, parsed.data.email);
    // One message for every failure — wrong email, wrong password, disabled
    // account. Distinguishing them tells an attacker which addresses are real
    // (`docs/security-madrasti.md` §4).
    return { ok: false, error: "errors.invalidCredentials" };
  }

  clearLoginAttempts(ip, parsed.data.email);

  const [user] = await db
    .select({ role: users.role, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (!user) return { ok: false, error: "errors.unexpected" };

  return { ok: true, data: { role: user.role, mustChangePassword: user.mustChangePassword } };
}
