import { describe, expect, it } from "vitest";
import type { Mark } from "./average.js";
import {
  type BulletinClassSubject,
  type BulletinStudentInput,
  composeClassBulletins,
} from "./bulletin.js";

/**
 * Bulletin composition.
 *
 * The last calculation in the product and the only one that leaves the school
 * on paper with a signature under it. Everything asserted here has a
 * real-world failure attached: a rank that cannot be explained to a parent, an
 * absence counted as a zero, a subject nobody taught deflating a whole class's
 * averages.
 */

/** A mark out of 20 at coefficient 1, which is the ordinary case. */
function mark(score: number | null, over = 20, coefficient = 1): Mark {
  return { score, isAbsent: score === null, maxScore: over, coefficient };
}

/** Absent for the assessment — excluded, and emphatically not a zero. */
const absent: Mark = { score: null, isAbsent: true, maxScore: 20, coefficient: 1 };

const MATHS = "subject-maths";
const ARABE = "subject-arabe";
const EPS = "subject-eps";

/** Maths at 4, Arabic at 4, EPS at 1 — a plausible collège weighting. */
const SUBJECTS: BulletinClassSubject[] = [
  { subjectId: MATHS, coefficient: 4 },
  { subjectId: ARABE, coefficient: 4 },
  { subjectId: EPS, coefficient: 1 },
];

function student(
  studentId: string,
  marksBySubject: Record<string, Mark[]>,
  absenceCount = 0
): BulletinStudentInput {
  return { studentId, absenceCount, marksBySubject };
}

describe("lines", () => {
  it("gives every student a line for every subject, in the order given", () => {
    // Bulletins in a class are read side by side. A student with no maths mark
    // still gets a maths line, or the sheets do not line up.
    const [bulletin] = composeClassBulletins(SUBJECTS, [student("a", { [ARABE]: [mark(14)] })]);
    expect(bulletin?.lines.map((line) => line.subjectId)).toEqual([MATHS, ARABE, EPS]);
    expect(bulletin?.lines[0]).toMatchObject({ average: null, weightedPoints: null });
  });

  it("carries the coefficient onto the line", () => {
    // Frozen at publication: a later change to the class's coefficient must
    // not rewrite a bulletin a parent has already seen.
    const [bulletin] = composeClassBulletins(SUBJECTS, [student("a", { [MATHS]: [mark(10)] })]);
    expect(bulletin?.lines.map((line) => line.coefficient)).toEqual([4, 4, 1]);
  });

  it("computes the points column as average x coefficient", () => {
    // The column a parent adds up by hand.
    const [bulletin] = composeClassBulletins(SUBJECTS, [
      student("a", { [MATHS]: [mark(12.5)], [ARABE]: [mark(15)], [EPS]: [mark(18)] }),
    ]);
    expect(bulletin?.lines.map((line) => line.weightedPoints)).toEqual([50, 60, 18]);
  });

  it("normalises a mark given out of something other than 20", () => {
    // An oral out of 10 must not count half as much as the teacher intended.
    const [bulletin] = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(8, 10)] })]
    );
    expect(bulletin?.lines[0]?.average).toBe(16);
  });

  it("weights assessments within a subject", () => {
    // A devoir surveillé at coefficient 2 against a contrôle at 1.
    const [bulletin] = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(10, 20, 1), mark(16, 20, 2)] })]
    );
    expect(bulletin?.lines[0]?.average).toBe(14);
  });
});

describe("absence is not zero", () => {
  it("excludes an absence from the subject average", () => {
    // 12 and absent is 12, not 6. This is the defect that would be invisible
    // until a parent asked why a good pupil failed.
    const [bulletin] = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(12), absent] })]
    );
    expect(bulletin?.lines[0]?.average).toBe(12);
  });

  it("still counts a genuine zero", () => {
    // A zero is a mark a student earned. It counts, and it hurts.
    const [bulletin] = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(12), mark(0)] })]
    );
    expect(bulletin?.lines[0]?.average).toBe(6);
  });

  it("leaves a subject with nothing but absences unaveraged", () => {
    const [bulletin] = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [absent, absent] })]
    );
    expect(bulletin?.lines[0]?.average).toBeNull();
    expect(bulletin?.generalAverage).toBeNull();
  });
});

describe("general average", () => {
  it("weights subjects by their coefficient", () => {
    // (16*4 + 12*4 + 10*1) / 9
    const [bulletin] = composeClassBulletins(SUBJECTS, [
      student("a", { [MATHS]: [mark(16)], [ARABE]: [mark(12)], [EPS]: [mark(10)] }),
    ]);
    expect(bulletin?.generalAverage).toBe(13.56);
  });

  it("drops an unmarked subject's coefficient out of the denominator too", () => {
    // The silent one. Leaving EPS's coefficient in while it contributes
    // nothing would deflate this average — and every average in the class —
    // with nothing on screen to show for it.
    const [bulletin] = composeClassBulletins(SUBJECTS, [
      student("a", { [MATHS]: [mark(16)], [ARABE]: [mark(12)] }),
    ]);
    // (16*4 + 12*4) / 8 = 14, not / 9 = 12.44.
    expect(bulletin?.generalAverage).toBe(14);
  });

  it("rounds half-up, once, at the end", () => {
    const [bulletin] = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(12), mark(13), mark(14.01)] })]
    );
    expect(bulletin?.generalAverage).toBe(13);
  });
});

describe("rank", () => {
  const three = [
    student("top", { [MATHS]: [mark(18)], [ARABE]: [mark(18)], [EPS]: [mark(18)] }),
    student("mid", { [MATHS]: [mark(12)], [ARABE]: [mark(12)], [EPS]: [mark(12)] }),
    student("low", { [MATHS]: [mark(8)], [ARABE]: [mark(8)], [EPS]: [mark(8)] }),
  ];

  it("ranks the best average first", () => {
    const composed = composeClassBulletins(SUBJECTS, three);
    expect(composed.map((b) => [b.studentId, b.rank])).toEqual([
      ["top", 1],
      ["mid", 2],
      ["low", 3],
    ]);
  });

  it("returns students in the order they were given, not in rank order", () => {
    // The caller passes register order and must get it back, or every screen
    // has to re-join on id.
    const composed = composeClassBulletins(SUBJECTS, [
      three[2],
      three[0],
      three[1],
    ] as typeof three);
    expect(composed.map((b) => b.studentId)).toEqual(["low", "top", "mid"]);
  });

  it("shares a rank on a tie and skips the next", () => {
    // 1, 2, 2, 4 — not 1, 2, 2, 3. Nobody notices until two families compare
    // bulletins, and then everybody does.
    const composed = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [
        student("a", { [MATHS]: [mark(18)] }),
        student("b", { [MATHS]: [mark(12)] }),
        student("c", { [MATHS]: [mark(12)] }),
        student("d", { [MATHS]: [mark(8)] }),
      ]
    );
    expect(composed.map((b) => b.rank)).toEqual([1, 2, 2, 4]);
  });

  it("ties on the average as printed, not on a hidden decimal", () => {
    // Both print 12,33. Ranking one above the other on the fourth decimal is a
    // difference the school cannot explain to either parent.
    const composed = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(12.333)] }), student("b", { [MATHS]: [mark(12.334)] })]
    );
    expect(composed[0]?.generalAverage).toBe(12.33);
    expect(composed[1]?.generalAverage).toBe(12.33);
    expect(composed.map((b) => b.rank)).toEqual([1, 1]);
  });

  it("leaves a student with no marks unranked rather than last", () => {
    // A pupil who joined in November. "23e sur 23" is a statement about them
    // the school never made.
    const composed = composeClassBulletins(SUBJECTS, [...three, student("newcomer", {})]);
    expect(composed.find((b) => b.studentId === "newcomer")).toMatchObject({
      rank: null,
      generalAverage: null,
    });
  });

  it("ranks each subject separately", () => {
    // Strong in maths, weak in Arabic — the two columns must disagree.
    const composed = composeClassBulletins(SUBJECTS, [
      student("a", { [MATHS]: [mark(18)], [ARABE]: [mark(8)] }),
      student("b", { [MATHS]: [mark(8)], [ARABE]: [mark(18)] }),
    ]);
    expect(composed[0]?.lines[0]?.rank).toBe(1); // maths
    expect(composed[0]?.lines[1]?.rank).toBe(2); // arabe
    expect(composed[1]?.lines[0]?.rank).toBe(2);
    expect(composed[1]?.lines[1]?.rank).toBe(1);
  });

  it("leaves a subject rank null where the student has no mark in it", () => {
    const composed = composeClassBulletins(SUBJECTS, [
      student("a", { [MATHS]: [mark(18)] }),
      student("b", { [MATHS]: [mark(8)], [ARABE]: [mark(15)] }),
    ]);
    expect(composed[0]?.lines[1]?.rank).toBeNull();
    expect(composed[1]?.lines[1]?.rank).toBe(1);
  });
});

describe("classSize", () => {
  it("counts the students who have a rank, not the headcount", () => {
    // "3e sur 27" where 27 pupils have marks — printing "sur 32" would assert
    // that five children did worse, which nobody said.
    const composed = composeClassBulletins(SUBJECTS, [
      student("a", { [MATHS]: [mark(18)] }),
      student("b", { [MATHS]: [mark(12)] }),
      student("newcomer", {}),
    ]);
    expect(composed.map((b) => b.classSize)).toEqual([2, 2, 2]);
  });

  it("is zero when nobody in the class has a mark yet", () => {
    const composed = composeClassBulletins(SUBJECTS, [student("a", {}), student("b", {})]);
    expect(composed.map((b) => [b.rank, b.classSize])).toEqual([
      [null, 0],
      [null, 0],
    ]);
  });
});

describe("absences", () => {
  it("carries the term total through untouched", () => {
    const composed = composeClassBulletins(SUBJECTS, [student("a", { [MATHS]: [mark(12)] }, 7)]);
    expect(composed[0]?.absenceCount).toBe(7);
  });

  it("does not let absences touch the average", () => {
    // Being absent from lessons is not being absent from an assessment, and
    // neither is a mark.
    const marks = { [MATHS]: [mark(12)] };
    const [none] = composeClassBulletins(SUBJECTS, [student("a", marks, 0)]);
    const [many] = composeClassBulletins(SUBJECTS, [student("a", marks, 40)]);
    expect(none?.generalAverage).toBe(many?.generalAverage);
  });
});

describe("edge cases", () => {
  it("returns nothing for an empty class", () => {
    expect(composeClassBulletins(SUBJECTS, [])).toEqual([]);
  });

  it("handles a class with no subjects configured yet", () => {
    const composed = composeClassBulletins([], [student("a", {})]);
    expect(composed[0]).toMatchObject({ lines: [], generalAverage: null, rank: null });
  });

  it("respects a school grading out of something other than 20", () => {
    const composed = composeClassBulletins(
      [{ subjectId: MATHS, coefficient: 1 }],
      [student("a", { [MATHS]: [mark(5, 10)] })],
      100
    );
    expect(composed[0]?.lines[0]?.average).toBe(50);
  });

  it("refuses a coefficient of zero rather than producing NaN", () => {
    // A NaN average silently poisons the general average, the rank and the
    // bulletin. It is refused at source instead.
    expect(() =>
      composeClassBulletins(
        [{ subjectId: MATHS, coefficient: 0 }],
        [student("a", { [MATHS]: [mark(12)] })]
      )
    ).toThrow("errors.coefficientPositive");
  });
});
