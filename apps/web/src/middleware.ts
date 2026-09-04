import { routing } from "@/i18n/routing";
import { LOCALES, type UserRole } from "@madrasti/core";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

/**
 * Route protection and locale resolution.
 *
 * Two inherited constraints from Bina, both applied deliberately
 * (`CLAUDE.md` §16):
 *
 * 1. **`getToken`, never the full `auth()` wrapper.** Wrapping middleware in
 *    `auth()` hangs the edge runtime indefinitely on self-hosted `next start` —
 *    confirmed there by bisection, where stripping the wrapper took a route
 *    from a 30s timeout to 361ms. `getToken` only decrypts the session cookie,
 *    which is all a route gate needs.
 * 2. **`secureCookie` forced to match the Auth.js config.** Both sides must
 *    agree on the cookie name regardless of either one's own https detection,
 *    or login silently loops.
 *
 * This is a redirect convenience, **not the security boundary.** A route
 * pattern is easy to get subtly wrong, so the real enforcement lives in the
 * query and action layer, where every function takes the session and scopes
 * itself (`docs/architecture-madrasti.md` §5).
 */

const LOCALE_SEGMENT = `(?:${LOCALES.join("|")})`;

/**
 * The app cannot authenticate anyone without this, so failing loudly at module
 * load beats decrypting every session against `undefined` and silently
 * treating every user as signed out.
 */
const AUTH_SECRET: string = (() => {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
})();

/** Route group prefixes and the roles allowed into each. */
const ROLE_ROUTES: { pattern: RegExp; roles: UserRole[] }[] = [
  { pattern: new RegExp(`^/${LOCALE_SEGMENT}/admin(?:/.*)?$`), roles: ["admin"] },
  { pattern: new RegExp(`^/${LOCALE_SEGMENT}/teacher(?:/.*)?$`), roles: ["teacher", "admin"] },
  { pattern: new RegExp(`^/${LOCALE_SEGMENT}/parent(?:/.*)?$`), roles: ["parent"] },
  { pattern: new RegExp(`^/${LOCALE_SEGMENT}/student(?:/.*)?$`), roles: ["student"] },
];

const CHANGE_PASSWORD = new RegExp(`^/${LOCALE_SEGMENT}/change-password$`);
const LOGIN = new RegExp(`^/${LOCALE_SEGMENT}/login$`);

function localeOf(pathname: string): string {
  const segment = pathname.split("/")[1];
  return segment && (LOCALES as readonly string[]).includes(segment)
    ? segment
    : routing.defaultLocale;
}

function homePathFor(role: UserRole): string {
  return role === "admin"
    ? "admin"
    : role === "teacher"
      ? "teacher"
      : role === "parent"
        ? "parent"
        : "student";
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const locale = localeOf(pathname);

  const guarded = ROLE_ROUTES.find((r) => r.pattern.test(pathname));
  const needsSession = guarded !== undefined || CHANGE_PASSWORD.test(pathname);

  const token =
    needsSession || LOGIN.test(pathname)
      ? await getToken({
          req,
          secret: AUTH_SECRET,
          // Must match `useSecureCookies` in auth/config.ts — see note above.
          secureCookie: process.env.NODE_ENV === "production",
        })
      : null;

  // Someone already signed in has no business on the login page.
  if (LOGIN.test(pathname) && token) {
    return NextResponse.redirect(new URL(`/${locale}/${homePathFor(token.role)}`, req.url));
  }

  if (needsSession) {
    if (!token) {
      const login = new URL(`/${locale}/login`, req.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }

    // A provisioned account must change its password before reaching anything
    // else. Checked here for the redirect, and again in `requireSession()` so
    // a route the matcher misses is still refused.
    if (token.mustChangePassword && !CHANGE_PASSWORD.test(pathname)) {
      return NextResponse.redirect(new URL(`/${locale}/change-password`, req.url));
    }

    if (guarded && !guarded.roles.includes(token.role)) {
      return NextResponse.redirect(new URL(`/${locale}/${homePathFor(token.role)}`, req.url));
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)"],
};
