import { describe, expect, it } from "vitest";
import {
  formatCoefficient,
  formatDocumentDate,
  formatInteger,
  formatMark,
  formatRank,
} from "./format.js";

/**
 * These tests exist for one reason above all others: to fail loudly if an ICU
 * or CLDR upgrade ever changes what an Arabic bulletin prints. Everything here
 * ends up on paper handed to a family.
 */

/** Eastern Arabic-Indic digits — correct in Cairo, wrong in Rabat. */
const EASTERN_DIGITS = /[\u0660-\u0669]/;

describe("Arabic uses Moroccan (Western) digits", () => {
  it("writes a mark in digits a Moroccan parent reads", () => {
    expect(formatMark(12.5, "ar")).toBe("12,50");
    expect(formatMark(12.5, "ar")).not.toMatch(EASTERN_DIGITS);
  });

  it("keeps every number on the document in Western digits", () => {
    for (const value of [formatInteger(27, "ar"), formatCoefficient(4, "ar")]) {
      expect(value).not.toMatch(EASTERN_DIGITS);
    }
    expect(formatDocumentDate(new Date("2026-01-15T10:00:00Z"), "ar")).not.toMatch(EASTERN_DIGITS);
  });

  it("still writes the month name in Arabic", () => {
    // Western digits must not have quietly dragged the whole date into French.
    const printed = formatDocumentDate(new Date("2026-01-15T10:00:00Z"), "ar");
    expect(printed).toContain("2026");
    expect(printed).toMatch(/[\u0600-\u06ff]/);
  });
});

describe("marks", () => {
  it("always shows two decimals, so a column aligns", () => {
    expect(formatMark(12.5, "fr")).toBe("12,50");
    expect(formatMark(9, "fr")).toBe("9,00");
    expect(formatMark(12.5, "en")).toBe("12.50");
  });

  it("rounds to two rather than truncating", () => {
    expect(formatMark(12.567, "fr")).toBe("12,57");
  });

  it("prints an em dash for a subject with no mark, never a zero", () => {
    // A subject with no assessment is not a subject the pupil scored nothing
    // in. Printing 0,00 would be a false record (`CLAUDE.md` §6).
    expect(formatMark(null, "fr")).toBe("—");
    expect(formatMark(null, "ar")).toBe("—");
    expect(formatMark(0, "fr")).toBe("0,00");
  });
});

describe("coefficients", () => {
  it("drops trailing zeros — a coefficient is a label, not a measurement", () => {
    expect(formatCoefficient(4, "fr")).toBe("4");
    expect(formatCoefficient(1.5, "fr")).toBe("1,5");
    expect(formatCoefficient(4, "en")).toBe("4");
  });
});

describe("document dates", () => {
  it("spells the month out, so the day cannot be misread", () => {
    const date = new Date("2026-01-15T10:00:00Z");
    expect(formatDocumentDate(date, "fr")).toBe("15 janvier 2026");
    // en-GB, not en: every other language on this document writes 15 January,
    // and a school does not print one line in American order.
    expect(formatDocumentDate(date, "en")).toBe("15 January 2026");
  });

  it("reads dates in Casablanca time, not the server's", () => {
    // 00:30 UTC on the 16th is still the 15th in Morocco (UTC+1 in winter). A
    // bulletin published late in the evening must not be dated tomorrow.
    const late = new Date("2026-01-15T23:30:00Z");
    expect(formatDocumentDate(late, "fr")).toBe("16 janvier 2026");
    const evening = new Date("2026-01-15T18:00:00Z");
    expect(formatDocumentDate(evening, "fr")).toBe("15 janvier 2026");
  });
});

describe("an unknown locale", () => {
  it("falls back to French, which is what the school's paperwork uses", () => {
    expect(formatMark(12.5, "de")).toBe("12,50");
  });
});

describe("ranks", () => {
  it("writes 1er for the top of the class, not 1e", () => {
    // The one place a French reader notices an ordinal suffix, on the proudest
    // line of a document their child brings home.
    expect(formatRank(1, "fr")).toBe("1er");
  });

  it("writes 2e, 3e and 20e for everyone else", () => {
    expect(formatRank(2, "fr")).toBe("2e");
    expect(formatRank(3, "fr")).toBe("3e");
    expect(formatRank(20, "fr")).toBe("20e");
  });

  it("adds no French suffix to Arabic or English", () => {
    // Arabic reads "الرتبة 3 من 27" and English "3 of 27"; neither takes "e".
    expect(formatRank(1, "ar")).toBe("1");
    expect(formatRank(3, "ar")).toBe("3");
    expect(formatRank(1, "en")).toBe("1");
  });

  it("keeps Moroccan digits in Arabic", () => {
    expect(formatRank(12, "ar")).not.toMatch(EASTERN_DIGITS);
    expect(formatRank(12, "ar")).toBe("12");
  });
});
