"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { APPRECIATION_MAX_LENGTH } from "@madrasti/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAppreciations } from "./actions";

/**
 * Writing a class's subject appreciations.
 *
 * A teacher does this once a term, down the register, with the marks in front
 * of her — so the average sits on the row and the whole class is one scrolling
 * list, never one pupil per page.
 *
 * - **`dir="auto"` on every field.** A teacher of an Arabic-medium class
 *   writes in Arabic; the same box is used by the French teacher next door.
 *   The browser decides the direction from the first strong character, which
 *   is right per field and cannot be right per screen.
 * - **Blank means no remark.** Clearing a box removes the remark rather than
 *   printing an empty line on the bulletin, so a teacher can change her mind.
 * - **Explicit save**, as everywhere else marks and records are written: a
 *   mistake must be fixable before it becomes part of a document the school
 *   signs.
 */

export type AppreciationRow = {
  studentId: string;
  name: string;
  average: number | null;
  text: string | null;
};

export function AppreciationSheet({
  classSubjectId,
  termId,
  students,
}: {
  classSubjectId: string;
  termId: string;
  students: AppreciationRow[];
}) {
  const t = useTranslations("appreciations");
  const te = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((student) => [student.studentId, student.text ?? ""]))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const written = students.filter(
    (student) => (texts[student.studentId] ?? "").trim().length > 0
  ).length;

  function setText(studentId: string, value: string) {
    setSaved(false);
    setTexts((current) => ({ ...current, [studentId]: value }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      // Every pupil is sent, including the blank ones — a blank is an
      // instruction to remove a remark, not an absence of information.
      const entries = students.map((student) => ({
        studentId: student.studentId,
        text: (texts[student.studentId] ?? "").trim(),
      }));

      try {
        const result = await saveAppreciations({ classSubjectId, termId, entries });
        if (!result.ok) {
          // Everything written stays on screen. Losing thirty considered
          // sentences to a failed save is the one failure this screen must
          // never have.
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
          const value = texts[student.studentId] ?? "";
          const over = value.trim().length > APPRECIATION_MAX_LENGTH;

          return (
            <li key={student.studentId} className="flex flex-col gap-1.5 border-b py-2.5">
              <div className="flex items-baseline gap-3">
                <span className="tabular w-6 shrink-0 text-xs text-[var(--text-muted)]">
                  {index + 1}
                </span>
                <label
                  htmlFor={`appreciation-${student.studentId}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                >
                  {student.name}
                </label>
                {/* The mark the remark is about. An em dash, never 0 — a pupil
                    with no counted mark has no average, and printing zero
                    accuses them. */}
                <span className="tabular shrink-0 text-sm text-[var(--text-secondary)]">
                  {student.average === null ? (
                    <span className="text-[var(--text-muted)]">—</span>
                  ) : (
                    student.average
                  )}
                </span>
              </div>

              <textarea
                id={`appreciation-${student.studentId}`}
                dir="auto"
                rows={2}
                value={value}
                onChange={(event) => setText(student.studentId, event.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("appreciationFor", { name: student.name })}
                aria-invalid={over || undefined}
                aria-describedby={over ? `over-${student.studentId}` : undefined}
                className={cn(
                  "w-full resize-y rounded-md border px-2.5 py-1.5 text-sm",
                  "border-[var(--border-strong)] bg-[var(--surface-raised)]",
                  over && "border-red-700"
                )}
              />

              {over && (
                <p id={`over-${student.studentId}`} className="text-xs text-red-700">
                  {t("tooLong", {
                    max: APPRECIATION_MAX_LENGTH,
                    over: value.trim().length - APPRECIATION_MAX_LENGTH,
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div
        className="sticky bottom-0 -mx-5 mt-4 border-t bg-[var(--surface-raised)] px-5 py-3 shadow-sticky"
        data-print="hide"
      >
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-700">
            {te(error)} {t("textKept")}
          </p>
        )}
        {saved && !error && (
          <output className="mb-2 block text-sm text-green-700">{t("saved")}</output>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tabular text-sm text-[var(--text-secondary)]">
            {t("writtenCount", { count: written, total: students.length })}
          </p>
          <Button onClick={save} pending={pending} size="lg">
            {error ? t("retry") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
