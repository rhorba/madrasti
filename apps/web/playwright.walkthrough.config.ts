import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "../../.env") });

/**
 * The walkthrough recording — CTS rule 9.
 *
 * Separate from `playwright.config.ts` on purpose. The test suite builds the
 * app and runs against a throwaway local server; this records **the live
 * deployment**, starts no server of its own, reseeds nothing, and produces a
 * film rather than a pass or a fail.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /walkthrough\.spec\.ts/,
  // One after another, in order: the file tells a story and the story has a
  // sequence.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 180_000,
  outputDir: "../../.recordings/raw",

  use: {
    baseURL: process.env["WALKTHROUGH_BASE"] ?? "https://madrasti-production.up.railway.app",
    // 720p: legible when someone plays it on a phone, which is how it will
    // actually be watched.
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
    trace: "off",
    screenshot: "off",
  },

  projects: [{ name: "walkthrough", use: { ...devices["Desktop Chrome"] } }],
});
