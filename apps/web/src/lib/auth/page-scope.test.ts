import { db, studentGuardians } from "@madrasti/db";
import { beforeAll, describe, expect, it } from "vitest";
import { requireReachableStudent } from "./page-scope.js";
import type { AppSession } from "./session.js";

/**
 * How a page refuses — `docs/security-madrasti.md` §5.
 *
 * `scope.ts` decides *whether* a parent may reach a child; this file asserts
 * what the user is shown when the answer is no. Both halves matter:
 *
 * - A refusal must not surface as an application error. A thrown
 *   `NotAuthorizedError` inside a server component becomes a 500 with an
 *   opaque digest, which tells a parent who mistyped a URL that something is
 *   broken (`CLAUDE.md` §10.6).
 * - A refusal must be indistinguishable from an id that does not exist, or the
 *   response itself becomes a way to enumerate the school's students.
 *
 * Requires a seeded database (`pnpm db:setup`).
 */

/** How Next signals a 404 from `notFound()`. */
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

function session(partial: Partial<AppSession> & Pick<AppSession, "role">): AppSession {
  return {
    userId: "00000000-0000-0000-0000-0000000000ff",
    email: "test@example.ma",
    locale: "fr",
    teacherId: null,
    guardianId: null,
    studentId: null,
    ...partial,
  };
}

let parentA: AppSession;
let childOfA: string;
let childOfB: string;

beforeAll(async () => {
  const links = await db
    .select({ guardianId: studentGuardians.guardianId, studentId: studentGuardians.studentId })
    .from(studentGuardians)
    .limit(200);

  const first = links[0];
  const other = links.find((link) => link.guardianId !== first?.guardianId);
  if (!first || !other) throw new Error("database is not seeded — run `pnpm db:setup`");

  parentA = session({ role: "parent", guardianId: first.guardianId });
  childOfA = first.studentId;
  childOfB = other.studentId;
});

describe("requireReachableStudent", () => {
  it("lets a parent through to their own child", async () => {
    await expect(requireReachableStudent(parentA, childOfA)).resolves.toBeUndefined();
  });

  it("answers 404 for another family's child, not 403 and not 500", async () => {
    await expect(requireReachableStudent(parentA, childOfB)).rejects.toThrow(NOT_FOUND);
  });

  it("answers the same 404 for an id that does not exist at all", async () => {
    // The two responses being identical is the point: a parent who walks ids
    // learns nothing about which of them are real.
    await expect(
      requireReachableStudent(parentA, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(NOT_FOUND);
  });

  it("refuses a student reaching a classmate", async () => {
    const asClassmate = session({ role: "student", studentId: childOfA });
    await expect(requireReachableStudent(asClassmate, childOfB)).rejects.toThrow(NOT_FOUND);
  });

  it("lets an admin through", async () => {
    await expect(
      requireReachableStudent(session({ role: "admin" }), childOfB)
    ).resolves.toBeUndefined();
  });
});
