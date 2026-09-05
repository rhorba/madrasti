import { afterEach, describe, expect, it, vi } from "vitest";
import { schoolNow, schoolToday } from "./school-time.js";

/**
 * The school's clock.
 *
 * Railway runs in UTC and Morocco is an hour ahead for most of the year, so a
 * server-local date is the wrong day for the first hour of every school
 * morning — precisely when a teacher opens the register and a parent checks
 * whether their child arrived. Morocco also drops back to UTC+0 around
 * Ramadan, so the offset is not a constant that can be hardcoded.
 */

afterEach(() => {
  vi.useRealTimers();
});

/** Freeze the wall clock at an instant expressed in UTC. */
function at(utc: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utc));
}

describe("schoolToday", () => {
  it("returns an ISO date", () => {
    at("2026-09-05T09:00:00Z");
    expect(schoolToday()).toBe("2026-09-05");
  });

  it("is already tomorrow in Casablanca late on a UTC evening", () => {
    // 23:30 UTC on the 5th is 00:30 on the 6th in Casablanca (UTC+1). A
    // server-local date would file the lesson under the wrong day.
    at("2026-09-05T23:30:00Z");
    expect(schoolToday()).toBe("2026-09-06");
  });

  it("is still the same day at the start of the school morning", () => {
    at("2026-09-05T07:00:00Z");
    expect(schoolToday()).toBe("2026-09-05");
  });
});

describe("schoolNow", () => {
  it("reports the local hour, not the UTC one", () => {
    // 07:00 UTC is 08:00 in Casablanca — the first lesson, not the hour before it.
    at("2026-09-05T07:00:00Z");
    expect(schoolNow()).toEqual({ date: "2026-09-05", minutes: 8 * 60 });
  });

  it("carries the date over with the time past midnight", () => {
    at("2026-09-05T23:30:00Z");
    expect(schoolNow()).toEqual({ date: "2026-09-06", minutes: 30 });
  });

  it("handles the Ramadan shift to UTC+0 rather than assuming a fixed offset", () => {
    // Morocco suspends DST for Ramadan. In March 2026 the country is at UTC+0,
    // so 08:00 UTC is 08:00 local — an hour earlier than the rest of the year.
    at("2026-03-05T08:00:00Z");
    const now = schoolNow();
    expect(now.date).toBe("2026-03-05");
    expect(now.minutes).toBe(8 * 60);
  });

  it("gives a minute count a lesson lookup can compare against", () => {
    at("2026-09-05T09:45:00Z");
    const now = schoolNow();
    expect(now.minutes).toBe(10 * 60 + 45);
    expect(now.minutes).toBeGreaterThanOrEqual(0);
    expect(now.minutes).toBeLessThan(24 * 60);
  });
});
