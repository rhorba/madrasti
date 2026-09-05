import { describe, expect, it } from "vitest";
import { normalise, roundAverage, roundNullable } from "./scale.js";

describe("normalise", () => {
  it("leaves a mark already on the school's scale alone", () => {
    expect(normalise(15, 20)).toBe(15);
  });

  it("rescales a mark given out of something else", () => {
    // The case that makes normalisation necessary: an oral out of 10 must not
    // count half as much as a contrôle out of 20 in the same average.
    expect(normalise(5, 10)).toBe(10);
    expect(normalise(30, 40)).toBe(15);
  });

  it("does NOT clamp a bonus mark", () => {
    // Teachers really do award 21/20. Capping it would misreport what was given.
    expect(normalise(21, 20)).toBe(21);
  });

  it("keeps a zero a zero", () => {
    expect(normalise(0, 20)).toBe(0);
  });

  it("honours a school grading on a different maximum", () => {
    expect(normalise(50, 100, 20)).toBe(10);
  });

  it("refuses a maximum of zero rather than returning Infinity", () => {
    expect(() => normalise(10, 0)).toThrow("errors.maxScorePositive");
    expect(() => normalise(10, -20)).toThrow("errors.maxScorePositive");
  });

  it("refuses a score that is not a number", () => {
    expect(() => normalise(Number.NaN, 20)).toThrow("errors.scoreRequired");
  });
});

describe("roundAverage", () => {
  it("rounds half UP, the way a school does", () => {
    expect(roundAverage(12.345)).toBe(12.35);
    expect(roundAverage(14.335)).toBe(14.34);
  });

  it("survives binary representation", () => {
    // 1.005 is really 1.00499999999999989, so a naive Math.round rounds it
    // down and a bulletin prints one centième less than the parent computes.
    expect(roundAverage(1.005)).toBe(1.01);
  });

  it("rounds down below the half", () => {
    expect(roundAverage(14.334)).toBe(14.33);
  });

  it("leaves an exact value alone", () => {
    expect(roundAverage(15)).toBe(15);
    expect(roundAverage(0)).toBe(0);
  });

  it("takes a different precision when asked", () => {
    expect(roundAverage(15.678, 1)).toBe(15.7);
    expect(roundAverage(15.678, 0)).toBe(16);
  });
});

describe("roundNullable", () => {
  it("keeps null as null — an absent student has no average", () => {
    expect(roundNullable(null)).toBeNull();
  });

  it("rounds a real value", () => {
    expect(roundNullable(12.345)).toBe(12.35);
  });
});
