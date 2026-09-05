import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      // The workspace floor (CLAUDE.md §12.4). `core` holds the CSV codec and
      // the Zod schemas; the schemas are declarative and are executed by the
      // import alone, so the figure that moves here is the codec's.
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      include: ["src/**/*.ts"],
      // Barrels re-export and contain no logic of their own.
      exclude: ["src/index.ts", "src/schemas/index.ts", "src/**/*.test.ts"],
    },
  },
});
