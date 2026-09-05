import { SCHOOL_TIMEZONE } from "@madrasti/core";
import { parseTime } from "@madrasti/timetable";

/**
 * Today, in the school's timezone rather than the server's.
 *
 * Railway runs in UTC and Morocco is an hour ahead for most of the year, so a
 * server-local date is the wrong day for the first hour of every school
 * morning — which is exactly when a teacher opens the register and a parent
 * checks whether their child arrived.
 */
export function schoolToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIMEZONE }).format(new Date());
}

/** Today, and the minute of it, for deciding which lesson is in progress. */
export function schoolNow(): { date: string; minutes: number } {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHOOL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return { date: schoolToday(), minutes: parseTime(time) };
}
