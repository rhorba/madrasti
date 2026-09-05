import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `errors.*` key the code can throw must exist in all three catalogues.
 *
 * This test exists because one did not. `errors.noStudents` was thrown by two
 * server actions and present in none of `ar.json`, `fr.json` or `en.json`, and
 * `pnpm i18n:check` was green throughout — it compares the three catalogues
 * against **each other**, and all three were missing it equally
 * (`.logs/issues.md`, 2026-09-05). next-intl renders a missing key as the key,
 * so an admin publishing an empty class was shown the literal string
 * `errors.noStudents`, which is exactly what §10.6 forbids.
 *
 * Parity is not coverage. This is the coverage half: it reads the source rather
 * than the catalogues, so a key that only the code knows about cannot hide.
 */

const REPO = resolve(__dirname, "../../../..");
const MESSAGES = join(REPO, "apps", "web", "messages");
const SOURCES = [
  join(REPO, "apps", "web", "src"),
  join(REPO, "packages", "core", "src"),
  join(REPO, "packages", "grading", "src"),
  join(REPO, "packages", "timetable", "src"),
];

/** Every `.ts`/`.tsx` file under a directory, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    // A test may name a key it expects to be missing; the product may not.
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(path);
  }
  return out;
}

/** `errors.something`, wherever it is written as a string literal. */
function thrownKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const dir of SOURCES) {
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`](errors\.[a-zA-Z0-9_]+)["'`]/g)) {
        const key = match[1];
        if (!key) continue;
        const where = found.get(key) ?? [];
        where.push(file.slice(REPO.length + 1).replaceAll("\\", "/"));
        found.set(key, where);
      }
    }
  }
  return found;
}

function catalogue(locale: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8"));
  const errors = (parsed as { errors?: Record<string, unknown> }).errors;
  return errors ?? {};
}

describe("every error key the code throws is translated", () => {
  const keys = thrownKeys();

  it("finds the throw sites at all, so an empty pass cannot masquerade as a green one", () => {
    // Without this, a broken glob would make every assertion below vacuous.
    expect(keys.size).toBeGreaterThan(30);
    expect([...keys.keys()]).toContain("errors.bulletinPublished");
  });

  for (const locale of ["ar", "fr", "en"]) {
    it(`resolves in ${locale}.json`, () => {
      const messages = catalogue(locale);
      const missing = [...keys.entries()]
        .filter(([key]) => !(key.slice("errors.".length) in messages))
        .map(([key, files]) => `${key} — thrown in ${files.join(", ")}`);

      expect(missing, `keys with no ${locale} translation`).toEqual([]);
    });
  }
});

describe("the catalogues carry no error key nothing throws", () => {
  it("does not accumulate dead entries", () => {
    // The other direction. A key left behind by a deleted feature is harmless
    // but it is also a lie about what the product can tell a user, and it makes
    // the catalogue harder to review in Arabic (§9.5).
    const keys = thrownKeys();
    const thrown = new Set([...keys.keys()].map((key) => key.slice("errors.".length)));

    // Zod's own message keys are referenced by schema definitions rather than
    // thrown, and a few are produced by composing a prefix; both are listed
    // here rather than switching the check off.
    const NOT_THROWN_DIRECTLY = new Set(["unexpected", "required", "invalid"]);

    const dead = Object.keys(catalogue("fr")).filter(
      (key) => !thrown.has(key) && !NOT_THROWN_DIRECTLY.has(key)
    );

    expect(dead, "error keys in fr.json that no code path can produce").toEqual([]);
  });
});
