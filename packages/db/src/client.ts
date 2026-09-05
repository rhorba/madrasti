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

  return drizzle(client, { schema, logger: { logQuery: () => countQuery() } });
}

/**
 * How many statements the handle has issued.
 *
 * Off unless a test turns it on, and it counts rather than logs: §12.9 forbids
 * an N+1 on any list screen, and "no N+1" is a claim about the **number of
 * round trips**, which is not observable from a function's return value. A
 * screen that ran one query per pupil would look identical to one that ran
 * two in total — until a class of thirty made the register take a second to
 * open.
 *
 * Deliberately not a query log: a statement carries parameters, and those
 * parameters are children's names (`CLAUDE.md` §11).
 */
const counter = { on: false, count: 0 };

function countQuery(): void {
  if (counter.on) counter.count += 1;
}

/** Run `fn`, and report how many statements it issued. */
export async function countQueries<T>(
  fn: () => Promise<T>
): Promise<{ result: T; queries: number }> {
  counter.on = true;
  counter.count = 0;
  try {
    const result = await fn();
    return { result, queries: counter.count };
  } finally {
    counter.on = false;
  }
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
