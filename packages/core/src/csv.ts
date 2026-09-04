/**
 * CSV parsing and student-import mapping.
 *
 * Pure: no I/O, no database, no framework. The school's secretary will feed
 * this a file exported from Massar or typed in Excel, and the failure mode that
 * matters is a silent one — a column quietly ignored, or 300 students imported
 * with their names in the wrong fields. So the mapping is explicit, unknown
 * headers are reported, and every row is validated before anything is written.
 */

import { z } from "zod";
import { MASSAR_CODE_MAX_LENGTH, MASSAR_CODE_PATTERN } from "./constants.js";
import { GENDERS } from "./enums.js";

/**
 * Parse RFC 4180-ish CSV.
 *
 * Handles quoted fields, embedded commas and newlines, doubled quotes, CRLF,
 * and a UTF-8 BOM — Excel on Windows emits the BOM, and without stripping it
 * the first header becomes "﻿nom" and silently fails to match.
 */
export function parseCsv(input: string, delimiter = ","): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  // A file not ending in a newline still has a final field to flush.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Detect the delimiter.
 *
 * A French-locale Excel writes `;`, not `,`, because the comma is the decimal
 * separator. Guessing wrong turns every row into a single field, so this is
 * worth doing rather than demanding the user "export properly".
 */
export function detectDelimiter(input: string): string {
  const firstLine = input.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

/**
 * Accepted header spellings, per field.
 *
 * Generous on purpose: the file may come from Massar, from a French Excel
 * sheet, or from someone typing Arabic headers. Matching is
 * accent- and case-insensitive.
 */
const HEADERS: Record<string, string[]> = {
  massarCode: ["massar", "code massar", "code_massar", "cne", "رمز مسار", "مسار"],
  lastNameFr: ["nom", "nom fr", "last name", "lastname", "nom de famille"],
  firstNameFr: ["prenom", "prenom fr", "first name", "firstname"],
  lastNameAr: ["nom ar", "nom arabe", "النسب", "الاسم العائلي"],
  firstNameAr: ["prenom ar", "prenom arabe", "الاسم", "الاسم الشخصي"],
  birthDate: ["date de naissance", "naissance", "birth date", "birthdate", "تاريخ الازدياد"],
  gender: ["sexe", "genre", "gender", "الجنس"],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export type HeaderMap = { index: Record<string, number>; unknown: string[] };

export function mapHeaders(header: string[]): HeaderMap {
  const index: Record<string, number> = {};
  const unknown: string[] = [];

  header.forEach((raw, position) => {
    const normalized = normalizeHeader(raw);
    if (normalized === "") return;

    const field = Object.entries(HEADERS).find(([, spellings]) =>
      spellings.some((spelling) => normalizeHeader(spelling) === normalized)
    )?.[0];

    if (field && !(field in index)) index[field] = position;
    else if (!field) unknown.push(raw.trim());
  });

  return { index, unknown };
}

/** `31/12/2015`, `31-12-2015` and `2015-12-31` all appear in real exports. */
export function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
}

/** `M`/`F`, `garçon`/`fille`, `ذكر`/`أنثى`. */
export function normalizeGender(value: string): "m" | "f" | null {
  const v = normalizeHeader(value);
  if (["m", "male", "masculin", "garcon", "h", "ذكر"].includes(v)) return "m";
  if (["f", "female", "feminin", "fille", "أنثى", "انثى"].includes(v)) return "f";
  return null;
}

export const importedStudentSchema = z.object({
  // Optional throughout — a school that does not use Massar codes, or a
  // student who has not been issued one yet, must still import cleanly.
  massarCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(MASSAR_CODE_MAX_LENGTH)
    .regex(MASSAR_CODE_PATTERN, { message: "errors.invalidMassarCode" })
    .nullable(),
  firstNameFr: z.string().trim().min(1, "errors.required").max(100),
  lastNameFr: z.string().trim().min(1, "errors.required").max(100),
  firstNameAr: z.string().trim().min(1, "errors.required").max(100),
  lastNameAr: z.string().trim().min(1, "errors.required").max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.invalidDate" }),
  gender: z.enum(GENDERS),
});

export type ImportedStudent = z.infer<typeof importedStudentSchema>;

export type ImportRowError = { line: number; field: string; message: string };

export type ImportPreview = {
  rows: ImportedStudent[];
  errors: ImportRowError[];
  unknownHeaders: string[];
  missingHeaders: string[];
  /** True when the file carries no Massar column at all — not an error. */
  withoutMassar: boolean;
};

const REQUIRED_FIELDS = [
  "firstNameFr",
  "lastNameFr",
  "firstNameAr",
  "lastNameAr",
  "birthDate",
  "gender",
];

/**
 * Turn a CSV file into rows ready to insert, plus everything wrong with it.
 *
 * Nothing is written here. The admin sees the preview — how many rows are
 * good, which lines are bad and why — and confirms. Importing 300 students is
 * not something to do optimistically.
 */
export function previewStudentImport(fileText: string): ImportPreview {
  const table = parseCsv(fileText, detectDelimiter(fileText));
  const [header, ...body] = table;

  if (!header) {
    return {
      rows: [],
      errors: [{ line: 0, field: "file", message: "errors.csvEmpty" }],
      unknownHeaders: [],
      missingHeaders: REQUIRED_FIELDS,
      withoutMassar: true,
    };
  }

  const { index, unknown } = mapHeaders(header);
  const missingHeaders = REQUIRED_FIELDS.filter((field) => !(field in index));

  const rows: ImportedStudent[] = [];
  const errors: ImportRowError[] = [];

  if (missingHeaders.length > 0) {
    return {
      rows,
      errors,
      unknownHeaders: unknown,
      missingHeaders,
      withoutMassar: !("massarCode" in index),
    };
  }

  body.forEach((cells, offset) => {
    // +2: one for the header row, one because humans count from 1.
    const line = offset + 2;
    const cell = (field: string) => {
      const position = index[field];
      return position === undefined ? "" : (cells[position] ?? "").trim();
    };

    const rawMassar = cell("massarCode");
    const rawDate = cell("birthDate");
    const rawGender = cell("gender");

    const birthDate = normalizeDate(rawDate);
    if (rawDate !== "" && birthDate === null) {
      errors.push({ line, field: "birthDate", message: "errors.invalidDate" });
      return;
    }

    const gender = normalizeGender(rawGender);
    if (gender === null) {
      errors.push({ line, field: "gender", message: "errors.invalidGender" });
      return;
    }

    const parsed = importedStudentSchema.safeParse({
      massarCode: rawMassar === "" ? null : rawMassar,
      firstNameFr: cell("firstNameFr"),
      lastNameFr: cell("lastNameFr"),
      firstNameAr: cell("firstNameAr"),
      lastNameAr: cell("lastNameAr"),
      birthDate: birthDate ?? "",
      gender,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          line,
          field: String(issue.path[0] ?? "row"),
          message: issue.message,
        });
      }
      return;
    }

    rows.push(parsed.data);
  });

  // Duplicate Massar codes inside the file itself: the database would reject
  // the second one mid-import, so catch it while nothing has been written.
  const seen = new Map<string, number>();
  rows.forEach((row, offset) => {
    if (!row.massarCode) return;
    const previous = seen.get(row.massarCode);
    if (previous !== undefined) {
      errors.push({
        line: offset + 2,
        field: "massarCode",
        message: "errors.duplicateMassarInFile",
      });
    } else {
      seen.set(row.massarCode, offset);
    }
  });

  return {
    rows,
    errors,
    unknownHeaders: unknown,
    missingHeaders: [],
    withoutMassar: !("massarCode" in index),
  };
}
