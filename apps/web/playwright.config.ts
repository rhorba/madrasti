import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "../../.env") });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // A known starting state: these tests write to a shared database.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  timeout: 30_000,

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Built, not dev: `useSecureCookies` is on in production, and the Auth.js
  // cookie-name split behind a proxy is exactly the class of bug these tests
  // exist to catch (CLAUDE.md §16.1). Testing only in dev would hide it.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    // Never reuse: a stale server silently tests the previous build, which is
    // exactly how a fixed bug appears to still be broken.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    // Playwright sets NODE_ENV=test, which Next rejects for a production
    // build. Force it back — and it must be "production" anyway, because
    // `useSecureCookies` keys off it and that is what these tests exercise.
    env: { NODE_ENV: "production" },
  },
});
