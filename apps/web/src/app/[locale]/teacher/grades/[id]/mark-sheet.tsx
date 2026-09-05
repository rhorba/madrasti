"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { assessmentStats, roundNullable } from "@madrasti/grading";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveGrades } from "../actions";

/**
 * Entering a class's marks.
 *
 * A teacher does this with a stack of papers in one hand, reading numbers off
 * them in register order. Everything here follows from that:
 *
 * - **One flat list, never one student per page.** She types, presses Enter,
 *   and the next field is focused. Thirty marks is thirty keystrokes and
 *   twenty-nine Enters, with no reaching for a mouse.
 * - **Blank is not zero.** A student she has not reached yet has no row at
 *   all, which is different from absent and different again from a zero.
 * - **Absent is a checkbox, not a magic value.** Typing "abs" into a number
 *   field is what teachers do to paper, and it is exactly the ambiguity that
 *   turns an absence into a nought (`CLAUDE.md` §3.B).
 * - **Explicit save.** As with the register: a mistake must be fixable before
 *   it becomes a record.
 */

export type MarkSheetStudent = {
  studentId: string;
  name: string;
  score: string | null;
  isAbsent: boolean;
};

type Entry = { value: string; isAbsent: boolean };

/**
 * Parse what a teacher actually typed.
 *
 * `12,5` is how a French keyboard writes twelve and a half, and rejecting it
 * would be the software correcting the user for being Moroccan.
 */
function parseScore(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MarkSheet({
  assessmentId,
  maxScore,
  students,
}: {
  assessmentId: string;
  maxScore: number;
  students: MarkSheetStudent[];
}) {
  const t = useTranslations("grades");
  const te = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      students.map((student) => [
        student.studentId,
        {
          value: student.score === null ? "" : String(Number(student.score)),
          isAbsent: student.isAbsent,
        },
      ])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const stats = useMemo(
    () =>
      assessmentStats(
        students.map((student) => {
          const entry = entries[student.studentId];
          return {
            score: entry?.isAbsent ? null : parseScore(entry?.value ?? ""),
            isAbsent: entry?.isAbsent ?? false,
          };
        })
      ),
    [entries, students]
  );

  function setValue(studentId: string, value: string) {
    setSaved(false);
    setEntries((current) => ({
      ...current,
      // Typing a mark clears an absence: the two states are mutually
      // exclusive, and the database says so too.
      [studentId]: {
        value,
        isAbsent: value.trim() === "" ? (current[studentId]?.isAbsent ?? false) : false,
      },
    }));
  }

  function setAbsent(studentId: string, isAbsent: boolean) {
    setSaved(false);
    setEntries((current) => ({
      ...current,
      [studentId]: { value: isAbsent ? "" : (current[studentId]?.value ?? ""), isAbsent },
    }));
  }

  /** Enter moves down the list, the way a spreadsheet does. */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    inputs.current[index + 1]?.focus();
  }

  function save() {
    setError(null);
    startTransition(async () => {
      // Only students who have been marked. A blank row is not sent at all —
      // it is "not yet entered", which is a real and different state.
      const payload = students
        .map((student) => {
          const entry = entries[student.studentId] ?? { value: "", isAbsent: false };
          if (entry.isAbsent) {
            return { studentId: student.studentId, score: null, isAbsent: true };
          }
          const score = parseScore(entry.value);
          return score === null ? null : { studentId: student.studentId, score, isAbsent: false };
        })
        .filter((entry): entry is { studentId: string; score: number | null; isAbsent: boolean } =>
          Boolean(entry)
        );

      try {
        const result = await saveGrades({ assessmentId, entries: payload });
        if (!result.ok) {
          // Every mark stays on screen — see the register's note; the reason
          // is the same and so is the cost of getting it wrong.
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
      <ul className="flex flex-col border-t">
        {students.map((student, index) => {
          const entry = entries[student.studentId] ?? { value: "", isAbsent: false };
          const score = parseScore(entry.value);
          const above = score !== null && score > maxScore;

          return (
            <li
              key={student.studentId}
              className="flex min-h-11 items-center gap-3 border-b px-1 py-1.5"
            >
              <span className="tabular w-6 shrink-0 text-xs text-[var(--text-muted)]">
                {index + 1}
              </span>
              <label
                htmlFor={`score-${student.studentId}`}
                className="min-w-0 flex-1 truncate text-sm font-medium"
              >
                {student.name}
              </label>

              <input
                id={`score-${student.studentId}`}
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={entry.isAbsent}
                value={entry.value}
                onChange={(event) => setValue(student.studentId, event.target.value)}
                onKeyDown={(event) => onKeyDown(event, index)}
                aria-label={t("scoreFor", { name: student.name, max: maxScore })}
                aria-describedby={above ? `above-${student.studentId}` : undefined}
                className={cn(
                  "tabular h-10 w-20 shrink-0 rounded-md border px-2 text-end text-base",
                  "border-[var(--border-strong)] bg-[var(--surface-raised)]",
                  "disabled:bg-[var(--bg-sunken)] disabled:text-[var(--text-muted)]",
                  // A bonus mark is allowed but flagged, because far more often
                  // it is a typo: 155 for 15,5.
                  above && "border-amber-600"
                )}
              />
              <span className="w-8 shrink-0 text-xs text-[var(--text-muted)]">/{maxScore}</span>

              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={entry.isAbsent}
                  onChange={(event) => setAbsent(student.studentId, event.target.checked)}
                  className="size-4"
                />
                {t("absent")}
              </label>
            </li>
          );
        })}
      </ul>

      {/* Bonus marks are listed rather than blocked — the teacher decides. */}
      {students.some((student) => {
        const score = parseScore(entries[student.studentId]?.value ?? "");
        return score !== null && score > maxScore;
      }) && (
        <p className="mt-3 rounded-md border border-amber-600 bg-amber-100 px-3 py-2 text-sm text-amber-700">
          {t("aboveMax", { max: maxScore })}
        </p>
      )}

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
            <span>{t("marked", { count: stats.marked })}</span>
            <span className="text-amber-700">{t("absentCount", { count: stats.absent })}</span>
            <span className="text-[var(--text-muted)]">
              {t("missing", { count: stats.missing })}
            </span>
            {stats.average !== null && (
              <span className="font-medium">
                {t("classAverage", { value: roundNullable(stats.average) ?? 0 })}
              </span>
            )}
          </p>

          <Button onClick={save} pending={pending} size="lg">
            {error ? t("retry") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
