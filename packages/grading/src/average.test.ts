import { describe, expect, it } from "vitest";
import { type Mark, assessmentStats, generalAverage, subjectAverage } from "./average.js";
import { roundAverage } from "./scale.js";

/** A marked assessment, out of 20 with coefficient 1 unless said otherwise. */
function mark(score: number, over: Partial<Mark> = {}): Mark {
  return { score, isAbsent: false, maxScore: 20, coefficient: 1, ...over };
}

/** A student who was not there. Never a zero. */
function absent(over: Partial<Mark> = {}): Mark {
  return { score: null, isAbsent: true, maxScore: 20, coefficient: 1, ...over };
}

describe("subjectAverage", () => {
  it("is the mark itself when there is one assessment", () => {
    expect(subjectAverage([mark(14)])).toBe(14);
  });

  it("averages several assessments of equal weight", () => {
    expect(subjectAverage([mark(14), mark(16)])).toBe(15);
  });

  it("weights by each assessment's coefficient", () => {
    // (14×1 + 16×3) / 4
    expect(subjectAverage([mark(14), mark(16, { coefficient: 3 })])).toBe(15.5);
  });

  it("EXCLUDES an absence — it is not a zero", () => {
    // The single most important assertion in this package. Counting the
    // absence as zero gives 10 and takes five points off a real child.
    expect(subjectAverage([mark(14), absent(), mark(16)])).toBe(15);
  });

  it("does not let an absence pull its coefficient into the denominator", () => {
    expect(subjectAverage([mark(14), absent({ coefficient: 9 })])).toBe(14);
  });

  it("INCLUDES a genuine zero — it is a mark the student earned", () => {
    expect(subjectAverage([mark(0), mark(20)])).toBe(10);
  });

  it("is null when the student was absent for everything", () => {
    // Not 0, not NaN. There is no average to state.
    expect(subjectAverage([absent(), absent()])).toBeNull();
  });

  it("is null when nothing has been marked yet", () => {
    expect(subjectAverage([])).toBeNull();
  });

  it("normalises assessments given out of different maxima", () => {
    // 5/10 and 15/20 are both 10/20 and 15/20 — the oral must not count half.
    expect(subjectAverage([mark(5, { maxScore: 10 }), mark(15)])).toBe(12.5);
  });

  it("carries a bonus mark through unclamped", () => {
    expect(subjectAverage([mark(21)])).toBe(21);
  });

  it("does NOT round intermediate values", () => {
    // 32/3 = 10.6666… A function that rounded here would return 10.67, and the
    // general average built on it would drift a centième per subject.
    const average = subjectAverage([mark(10), mark(11), mark(11)]);
    expect(average).toBeCloseTo(10.666666666666666, 12);
    expect(average).not.toBe(10.67);
    expect(roundAverage(average as number)).toBe(10.67);
  });

  it("refuses a coefficient of zero rather than dividing by it", () => {
    expect(() => subjectAverage([mark(14, { coefficient: 0 })])).toThrow(
      "errors.coefficientPositive"
    );
  });
});

describe("generalAverage", () => {
  it("weights subjects by their per-class coefficient", () => {
    // (12×4 + 16×2) / 6
    expect(
      generalAverage([
        { average: 12, coefficient: 4 },
        { average: 16, coefficient: 2 },
      ])
    ).toBeCloseTo(13.333333333333334, 12);
  });

  it("EXCLUDES a subject with no marks, coefficient and all", () => {
    // Leaving the coefficient in the denominator halves this average to 6 and
    // does it to every student in the class at once.
    expect(
      generalAverage([
        { average: 12, coefficient: 4 },
        { average: null, coefficient: 4 },
      ])
    ).toBe(12);
  });

  it("is null when no subject has a single mark", () => {
    expect(
      generalAverage([
        { average: null, coefficient: 4 },
        { average: null, coefficient: 2 },
      ])
    ).toBeNull();
  });

  it("is null for a student with no subjects at all", () => {
    expect(generalAverage([])).toBeNull();
  });

  it("equals the subject average when every subject agrees, whatever the weights", () => {
    expect(
      generalAverage([
        { average: 13.5, coefficient: 4 },
        { average: 13.5, coefficient: 1 },
      ])
    ).toBe(13.5);
  });
});

describe("assessmentStats", () => {
  it("counts what is entered, what is absent and what is still missing", () => {
    const stats = assessmentStats([
      { score: 12, isAbsent: false },
      { score: 16, isAbsent: false },
      { score: null, isAbsent: true },
      { score: null, isAbsent: false },
    ]);

    expect(stats).toMatchObject({ marked: 2, absent: 1, missing: 1 });
    expect(stats.average).toBe(14);
    expect(stats.lowest).toBe(12);
    expect(stats.highest).toBe(16);
  });

  it("reports nothing rather than zero for an untouched assessment", () => {
    const stats = assessmentStats([{ score: null, isAbsent: false }]);
    expect(stats).toMatchObject({ marked: 0, absent: 0, missing: 1 });
    expect(stats.average).toBeNull();
    expect(stats.lowest).toBeNull();
    expect(stats.highest).toBeNull();
  });

  it("is empty for an empty class", () => {
    expect(assessmentStats([])).toMatchObject({ marked: 0, absent: 0, missing: 0, average: null });
  });
});
