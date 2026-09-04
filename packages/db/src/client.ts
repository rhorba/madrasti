import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

function connectionString(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  return url;
}

/**
 * Next.js dev hot-reloads modules, which would otherwise open a new pool on
 * every reload until Postgres refuses connections. Cached on globalThis in
 * development only; production gets one pool per process as normal.
 */
const globalForDb = globalThis as unknown as { __madrastiSql?: postgres.Sql };

const client =
  globalForDb.__madrastiSql ??
  postgres(connectionString(), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env["NODE_ENV"] !== "production") globalForDb.__madrastiSql = client;

export const db = drizzle(client, { schema });
export { client as sql };
export type Database = typeof db;
