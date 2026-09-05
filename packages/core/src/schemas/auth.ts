import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "../constants.js";
import { USER_ROLES } from "../enums.js";
import { emailSchema, localeSchema, uuidSchema } from "./common.js";

/**
 * A short list of values that must never be a password here. Not a security
 * control on its own — argon2id and rate limiting are (see security doc §4) —
 * but it catches the handful a rushed school secretary would actually pick
 * when creating twenty accounts in an afternoon.
 */
const OBVIOUS_PASSWORDS = new Set([
  "password",
  "motdepasse",
  "12345678",
  "1234567890",
  "azertyuiop",
  "qwertyuiop",
  "madrasti",
  "madrasti123",
  "ecole2025",
  "ecole2026",
]);

/**
 * Password policy: length only, plus an obvious-value check.
 *
 * Deliberately no composition rules and no forced rotation. Both push
 * non-technical users toward writing passwords on a note stuck to the monitor,
 * which in a school office is the real risk (security doc §4).
 */
export const passwordSchema = z
  // Same reason as `changePasswordSchema`: a missing field is `null`, and the
  // default type error is an English sentence about types.
  .string({ required_error: "errors.required", invalid_type_error: "errors.required" })
  .min(PASSWORD_MIN_LENGTH, { message: "errors.passwordTooShort" })
  .max(200)
  .refine((v) => !OBVIOUS_PASSWORDS.has(v.toLowerCase()), {
    message: "errors.passwordTooCommon",
  });

export const signInSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: an existing password predates the policy, and
  // validating it here would leak which accounts hold a weak one.
  password: z.string().min(1, { message: "errors.required" }),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const changePasswordSchema = z
  .object({
    // `required_error` as well as `min`: a field the browser did not send at
    // all is `null`, and Zod's own "Expected string, received null" would be
    // handed straight to the user (§10.6). Every message here must be a
    // translation key.
    currentPassword: z
      .string({ required_error: "errors.required", invalid_type_error: "errors.required" })
      .min(1, { message: "errors.required" }),
    newPassword: passwordSchema,
    confirmPassword: z.string({
      required_error: "errors.required",
      invalid_type_error: "errors.required",
    }),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "errors.passwordMismatch",
      });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "errors.passwordUnchanged",
      });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createAccountSchema = z.object({
  email: emailSchema,
  role: z.enum(USER_ROLES),
  locale: localeSchema.default("fr"),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const resetPasswordSchema = z.object({ userId: uuidSchema });

export const setUserActiveSchema = z.object({
  userId: uuidSchema,
  isActive: z.boolean(),
});

export const updateLocaleSchema = z.object({ locale: localeSchema });
