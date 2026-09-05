import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      // The arithmetic behind every bulletin. A wrong answer here is invisible
      // until a parent checks it, so this package is held above the 80%
      // workspace floor (`docs/test-strategy-madrasti.md` §2).
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
    },
  },
});
