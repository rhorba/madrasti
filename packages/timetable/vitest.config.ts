import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      // Pure logic with no I/O, and a wrong answer here is invisible until
      // term starts — so this package is held to a higher bar than the 80%
      // workspace floor (`docs/test-strategy-madrasti.md` §2).
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
    },
  },
});
