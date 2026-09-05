import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Single workspace-root .env, as everywhere else.
loadEnv({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
    // Workspace packages use ESM ".js" specifiers for ".ts" sources.
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  test: {
    // The authorisation suite shares one database.
    fileParallelism: false,
    testTimeout: 20_000,
    include: ["src/**/*.test.ts"],
    coverage: {
      // Vitest covers the two layers where a defect is silent: the server
      // actions and the authorisation and query helpers underneath them.
      // Components are covered by Playwright (`CLAUDE.md` §12.5) — a figure
      // taken over `.tsx` here would report a React tree as untested while the
      // E2E suite drives it, and would say nothing about whether it works.
      include: ["src/lib/**/*.ts", "src/**/actions.ts", "src/**/*-actions.ts"],
      exclude: ["src/**/*.test.ts"],
      // **A ratchet, not the target.** The DoD asks for 80% (`CLAUDE.md`
      // §12.4) and this layer is at ~33%: eight of the eleven server-action
      // files have no unit test, and the admin and timetable queries none
      // either. See `.logs/issues.md`. The floor is set just under the
      // measured figure so it cannot slip further while that is worked off,
      // and it is raised as tests land — the honest number is deliberately
      // visible in this file rather than hidden behind a narrowed `include`.
      thresholds: { lines: 33, functions: 69, branches: 81, statements: 33 },
    },
  },
});
