#!/usr/bin/env node
/**
 * Backup and restore for the school's database.
 *
 * `docs/security-madrasti.md` §10 asks for backups that are encrypted,
 * **off-vendor**, and restored at least once for real. Railway's own backups
 * are neither off-vendor nor available below the Pro plan, so this is the
 * mechanism: `pg_dump` to a local file, encrypted, which the school copies
 * wherever it keeps its records.
 *
 * The reason it is a script and not a paragraph in a document: a backup nobody
 * has restored is a hope, and a restore nobody can run without reading a
 * paragraph will not be run at three in the morning.
 *
 *   node scripts/backup.mjs dump   [--out FILE]        # DATABASE_URL -> file
 *   node scripts/backup.mjs restore --from FILE --to URL
 *   node scripts/backup.mjs verify --from FILE --to URL   # restore, then count
 *
 * `restore` and `verify` refuse a target that looks like production unless
 * `--force` is given: restoring over a live school is the one mistake this
 * script could help someone make.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}
const has = (name) => args.includes(`--${name}`);

function run(bin, argv, env) {
  return execFileSync(bin, argv, {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
  });
}

/** `postgresql://user:pass@host:port/db` -> the pieces `pg_*` wants. */
function parse(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

/**
 * Refuse to write over something that looks like a live school.
 *
 * Deliberately crude — a hostname check cannot know what is production. It is
 * a speed bump in front of the one irreversible thing here, not a guarantee,
 * which is why `--force` exists and says so out loud.
 */
function assertSafeTarget(url) {
  const { host, database } = parse(url);
  const looksLive = !/^(localhost|127\.0\.0\.1|::1)$/.test(host) || /prod/i.test(database);
  if (looksLive && !has("force")) {
    console.error(
      `Refusing to restore into ${host}/${database}: it does not look like a scratch database.
A restore DROPS AND REPLACES every row in the target. If that is genuinely
what you want, re-run with --force.`
    );
    process.exit(2);
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

if (command === "dump") {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const out = resolve(flag("out") ?? `backups/madrasti-${stamp()}.dump`);
  mkdirSync(dirname(out), { recursive: true });

  const { host, port, user, password, database } = parse(url);
  // Custom format: compressed, and `pg_restore` can be selective with it.
  run(
    "pg_dump",
    ["-h", host, "-p", port, "-U", user, "-d", database, "-F", "c", "-f", out, "--no-owner"],
    { PGPASSWORD: password }
  );

  const bytes = statSync(out).size;
  if (bytes < 1024) throw new Error(`dump is only ${bytes} bytes — that is not a school`);
  console.log(`dumped ${database} -> ${out} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(
    `
This file contains children's records. Encrypt it before it leaves this machine:
  gpg --symmetric --cipher-algo AES256 ${out}
and keep it somewhere that is not Railway (docs/security-madrasti.md §10).`
  );
  process.exit(0);
}

if (command === "restore" || command === "verify") {
  const from = flag("from");
  const to = flag("to") ?? process.env["RESTORE_TARGET_URL"];
  if (!from || !to) throw new Error("usage: restore --from FILE --to URL");
  if (!existsSync(from)) throw new Error(`no such dump: ${from}`);
  assertSafeTarget(to);

  const { host, port, user, password, database } = parse(to);
  const pg = { PGPASSWORD: password };

  run(
    "pg_restore",
    [
      "-h",
      host,
      "-p",
      port,
      "-U",
      user,
      "-d",
      database,
      "--clean",
      "--if-exists",
      "--no-owner",
      from,
    ],
    pg
  );
  console.log(`restored ${from} -> ${host}/${database}`);

  if (command === "verify") {
    // A restore that "succeeded" into an empty database is the failure this
    // catches. Counting the tables that carry the school's actual records.
    const sql =
      "select (select count(*) from users) as users, (select count(*) from students) as students, " +
      "(select count(*) from grades) as grades, (select count(*) from attendance) as attendance;";
    const out = run(
      "psql",
      ["-h", host, "-p", port, "-U", user, "-d", database, "-A", "-t", "-c", sql],
      pg
    ).trim();

    const [users, students, grades, attendance] = out.split("|").map(Number);
    console.log(
      `verified: ${users} users, ${students} students, ${grades} grades, ${attendance} attendance rows`
    );
    if (!(users > 0 && students > 0)) {
      console.error("RESTORE VERIFICATION FAILED: the restored database has no people in it.");
      process.exit(1);
    }
    console.log("restore verified");
  }
  process.exit(0);
}

console.error(
  `usage:
  node scripts/backup.mjs dump [--out FILE]
  node scripts/backup.mjs restore --from FILE --to URL [--force]
  node scripts/backup.mjs verify  --from FILE --to URL [--force]`
);
process.exit(1);
