import { execSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Reseed before the suite.
 *
 * These tests write — they add timetable slots, import students, provision
 * accounts. Without a known starting state a second run collides with the
 * first run's leftovers, and the failure looks like a product bug rather than
 * stale data. The seed is deterministic and idempotent, so this is cheap.
 */
export default function globalSetup(): void {
  // Playwright loads this file as CommonJS, so `__dirname` rather than
  // `import.meta.url`.
  const repoRoot = resolve(__dirname, "../../..");
  execSync("pnpm --filter @madrasti/db seed", { cwd: repoRoot, stdio: "inherit" });
}
