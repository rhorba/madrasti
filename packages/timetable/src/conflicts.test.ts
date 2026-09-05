import { describe, expect, it } from "vitest";
import {
  type SlotLike,
  blockingConflicts,
  findAllConflicts,
  findConflicts,
  validateSlot,
} from "./conflicts.js";

/**
 * `docs/test-strategy-madrasti.md` §4.
 *
 * The adjacency case below is the one that matters most: 09:00–10:00 and
 * 10:00–11:00 are back-to-back lessons, which is the normal shape of a school
 * day. An implementation that calls those a clash makes the timetable
 * unbuildable, and it is the classic off-by-one in interval comparison.
 */

function slot(overrides: Partial<SlotLike> = {}): SlotLike {
  return {
    id: "slot-1",
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    teacherId: "teacher-a",
    classGroupId: "class-a",
    room: "S12",
    ...overrides,
  };
}

describe("validateSlot", () => {
  it("accepts an ordinary lesson", () => {
    expect(validateSlot({ weekday: 1, startTime: "09:00", endTime: "10:00" })).toBeNull();
  });

  it("accepts Saturday", () => {
    // Moroccan schools teach Saturday mornings; rejecting it would drop a
    // sixth of the timetable.
    expect(validateSlot({ weekday: 6, startTime: "08:00", endTime: "09:00" })).toBeNull();
  });

  it("rejects Sunday", () => {
    expect(validateSlot({ weekday: 7, startTime: "08:00", endTime: "09:00" })).toEqual({
      code: "errors.invalidWeekday",
    });
  });

  it("rejects a weekday below Monday", () => {
    expect(validateSlot({ weekday: 0, startTime: "08:00", endTime: "09:00" })?.code).toBe(
      "errors.invalidWeekday"
    );
  });

  it("rejects a non-integer weekday", () => {
    expect(validateSlot({ weekday: 1.5, startTime: "08:00", endTime: "09:00" })?.code).toBe(
      "errors.invalidWeekday"
    );
  });

  it("rejects an end before the start", () => {
    expect(validateSlot({ weekday: 1, startTime: "10:00", endTime: "09:00" })?.code).toBe(
      "errors.endBeforeStart"
    );
  });

  it("rejects a zero-length slot", () => {
    expect(validateSlot({ weekday: 1, startTime: "09:00", endTime: "09:00" })?.code).toBe(
      "errors.endBeforeStart"
    );
  });

  it("rejects an unparseable time", () => {
    expect(validateSlot({ weekday: 1, startTime: "25:00", endTime: "26:00" })?.code).toBe(
      "errors.endBeforeStart"
    );
  });

  it("rejects a slot too short to be a lesson", () => {
    expect(validateSlot({ weekday: 1, startTime: "09:00", endTime: "09:05" })?.code).toBe(
      "errors.slotTooShort"
    );
  });

  it("rejects a slot longer than half a day", () => {
    expect(validateSlot({ weekday: 1, startTime: "08:00", endTime: "16:00" })?.code).toBe(
      "errors.slotTooLong"
    );
  });

  it("accepts seconds in the time, as Postgres renders them", () => {
    expect(validateSlot({ weekday: 1, startTime: "09:00:00", endTime: "10:00:00" })).toBeNull();
  });
});

describe("findConflicts — overlap boundaries", () => {
  const existing = [slot({ id: "existing", startTime: "09:00", endTime: "10:00" })];

  it("ADJACENT slots do not conflict", () => {
    // The critical case. Back-to-back lessons are the normal school day.
    const candidate = slot({ id: "new", startTime: "10:00", endTime: "11:00" });
    expect(findConflicts(candidate, existing)).toEqual([]);
  });

  it("adjacent on the other side does not conflict", () => {
    const candidate = slot({ id: "new", startTime: "08:00", endTime: "09:00" });
    expect(findConflicts(candidate, existing)).toEqual([]);
  });

  it("identical times conflict", () => {
    const candidate = slot({ id: "new", startTime: "09:00", endTime: "10:00" });
    expect(findConflicts(candidate, existing).length).toBeGreaterThan(0);
  });

  it("a partial overlap at the start conflicts", () => {
    const candidate = slot({ id: "new", startTime: "08:30", endTime: "09:30" });
    expect(findConflicts(candidate, existing).length).toBeGreaterThan(0);
  });

  it("a partial overlap at the end conflicts", () => {
    const candidate = slot({ id: "new", startTime: "09:30", endTime: "10:30" });
    expect(findConflicts(candidate, existing).length).toBeGreaterThan(0);
  });

  it("a contained slot conflicts", () => {
    const candidate = slot({ id: "new", startTime: "09:15", endTime: "09:45" });
    expect(findConflicts(candidate, existing).length).toBeGreaterThan(0);
  });

  it("a containing slot conflicts", () => {
    const candidate = slot({ id: "new", startTime: "08:00", endTime: "11:00" });
    expect(findConflicts(candidate, existing).length).toBeGreaterThan(0);
  });

  it("a one-minute overlap conflicts", () => {
    const candidate = slot({ id: "new", startTime: "09:59", endTime: "10:59" });
    expect(findConflicts(candidate, existing).length).toBeGreaterThan(0);
  });

  it("a different weekday never conflicts", () => {
    const candidate = slot({ id: "new", weekday: 2 });
    expect(findConflicts(candidate, existing)).toEqual([]);
  });
});

describe("findConflicts — which resource", () => {
  it("reports a teacher double-booking", () => {
    const existing = [slot({ id: "existing", classGroupId: "class-b", room: "S99" })];
    const candidate = slot({ id: "new" });
    const kinds = findConflicts(candidate, existing).map((c) => c.kind);
    expect(kinds).toEqual(["teacher"]);
  });

  it("reports a class double-booking", () => {
    const existing = [slot({ id: "existing", teacherId: "teacher-b", room: "S99" })];
    const candidate = slot({ id: "new" });
    expect(findConflicts(candidate, existing).map((c) => c.kind)).toEqual(["class"]);
  });

  it("reports a room double-booking", () => {
    const existing = [
      slot({ id: "existing", teacherId: "teacher-b", classGroupId: "class-b", room: "S12" }),
    ];
    const candidate = slot({ id: "new" });
    expect(findConflicts(candidate, existing).map((c) => c.kind)).toEqual(["room"]);
  });

  it("reports every conflict, not just the first", () => {
    // An admin fixing a timetable should see both problems at once.
    const existing = [slot({ id: "existing" })];
    const candidate = slot({ id: "new" });
    expect(
      findConflicts(candidate, existing)
        .map((c) => c.kind)
        .sort()
    ).toEqual(["class", "room", "teacher"]);
  });

  it("treats room names case- and whitespace-insensitively", () => {
    const existing = [
      slot({ id: "existing", teacherId: "teacher-b", classGroupId: "class-b", room: "S12" }),
    ];
    const candidate = slot({ id: "new", room: "  s12 " });
    expect(findConflicts(candidate, existing).map((c) => c.kind)).toEqual(["room"]);
  });

  it("does not treat two unassigned rooms as the same room", () => {
    // A null room means "not recorded", not "the same place".
    const existing = [
      slot({ id: "existing", teacherId: "teacher-b", classGroupId: "class-b", room: null }),
    ];
    const candidate = slot({ id: "new", room: null });
    expect(findConflicts(candidate, existing)).toEqual([]);
  });

  it("treats an empty-string room as unassigned", () => {
    const existing = [
      slot({ id: "existing", teacherId: "teacher-b", classGroupId: "class-b", room: "" }),
    ];
    const candidate = slot({ id: "new", room: "   " });
    expect(findConflicts(candidate, existing)).toEqual([]);
  });
});

describe("findConflicts — editing", () => {
  it("a slot never conflicts with itself", () => {
    // Otherwise saving an unchanged slot would refuse itself.
    const existing = [slot({ id: "slot-1" })];
    expect(findConflicts(slot({ id: "slot-1" }), existing)).toEqual([]);
  });

  it("an unsaved slot conflicts with everything it overlaps", () => {
    const existing = [slot({ id: "existing" })];
    expect(findConflicts(slot({ id: undefined }), existing).length).toBeGreaterThan(0);
  });

  it("returns nothing against an empty timetable", () => {
    expect(findConflicts(slot(), [])).toEqual([]);
  });
});

describe("blockingConflicts", () => {
  it("blocks teacher and class clashes", () => {
    const existing = [slot({ id: "existing", room: "S99" })];
    const blocking = blockingConflicts(findConflicts(slot({ id: "new" }), existing));
    expect(blocking.map((c) => c.kind).sort()).toEqual(["class", "teacher"]);
  });

  it("does not block a room clash on its own", () => {
    // Schools do run two groups in a hall. Refusing would have the secretary
    // inventing fake room names to get past us.
    const existing = [
      slot({ id: "existing", teacherId: "teacher-b", classGroupId: "class-b", room: "S12" }),
    ];
    expect(blockingConflicts(findConflicts(slot({ id: "new" }), existing))).toEqual([]);
  });
});

describe("findAllConflicts", () => {
  it("finds nothing in a clean timetable", () => {
    const slots = [
      slot({ id: "a", startTime: "08:00", endTime: "09:00" }),
      slot({ id: "b", startTime: "09:00", endTime: "10:00" }),
      slot({ id: "c", startTime: "10:00", endTime: "11:00" }),
    ];
    expect(findAllConflicts(slots)).toEqual([]);
  });

  it("reports a clashing pair once, not twice", () => {
    const slots = [
      slot({ id: "a", teacherId: "t", classGroupId: "c1", room: null }),
      slot({ id: "b", teacherId: "t", classGroupId: "c2", room: null }),
    ];
    expect(findAllConflicts(slots)).toHaveLength(1);
  });

  it("finds conflicts across a whole week", () => {
    const slots = [
      slot({ id: "a", weekday: 1, teacherId: "t", classGroupId: "c1", room: null }),
      slot({ id: "b", weekday: 1, teacherId: "t", classGroupId: "c2", room: null }),
      slot({ id: "c", weekday: 3, teacherId: "t", classGroupId: "c3", room: null }),
      slot({ id: "d", weekday: 3, teacherId: "t", classGroupId: "c4", room: null }),
    ];
    expect(findAllConflicts(slots)).toHaveLength(2);
  });
});
