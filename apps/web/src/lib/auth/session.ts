import { auth } from "@/auth";
import type { Locale, UserRole } from "@madrasti/core";
import { db, guardians, students, teachers, users } from "@madrasti/db";
import { eq } from "drizzle-orm";
import {
  NotAuthenticatedError,
  NotAuthorizedError,
  PasswordChangeRequiredError,
} from "./errors.js";

/**
 * The session, resolved against the database.
 *
 * `role` comes from the token; everything that grants *reach* — the teacher,
 * guardian or student row this account is attached to — is looked up fresh on
 * each request. Nothing authoritative is trusted from the JWT.
 */
export type AppSession = {
  userId: string;
  email: string;
  role: UserRole;
  locale: Locale;
  /** Set when role is `teacher`. */
  teacherId: string | null;
  /** Set when role is `parent`. */
  guardianId: string | null;
  /** Set when role is `student`. */
  studentId: string | null;
};

/**
 * Authenticate the current request.
 *
 * Re-reads the user on every call rather than trusting the token, because two
 * things must take effect immediately rather than at token expiry: an account
 * being disabled, and a forced password change. An eight-hour JWT would
 * otherwise keep a departed teacher signed in for the rest of the day.
 */
export async function requireSession(options?: {
  allowPasswordChange?: boolean;
}): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.id) throw new NotAuthenticatedError();

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user || !user.isActive) throw new NotAuthenticatedError();

  if (user.mustChangePassword && options?.allowPasswordChange !== true) {
    throw new PasswordChangeRequiredError();
  }

  const [teacher] =
    user.role === "teacher"
      ? await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, user.id))
      : [];
  const [guardian] =
    user.role === "parent"
      ? await db.select({ id: guardians.id }).from(guardians).where(eq(guardians.userId, user.id))
      : [];
  const [student] =
    user.role === "student"
      ? await db.select({ id: students.id }).from(students).where(eq(students.userId, user.id))
      : [];

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    teacherId: teacher?.id ?? null,
    guardianId: guardian?.id ?? null,
    studentId: student?.id ?? null,
  };
}

/** Narrow a session to one of the given roles, or refuse. */
export function assertRole(session: AppSession, ...allowed: UserRole[]): void {
  if (!allowed.includes(session.role)) {
    throw new NotAuthorizedError(`role ${session.role} not in [${allowed.join(", ")}]`);
  }
}

/** The home path for a role. Used after sign-in and by the middleware gate. */
export function homePathFor(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "parent":
      return "/parent";
    case "student":
      return "/student";
  }
}
