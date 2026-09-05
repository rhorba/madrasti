import { describe, expect, it } from "vitest";
import {
  addDays,
  currentAndNext,
  datesForSlot,
  isTeachingDay,
  slotsOnDate,
  startOfWeek,
  teachingWeek,
  weekdayOf,
} from "./sessions.js";
import { formatTime, parseTime } from "./time.js";

/** 2026-09-07 is a Monday. Every date below is anchored to that week. */
const MONDAY = "2026-09-07";

describe("weekdayOf", () => {
  it("maps Monday to 1 through Sunday to 7", () => {
    expect(weekdayOf("2026-09-07")).toBe(1);
    expect(weekdayOf("2026-09-08")).toBe(2);
    expect(weekdayOf("2026-09-12")).toBe(6);
    expect(weekdayOf("2026-09-13")).toBe(7);
  });

  it("rejects a malformed date rather than guessing", () => {
    expect(() => weekdayOf("07/09/2026")).toThrow();
    expect(() => weekdayOf("2026-9-7")).toThrow();
  });
});

describe("isTeachingDay", () => {
  it("counts Saturday as a teaching day and Sunday as not", () => {
    expect(isTeachingDay("2026-09-12")).toBe(true);
    expect(isTeachingDay("2026-09-13")).toBe(false);
  });
});

describe("addDays", () => {
  it("moves forward and backward", () => {
    expect(addDays(MONDAY, 1)).toBe("2026-09-08");
    expect(addDays(MONDAY, -1)).toBe("2026-09-06");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("startOfWeek", () => {
  it("returns the same Monday for every day of that week", () => {
    for (const date of ["2026-09-07", "2026-09-09", "2026-09-12"]) {
      expect(startOfWeek(date)).toBe(MONDAY);
    }
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    // A register taken on Saturday and viewed on Sunday must stay in the same
    // week, which is not what a Sunday-first calendar would do.
    expect(startOfWeek("2026-09-13")).toBe(MONDAY);
  });
});

describe("teachingWeek", () => {
  it("returns Monday to Saturday, omitting Sunday", () => {
    const week = teachingWeek("2026-09-09");
    expect(week).toHaveLength(6);
    expect(week[0]).toBe(MONDAY);
    expect(week[5]).toBe("2026-09-12");
    expect(week).not.toContain("2026-09-13");
  });
});

const SLOTS = [
  { id: "a", weekday: 1, startTime: "10:00", endTime: "11:00" },
  { id: "b", weekday: 1, startTime: "08:00", endTime: "09:00" },
  { id: "c", weekday: 1, startTime: "09:00", endTime: "10:00" },
  { id: "d", weekday: 2, startTime: "08:00", endTime: "09:00" },
];

describe("slotsOnDate", () => {
  it("returns only that weekday's slots, in time order", () => {
    // The teacher's home screen is a chronological list — order is the point.
    expect(slotsOnDate(SLOTS, MONDAY).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("returns nothing for a day with no lessons", () => {
    expect(slotsOnDate(SLOTS, "2026-09-13")).toEqual([]);
  });
});

describe("currentAndNext", () => {
  it("finds the lesson in progress and the one after it", () => {
    const { current, next } = currentAndNext(SLOTS, MONDAY, parseTime("09:30"));
    expect(current?.id).toBe("c");
    expect(next?.id).toBe("a");
  });

  it("before the first lesson there is no current one", () => {
    const { current, next } = currentAndNext(SLOTS, MONDAY, parseTime("07:00"));
    expect(current).toBeNull();
    expect(next?.id).toBe("b");
  });

  it("after the last lesson there is no next one", () => {
    const { current, next } = currentAndNext(SLOTS, MONDAY, parseTime("18:00"));
    expect(current).toBeNull();
    expect(next).toBeNull();
  });

  it("a lesson is current at its start minute", () => {
    expect(currentAndNext(SLOTS, MONDAY, parseTime("09:00")).current?.id).toBe("c");
  });

  it("a lesson is over at its end minute", () => {
    // Half-open intervals: 10:00 belongs to the lesson that starts at 10:00.
    expect(currentAndNext(SLOTS, MONDAY, parseTime("10:00")).current?.id).toBe("a");
  });

  it("in a gap between lessons, only next is set", () => {
    const gapped = [
      { id: "x", weekday: 1, startTime: "08:00", endTime: "09:00" },
      { id: "y", weekday: 1, startTime: "11:00", endTime: "12:00" },
    ];
    const { current, next } = currentAndNext(gapped, MONDAY, parseTime("10:00"));
    expect(current).toBeNull();
    expect(next?.id).toBe("y");
  });
});

describe("datesForSlot", () => {
  it("returns every matching weekday in the range, inclusive", () => {
    const dates = datesForSlot(1, "2026-09-07", "2026-09-28");
    expect(dates).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("starts at the first matching weekday after the range start", () => {
    // Range is Mon 7th to Mon 21st; the Wednesdays inside it are the 9th and
    // the 16th. The 23rd falls outside, so the range end is exclusive of it.
    const dates = datesForSlot(3, "2026-09-07", "2026-09-21");
    expect(dates).toEqual(["2026-09-09", "2026-09-16"]);
  });

  it("returns nothing when the range contains no matching day", () => {
    expect(datesForSlot(1, "2026-09-08", "2026-09-12")).toEqual([]);
  });

  it("returns nothing for an inverted range", () => {
    expect(datesForSlot(1, "2026-09-28", "2026-09-07")).toEqual([]);
  });

  it("handles a single-day range", () => {
    expect(datesForSlot(1, MONDAY, MONDAY)).toEqual([MONDAY]);
  });

  it("spans a full term without drifting", () => {
    // 16 weeks of Mondays; a date-arithmetic bug would show up as 15 or 17.
    const dates = datesForSlot(1, "2026-09-07", "2026-12-21");
    expect(dates).toHaveLength(16);
    expect(dates.every((date) => weekdayOf(date) === 1)).toBe(true);
  });

  it("does not drift across a DST transition", () => {
    // Morocco shifts around Ramadan. Every returned date must still be the
    // same weekday — this is why dates are handled as calendar days in UTC
    // rather than as instants.
    const dates = datesForSlot(4, "2027-02-01", "2027-05-01");
    expect(dates.every((date) => weekdayOf(date) === 4)).toBe(true);
  });
});

describe("time formatting round-trip", () => {
  it("survives parse then format", () => {
    for (const value of ["00:00", "08:30", "12:15", "23:59"]) {
      expect(formatTime(parseTime(value))).toBe(value);
    }
  });

  it("drops seconds", () => {
    expect(formatTime(parseTime("09:05:45"))).toBe("09:05");
  });
});
