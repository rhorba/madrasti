import { parseTime } from "./time.js";

/**
 * Turning a weekly grid into concrete dated sessions.
 *
 * Sessions are materialised lazily — created when a teacher first opens one to
 * mark a register, not pre-generated for the year
 * (`docs/system-design-madrasti.md` §2). What this module provides is the
 * arithmetic for "which slots fall on this date" and "what is on today", which
 * the teacher's home screen needs before any session row exists.
 *
 * All dates here are `YYYY-MM-DD` calendar days, never instants. A school day
 * is a wall-clock notion; Morocco shifts to and from UTC+0 around Ramadan, and
 * carrying dates as timestamps would move a register onto the wrong day twice
 * a year.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string): string {
  if (!DATE_PATTERN.test(value)) throw new Error(`invalid date: ${value}`);
  return value;
}

/**
 * Weekday of a calendar date, 1 = Monday … 7 = Sunday.
 *
 * Parsed as UTC deliberately: `new Date("2026-09-07")` is midnight UTC, and
 * reading it back with `getUTCDay` is timezone-independent. Using the local
 * getters would shift the day for anyone west of Greenwich.
 */
export function weekdayOf(date: string): number {
  assertDate(date);
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday–Saturday are teaching days; Sunday is not. */
export function isTeachingDay(date: string): boolean {
  return weekdayOf(date) <= 6;
}

export function addDays(date: string, days: number): string {
  assertDate(date);
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -(weekdayOf(date) - 1));
}

/** Monday–Saturday of the week containing `date`. Sunday is omitted. */
export function teachingWeek(date: string): string[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 6 }, (_, offset) => addDays(monday, offset));
}

export type SlotOnDay = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
};

/**
 * The slots that fall on a given date, in time order.
 *
 * Sorted because the teacher's home screen is a chronological list — "what am
 * I teaching next" is the entire question it answers
 * (`docs/ux-madrasti.md` §5).
 */
export function slotsOnDate<T extends SlotOnDay>(slots: T[], date: string): T[] {
  const weekday = weekdayOf(date);
  return slots
    .filter((slot) => slot.weekday === weekday)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}

/**
 * Which slot is happening now, and which is next.
 *
 * `current` is the session whose interval contains the given time; `next` is
 * the first one starting after it. Both may be absent — before the first
 * lesson there is no current one, after the last there is no next.
 */
export function currentAndNext<T extends SlotOnDay>(
  slots: T[],
  date: string,
  nowMinutes: number
): { current: T | null; next: T | null } {
  const today = slotsOnDate(slots, date);

  const current =
    today.find(
      (slot) => parseTime(slot.startTime) <= nowMinutes && nowMinutes < parseTime(slot.endTime)
    ) ?? null;

  const next = today.find((slot) => parseTime(slot.startTime) > nowMinutes) ?? null;

  return { current, next };
}

/**
 * Every date within a term on which a slot recurs.
 *
 * Used for counting expected sessions, not for pre-creating rows. Inclusive of
 * both bounds, and it never returns a Sunday because no slot may carry
 * weekday 7.
 */
export function datesForSlot(weekday: number, from: string, to: string): string[] {
  assertDate(from);
  assertDate(to);
  if (to < from) return [];

  const dates: string[] = [];
  // Jump straight to the first matching weekday rather than walking every day.
  const offset = (weekday - weekdayOf(from) + 7) % 7;
  for (let date = addDays(from, offset); date <= to; date = addDays(date, 7)) {
    dates.push(date);
  }
  return dates;
}
