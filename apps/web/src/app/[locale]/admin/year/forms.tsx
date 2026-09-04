"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { createTerm, createYear } from "../actions";

export function YearForm() {
  const t = useTranslations("admin.year");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createYear, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form
      ref={formRef}
      action={run}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h3 className="text-sm font-medium">{t("addYear")}</h3>
      <FormError error={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t("label")}
          name="label"
          placeholder="2026-2027"
          hint={t("labelHint")}
          error={errorFor("label")}
          required
        />
        <Field
          label={t("startDate")}
          name="startDate"
          type="date"
          error={errorFor("startDate")}
          required
        />
        <Field
          label={t("endDate")}
          name="endDate"
          type="date"
          error={errorFor("endDate")}
          required
        />
      </div>
      <div>
        <Button type="submit" pending={pending}>
          {t("addYear")}
        </Button>
      </div>
    </form>
  );
}

export function TermForm({ yearId, nextOrder }: { yearId: string; nextOrder: number }) {
  const t = useTranslations("admin.year");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createTerm, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set("yearId", yearId);
        formData.set("order", String(nextOrder));
        run(formData);
      }}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h3 className="text-sm font-medium">{t("addTerm", { order: nextOrder })}</h3>
      <FormError error={error} />
      {/* All three languages are captured here rather than translated later:
          the school names its own terms, and a bulletin prints this text. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("labelFr")} name="labelFr" error={errorFor("labelFr")} required />
        <Field label={t("labelAr")} name="labelAr" dir="rtl" error={errorFor("labelAr")} required />
        <Field label={t("labelEn")} name="labelEn" error={errorFor("labelEn")} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("startDate")}
          name="startDate"
          type="date"
          error={errorFor("startDate")}
          required
        />
        <Field
          label={t("endDate")}
          name="endDate"
          type="date"
          error={errorFor("endDate")}
          required
        />
      </div>
      <div>
        <Button type="submit" pending={pending}>
          {t("addTermAction")}
        </Button>
      </div>
    </form>
  );
}
