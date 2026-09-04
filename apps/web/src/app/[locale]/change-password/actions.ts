"use server";

import { audit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { type ActionResult, changePasswordSchema } from "@madrasti/core";
import { db, users } from "@madrasti/db";
import { hash, verify } from "argon2";
import { eq } from "drizzle-orm";

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  // `allowPasswordChange` — this is the one route a user with
  // `mustChangePassword` may reach, so the guard must not bounce them here.
  // Wrapped because `requireSession` throws: a stale cookie should produce a
  // translated message, not an opaque server-action digest.
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession({ allowPasswordChange: true });
  } catch {
    return { ok: false, error: "errors.notAuthorized" };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: Object.values(flat.fieldErrors)[0]?.[0] ?? "errors.unexpected",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return { ok: false, error: "errors.unexpected" };

  const ok = await verify(user.passwordHash, parsed.data.currentPassword).catch(() => false);
  if (!ok) return { ok: false, error: "errors.invalidCredentials" };

  await db
    .update(users)
    .set({
      passwordHash: await hash(parsed.data.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.userId));

  // Note what is *not* recorded: neither password, nor a hash, nor a length.
  await audit(session, "user.password_changed", "users", session.userId);

  return { ok: true, data: undefined };
}
