import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * The database handle.
 *
 * **Lazy on purpose.** Connecting at module load would mean that merely
 * *importing* this package requires `DATABASE_URL` — which breaks `next build`,
 * where page data is collected in a process that has no database and needs
 * none. Nothing here touches the network until the first query runs.
 */

type Db = ReturnType<typeof create>;

function create() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

  /**
   * Next dev hot-reloads modules, which would otherwise open a new pool on
   * every reload until Postgres refuses connections. Cached on globalThis in
   * development only; production gets one pool per process, as normal.
   */
  const globalForDb = globalThis as unknown as { __madrastiSql?: postgres.Sql };

  const client =
    globalForDb.__madrastiSql ?? postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });

  if (process.env["NODE_ENV"] !== "production") globalForDb.__madrastiSql = client;

  return drizzle(client, { schema });
}

let instance: Db | undefined;

function getDb(): Db {
  instance ??= create();
  return instance;
}

/**
 * A proxy so call sites keep the plain `db.select()...` shape while the real
 * handle is built on first use.
 */
export const db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

export type Database = Db;
