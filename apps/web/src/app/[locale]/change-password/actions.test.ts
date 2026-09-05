import { auditLog, db, users } from "@madrasti/db";
import { verify } from "argon2";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { changePasswordAction } from "./actions.js";

/**
 * Changing a password.
 *
 * The one route a provisioned account may reach before anything else, so the
 * guard has to let them through while still refusing everyone else. Beyond
 * that, this file is about what must **not** happen: the old password
 * accepted, the new one stored in the clear, or either of them written into
 * the audit log (`CLAUDE.md` §11).
 *
 * Requires a migrated and seeded database (`pnpm db:setup`).
 */

const signedInAs = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (signedInAs.userId ? { user: { id: signedInAs.userId } } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const CURRENT = "madrasti2026!";
const NEXT = "Nouveau-Mot-2026!";

let userId: string;
let originalHash: string;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeAll(async () => {
  // A teacher rather than the admin: every other file in this suite signs in
  // as the admin, and rewriting its hash mid-run would break them.
  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.role, "teacher"))
    .limit(1);
  if (!row) throw new Error("database is not seeded — run `pnpm db:setup`");
  userId = row.id;
  originalHash = row.passwordHash;
  signedInAs.userId = userId;
});

afterEach(async () => {
  // Put the seeded password back: the E2E suite signs in with it.
  await db
    .update(users)
    .set({ passwordHash: originalHash, mustChangePassword: false })
    .where(eq(users.id, userId));
  signedInAs.userId = userId;
});

afterAll(() => {
  signedInAs.userId = null;
});

describe("changing a password", () => {
  it("replaces the hash and clears the must-change flag", async () => {
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId));

    const result = await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT })
    );
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.mustChangePassword).toBe(false);
    expect(await verify(row!.passwordHash, NEXT)).toBe(true);
    expect(await verify(row!.passwordHash, CURRENT)).toBe(false);
  });

  it("stores argon2id, never the password itself", async () => {
    await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT })
    );

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.passwordHash).not.toContain(NEXT);
    // §11 allows argon2id and nothing else.
    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("refuses the wrong current password", async () => {
    const result = await changePasswordAction(
      form({ currentPassword: "not-the-password", newPassword: NEXT, confirmPassword: NEXT })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.invalidCredentials");

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.passwordHash).toBe(originalHash);
  });

  it("refuses when the confirmation does not match", async () => {
    const result = await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: NEXT, confirmPassword: "something-else" })
    );
    expect(result.ok).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.passwordHash).toBe(originalHash);
  });

  it("refuses a password too short to be worth having", async () => {
    const result = await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: "abc", confirmPassword: "abc" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^errors\./);
  });

  it("refuses a form with fields missing, without throwing", async () => {
    const result = await changePasswordAction(form({ currentPassword: CURRENT }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^errors\./);
  });

  it("refuses nobody at all, with a translated message rather than a digest", async () => {
    signedInAs.userId = null;
    const result = await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("errors.notAuthorized");
  });

  it("refuses a cookie whose user no longer exists", async () => {
    // A JWT outlives the row it points at. The user should meet a message,
    // not a 500.
    signedInAs.userId = "00000000-0000-0000-0000-000000000000";
    const result = await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^errors\./);
  });

  it("records that the password changed, and nothing about the password", async () => {
    await changePasswordAction(
      form({ currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT })
    );

    const entries = await db
      .select({ action: auditLog.action, payload: auditLog.payload })
      .from(auditLog)
      .where(eq(auditLog.entityId, userId));

    const changed = entries.filter((row) => row.action === "user.password_changed");
    expect(changed.length).toBeGreaterThan(0);

    // Neither password, nor a hash, nor a length.
    const serialised = JSON.stringify(entries);
    expect(serialised).not.toContain(NEXT);
    expect(serialised).not.toContain(CURRENT);
    expect(serialised).not.toContain("$argon2");
  });
});
