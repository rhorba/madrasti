import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  mapHeaders,
  normalizeDate,
  normalizeGender,
  parseCsv,
  previewStudentImport,
} from "./csv.js";

/**
 * The import is the difference between the secretary spending two days typing
 * 300 students and spending ten minutes. It is also the place where a silent
 * mistake is worst: names landing in the wrong columns, or a file that looks
 * imported but skipped half its rows. Hence the breadth here.
 */

describe("parseCsv", () => {
  it("parses a plain file", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields containing the delimiter", () => {
    expect(parseCsv('nom,prenom\n"Alaoui, fils",Amine')).toEqual([
      ["nom", "prenom"],
      ["Alaoui, fils", "Amine"],
    ]);
  });

  it("handles doubled quotes", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("handles embedded newlines inside quotes", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([["a"], ["line1\nline2"]]);
  });

  it("handles CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips the UTF-8 BOM Excel writes", () => {
    // Without this the first header reads "﻿nom" and silently fails to map.
    expect(parseCsv("﻿nom,prenom\nA,B")[0]).toEqual(["nom", "prenom"]);
  });

  it("keeps a final row with no trailing newline", () => {
    expect(parseCsv("a\n1")).toHaveLength(2);
  });

  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toHaveLength(2);
  });
});

describe("detectDelimiter", () => {
  it("detects a comma", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("detects the semicolon a French Excel writes", () => {
    expect(detectDelimiter("nom;prenom;sexe\nA;B;M")).toBe(";");
  });

  it("detects tabs", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });
});

describe("mapHeaders", () => {
  it("maps French headers", () => {
    const { index } = mapHeaders(["Nom", "Prénom", "Date de naissance", "Sexe"]);
    expect(index["lastNameFr"]).toBe(0);
    expect(index["firstNameFr"]).toBe(1);
    expect(index["birthDate"]).toBe(2);
    expect(index["gender"]).toBe(3);
  });

  it("maps Arabic headers", () => {
    const { index } = mapHeaders(["النسب", "الاسم", "رمز مسار"]);
    expect(index["lastNameAr"]).toBe(0);
    expect(index["firstNameAr"]).toBe(1);
    expect(index["massarCode"]).toBe(2);
  });

  it("ignores case, accents and separators", () => {
    const { index } = mapHeaders(["CODE_MASSAR", "date-de-naissance"]);
    expect(index["massarCode"]).toBe(0);
    expect(index["birthDate"]).toBe(1);
  });

  it("reports headers it does not recognise rather than dropping them", () => {
    const { unknown } = mapHeaders(["Nom", "Adresse", "Téléphone"]);
    expect(unknown).toEqual(["Adresse", "Téléphone"]);
  });
});

describe("normalizeDate", () => {
  it("accepts ISO", () => {
    expect(normalizeDate("2015-12-31")).toBe("2015-12-31");
  });

  it("accepts the French day-first form", () => {
    expect(normalizeDate("31/12/2015")).toBe("2015-12-31");
    expect(normalizeDate("1/2/2015")).toBe("2015-02-01");
  });

  it("accepts dashes and dots", () => {
    expect(normalizeDate("31-12-2015")).toBe("2015-12-31");
    expect(normalizeDate("31.12.2015")).toBe("2015-12-31");
  });

  it("rejects nonsense", () => {
    expect(normalizeDate("hier")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("normalizeGender", () => {
  it("accepts every spelling the school might use", () => {
    for (const male of ["M", "m", "Masculin", "garçon", "ذكر"]) {
      expect(normalizeGender(male)).toBe("m");
    }
    for (const female of ["F", "Féminin", "fille", "أنثى"]) {
      expect(normalizeGender(female)).toBe("f");
    }
  });

  it("rejects anything else rather than guessing", () => {
    expect(normalizeGender("x")).toBeNull();
    expect(normalizeGender("")).toBeNull();
  });
});

const HEADER = "Nom,Prénom,Nom ar,Prénom ar,Date de naissance,Sexe";

describe("previewStudentImport", () => {
  it("imports a clean file", () => {
    const preview = previewStudentImport(
      `${HEADER}\nKabbaj,Amine,قباج,أمين,31/12/2015,M\nRami,Salma,رامي,سلمى,2016-01-15,F`
    );
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({
      lastNameFr: "Kabbaj",
      firstNameAr: "أمين",
      birthDate: "2015-12-31",
      gender: "m",
      massarCode: null,
    });
  });

  it("imports without a Massar column at all", () => {
    // The school may simply not use Massar codes. That is not an error, and
    // the flag lets the UI say so plainly rather than warning about it.
    const preview = previewStudentImport(`${HEADER}\nKabbaj,Amine,قباج,أمين,31/12/2015,M`);
    expect(preview.withoutMassar).toBe(true);
    expect(preview.rows[0]?.massarCode).toBeNull();
    expect(preview.errors).toEqual([]);
  });

  it("accepts a Massar column with blanks for students who have no code yet", () => {
    const preview = previewStudentImport(
      `Massar,${HEADER}\nR130012345,Kabbaj,Amine,قباج,أمين,31/12/2015,M\n,Rami,Salma,رامي,سلمى,2016-01-15,F`
    );
    expect(preview.withoutMassar).toBe(false);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]?.massarCode).toBe("R130012345");
    expect(preview.rows[1]?.massarCode).toBeNull();
  });

  it("reports the line number of a bad row and keeps the good ones", () => {
    const preview = previewStudentImport(
      `${HEADER}\nKabbaj,Amine,قباج,أمين,31/12/2015,M\nRami,Salma,رامي,سلمى,pas une date,F`
    );
    expect(preview.rows).toHaveLength(1);
    expect(preview.errors).toEqual([
      { line: 3, field: "birthDate", message: "errors.invalidDate" },
    ]);
  });

  it("catches a duplicate Massar code inside the file", () => {
    // The database would reject the second one part-way through the import,
    // leaving half the students created.
    const preview = previewStudentImport(
      `Massar,${HEADER}\nR130012345,Kabbaj,Amine,قباج,أمين,31/12/2015,M\nR130012345,Rami,Salma,رامي,سلمى,2016-01-15,F`
    );
    expect(preview.errors.some((e) => e.message === "errors.duplicateMassarInFile")).toBe(true);
  });

  it("refuses a file missing a required column", () => {
    const preview = previewStudentImport("Nom,Prénom\nKabbaj,Amine");
    expect(preview.missingHeaders).toContain("firstNameAr");
    expect(preview.rows).toEqual([]);
  });

  it("reports an empty file", () => {
    expect(previewStudentImport("").errors[0]?.message).toBe("errors.csvEmpty");
  });

  it("handles a semicolon-delimited French export", () => {
    const preview = previewStudentImport(
      "Nom;Prénom;Nom ar;Prénom ar;Date de naissance;Sexe\nKabbaj;Amine;قباج;أمين;31/12/2015;M"
    );
    expect(preview.rows).toHaveLength(1);
  });

  it("requires the Arabic name — it is printed on the bulletin", () => {
    const preview = previewStudentImport(`${HEADER}\nKabbaj,Amine,,أمين,31/12/2015,M`);
    expect(preview.rows).toEqual([]);
    expect(preview.errors.some((e) => e.field === "lastNameAr")).toBe(true);
  });
});
