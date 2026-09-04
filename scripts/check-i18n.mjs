#!/usr/bin/env node
/**
 * Message-key parity across ar / fr / en.
 *
 * This is the mechanical half of DoD 14. It exists because the previous
 * project on this stack shipped a correct RTL layout with untranslated French
 * strings sitting behind it — the plumbing worked, so nobody noticed.
 *
 * What it can prove: every key exists in every locale, no key is empty, and no
 * placeholder set differs between locales.
 *
 * What it cannot prove: that the Arabic is actually Arabic. A string copied
 * verbatim from French into ar.json passes every check here except the
 * identical-value heuristic below, which is why a human review by an Arabic
 * reader stays on the checklist (`docs/test-strategy-madrasti.md` §9).
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const MESSAGES_DIR = join(process.cwd(), "apps", "web", "messages");
const REFERENCE = "fr";

/**
 * Values legitimately identical across locales: proper nouns, language names
 * shown in their own script, and symbols. Anything else that matches the
 * French exactly is almost certainly untranslated.
 */
const ALLOWED_IDENTICAL = new Set([
  "app.name",
  "locale.ar",
  "locale.fr",
  "locale.en",
  // Genuine fr/en cognates — identical by coincidence, not by neglect.
  // Keep this list short: every entry is a check switched off, so add one only
  // after confirming the word really is the same in both languages.
  "roles.admin",
  "roles.parent",
  "nav.classes",
]);

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

/** ICU placeholders such as `{name}` — the set must match across locales. */
function placeholders(value) {
  if (typeof value !== "string") return new Set();
  return new Set([...value.matchAll(/\{(\w+)/g)].map((m) => m[1]));
}

const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
const locales = files.map((f) => basename(f, ".json"));
const messages = new Map(
  locales.map((l) => [
    l,
    flatten(JSON.parse(readFileSync(join(MESSAGES_DIR, `${l}.json`), "utf8"))),
  ])
);

const reference = messages.get(REFERENCE);
if (!reference) {
  console.error(`missing reference locale ${REFERENCE}.json`);
  process.exit(1);
}

const problems = [];

for (const locale of locales) {
  const current = messages.get(locale);

  for (const key of reference.keys()) {
    if (!current.has(key)) problems.push(`${locale}: missing key  ${key}`);
  }
  for (const key of current.keys()) {
    if (!reference.has(key)) problems.push(`${locale}: extra key    ${key}`);
  }

  for (const [key, value] of current) {
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${locale}: empty value ${key}`);
      continue;
    }
    if (locale === REFERENCE) continue;

    const expected = placeholders(reference.get(key));
    const actual = placeholders(value);
    for (const p of expected) {
      if (!actual.has(p)) problems.push(`${locale}: missing placeholder {${p}} in ${key}`);
    }
    for (const p of actual) {
      if (!expected.has(p)) problems.push(`${locale}: unexpected placeholder {${p}} in ${key}`);
    }

    if (!ALLOWED_IDENTICAL.has(key) && value === reference.get(key)) {
      problems.push(`${locale}: identical to ${REFERENCE} — probably untranslated: ${key}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length} problems):\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `i18n ok — ${locales.join(", ")} each carry ${reference.size} keys, placeholders match`
);
