"use client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { updateSchool } from "../actions";

export function SchoolForm({
  school,
}: {
  school: {
    id: string;
    nameFr: string;
    nameAr: string;
    nameEn: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    defaultLocale: string;
    gradingMax: number;
  };
}) {
  const t = useTranslations("admin.settings");
  const [saved, setSaved] = useState(false);
  const { run, pending, error, errorFor } = useAction(updateSchool, {
    onSuccess: () => setSaved(true),
  });

  return (
    <form
      action={(formData) => {
        setSaved(false);
        formData.set("id", school.id);
        run(formData);
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <FormError error={error} />
      {/* <output> carries an implicit role="status", so assistive tech
          announces the save without a redundant role attribute. */}
      {saved && <output className="block text-sm text-green-700">{t("saved")}</output>}

      {/* The school's own name in all three scripts — it heads every printed
          bulletin, so it must be right in the language the bulletin is in. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t("nameFr")}
          name="nameFr"
          defaultValue={school.nameFr}
          error={errorFor("nameFr")}
          required
        />
        <Field
          label={t("nameAr")}
          name="nameAr"
          dir="rtl"
          defaultValue={school.nameAr}
          error={errorFor("nameAr")}
          required
        />
        <Field
          label={t("nameEn")}
          name="nameEn"
          defaultValue={school.nameEn}
          error={errorFor("nameEn")}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t("address")}
          name="address"
          defaultValue={school.address ?? ""}
          error={errorFor("address")}
        />
        <Field
          label={t("phone")}
          name="phone"
          type="tel"
          dir="ltr"
          defaultValue={school.phone ?? ""}
          error={errorFor("phone")}
        />
        <Field
          label={t("email")}
          name="email"
          type="email"
          defaultValue={school.email ?? ""}
          error={errorFor("email")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t("defaultLocale")}
          name="defaultLocale"
          defaultValue={school.defaultLocale}
          hint={t("defaultLocaleHint")}
        >
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </SelectField>
        <Field
          label={t("gradingMax")}
          name="gradingMax"
          type="number"
          min={1}
          max={100}
          defaultValue={school.gradingMax}
          hint={t("gradingMaxHint")}
          error={errorFor("gradingMax")}
        />
      </div>

      <div>
        <Button type="submit" pending={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
