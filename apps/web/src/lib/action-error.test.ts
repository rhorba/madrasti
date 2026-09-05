import { describe, expect, it } from "vitest";
import { toErrorKey } from "./action-error.js";

/**
 * What a user is told when a write fails.
 *
 * This file exists because it did not. Upgrading `drizzle-orm` from 0.38 to
 * 0.45 changed the shape of a driver error — the thrown `message` became
 * `"Failed query: insert into ..."` and the Postgres detail naming the violated
 * constraint moved to `error.cause`. `toErrorKey` matched only the top-level
 * message, so ten user-facing messages silently became "an unexpected error":
 * a duplicate email stopped saying it was a duplicate email. The whole suite
 * stayed green (`.logs/issues.md`, Sprint 9).
 *
 * So the fixtures below are shaped like the **real** thing, wrapper and all.
 */

/** A driver error as drizzle 0.45 throws it. */
function wrappedQueryError(postgresMessage: string): Error {
  return new Error(
    'Failed query: insert into "users" ("id", "email") values ($1, $2)\nparams: 1,a@b.c',
    { cause: Object.assign(new Error(postgresMessage), { code: "23505" }) }
  );
}

describe("a constraint a user can act on", () => {
  const CASES: [string, string][] = [
    ['duplicate key value violates unique constraint "users_email_unique"', "errors.emailTaken"],
    [
      'duplicate key value violates unique constraint "students_massar_unique"',
      "errors.massarTaken",
    ],
    [
      'duplicate key value violates unique constraint "class_groups_year_name_unique"',
      "errors.classNameTaken",
    ],
    [
      'duplicate key value violates unique constraint "subjects_code_unique"',
      "errors.subjectCodeTaken",
    ],
    [
      'duplicate key value violates unique constraint "terms_year_order_unique"',
      "errors.termOrderTaken",
    ],
    [
      'duplicate key value violates unique constraint "academic_years_one_current"',
      "errors.oneCurrentYear",
    ],
    ['duplicate key value violates unique constraint "terms_one_current"', "errors.oneCurrentTerm"],
    [
      'duplicate key value violates unique constraint "enrolments_one_active_per_year"',
      "errors.alreadyEnrolled",
    ],
    [
      'duplicate key value violates unique constraint "class_subjects_class_subject_unique"',
      "errors.subjectAlreadyInClass",
    ],
    [
      'update or delete on table "subjects" violates foreign key constraint on table "class_subjects"',
      "errors.stillInUse",
    ],
  ];

  for (const [postgresMessage, key] of CASES) {
    it(`maps ${key} even when the driver wraps it`, () => {
      expect(toErrorKey(wrappedQueryError(postgresMessage))).toBe(key);
    });
  }

  it("still maps an unwrapped error, so an older driver shape keeps working", () => {
    expect(
      toErrorKey(new Error('duplicate key value violates unique constraint "users_email_unique"'))
    ).toBe("errors.emailTaken");
  });

  it("reads more than one level down the chain", () => {
    const deep = new Error("outer", {
      cause: new Error("middle", {
        cause: new Error('violates unique constraint "users_email_unique"'),
      }),
    });
    expect(toErrorKey(deep)).toBe("errors.emailTaken");
  });
});

describe("errors the domain raises itself", () => {
  it("passes a translation key straight through", () => {
    // `validateSlot` and the conflict checks throw the key as the message.
    expect(toErrorKey(new Error("errors.classBusy"))).toBe("errors.classBusy");
    expect(toErrorKey(new Error("errors.bulletinPublished"))).toBe("errors.bulletinPublished");
  });
});

describe("anything else", () => {
  it("becomes the generic message rather than leaking a driver sentence", () => {
    // The point of the fallback: a raw Postgres sentence names columns and
    // constraints, means nothing to a parent, and must never reach one (§10.6).
    const key = toErrorKey(wrappedQueryError('null value in column "x" violates not-null'));
    expect(key).toBe("errors.unexpected");
  });

  it("survives a thrown non-Error without crashing the action wrapper", () => {
    expect(toErrorKey("a string")).toBe("errors.unexpected");
    expect(toErrorKey(undefined)).toBe("errors.unexpected");
  });

  it("does not loop forever on a circular cause chain", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    expect(toErrorKey(a)).toBe("errors.unexpected");
  });
});
