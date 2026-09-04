import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integrity tests share one Postgres database and assert on constraint
    // violations, so they must not run concurrently against each other.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    include: ["src/**/*.test.ts"],
  },
});
