"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { createSubject } from "../actions";

export function SubjectForm() {
  const t = useTranslations("admin.subjects");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createSubject, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form
      ref={formRef}
      action={run}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h2 className="text-sm font-medium">{t("add")}</h2>
      <FormError error={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("nameFr")} name="nameFr" error={errorFor("nameFr")} required />
        <Field label={t("nameAr")} name="nameAr" dir="rtl" error={errorFor("nameAr")} required />
        <Field label={t("nameEn")} name="nameEn" error={errorFor("nameEn")} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("code")}
          name="code"
          placeholder="MAT"
          hint={t("codeHint")}
          error={errorFor("code")}
          required
        />
        <Field
          label={t("color")}
          name="color"
          type="color"
          defaultValue="#2F6B43"
          error={errorFor("color")}
        />
      </div>
      <div>
        <Button type="submit" pending={pending}>
          {t("add")}
        </Button>
      </div>
    </form>
  );
}
