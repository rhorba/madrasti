import { auditLog, db } from "@madrasti/db";
import { headers } from "next/headers";
import type { AppSession } from "./auth/session.js";

/**
 * Append to the audit trail.
 *
 * `payload` may carry changed **academic** fields with old and new values — a
 * mark moving from 12 to 14 is exactly what an audit needs. It must never
 * carry identity or contact fields, a password, or a token
 * (`docs/security-madrasti.md` §7).
 */
export async function audit(
  session: Pick<AppSession, "userId">,
  action: string,
  entity: string,
  entityId?: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();

  await db.insert(auditLog).values({
    actorId: session.userId,
    action,
    entity,
    entityId: entityId ?? null,
    payload: payload ?? null,
    // `inet` rejects a malformed value, and a missing header is normal in dev.
    ip: ip && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null,
  });
}
