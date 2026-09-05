import { describe, expect, it } from "vitest";
import { type BulletinLine, bulletinTotals, composeClassBulletins } from "./bulletin.js";

/**
 * The foot of the printed table.
 *
 * The property that matters is the one a parent tests by hand: points total
 * divided by coefficient total is the general average printed below it.
 */

function line(partial: Partial<BulletinLine>): BulletinLine {
  return {
    subjectId: "s",
    average: 12,
    coefficient: 2,
    weightedPoints: 24,
    rank: null,
    ...partial,
  };
}

describe("bulletinTotals", () => {
  it("adds up the two columns it sits under", () => {
    const totals = bulletinTotals([
      line({ average: 12, coefficient: 4, weightedPoints: 48 }),
      line({ average: 15, coefficient: 2, weightedPoints: 30 }),
    ]);
    expect(totals.coefficient).toBe(6);
    expect(totals.weightedPoints).toBe(78);
    expect(totals.countedSubjects).toBe(2);
  });

  it("leaves out a subject with no mark, coefficient included", () => {
    // The whole point. Counting the unmarked subject's coefficient 4 would put
    // the denominator at 10 and break the parent's hand-check.
    const totals = bulletinTotals([
      line({ average: 12, coefficient: 4, weightedPoints: 48 }),
      line({ average: null, coefficient: 4, weightedPoints: null }),
      line({ average: 15, coefficient: 2, weightedPoints: 30 }),
    ]);
    expect(totals.coefficient).toBe(6);
    expect(totals.weightedPoints).toBe(78);
    expect(totals.countedSubjects).toBe(2);
  });

  it("is zero for a bulletin with nothing marked, rather than NaN", () => {
    const totals = bulletinTotals([line({ average: null, weightedPoints: null })]);
    expect(totals).toEqual({ coefficient: 0, weightedPoints: 0, countedSubjects: 0 });
    expect(totals.weightedPoints / totals.coefficient).toBeNaN();
  });

  it("handles an empty sheet", () => {
    expect(bulletinTotals([])).toEqual({
      coefficient: 0,
      weightedPoints: 0,
      countedSubjects: 0,
    });
  });

  it("does not accumulate binary drift down a long column", () => {
    // 0.1 + 0.2 territory: ten lines of 1.1 points must print 11, not
    // 10.999999999999998.
    const totals = bulletinTotals(
      Array.from({ length: 10 }, () =>
        line({ average: 1.1, coefficient: 0.1, weightedPoints: 1.1 })
      )
    );
    expect(totals.weightedPoints).toBe(11);
    expect(totals.coefficient).toBe(1);
  });
});

describe("the parent's hand-check", () => {
  it("points ÷ coefficients gives back the printed general average", () => {
    // Composed the way a real bulletin is, including a subject the pupil has no
    // mark in — the case that breaks a naive total.
    const [composed] = composeClassBulletins(
      [
        { subjectId: "ar", coefficient: 4 },
        { subjectId: "fr", coefficient: 4 },
        { subjectId: "eps", coefficient: 1 },
      ],
      [
        {
          studentId: "p1",
          absenceCount: 0,
          marksBySubject: {
            ar: [{ score: 13, maxScore: 20, coefficient: 1, isAbsent: false }],
            fr: [{ score: 16, maxScore: 20, coefficient: 1, isAbsent: false }],
            // No EPS mark at all this term.
          },
        },
      ]
    );

    expect(composed).toBeDefined();
    const totals = bulletinTotals(composed!.lines);

    expect(totals.coefficient).toBe(8);
    expect(totals.weightedPoints).toBe(116);
    expect(totals.weightedPoints / totals.coefficient).toBeCloseTo(composed!.generalAverage!, 2);
  });

  it("holds when the averages do not divide cleanly", () => {
    const [composed] = composeClassBulletins(
      [
        { subjectId: "ar", coefficient: 4 },
        { subjectId: "maths", coefficient: 3 },
      ],
      [
        {
          studentId: "p1",
          absenceCount: 0,
          marksBySubject: {
            ar: [
              { score: 11, maxScore: 20, coefficient: 1, isAbsent: false },
              { score: 14, maxScore: 20, coefficient: 2, isAbsent: false },
            ],
            maths: [{ score: 7.5, maxScore: 10, coefficient: 1, isAbsent: false }],
          },
        },
      ]
    );

    const totals = bulletinTotals(composed!.lines);
    // Within a centième — the rounding of each line is what a parent adds up.
    expect(totals.weightedPoints / totals.coefficient).toBeCloseTo(composed!.generalAverage!, 1);
  });
});
