import { describe, expect, it } from "vitest";
import { APPRECIATION_MAX_LENGTH } from "../constants.js";
import { isRtl } from "../enums.js";
import {
  academicYearSchema,
  appreciationEntrySchema,
  assignmentSchema,
  assignmentUpdateSchema,
  attachmentRequestSchema,
  attendanceMarkSchema,
  changePasswordSchema,
  classSubjectSchema,
  dateStringSchema,
  emailSchema,
  gradeEntrySchema,
  guardianSchema,
  isAboveMax,
  massarCodeSchema,
  passwordSchema,
  phoneSchema,
  saveAppreciationsSchema,
  saveAttendanceSchema,
  saveGradesSchema,
  signInSchema,
  subjectSchema,
  termSchema,
  timeStringSchema,
  timetableSlotSchema,
  updateTimetableSlotSchema,
  weekdaySchema,
} from "./index.js";

/**
 * These schemas are the validation boundary in front of every server action
 * (`CLAUDE.md` §12.2): nothing reaches the database without passing through
 * one. The refinements in particular are business rules — absent is not zero,
 * minutes only mean something for `late`, a lesson cannot end before it starts
 * — and a rule asserted only in a comment is not asserted at all.
 *
 * Two things are checked throughout, not one:
 *   - that the wrong value is refused, and
 *   - that the message is the **translation key** the UI will resolve, because
 *     a raw Zod sentence reaching a teacher is itself a defect (§10.6).
 */

const UUID = "3f1a7c6e-9d2b-4f8a-a1c5-8e0b2d4f6a91";
const UUID_2 = "7b2e4d1a-5c3f-4a9e-b8d7-1f0c6a2e9b43";

/** The first message for `path`, or the first message overall when omitted. */
function issueFor(
  result: { success: boolean; error?: unknown },
  path?: string
): string | undefined {
  if (result.success) return undefined;
  const { issues } = result.error as { issues: { path: (string | number)[]; message: string }[] };
  const match = path ? issues.find((i) => i.path.join(".") === path) : issues[0];
  return match?.message;
}

describe("primitives", () => {
  it("accepts an ISO date and refuses a calendar-invalid one", () => {
    expect(dateStringSchema.safeParse("2026-09-05").success).toBe(true);
    expect(dateStringSchema.safeParse("2024-02-29").success).toBe(true); // a real leap day
    // Shaped like a date, is not one. Both the regex and `Date.parse` let
    // these through — `Date.parse` rolls them over to the following March.
    expect(issueFor(dateStringSchema.safeParse("2026-02-31"))).toBe("errors.invalidDate");
    expect(issueFor(dateStringSchema.safeParse("2025-02-29"))).toBe("errors.invalidDate");
    expect(issueFor(dateStringSchema.safeParse("2026-04-31"))).toBe("errors.invalidDate");
    expect(issueFor(dateStringSchema.safeParse("2026-13-01"))).toBe("errors.invalidDate");
    expect(issueFor(dateStringSchema.safeParse("2026-00-10"))).toBe("errors.invalidDate");
    expect(issueFor(dateStringSchema.safeParse("05/09/2026"))).toBe("errors.invalidDate");
  });

  it("accepts HH:MM and HH:MM:SS on a 24-hour clock", () => {
    expect(timeStringSchema.safeParse("08:30").success).toBe(true);
    expect(timeStringSchema.safeParse("08:30:00").success).toBe(true);
    expect(timeStringSchema.safeParse("23:59").success).toBe(true);
    expect(issueFor(timeStringSchema.safeParse("24:00"))).toBe("errors.invalidTime");
    expect(issueFor(timeStringSchema.safeParse("8:30"))).toBe("errors.invalidTime");
  });

  it("normalises an email to trimmed lower case", () => {
    expect(emailSchema.parse("  Prof@Ecole.MA ")).toBe("prof@ecole.ma");
    expect(issueFor(emailSchema.safeParse("prof@"))).toBe("errors.invalidEmail");
  });

  it("accepts Moroccan numbers the way people actually type them", () => {
    // Every one of these is the same number. Two secretaries typing it
    // differently must not produce two different rows.
    for (const n of ["0612345678", " 06 12 34 56 78", "06-12-34-56-78", "06.12.34.56.78"]) {
      expect(phoneSchema.parse(n), n).toBe("0612345678");
    }
    expect(phoneSchema.parse("+212 612 34 56 78")).toBe("+212612345678");
  });

  it("refuses a number that is not a Moroccan one", () => {
    // Wrong operator prefix — Moroccan numbers run 5 to 7 — and one digit short.
    expect(issueFor(phoneSchema.safeParse("0412345678"))).toBe("errors.invalidPhone");
    expect(issueFor(phoneSchema.safeParse("061234567"))).toBe("errors.invalidPhone");
    expect(issueFor(phoneSchema.safeParse("06123456789"))).toBe("errors.invalidPhone");
  });

  it("upper-cases a Massar code and refuses punctuation", () => {
    expect(massarCodeSchema.parse(" r130012345 ")).toBe("R130012345");
    expect(issueFor(massarCodeSchema.safeParse("R13-0012"))).toBe("errors.invalidMassarCode");
    expect(issueFor(massarCodeSchema.safeParse("R13"))).toBe("errors.invalidMassarCode");
  });
});

describe("attendance", () => {
  const mark = { studentId: UUID, status: "late" as const, minutesLate: 10 };

  it("accepts minutes for a late arrival", () => {
    expect(attendanceMarkSchema.safeParse(mark).success).toBe(true);
  });

  it("refuses minutes on any status but late", () => {
    // Mirrors the database CHECK. Absence reports become unexplainable
    // otherwise: "absent, ten minutes late" is not a thing.
    for (const status of ["present", "absent", "excused"] as const) {
      const result = attendanceMarkSchema.safeParse({ ...mark, status });
      expect(issueFor(result, "minutesLate"), status).toBe("errors.minutesLateOnlyForLate");
    }
  });

  it("accepts late with no minutes recorded", () => {
    expect(attendanceMarkSchema.safeParse({ studentId: UUID, status: "late" }).success).toBe(true);
  });

  it("bounds the minutes", () => {
    expect(attendanceMarkSchema.safeParse({ ...mark, minutesLate: 0 }).success).toBe(false);
    expect(attendanceMarkSchema.safeParse({ ...mark, minutesLate: 241 }).success).toBe(false);
    expect(attendanceMarkSchema.safeParse({ ...mark, minutesLate: 240 }).success).toBe(true);
  });

  it("refuses an empty register", () => {
    const result = saveAttendanceSchema.safeParse({ slotId: UUID, date: "2026-09-05", marks: [] });
    expect(issueFor(result, "marks")).toBe("errors.emptyRegister");
  });
});

describe("grades", () => {
  it("excludes an absent student by refusing to give them a score", () => {
    // The distinction the whole grading package rests on: an absence is the
    // absence of a mark, not a zero.
    const result = gradeEntrySchema.safeParse({ studentId: UUID, score: 0, isAbsent: true });
    expect(issueFor(result, "score")).toBe("errors.absentCannotHaveScore");
  });

  it("requires a score from a student who was present", () => {
    const result = gradeEntrySchema.safeParse({ studentId: UUID, score: null, isAbsent: false });
    expect(issueFor(result, "score")).toBe("errors.scoreRequired");
  });

  it("accepts a genuine zero", () => {
    const parsed = gradeEntrySchema.parse({ studentId: UUID, score: 0, isAbsent: false });
    expect(parsed).toMatchObject({ score: 0, isAbsent: false });
  });

  it("accepts an absence with no score", () => {
    expect(
      gradeEntrySchema.safeParse({ studentId: UUID, score: null, isAbsent: true }).success
    ).toBe(true);
  });

  it("defaults isAbsent to false", () => {
    expect(gradeEntrySchema.parse({ studentId: UUID, score: 12 }).isAbsent).toBe(false);
  });

  it("refuses a negative mark", () => {
    const result = gradeEntrySchema.safeParse({ studentId: UUID, score: -1, isAbsent: false });
    expect(issueFor(result, "score")).toBe("errors.scoreNegative");
  });

  it("refuses an assessment with nobody in it", () => {
    const result = saveGradesSchema.safeParse({ assessmentId: UUID, entries: [] });
    expect(issueFor(result, "entries")).toBe("errors.noGrades");
  });

  it("flags a mark above the maximum without rejecting it", () => {
    // A bonus mark above the ceiling is a real thing teachers do, so the
    // schema stays out of it and the action warns.
    expect(isAboveMax(21, 20)).toBe(true);
    expect(isAboveMax(20, 20)).toBe(false);
    expect(isAboveMax(null, 20)).toBe(false);
  });
});

describe("homework", () => {
  const homework = { classSubjectId: UUID, title: "Exercices 4 et 5", assignedOn: "2026-09-05" };

  it("refuses a due date before the assigned date", () => {
    const result = assignmentSchema.safeParse({ ...homework, dueOn: "2026-09-04" });
    expect(issueFor(result, "dueOn")).toBe("errors.dueBeforeAssigned");
  });

  it("accepts homework due the day it is set", () => {
    expect(assignmentSchema.safeParse({ ...homework, dueOn: "2026-09-05" }).success).toBe(true);
  });

  it("applies the same rule when the homework is edited", () => {
    // The rule is written out twice, once per schema. Asserting only the
    // create path is how the edit path comes to disagree with it.
    const edit = { id: UUID_2, title: homework.title, assignedOn: homework.assignedOn };
    expect(
      issueFor(assignmentUpdateSchema.safeParse({ ...edit, dueOn: "2026-09-04" }), "dueOn")
    ).toBe("errors.dueBeforeAssigned");
    expect(assignmentUpdateSchema.safeParse({ ...edit, dueOn: "2026-09-12" }).success).toBe(true);
  });

  it("refuses an attachment type that is not on the list", () => {
    const request = { classSubjectId: UUID, contentType: "application/zip", contentLength: 1000 };
    expect(issueFor(attachmentRequestSchema.safeParse(request), "contentType")).toBe(
      "errors.attachmentType"
    );
  });

  it("refuses an empty or oversized attachment", () => {
    const request = { classSubjectId: UUID, contentType: "application/pdf" as const };
    expect(issueFor(attachmentRequestSchema.safeParse({ ...request, contentLength: 0 }))).toBe(
      "errors.attachmentEmpty"
    );
    expect(
      issueFor(
        attachmentRequestSchema.safeParse({ ...request, contentLength: 10 * 1024 * 1024 + 1 })
      )
    ).toBe("errors.attachmentTooLarge");
  });
});

describe("timetable", () => {
  const slot = { classSubjectId: UUID, weekday: 6, startTime: "08:00", endTime: "10:00" };

  it("accepts Saturday and refuses Sunday", () => {
    // The Moroccan school week is Mon-Sat. Sunday (7) is absent by design.
    expect(weekdaySchema.safeParse(6).success).toBe(true);
    expect(issueFor(weekdaySchema.safeParse(7))).toBe("errors.invalidWeekday");
    expect(issueFor(weekdaySchema.safeParse(0))).toBe("errors.invalidWeekday");
  });

  it("coerces the weekday arriving from a form as a string", () => {
    expect(weekdaySchema.parse("3")).toBe(3);
  });

  it("refuses a lesson that ends before or when it starts", () => {
    expect(issueFor(timetableSlotSchema.safeParse({ ...slot, endTime: "07:00" }), "endTime")).toBe(
      "errors.endBeforeStart"
    );
    expect(issueFor(timetableSlotSchema.safeParse({ ...slot, endTime: "08:00" }), "endTime")).toBe(
      "errors.endBeforeStart"
    );
  });

  it("applies the same rule to the update variant", () => {
    // The refined schema cannot be `.extend()`ed, so the update variant is
    // re-refined from the plain object — which is exactly how a rule gets
    // dropped from one of the two without anyone noticing.
    const result = updateTimetableSlotSchema.safeParse({ ...slot, id: UUID_2, endTime: "07:00" });
    expect(issueFor(result, "endTime")).toBe("errors.endBeforeStart");
    expect(updateTimetableSlotSchema.safeParse({ ...slot, id: UUID_2 }).success).toBe(true);
  });
});

describe("academic structure", () => {
  it("requires a year label shaped like 2025-2026", () => {
    const dates = { startDate: "2025-09-01", endDate: "2026-06-30" };
    expect(academicYearSchema.safeParse({ label: "2025-2026", ...dates }).success).toBe(true);
    expect(issueFor(academicYearSchema.safeParse({ label: "2025/26", ...dates }), "label")).toBe(
      "errors.invalidYearLabel"
    );
  });

  it("refuses a year that ends before it starts", () => {
    const result = academicYearSchema.safeParse({
      label: "2025-2026",
      startDate: "2026-06-30",
      endDate: "2025-09-01",
    });
    expect(issueFor(result, "endDate")).toBe("errors.endBeforeStart");
  });

  it("allows three terms and no more", () => {
    const term = {
      yearId: UUID,
      labelFr: "Trimestre 1",
      labelAr: "الأسدس الأول",
      labelEn: "Term 1",
      startDate: "2025-09-01",
      endDate: "2025-12-15",
    };
    expect(termSchema.safeParse({ ...term, order: 3 }).success).toBe(true);
    expect(termSchema.safeParse({ ...term, order: 4 }).success).toBe(false);
  });

  it("defaults a subject colour and refuses a malformed one", () => {
    const subject = { nameFr: "Maths", nameAr: "الرياضيات", nameEn: "Maths", code: "MATH" };
    expect(subjectSchema.parse(subject).color).toBe("#2F6B43");
    expect(issueFor(subjectSchema.safeParse({ ...subject, color: "green" }), "color")).toBe(
      "errors.invalidColor"
    );
    expect(issueFor(subjectSchema.safeParse({ ...subject, code: "maths" }), "code")).toBe(
      "errors.invalidCode"
    );
  });

  it("keeps the coefficient on the class+subject, positive and bounded", () => {
    // Maths is coefficient 4 in college and 2 in some primaire levels; a
    // school-wide value would mis-weight every bulletin at every other level.
    const link = { classGroupId: UUID, subjectId: UUID_2, teacherId: UUID };
    expect(classSubjectSchema.parse(link).coefficient).toBe(1);
    expect(classSubjectSchema.parse({ ...link, coefficient: "4" }).coefficient).toBe(4);
    expect(issueFor(classSubjectSchema.safeParse({ ...link, coefficient: 0 }))).toBe(
      "errors.coefficientPositive"
    );
    expect(classSubjectSchema.safeParse({ ...link, coefficient: 11 }).success).toBe(false);
  });

  it("requires a guardian's name in both scripts", () => {
    const guardian = {
      firstNameFr: "Youssef",
      lastNameFr: "Alaoui",
      firstNameAr: "",
      lastNameAr: "العلوي",
      phone: "0612345678",
      relation: "father" as const,
    };
    expect(issueFor(guardianSchema.safeParse(guardian), "firstNameAr")).toBe("errors.required");
  });
});

describe("auth", () => {
  it("enforces length but no composition rules", () => {
    // Composition rules push a school secretary creating twenty accounts
    // toward a note stuck to the monitor (security doc §4).
    expect(passwordSchema.safeParse("correcte cheval batterie").success).toBe(true);
    expect(issueFor(passwordSchema.safeParse("court"))).toBe("errors.passwordTooShort");
  });

  it("refuses the handful anyone in a hurry would pick, case-insensitively", () => {
    expect(issueFor(passwordSchema.safeParse("motdepasse"))).toBe("errors.passwordTooCommon");
    expect(issueFor(passwordSchema.safeParse("Madrasti123"))).toBe("errors.passwordTooCommon");
  });

  it("does not apply the policy to the password being signed in with", () => {
    // An existing password predates the policy, and validating it at sign-in
    // would leak which accounts hold a weak one.
    expect(signInSchema.safeParse({ email: "prof@ecole.ma", password: "1234" }).success).toBe(true);
    expect(issueFor(signInSchema.safeParse({ email: "prof@ecole.ma", password: "" }))).toBe(
      "errors.required"
    );
  });

  it("catches a mistyped confirmation and an unchanged password", () => {
    const current = { currentPassword: "ancien-mot-de-passe" };
    expect(
      issueFor(
        changePasswordSchema.safeParse({
          ...current,
          newPassword: "nouveau-mot-de-passe",
          confirmPassword: "nouveau-mot-de-pass",
        }),
        "confirmPassword"
      )
    ).toBe("errors.passwordMismatch");
    expect(
      issueFor(
        changePasswordSchema.safeParse({
          ...current,
          newPassword: "ancien-mot-de-passe",
          confirmPassword: "ancien-mot-de-passe",
        }),
        "newPassword"
      )
    ).toBe("errors.passwordUnchanged");
  });
});

describe("appreciations", () => {
  const id = "b3f1a1f4-5c2e-4b6d-9f1a-1f45c2e4b6d9";
  const other = "c4a2b2e5-6d3f-4c7e-8a2b-2e56d3f4c7e8";

  it("accepts an empty remark, because clearing one is a real instruction", () => {
    // The schema must not treat an erasure as a validation failure: the action
    // deletes the row, and the CHECK in the database is what refuses to store
    // a blank as though it were a remark.
    const parsed = appreciationEntrySchema.safeParse({ studentId: id, text: "   " });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.text).toBe("");
  });

  it("keeps an Arabic remark intact", () => {
    // A teacher of an Arabic-medium class writes in Arabic, and the sentence
    // is stored and printed exactly as authored — never translated
    // (`.logs/decisions.md`, 2026-09-05).
    const text = "تلميذ مجتهد، مستواه في تحسن مستمر.";
    const parsed = appreciationEntrySchema.safeParse({ studentId: id, text });
    expect(parsed.success && parsed.data.text).toBe(text);
  });

  it("refuses a remark too long to fit a bulletin, with a translation key", () => {
    expect(
      issueFor(
        appreciationEntrySchema.safeParse({
          studentId: id,
          text: "a".repeat(APPRECIATION_MAX_LENGTH + 1),
        }),
        "text"
      )
    ).toBe("errors.appreciationTooLong");
    expect(
      appreciationEntrySchema.safeParse({
        studentId: id,
        text: "a".repeat(APPRECIATION_MAX_LENGTH),
      }).success
    ).toBe(true);
  });

  it("refuses an empty sheet", () => {
    expect(
      issueFor(
        saveAppreciationsSchema.safeParse({ classSubjectId: id, termId: other, entries: [] })
      )
    ).toBe("errors.noAppreciations");
  });

  it("carries the class+subject and the term, never the subject alone", () => {
    // Both are required: the class+subject is the authorisation, and without
    // the term a remark would land on whichever bulletin was generated next.
    expect(
      saveAppreciationsSchema.safeParse({
        classSubjectId: id,
        entries: [{ studentId: other, text: "Bien." }],
      }).success
    ).toBe(false);
  });
});

describe("locale", () => {
  it("marks Arabic as the only RTL locale we ship", () => {
    // Read by the layout, the direction attribute and every mirrored icon.
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("fr")).toBe(false);
    expect(isRtl("en")).toBe(false);
  });
});
