import { WEEKDAY_MAX, WEEKDAY_MIN, type Weekday } from "@madrasti/core";
import { type Interval, isWellOrdered, overlaps, toInterval } from "./time.js";

/**
 * Slot conflict detection.
 *
 * Three resources can be double-booked, and each has a different consequence:
 *
 * - **A teacher** cannot be in two rooms at once. This is the one that gets
 *   noticed immediately, on the first Monday.
 * - **A class** cannot have two lessons at once. Noticed just as fast.
 * - **A room** cannot hold two classes at once. Often tolerated in practice —
 *   a "room" may be a shared yard or a hall — so it is reported separately and
 *   the caller decides whether to refuse or merely warn.
 *
 * Pure and exhaustively tested: a wrong answer here either makes the timetable
 * unbuildable or lets a teacher be scheduled in two places, and neither is
 * discoverable until term starts.
 */

export type SlotLike = {
  /** Absent for a slot not yet persisted. */
  id?: string | undefined;
  weekday: number;
  startTime: string;
  endTime: string;
  room?: string | null | undefined;
  teacherId: string;
  classGroupId: string;
};

export type ConflictKind = "teacher" | "class" | "room";

export type Conflict = {
  kind: ConflictKind;
  /** The existing slot that the candidate collides with. */
  withSlotId: string | undefined;
  weekday: number;
  startTime: string;
  endTime: string;
};

export type ValidationIssue =
  | { code: "errors.invalidWeekday" }
  | { code: "errors.endBeforeStart" }
  | { code: "errors.slotTooShort" }
  | { code: "errors.slotTooLong" };

/** A lesson shorter than this is almost certainly a typo. */
export const MIN_SLOT_MINUTES = 15;
/** Longer than half a day is likewise a mistake, not a marathon lesson. */
export const MAX_SLOT_MINUTES = 6 * 60;

export function validateSlot(
  slot: Pick<SlotLike, "weekday" | "startTime" | "endTime">
): ValidationIssue | null {
  if (!Number.isInteger(slot.weekday) || slot.weekday < WEEKDAY_MIN || slot.weekday > WEEKDAY_MAX) {
    // Sunday (7) lands here. Moroccan schools teach Monday–Saturday.
    return { code: "errors.invalidWeekday" };
  }

  let interval: Interval;
  try {
    interval = toInterval(slot.startTime, slot.endTime);
  } catch {
    return { code: "errors.endBeforeStart" };
  }

  if (!isWellOrdered(interval)) return { code: "errors.endBeforeStart" };

  const minutes = interval.end - interval.start;
  if (minutes < MIN_SLOT_MINUTES) return { code: "errors.slotTooShort" };
  if (minutes > MAX_SLOT_MINUTES) return { code: "errors.slotTooLong" };

  return null;
}

/**
 * Every conflict between a candidate slot and the slots that already exist.
 *
 * Returns all of them rather than the first: an admin fixing a timetable wants
 * to see that a slot clashes with both a teacher and a room, not to discover
 * the second problem after fixing the first.
 *
 * A slot never conflicts with itself — `candidate.id` is excluded — so this
 * works unchanged when editing an existing slot.
 */
export function findConflicts(candidate: SlotLike, existing: SlotLike[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const candidateInterval = toInterval(candidate.startTime, candidate.endTime);
  const candidateRoom = normalizeRoom(candidate.room);

  for (const other of existing) {
    if (candidate.id !== undefined && other.id === candidate.id) continue;
    if (other.weekday !== candidate.weekday) continue;
    if (!overlaps(candidateInterval, toInterval(other.startTime, other.endTime))) continue;

    const shared = {
      withSlotId: other.id,
      weekday: other.weekday,
      startTime: other.startTime,
      endTime: other.endTime,
    };

    if (other.teacherId === candidate.teacherId) {
      conflicts.push({ kind: "teacher", ...shared });
    }
    if (other.classGroupId === candidate.classGroupId) {
      conflicts.push({ kind: "class", ...shared });
    }

    const otherRoom = normalizeRoom(other.room);
    if (candidateRoom !== null && otherRoom !== null && candidateRoom === otherRoom) {
      conflicts.push({ kind: "room", ...shared });
    }
  }

  return conflicts;
}

/**
 * Conflicts that must block the write.
 *
 * A room clash is reported but not blocking: schools genuinely do run two
 * groups in a hall or a yard, and refusing that would have the secretary
 * inventing fake room names to get around us.
 */
export function blockingConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.filter((conflict) => conflict.kind !== "room");
}

/** Rooms are typed by hand, so "S12" and " s12 " are the same room. */
function normalizeRoom(room: string | null | undefined): string | null {
  if (room === null || room === undefined) return null;
  const trimmed = room.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/** Every conflict within a set of slots — used to audit an imported timetable. */
export function findAllConflicts(slots: SlotLike[]): Conflict[] {
  const seen = new Set<string>();
  const conflicts: Conflict[] = [];

  for (const slot of slots) {
    for (const conflict of findConflicts(slot, slots)) {
      // A clashes with B and B with A; report the pair once.
      const key = [conflict.kind, slot.id ?? "", conflict.withSlotId ?? ""].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

export function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= WEEKDAY_MIN && value <= WEEKDAY_MAX;
}
