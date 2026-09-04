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
  },
});
