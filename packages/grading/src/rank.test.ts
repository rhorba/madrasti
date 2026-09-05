import { describe, expect, it } from "vitest";
import { rankStudents } from "./rank.js";

/** Rank a list of averages, returning just the ranks in student order. */
function ranksOf(averages: (number | null)[]): (number | null)[] {
  const ranked = rankStudents(averages.map((average, index) => ({ id: String(index), average })));
  return averages.map((_, index) => ranked.find((row) => row.id === String(index))?.rank ?? null);
}

describe("rankStudents", () => {
  it("ranks the highest average first", () => {
    expect(ranksOf([12, 16, 14])).toEqual([3, 1, 2]);
  });

  it("gives tied students the same rank AND skips the next one", () => {
    // 1, 2, 2, 4 — never 1, 2, 2, 3. The naive index-based implementation
    // produces the second, and two families notice by comparing bulletins.
    expect(ranksOf([15, 14, 14, 12])).toEqual([1, 2, 2, 4]);
  });

  it("handles a tie at the top", () => {
    expect(ranksOf([16, 16, 12])).toEqual([1, 1, 3]);
  });

  it("handles a whole class on the same average", () => {
    expect(ranksOf([13, 13, 13])).toEqual([1, 1, 1]);
  });

  it("leaves a student with no average UNRANKED, not last", () => {
    // A pupil who joined in November has no marks. "23e sur 23" is a statement
    // about them the school never made.
    expect(ranksOf([14, null, 12])).toEqual([1, null, 2]);
  });

  it("ranks nobody when nobody has an average", () => {
    expect(ranksOf([null, null])).toEqual([null, null]);
  });

  it("ranks a class of one", () => {
    expect(ranksOf([11.5])).toEqual([1]);
  });

  it("returns nothing for an empty class", () => {
    expect(rankStudents([])).toEqual([]);
  });

  it("ties on the average as PRINTED, not on the fourth decimal", () => {
    // Both print 12.33. Ranking one above the other on a difference the
    // bulletin does not show is a distinction the school cannot defend.
    expect(ranksOf([12.3341, 12.3349, 11])).toEqual([1, 1, 3]);
  });

  it("separates averages that print differently", () => {
    expect(ranksOf([12.334, 12.336])).toEqual([2, 1]);
  });

  it("returns ranked students first, then the unranked", () => {
    const out = rankStudents([
      { id: "a", average: null },
      { id: "b", average: 12 },
      { id: "c", average: 18 },
    ]);
    expect(out.map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("carries the caller's own fields through untouched", () => {
    const out = rankStudents([{ id: "a", name: "Yasmine", average: 14 }]);
    expect(out[0]).toEqual({ id: "a", name: "Yasmine", average: 14, rank: 1 });
  });

  it("keeps the unrounded average — rounding is for display only", () => {
    const out = rankStudents([{ id: "a", average: 12.3341 }]);
    expect(out[0]?.average).toBe(12.3341);
  });
});
