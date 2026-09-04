import { defineConfig } from "drizzle-kit";
import { loadRootEnv, requireDatabaseUrl } from "./src/env.js";

loadRootEnv();

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: requireDatabaseUrl() },
  // Generated SQL is reviewed by a human and committed; `push` is for local
  // scratch only and must never run against production (devops doc §5).
  verbose: true,
  strict: true,
});
