"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { ASSESSMENT_TYPES, DEFAULT_GRADING_MAX } from "@madrasti/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createAssessment, deleteAssessment, updateAssessment } from "./actions";

/** Today, so a new assessment defaults to the lesson that just happened. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssessmentForm({
  classSubjectId,
  termId,
}: {
  classSubjectId: string;
  termId: string;
}) {
  const t = useTranslations("grades");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createAssessment, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form
      ref={formRef}
      action={run}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h2 className="text-sm font-medium">{t("addAssessment")}</h2>
      <FormError error={error} />

      {/* The class+subject and the term are fixed by the screen, not chosen:
          a teacher is already looking at 5ème A · Maths · trimestre 1, and
          re-picking them is an invitation to file marks in the wrong place. */}
      <input type="hidden" name="classSubjectId" value={classSubjectId} />
      <input type="hidden" name="termId" value={termId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("assessmentTitle")}
          name="title"
          placeholder={t("titlePlaceholder")}
          error={errorFor("title")}
          required
        />
        <SelectField label={t("type")} name="type" defaultValue="controle" error={errorFor("type")}>
          {ASSESSMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t("date")}
          name="date"
          type="date"
          defaultValue={today()}
          error={errorFor("date")}
        />
        <Field
          label={t("maxScore")}
          name="maxScore"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="1"
          defaultValue={DEFAULT_GRADING_MAX}
          error={errorFor("maxScore")}
        />
        <Field
          label={t("coefficient")}
          name="coefficient"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0.5"
          defaultValue={1}
          hint={t("coefficientHint")}
          error={errorFor("coefficient")}
        />
      </div>

      <div>
        <Button type="submit" pending={pending}>
          {t("addAssessment")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Withdraw an assessment.
 *
 * Confirms first, and the confirmation names the assessment — a teacher with
 * four contrôles listed must be told which one she is about to remove. The
 * marks themselves are never destroyed; see the action.
 */
export function DeleteAssessment({ id, title }: { id: string; title: string }) {
  const t = useTranslations("grades");
  const te = useTranslations();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAssessment({ id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-red-700"
      >
        {t("delete")}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-red-700">{t("deleteConfirm", { title })}</span>
      <Button type="button" onClick={remove} pending={pending} size="sm" variant="danger">
        {t("deleteYes")}
      </Button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-sm underline underline-offset-2"
      >
        {t("cancel")}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {te(error)}
        </span>
      )}
    </span>
  );
}

/**
 * Edit an assessment in place.
 *
 * Only the four fields that are genuinely correctable: a typo in the title, a
 * wrong date, and — the two that matter — the maximum and the coefficient,
 * because both silently move every average behind the assessment. The class,
 * the subject and the term are not editable: moving an assessment between them
 * would carry its marks along and rewrite two bulletins without saying so.
 */
export function EditAssessment({
  assessment,
}: {
  assessment: {
    id: string;
    title: string;
    type: string;
    date: string;
    maxScore: string;
    coefficient: string;
  };
}) {
  const t = useTranslations("grades");
  const [open, setOpen] = useState(false);
  const { run, pending, error, errorFor } = useAction(updateAssessment, {
    onSuccess: () => setOpen(false),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-[var(--action-primary)] underline underline-offset-2"
      >
        {t("editAssessment")}
      </button>
    );
  }

  return (
    <form action={run} className="flex w-full flex-col gap-3 py-2" noValidate>
      <FormError error={error} />
      <input type="hidden" name="id" value={assessment.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("assessmentTitle")}
          name="title"
          defaultValue={assessment.title}
          error={errorFor("title")}
          required
        />
        <SelectField
          label={t("type")}
          name="type"
          defaultValue={assessment.type}
          error={errorFor("type")}
        >
          {ASSESSMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t("date")}
          name="date"
          type="date"
          defaultValue={assessment.date}
          error={errorFor("date")}
        />
        <Field
          label={t("maxScore")}
          name="maxScore"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="1"
          defaultValue={Number(assessment.maxScore)}
          error={errorFor("maxScore")}
        />
        <Field
          label={t("coefficient")}
          name="coefficient"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0.5"
          defaultValue={Number(assessment.coefficient)}
          error={errorFor("coefficient")}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" pending={pending} size="sm">
          {t("saveChanges")}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm underline underline-offset-2"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
