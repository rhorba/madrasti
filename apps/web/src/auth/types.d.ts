import type { Locale, UserRole } from "@madrasti/core";
import type { DefaultSession } from "next-auth";

/**
 * Session and JWT shape.
 *
 * Note what is absent: no list of reachable classes or children. Those are
 * recomputed from the database per request by `lib/auth/scope.ts`, so stale
 * authority cannot ride along in a token (`docs/security-madrasti.md` §3).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      locale: Locale;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    locale: Locale;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: UserRole;
    locale: Locale;
    mustChangePassword: boolean;
  }
}
