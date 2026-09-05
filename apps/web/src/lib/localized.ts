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
