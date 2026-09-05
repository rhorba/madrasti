import type { Locale } from "@madrasti/core";

/**
 * Pick the right column from a trilingual row.
 *
 * Subjects, levels and terms carry `*Fr` / `*Ar` / `*En` columns rather than a
 * translation key, because the school names them itself — "Éveil scientifique"
 * is their wording, not ours. Falls back to French, which is what the school's
 * existing paperwork uses.
 */
export function localized(
  row: { fr: string; ar: string; en: string },
  locale: Locale | string
): string {
  if (locale === "ar") return row.ar || row.fr;
  if (locale === "en") return row.en || row.fr;
  return row.fr;
}

/** For rows using the `nameFr`/`nameAr`/`nameEn` convention. */
export function localizedName(
  row: { nameFr: string; nameAr: string; nameEn: string },
  locale: Locale | string
): string {
  return localized({ fr: row.nameFr, ar: row.nameAr, en: row.nameEn }, locale);
}

/** For rows using the `labelFr`/`labelAr`/`labelEn` convention. */
export function localizedLabel(
  row: { labelFr: string; labelAr: string; labelEn: string },
  locale: Locale | string
): string {
  return localized({ fr: row.labelFr, ar: row.labelAr, en: row.labelEn }, locale);
}

/**
 * A person's name in the reader's script.
 *
 * Arabic readers get the Arabic spelling of a name, not a transliteration of
 * the French — both are captured at enrolment precisely so this is possible
 * (`CLAUDE.md` §6).
 */
export function personName(
  row: {
    firstNameFr: string;
    lastNameFr: string;
    firstNameAr: string;
    lastNameAr: string;
  },
  locale: Locale | string
): string {
  return locale === "ar"
    ? `${row.firstNameAr} ${row.lastNameAr}`.trim()
    : `${row.firstNameFr} ${row.lastNameFr}`.trim();
}

/**
 * For rows that carry a *joined* subject, named `subjectName*`.
 *
 * Marks, absences and homework all arrive with the subject joined on rather
 * than nested, because one flat row per result is one round trip.
 */
export function localizedSubject(
  row: { subjectNameFr: string; subjectNameAr: string; subjectNameEn: string },
  locale: Locale | string
): string {
  return localized({ fr: row.subjectNameFr, ar: row.subjectNameAr, en: row.subjectNameEn }, locale);
}

/**
 * `"ar"` when a free-text string is written in Arabic, otherwise `undefined`.
 *
 * For `lang` on the element that holds it. A teacher's remark is stored as she
 * wrote it and is not translated (`.logs/decisions.md`, story 8.2), so an
 * Arabic sentence routinely appears in a French document and the reverse.
 * Without `lang`, that sentence inherits the sheet's Latin face at the sheet's
 * Latin size — and Arabic set at the same size as Latin reads noticeably
 * smaller (`CLAUDE.md` §9). Marking the element lets the one rule in
 * `globals.css` that compensates for this do its job.
 */
export function scriptLang(text: string | null | undefined): "ar" | undefined {
  return text && /[؀-ۿ]/.test(text) ? "ar" : undefined;
}
