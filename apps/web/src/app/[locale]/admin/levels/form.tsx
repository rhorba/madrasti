"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { createLevel } from "../actions";

export function LevelForm({ nextOrder }: { nextOrder: number }) {
  const t = useTranslations("admin.levels");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createLevel, {
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
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("nameFr")} name="nameFr" error={errorFor("nameFr")} required />
        <Field label={t("nameAr")} name="nameAr" dir="rtl" error={errorFor("nameAr")} required />
        <Field label={t("nameEn")} name="nameEn" error={errorFor("nameEn")} required />
        <Field
          label={t("order")}
          name="order"
          type="number"
          min={1}
          defaultValue={nextOrder}
          hint={t("orderHint")}
          error={errorFor("order")}
          required
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
