import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Mark, generalAverage, subjectAverage } from "./average.js";
import { rankStudents } from "./rank.js";
import { normalise, roundAverage } from "./scale.js";

/**
 * Property tests — `docs/test-strategy-madrasti.md` §3.
 *
 * The example tests next door assert the cases we thought of. These assert the
 * invariants that must hold for *every* input, which is the half that catches
 * what nobody thought of. Worth the setup cost here and nowhere else: this is
 * the arithmetic behind every bulletin.
 */

const score = fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true });
const coefficient = fc.double({ min: 0.5, max: 10, noNaN: true, noDefaultInfinity: true });

const markArb: fc.Arbitrary<Mark> = fc.record({
  score,
  isAbsent: fc.constant(false),
  maxScore: fc.constantFrom(10, 20, 40),
  coefficient,
});

describe("an average is bounded by its inputs", () => {
  it("never falls outside [min, max] of the normalised marks", () => {
    fc.assert(
      fc.property(fc.array(markArb, { minLength: 1, maxLength: 12 }), (marks) => {
        const average = subjectAverage(marks) as number;
        const normalised = marks.map((m) => normalise(m.score as number, m.maxScore));
        // A weighted mean that escapes its own inputs is arithmetic nobody can
        // explain to a parent — and it is what a sign error looks like.
        expect(average).toBeGreaterThanOrEqual(Math.min(...normalised) - 1e-9);
        expect(average).toBeLessThanOrEqual(Math.max(...normalised) + 1e-9);
      })
    );
  });
});

describe("an absence changes nothing", () => {
  it("adding any number of absences leaves the average identical", () => {
    fc.assert(
      fc.property(
        fc.array(markArb, { minLength: 1, maxLength: 8 }),
        fc.array(coefficient, { maxLength: 5 }),
        (marks, absentCoefficients) => {
          const withAbsences: Mark[] = [
            ...marks,
            ...absentCoefficients.map((c) => ({
              score: null,
              isAbsent: true,
              maxScore: 20,
              coefficient: c,
            })),
          ];
          expect(subjectAverage(withAbsences)).toBe(subjectAverage(marks));
        }
      )
    );
  });
});

describe("identical subjects average to themselves", () => {
  it("whatever the coefficients are", () => {
    fc.assert(
      fc.property(score, fc.array(coefficient, { minLength: 1, maxLength: 10 }), (value, coefs) => {
        const average = generalAverage(coefs.map((c) => ({ average: value, coefficient: c })));
        expect(average).toBeCloseTo(value, 9);
      })
    );
  });
});

describe("a subject with no marks is invisible", () => {
  it("adding empty subjects never moves the general average", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ average: score, coefficient }), { minLength: 1, maxLength: 10 }),
        fc.array(coefficient, { maxLength: 5 }),
        (subjects, emptyCoefficients) => {
          const withEmpties = [
            ...subjects,
            ...emptyCoefficients.map((c) => ({ average: null, coefficient: c })),
          ];
          expect(generalAverage(withEmpties)).toBe(generalAverage(subjects));
        }
      )
    );
  });
});

describe("ranks are well-formed", () => {
  const rankable = fc.array(fc.option(score, { nil: null }), { maxLength: 15 });

  it("every student comes back exactly once", () => {
    fc.assert(
      fc.property(rankable, (averages) => {
        const out = rankStudents(averages.map((average, i) => ({ id: String(i), average })));
        expect(new Set(out.map((r) => r.id)).size).toBe(averages.length);
      })
    );
  });

  it("a rank is 1-based, never exceeds the class size, and 1 exists if anyone is ranked", () => {
    fc.assert(
      fc.property(rankable, (averages) => {
        const out = rankStudents(averages.map((average, i) => ({ id: String(i), average })));
        const ranks = out.map((r) => r.rank).filter((r): r is number => r !== null);

        for (const rank of ranks) {
          expect(rank).toBeGreaterThanOrEqual(1);
          expect(rank).toBeLessThanOrEqual(averages.length);
        }
        if (ranks.length > 0) expect(Math.min(...ranks)).toBe(1);
      })
    );
  });

  it("a rank is exactly one more than the number of students who beat you", () => {
    // This is the tie rule stated as arithmetic: it forces 1, 2, 2, 4 and
    // rules out 1, 2, 2, 3 without naming either.
    fc.assert(
      fc.property(rankable, (averages) => {
        const out = rankStudents(averages.map((average, i) => ({ id: String(i), average })));
        const printed = out
          .filter((r) => r.average !== null)
          .map((r) => roundAverage(r.average as number));

        for (const row of out) {
          if (row.rank === null) continue;
          const better = printed.filter((p) => p > roundAverage(row.average as number)).length;
          expect(row.rank).toBe(better + 1);
        }
      })
    );
  });

  it("a student with no average is never ranked", () => {
    fc.assert(
      fc.property(rankable, (averages) => {
        const out = rankStudents(averages.map((average, i) => ({ id: String(i), average })));
        for (const row of out) {
          if (row.average === null) expect(row.rank).toBeNull();
        }
      })
    );
  });
});
