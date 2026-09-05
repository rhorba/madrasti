import type { ActionResult } from "@madrasti/core";
import type { UserRole } from "@madrasti/core";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { audit } from "./audit.js";
import { isAuthError } from "./auth/errors.js";
import { type AppSession, assertRole, requireSession } from "./auth/session.js";

/**
 * The shape every mutation takes.
 *
 * `docs/architecture-madrasti.md` §4 fixes the order — authenticate, validate,
 * authorise, mutate, audit, revalidate — and this wrapper is that order made
 * unavoidable. Writing it once per action by hand is how one of the six
 * eventually goes missing, and the one that goes missing is never the first.
 *
 * Errors are returned, never thrown across the boundary: an uncaught throw in
 * a server action reaches the user as an opaque digest, which is useless to a
 * school secretary and to us.
 */

export type ActionContext = { session: AppSession };

type Handler<TInput, TData> = (input: TInput, ctx: ActionContext) => Promise<TData>;

type Options<TInput, TData> = {
  /** Roles permitted to run this action. */
  roles: UserRole[];
  /**
   * Parsed *into* `TInput`, from anything.
   *
   * The third parameter is `unknown` deliberately: the raw value is a
   * `FormData` or a plain object off the wire, and a schema with `.default()`
   * or `.coerce` has an input type that differs from what the handler
   * receives. Pinning both ends to `TInput` would reject exactly the schemas
   * that do the most work.
   */
  schema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  handler: Handler<TInput, TData>;
  /**
   * Audit entry. Omit only for genuinely read-only actions — every write to an
   * academic record is auditable (`docs/security-madrasti.md` §7).
   */
  audit?: (
    input: TInput,
    data: TData
  ) => {
    action: string;
    entity: string;
    entityId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
  };
  /** Paths to invalidate after a successful write. */
  revalidate?: (input: TInput, data: TData) => string[];
};

/**
 * Turn `FormData` into a plain object so Zod can parse it.
 *
 * Checkboxes are the awkward case: an unchecked box sends nothing at all, so
 * "absent" would silently read as undefined rather than false. Forms therefore
 * pair every checkbox with a hidden field of the same name, and the last value
 * wins — which is what `getAll().at(-1)` picks up.
 */
function normalize(raw: unknown): unknown {
  if (!(raw instanceof FormData)) return raw;

  const out: Record<string, unknown> = {};
  for (const key of new Set(raw.keys())) {
    const values = raw.getAll(key);
    const value = values.at(-1);
    if (typeof value !== "string") continue;
    if (value === "") {
      // An empty text input means "not provided", not "the empty string" —
      // otherwise every optional field fails its own validation.
      out[key] = undefined;
      continue;
    }
    out[key] = value === "true" ? true : value === "false" ? false : value;
  }
  return out;
}

export function defineAction<TInput, TData>(options: Options<TInput, TData>) {
  return async (raw: unknown): Promise<ActionResult<TData>> => {
    try {
      // 1. authenticate
      const session = await requireSession();

      // 2. authorise by role (per-record reach is the handler's job, via the
      //    assertCanReach* helpers — role alone is never sufficient)
      assertRole(session, ...options.roles);

      // 3. validate
      const parsed = options.schema.safeParse(normalize(raw));
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        return {
          ok: false,
          error: firstError(flat) ?? "errors.unexpected",
          fieldErrors: flat.fieldErrors as Record<string, string[]>,
        };
      }

      // 4. mutate
      const data = await options.handler(parsed.data, { session });

      // 5. audit
      const entry = options.audit?.(parsed.data, data);
      if (entry) {
        await audit(session, entry.action, entry.entity, entry.entityId, entry.payload);
      }

      // 6. revalidate
      for (const path of options.revalidate?.(parsed.data, data) ?? []) {
        revalidatePath(path, "layout");
      }

      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toErrorKey(error) };
    }
  };
}

function firstError(flat: {
  formErrors: string[];
  // Zod's flattened shape is partial — a field with no issue is simply absent.
  fieldErrors: Record<string, string[] | undefined>;
}) {
  return flat.formErrors[0] ?? Object.values(flat.fieldErrors).flat().filter(Boolean)[0];
}

/**
 * Map a thrown error to a translation key.
 *
 * Nothing from the database or the driver is ever passed through: a raw
 * Postgres message would leak column and constraint names to a parent, and it
 * is meaningless to the person reading it either way.
 */
function toErrorKey(error: unknown): string {
  if (isAuthError(error)) return "errors.notAuthorized";

  const message = error instanceof Error ? error.message : "";

  // Domain code throws errors whose message *is* the translation key —
  // `validateSlot` and the conflict checks do this. Pass those straight
  // through rather than flattening them to a generic failure.
  if (message.startsWith("errors.")) return message;

  // Constraint names are stable and map to something a user can act on.
  if (message.includes("users_email_unique")) return "errors.emailTaken";
  if (message.includes("students_massar_unique")) return "errors.massarTaken";
  if (message.includes("class_groups_year_name_unique")) return "errors.classNameTaken";
  if (message.includes("subjects_code_unique") || message.includes("subjects_code_key")) {
    return "errors.subjectCodeTaken";
  }
  if (message.includes("terms_year_order_unique")) return "errors.termOrderTaken";
  if (message.includes("academic_years_one_current")) return "errors.oneCurrentYear";
  if (message.includes("terms_one_current")) return "errors.oneCurrentTerm";
  if (message.includes("enrolments_one_active_per_year")) return "errors.alreadyEnrolled";
  if (message.includes("class_subjects_class_subject_unique"))
    return "errors.subjectAlreadyInClass";
  if (message.includes("violates foreign key constraint")) return "errors.stillInUse";

  console.error("[action] unhandled error:", error);
  return "errors.unexpected";
}
