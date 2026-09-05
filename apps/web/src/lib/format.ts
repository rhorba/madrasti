import type { Locale } from "@madrasti/core";

/**
 * Numbers and dates as Moroccan school paperwork writes them.
 *
 * The one rule worth stating plainly: **an Arabic bulletin in Morocco uses
 * Western digits.** A mark is `12,50`, never `١٢٫٥٠`. Massar prints Western
 * digits, the school's existing paperwork uses them, and a parent in Rabat
 * reads them. Eastern Arabic-Indic numerals are correct in Egypt and the Gulf
 * and wrong here.
 *
 * That is why the locale is pinned rather than left to `Intl`. Today's CLDR
 * happens to resolve a bare `ar` to the `latn` numbering system, so the default
 * is currently right by luck — but it has not always been, it differs by
 * region subtag (`ar-EG` still yields `١٢٫٥`), and the browser's ICU is not
 * necessarily the server's. A document that silently changed numbering system
 * on an ICU upgrade would be a genuinely serious defect in a printed record, so
 * `-u-nu-latn` says it out loud and a unit test holds it there.
 *
 * The dates follow the same reasoning: `en-GB`, not `en`, because every other
 * language on this document writes 15 January and a school does not print one
 * line in American order.
 */
const FORMATTING_LOCALE: Record<Locale, string> = {
  // Moroccan Arabic conventions — Western digits, comma decimal separator.
  ar: "ar-MA-u-nu-latn",
  fr: "fr-MA",
  en: "en-GB",
};

function resolve(locale: Locale | string): string {
  return FORMATTING_LOCALE[locale as Locale] ?? FORMATTING_LOCALE.fr;
}

/**
 * A mark or an average, always to two decimals.
 *
 * Fixed decimals are not decoration: a column of thirty marks has to align, and
 * `12,5` beside `9,75` in a printed table does not. Pairs with `.tabular`.
 */
export function formatMark(value: number | null, locale: Locale | string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(resolve(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * A coefficient, with no trailing zeros.
 *
 * Coefficients are read as labels rather than measured against each other —
 * "4", not "4,00" — and most of them are whole numbers.
 */
export function formatCoefficient(value: number, locale: Locale | string): string {
  return new Intl.NumberFormat(resolve(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** A whole number — an absence total, a rank, a class size. */
export function formatInteger(value: number, locale: Locale | string): string {
  return new Intl.NumberFormat(resolve(locale), { maximumFractionDigits: 0 }).format(value);
}

/**
 * A date as it is printed on a document, spelled out rather than numeric.
 *
 * `15 janvier 2026` cannot be misread; `15/01/2026` and `01/15/2026` are the
 * same eight characters meaning different days, on a document that outlives
 * everyone's memory of which convention the school used.
 */
export function formatDocumentDate(date: Date, locale: Locale | string): string {
  return new Intl.DateTimeFormat(resolve(locale), {
    dateStyle: "long",
    timeZone: "Africa/Casablanca",
  }).format(date);
}

/**
 * A rank, with the ordinal suffix the language actually uses.
 *
 * French writes **1er** for the top of the class and 2e, 3e, 20e for everyone
 * else. Printing "1e" on the proudest line of a bulletin is the kind of mistake
 * a parent notices immediately and a developer never does.
 *
 * Done here rather than with ICU `selectordinal` in the message catalogue,
 * because `selectordinal` needs a raw number and would format it with the
 * locale's own numbering system — which for `ar` is exactly the Eastern-digit
 * behaviour this module exists to pin down. The suffix is chosen here; the
 * digits still go through `formatInteger`.
 *
 * Arabic and English take no suffix in this position: Arabic writes
 * "الرتبة 3 من 27", and the English string reads "3 of 27".
 */
export function formatRank(value: number, locale: Locale | string): string {
  const digits = formatInteger(value, locale);
  if (locale !== "fr") return digits;
  // 1er, and 1re for a feminine noun — but "rang" is masculine, so 1er.
  return value === 1 ? `${digits}er` : `${digits}e`;
}
