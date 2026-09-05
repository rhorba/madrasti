import { describe, expect, it } from "vitest";
import { cn } from "./cn.js";
import {
  localized,
  localizedLabel,
  localizedName,
  localizedSubject,
  personName,
  scriptLang,
} from "./localized.js";

/**
 * Choosing the right column from a trilingual row.
 *
 * Small functions, but every screen in the product runs through them, and the
 * failure they exist to prevent is the one this project inherited from Bina:
 * a correct RTL layout with French text behind it (`CLAUDE.md` §16.6).
 */

const SUBJECT = { nameFr: "Éveil scientifique", nameAr: "النشاط العلمي", nameEn: "Science" };
const TERM = { labelFr: "1er trimestre", labelAr: "الدورة الأولى", labelEn: "First term" };
const PUPIL = {
  firstNameFr: "Reda",
  lastNameFr: "Rami",
  firstNameAr: "رضى",
  lastNameAr: "رامي",
};

describe("localized", () => {
  it("returns the column for the locale asked for", () => {
    const row = { fr: "Français", ar: "العربية", en: "English" };
    expect(localized(row, "fr")).toBe("Français");
    expect(localized(row, "ar")).toBe("العربية");
    expect(localized(row, "en")).toBe("English");
  });

  it("falls back to French, which is what the school's paperwork uses", () => {
    // An unknown locale, and — more importantly — a row the admin filled in
    // only in French, which is the realistic state of a half-configured school.
    expect(localized({ fr: "Maths", ar: "", en: "" }, "ar")).toBe("Maths");
    expect(localized({ fr: "Maths", ar: "", en: "" }, "en")).toBe("Maths");
    expect(localized({ fr: "Maths", ar: "الرياضيات", en: "" }, "de")).toBe("Maths");
  });
});

describe("the naming conventions the schema actually uses", () => {
  it("reads name* rows", () => {
    expect(localizedName(SUBJECT, "ar")).toBe("النشاط العلمي");
    expect(localizedName(SUBJECT, "fr")).toBe("Éveil scientifique");
    expect(localizedName(SUBJECT, "en")).toBe("Science");
  });

  it("reads label* rows", () => {
    expect(localizedLabel(TERM, "ar")).toBe("الدورة الأولى");
    expect(localizedLabel(TERM, "fr")).toBe("1er trimestre");
    expect(localizedLabel(TERM, "en")).toBe("First term");
  });

  it("reads a subject joined onto a flat row", () => {
    const mark = {
      subjectNameFr: "Arabe",
      subjectNameAr: "اللغة العربية",
      subjectNameEn: "Arabic",
    };
    expect(localizedSubject(mark, "ar")).toBe("اللغة العربية");
    expect(localizedSubject(mark, "fr")).toBe("Arabe");
  });
});

describe("personName", () => {
  it("gives an Arabic reader the Arabic spelling, not a transliteration", () => {
    // Both spellings are captured at enrolment precisely so this is possible
    // (`CLAUDE.md` §6) — a proper noun cannot be translated at render time.
    expect(personName(PUPIL, "ar")).toBe("رضى رامي");
    expect(personName(PUPIL, "fr")).toBe("Reda Rami");
    // English uses the Latin spelling; there is no third column for names.
    expect(personName(PUPIL, "en")).toBe("Reda Rami");
  });

  it("does not leave a stray space when half a name is missing", () => {
    // A student imported from a CSV with no Arabic first name.
    expect(personName({ ...PUPIL, firstNameAr: "", lastNameAr: "رامي" }, "ar")).toBe("رامي");
    expect(personName({ ...PUPIL, firstNameFr: "Reda", lastNameFr: "" }, "fr")).toBe("Reda");
  });
});

describe("scriptLang", () => {
  it("marks Arabic prose so the stylesheet can size it correctly", () => {
    expect(scriptLang("تلميذ مجتهد، مستواه في تحسن مستمر.")).toBe("ar");
  });

  it("leaves Latin prose unmarked", () => {
    expect(scriptLang("Élève sérieux, en progrès constant.")).toBeUndefined();
  });

  it("treats a mixed sentence as Arabic, which is how it should be set", () => {
    expect(scriptLang("Note: ممتاز")).toBe("ar");
  });

  it("handles nothing at all", () => {
    expect(scriptLang("")).toBeUndefined();
    expect(scriptLang(null)).toBeUndefined();
    expect(scriptLang(undefined)).toBeUndefined();
  });
});

describe("cn", () => {
  it("joins classes and drops the falsy ones", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("lets a later Tailwind class win over an earlier one it conflicts with", () => {
    // The whole reason this wraps `tailwind-merge` rather than `clsx` alone:
    // a component's own padding must be overridable by its caller.
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-[var(--text-muted)]", "text-base")).toBe(
      "text-[var(--text-muted)] text-base"
    );
  });

  it("keeps classes that only look like they conflict", () => {
    expect(cn("ps-2", "pe-4")).toBe("ps-2 pe-4");
  });
});
