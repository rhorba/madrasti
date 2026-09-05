import { describe, expect, it } from "vitest";
import { isWeekday } from "./conflicts.js";
import {
  durationMinutes,
  formatTime,
  isWellOrdered,
  overlaps,
  parseTime,
  toInterval,
} from "./time.js";

describe("parseTime", () => {
  it("converts to minutes since midnight", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("08:30")).toBe(510);
    expect(parseTime("23:59")).toBe(1439);
  });

  it("ignores seconds and surrounding whitespace", () => {
    expect(parseTime(" 09:15:30 ")).toBe(555);
  });

  it("rejects an out-of-range or malformed time", () => {
    for (const bad of ["24:00", "09:60", "9:00", "", "noon"]) {
      expect(() => parseTime(bad)).toThrow(/invalid time/);
    }
  });
});

describe("formatTime", () => {
  it("zero-pads to HH:MM", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(65)).toBe("01:05");
  });

  it("wraps values outside a single day rather than producing nonsense", () => {
    expect(formatTime(1440)).toBe("00:00");
    expect(formatTime(-60)).toBe("23:00");
  });
});

describe("durationMinutes", () => {
  it("measures the length of a lesson", () => {
    expect(durationMinutes(toInterval("09:00", "10:00"))).toBe(60);
    expect(durationMinutes(toInterval("08:15", "09:45"))).toBe(90);
  });
});

describe("isWellOrdered", () => {
  it("requires the end to be strictly after the start", () => {
    expect(isWellOrdered(toInterval("09:00", "10:00"))).toBe(true);
    expect(isWellOrdered(toInterval("09:00", "09:00"))).toBe(false);
    expect(isWellOrdered(toInterval("10:00", "09:00"))).toBe(false);
  });
});

describe("overlaps", () => {
  it("is symmetric", () => {
    const a = toInterval("09:00", "10:00");
    const b = toInterval("09:30", "10:30");
    expect(overlaps(a, b)).toBe(overlaps(b, a));
    expect(overlaps(a, b)).toBe(true);
  });

  it("treats touching intervals as not overlapping", () => {
    expect(overlaps(toInterval("09:00", "10:00"), toInterval("10:00", "11:00"))).toBe(false);
  });
});

describe("isWeekday", () => {
  it("accepts Monday through Saturday", () => {
    for (const day of [1, 2, 3, 4, 5, 6]) expect(isWeekday(day)).toBe(true);
  });

  it("rejects Sunday, zero and non-integers", () => {
    for (const day of [0, 7, -1, 1.5, Number.NaN]) expect(isWeekday(day)).toBe(false);
  });
});
