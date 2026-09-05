/**
 * Times of day, as minutes since midnight.
 *
 * Slots are wall-clock times on a repeating weekly grid — "Monday 09:00" is not
 * an instant, so `Date` is the wrong type for them. Comparing `"09:00"` against
 * `"10:00"` as strings happens to work for zero-padded 24-hour values, but
 * arithmetic does not, and the moment someone needs a duration or an overlap
 * the string representation stops being enough. Integers make both trivial.
 */

/** `HH:MM` or `HH:MM:SS`, 24-hour. Postgres `time` columns render either. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export const MINUTES_PER_DAY = 24 * 60;

export function parseTime(value: string): number {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) throw new Error(`invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

/** Always `HH:MM` — seconds are noise on a school timetable. */
export function formatTime(minutes: number): string {
  const clamped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export type Interval = { start: number; end: number };

export function toInterval(startTime: string, endTime: string): Interval {
  return { start: parseTime(startTime), end: parseTime(endTime) };
}

/**
 * Do two intervals overlap?
 *
 * Half-open: `[start, end)`. So 09:00–10:00 and 10:00–11:00 are **adjacent,
 * not overlapping** — back-to-back lessons are the normal case in a school
 * day, and treating them as a clash would make the timetable unbuildable.
 * This one boundary is the whole reason this function exists rather than an
 * inline comparison.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function durationMinutes(interval: Interval): number {
  return interval.end - interval.start;
}

export function isWellOrdered(interval: Interval): boolean {
  return interval.end > interval.start;
}
