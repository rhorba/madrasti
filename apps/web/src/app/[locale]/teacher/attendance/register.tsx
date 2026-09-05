"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AttendanceStatus } from "@madrasti/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveAttendance } from "./actions";

/**
 * The register.
 *
 * The most-used screen in the product, and the one with the tightest budget: a
 * teacher has about ninety seconds between lessons, one hand on a phone, and
 * thirty students in front of her. If this is not close to instant she keeps
 * using the paper register and the product is quietly dead
 * (`docs/ux-madrasti.md` §1).
 *
 * Everything here follows from that:
 *
 * - **Everyone starts present.** She touches only the exceptions, so a full
 *   class is one tap total.
 * - **Tap the row to cycle**, not a dropdown or a modal. The whole row is the
 *   target, at least 44px tall.
 * - **Save is explicit.** Not autosave-per-tap: a mis-tap must be fixable
 *   before it becomes a record.
 * - **No transitions.** Motion on this screen is latency she can feel.
 */

const CYCLE: AttendanceStatus[] = ["present", "absent", "late", "excused"];

/**
 * Colour *and* glyph for every state, never colour alone — an accessibility
 * requirement and a greyscale-print one (`DESIGN.md` §3).
 */
const STYLES: Record<AttendanceStatus, { glyph: string; className: string }> = {
  present: { glyph: "✓", className: "bg-green-50 text-green-700" },
  absent: { glyph: "✗", className: "bg-red-100 text-red-700" },
  late: { glyph: "◷", className: "bg-amber-100 text-amber-700" },
  excused: { glyph: "!", className: "bg-blue-100 text-blue-700" },
};

export type RegisterStudent = {
  studentId: string;
  name: string;
  massarCode: string | null;
  status: AttendanceStatus | null;
  minutesLate: number | null;
};

type Mark = { status: AttendanceStatus; minutesLate: number | null };

export function Register({
  slotId,
  date,
  students,
  alreadyTaken,
}: {
  slotId: string;
  date: string;
  students: RegisterStudent[];
  alreadyTaken: boolean;
}) {
  const t = useTranslations("attendance");
  const te = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Defaulting to present is the entire speed argument. A register reopened
  // for correction starts from what was recorded instead.
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      students.map((student) => [
        student.studentId,
        { status: student.status ?? "present", minutesLate: student.minutesLate },
      ])
    )
  );

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const counts = useMemo(() => {
    const tally: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const mark of Object.values(marks)) tally[mark.status] += 1;
    return tally;
  }, [marks]);

  function cycle(studentId: string) {
    setSaved(false);
    setMarks((current) => {
      const mark = current[studentId];
      if (!mark) return current;
      const next = CYCLE[(CYCLE.indexOf(mark.status) + 1) % CYCLE.length] ?? "present";
      return {
        ...current,
        // Minutes only mean something for `late`; clear them otherwise so a
        // stale value cannot ride along into the database.
        [studentId]: { status: next, minutesLate: next === "late" ? mark.minutesLate : null },
      };
    });
  }

  function setMinutes(studentId: string, minutes: number | null) {
    setMarks((current) => {
      const mark = current[studentId];
      if (!mark) return current;
      return { ...current, [studentId]: { ...mark, minutesLate: minutes } };
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const payload = {
        slotId,
        date,
        marks: students.map((student) => {
          const mark = marks[student.studentId];
          return {
            studentId: student.studentId,
            status: mark?.status ?? "present",
            minutesLate: mark?.status === "late" ? mark.minutesLate : null,
          };
        }),
      };

      // Every failure lands in the same place, and the marks stay exactly
      // where they are. School wifi drops, and asking a teacher to re-enter
      // thirty marks is how you lose her for good (`docs/ux-madrasti.md` §3.8)
      // — including when the request never arrives at all, which is the case
      // an unawaited rejection would otherwise turn into a blank error screen.
      try {
        const result = await saveAttendance(payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSaved(true);
        router.refresh();
      } catch {
        setError("errors.network");
      }
    });
  }

  return (
    <div className="flex flex-col">
      {alreadyTaken && !saved && (
        <p className="mb-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {t("alreadyTaken")}
        </p>
      )}

      <ul className="flex flex-col border-t">
        {students.map((student, index) => {
          const mark = marks[student.studentId] ?? {
            status: "present" as const,
            minutesLate: null,
          };
          const style = STYLES[mark.status];

          return (
            <li key={student.studentId} className="border-b">
              <button
                type="button"
                onClick={() => cycle(student.studentId)}
                // The whole row is the target: 44px minimum, thumb-sized.
                className="flex min-h-11 w-full items-center gap-3 px-1 py-2 text-start hover:bg-[var(--bg-sunken)]"
                aria-label={t("cycleLabel", {
                  name: student.name,
                  status: te(`attendance.statuses.${mark.status}`),
                })}
              >
                <span className="tabular w-6 shrink-0 text-xs text-[var(--text-muted)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{student.name}</span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    style.className
                  )}
                >
                  <span aria-hidden>{style.glyph}</span>
                  {t(`statuses.${mark.status}`)}
                </span>
              </button>

              {/* Optional, and only for `late`. Asking for minutes inline would
                  break the rhythm, so tapping to `late` records it immediately
                  and this is here to be ignored. */}
              {mark.status === "late" && (
                <div className="flex items-center gap-2 px-1 pb-2 ps-10">
                  <label
                    htmlFor={`minutes-${student.studentId}`}
                    className="text-xs text-[var(--text-muted)]"
                  >
                    {t("minutesLate")}
                  </label>
                  <input
                    id={`minutes-${student.studentId}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    value={mark.minutesLate ?? ""}
                    onChange={(event) =>
                      setMinutes(
                        student.studentId,
                        event.target.value === "" ? null : Number(event.target.value)
                      )
                    }
                    className="tabular h-8 w-16 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-end text-sm"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Sticky at the bottom: the running count lets her sanity-check against
          the room before saving, and the button sits in the thumb zone. */}
      <div
        className="sticky bottom-0 -mx-5 mt-4 border-t bg-[var(--surface-raised)] px-5 py-3 shadow-sticky"
        data-print="hide"
      >
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-700">
            {te(error)} {t("marksKept")}
          </p>
        )}
        {saved && !error && (
          <output className="mb-2 block text-sm text-green-700">{t("saved")}</output>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tabular flex flex-wrap gap-x-3 text-sm text-[var(--text-secondary)]">
            <span className="text-green-700">
              {STYLES.present.glyph} {counts.present}
            </span>
            <span className="text-red-700">
              {STYLES.absent.glyph} {counts.absent}
            </span>
            <span className="text-amber-700">
              {STYLES.late.glyph} {counts.late}
            </span>
            <span className="text-blue-700">
              {STYLES.excused.glyph} {counts.excused}
            </span>
          </p>

          <Button onClick={save} pending={pending} size="lg">
            {error ? t("retry") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
