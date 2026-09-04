import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * Load the workspace-root `.env`.
 *
 * Drizzle commands and the seed run with their cwd at `packages/db`, so a bare
 * `dotenv/config` would look for `packages/db/.env` and silently find nothing.
 * The repo keeps exactly one `.env`, at the root.
 */
export function loadRootEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const rootEnv = resolve(here, "../../../.env");
  if (existsSync(rootEnv)) config({ path: rootEnv });
  else config();
}

export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env at the repo root");
  }
  return url;
}
