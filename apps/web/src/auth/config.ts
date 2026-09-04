import { SESSION_MAX_AGE_SECONDS, signInSchema } from "@madrasti/core";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "./verify.js";

/**
 * Auth.js v5 configuration.
 *
 * Credentials only. No Google, no SSO: families will not have organisational
 * accounts, and every extra sign-in route is one more thing the school office
 * has to explain to a parent on the phone (`CLAUDE.md` §15).
 */

/**
 * Force secure cookies in production.
 *
 * This single line is the fix for a production failure inherited from Bina.
 * Behind a TLS-terminating proxy (Railway, Render, Fly), Auth.js's own
 * protocol detection disagrees between runtimes: the Edge runtime sees https
 * and writes the `__Secure-`-prefixed cookie, while the Node runtime does not
 * and reads the unprefixed name. Login appears to succeed and the user is
 * silently bounced straight back out, with no error anywhere.
 *
 * Every direct `getToken()` call must pass `secureCookie` to match — see
 * `src/middleware.ts` (`CLAUDE.md` §16.1).
 */
export const useSecureCookies = process.env.NODE_ENV === "production";

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        return verifyCredentials(parsed.data);
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },

  useSecureCookies,
  trustHost: true,

  pages: {
    signIn: "/fr/login",
    error: "/fr/login",
  },

  callbacks: {
    /**
     * The token carries **identity and role only** — never a list of the
     * classes or children the user may reach. Those are recomputed from the
     * database on every request, so a token minted before a teacher lost a
     * class cannot still grant it (`docs/security-madrasti.md` §3).
     */
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id ?? "";
        token.role = user.role;
        token.locale = user.locale;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.locale = token.locale;
      session.user.mustChangePassword = token.mustChangePassword;
      return session;
    },
  },
};
