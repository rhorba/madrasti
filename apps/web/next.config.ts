import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * The workspace keeps a single `.env`, at the repo root. Next only looks in
 * its own directory, so load the root one here — this runs before the build
 * and before `next start`, so the server runtime sees the variables too.
 * Values already in the environment (Railway, CI) always win.
 */
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) loadEnv({ path: rootEnv });

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * Pragmatic rather than pure: Next injects inline styles, so `style-src` needs
 * `'unsafe-inline'`; `'unsafe-eval'` is dev-only. Student photos and homework
 * attachments come from R2 over short-lived signed URLs, so that host is
 * allowed for images and direct uploads.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join("; ")
  .concat(isDev ? "" : "; upgrade-insecure-requests");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // `standalone` needs symlinks and fails on Windows without Developer Mode.
  // Only the Docker/CI build consumes it (CLAUDE.md §16.5). Spread rather than
  // set to `undefined`: under `exactOptionalPropertyTypes` an explicit
  // undefined is not the same as an absent key.
  ...(process.env["BUILD_STANDALONE"] === "1" ? { output: "standalone" as const } : {}),

  // Native module — webpack must not bundle it (CLAUDE.md §16.4).
  serverExternalPackages: ["argon2"],

  webpack: (webpackConfig) => {
    // Workspace packages are TypeScript sources that import each other with
    // ESM ".js" specifiers. The server resolves these already; the client
    // bundle needs to be told (CLAUDE.md §16.3).
    webpackConfig.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default withNextIntl(config);
