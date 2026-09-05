"use client";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { APPRECIATION_MAX_LENGTH, BULLETIN_DECISIONS, type BulletinDecision } from "@madrasti/core";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishBulletins, saveBulletinReview, unpublishBulletins } from "./actions";

/**
 * The conseil de classe, on one screen.
 *
 * The head teacher reads down the class — average, rank, absences — and writes
 * the overall remark and the council's decision against each pupil. Then one
 * button turns the whole class into documents.
 *
 * The two states this screen has are deliberately not the same screen wearing
 * a flag. **Before publication** everything is editable and the figures are
 * live. **After publication** the fields are read-only and the figures shown
 * are the frozen ones — because that is what the family is holding, and a
 * screen that showed a recomputed average beside a published bulletin would
 * quietly teach the school to distrust its own paperwork.
 */

export type ReviewRow = {
  studentId: string;
  name: string;
  average: number | null;
  rank: number | null;
  classSize: number;
  absenceCount: number;
  appreciation: string;
  decision: BulletinDecision | null;
};

export function ReviewSheet({
  classGroupId,
  termId,
  students,
  publishedAt,
}: {
  classGroupId: string;
  termId: string;
  students: ReviewRow[];
  publishedAt: string | null;
}) {
  const t = useTranslations("bulletins");
  const tp = useTranslations("bulletinDoc");
  const te = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const published = publishedAt !== null;
  const [rows, setRows] = useState<Record<string, { appreciation: string; decision: string }>>(() =>
    Object.fromEntries(
      students.map((student) => [
        student.studentId,
        { appreciation: student.appreciation, decision: student.decision ?? "" },
      ])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  function edit(studentId: string, patch: { appreciation?: string; decision?: string }) {
    setNotice(null);
    setRows((current) => ({
      ...current,
      [studentId]: {
        appreciation: current[studentId]?.appreciation ?? "",
        decision: current[studentId]?.decision ?? "",
        ...patch,
      },
    }));
  }

  function entries() {
    return students.map((student) => {
      const row = rows[student.studentId] ?? { appreciation: "", decision: "" };
      return {
        studentId: student.studentId,
        appreciation: row.appreciation.trim(),
        decision: row.decision === "" ? null : (row.decision as BulletinDecision),
      };
    });
  }

  /** Run an action, keeping everything on screen if it fails. */
  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.error ?? "errors.unexpected");
          return;
        }
        setNotice(success);
        router.refresh();
      } catch {
        setError("errors.network");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {published && (
        <p
          className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-sm"
          data-print="hide"
        >
          {/* Colour is never the only signal — the sentence says it too. */}
          <strong className="font-medium">{t("publishedOn", { date: publishedAt })}</strong>{" "}
          {t("publishedExplainer")}
        </p>
      )}

      <ul className="flex flex-col border-t">
        {students.map((student, index) => {
          const row = rows[student.studentId] ?? { appreciation: "", decision: "" };
          const over = row.appreciation.trim().length > APPRECIATION_MAX_LENGTH;

          return (
            <li key={student.studentId} className="flex flex-col gap-2 border-b py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular w-6 shrink-0 text-xs text-[var(--text-muted)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{student.name}</span>

                <span className="tabular flex shrink-0 items-center gap-3 text-sm">
                  <span title={t("average")}>
                    {student.average === null ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      student.average
                    )}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {student.rank === null
                      ? "—"
                      : t("rankOf", { rank: student.rank, of: student.classSize })}
                  </span>
                  {student.absenceCount > 0 ? (
                    <Chip tone="amber">{t("absences", { count: student.absenceCount })}</Chip>
                  ) : (
                    <span className="text-[var(--text-muted)]">{t("absences", { count: 0 })}</span>
                  )}
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <textarea
                  id={`appreciation-${student.studentId}`}
                  dir="auto"
                  rows={2}
                  readOnly={published}
                  value={row.appreciation}
                  onChange={(event) =>
                    edit(student.studentId, { appreciation: event.target.value })
                  }
                  placeholder={published ? "" : t("appreciationPlaceholder")}
                  aria-label={t("appreciationFor", { name: student.name })}
                  aria-invalid={over || undefined}
                  className={cn(
                    "min-w-0 flex-1 resize-y rounded-md border px-2.5 py-1.5 text-sm",
                    "border-[var(--border-strong)] bg-[var(--surface-raised)]",
                    published && "bg-[var(--bg-sunken)] text-[var(--text-secondary)]",
                    over && "border-red-700"
                  )}
                />

                <select
                  value={row.decision}
                  disabled={published}
                  onChange={(event) => edit(student.studentId, { decision: event.target.value })}
                  aria-label={t("decisionFor", { name: student.name })}
                  className={cn(
                    "h-11 shrink-0 rounded-md border px-2 text-sm sm:w-56",
                    "border-[var(--border-strong)] bg-[var(--surface-raised)]",
                    "disabled:bg-[var(--bg-sunken)] disabled:text-[var(--text-secondary)]"
                  )}
                >
                  <option value="">{t("noDecision")}</option>
                  {BULLETIN_DECISIONS.map((decision) => (
                    <option key={decision} value={decision}>
                      {t(`decisions.${decision}`)}
                    </option>
                  ))}
                </select>
              </div>

              {over && (
                <p className="text-xs text-red-700">
                  {t("tooLong", {
                    max: APPRECIATION_MAX_LENGTH,
                    over: row.appreciation.trim().length - APPRECIATION_MAX_LENGTH,
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div
        className="sticky bottom-0 -mx-5 border-t bg-[var(--surface-raised)] px-5 py-3 shadow-sticky"
        data-print="hide"
      >
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-700">
            {te(error)}
          </p>
        )}
        {notice && !error && (
          <output className="mb-2 block text-sm text-green-700">{t(notice)}</output>
        )}

        {published ? (
          <div className="flex flex-col gap-2">
            {confirming ? (
              <div className="flex flex-col gap-2">
                {/* A reason is required, not optional: unpublishing reopens
                    marks a family has already been shown, and a year later
                    this sentence is the only thing that can explain why an
                    average changed. */}
                <label htmlFor="unpublish-reason" className="text-sm font-medium">
                  {t("unpublishReason")}
                </label>
                <input
                  id="unpublish-reason"
                  dir="auto"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    pending={pending}
                    disabled={reason.trim().length === 0}
                    onClick={() =>
                      run(
                        () =>
                          unpublishBulletins({
                            classGroupId,
                            termId,
                            reason: reason.trim(),
                          }),
                        "unpublished"
                      )
                    }
                  >
                    {t("confirmUnpublish")}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--text-secondary)]">{t("frozen")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Printing is offered only once the class is published,
                      because only a published bulletin exists on paper. The
                      print screen enforces that too — this is where it is
                      *explained*. */}
                  <Link
                    href={`/admin/bulletins/print?class=${classGroupId}&term=${termId}`}
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] px-4 text-base font-medium hover:bg-[var(--bg-sunken)]"
                  >
                    <Printer aria-hidden size={18} strokeWidth={1.5} />
                    {tp("print")}
                  </Link>
                  <Button variant="secondary" onClick={() => setConfirming(true)}>
                    {t("unpublish")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {t("toPublish", { count: students.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                pending={pending}
                onClick={() =>
                  run(
                    () => saveBulletinReview({ classGroupId, termId, entries: entries() }),
                    "reviewSaved"
                  )
                }
              >
                {t("saveDraft")}
              </Button>
              <Button
                pending={pending}
                onClick={() =>
                  // The remarks are saved first, then the class is published,
                  // so an admin who writes and publishes in one go does not
                  // silently publish the previous draft.
                  run(async () => {
                    const saved = await saveBulletinReview({
                      classGroupId,
                      termId,
                      entries: entries(),
                    });
                    if (!saved.ok) return saved;
                    return publishBulletins({ classGroupId, termId });
                  }, "publishedNotice")
                }
              >
                {t("publish")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
