import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadRootEnv, requireDatabaseUrl } from "./env.js";

/**
 * Applied as a release step, never at application boot — a boot-time migration
 * races when more than one instance starts (`docs/devops-madrasti.md` §5).
 */
loadRootEnv();

const client = postgres(requireDatabaseUrl(), { max: 1 });

await migrate(drizzle(client), { migrationsFolder: "./migrations" });
console.log("migrations applied");
await client.end();
