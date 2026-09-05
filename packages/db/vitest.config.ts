import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integrity tests share one Postgres database and assert on constraint
    // violations, so they must not run concurrently against each other.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    include: ["src/**/*.test.ts"],
    coverage: {
      // What is measured here is the schema: the tables, enums and CHECK
      // constraints the integrity suite exercises by violating them.
      include: ["src/schema/**/*.ts"],
      exclude: ["src/schema/index.ts"],
      // No `functions` threshold, deliberately. The only functions in a
      // Drizzle schema are the `(table) => ({ ... })` callbacks that declare
      // indexes and constraints, and those run under drizzle-kit rather than
      // at import — so the figure sits near 3% however much is tested and
      // would be a gate on nothing.
      thresholds: { lines: 80, branches: 80, statements: 80 },
      // The rest of the package is scripts, not logic, and a coverage figure
      // over them would be a figure about how much of a script ran:
      //   seed.ts / seed-data.ts  — exercised by `pnpm db:setup`, and by every
      //                             integration and E2E suite, which start from
      //                             a seeded database.
      //   migrate.ts              — the same, and it is drizzle's runner.
      //   client.ts / env.ts      — connection wiring; the suite cannot run at
      //                             all unless both work.
    },
  },
});
