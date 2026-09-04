"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { createClass } from "../actions";

type Option = { id: string; name: string };

export function ClassForm({
  yearId,
  levels,
  teachers,
}: {
  yearId: string;
  levels: Option[];
  teachers: Option[];
}) {
  const t = useTranslations("admin.classes");
  const tc = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createClass, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set("yearId", yearId);
        run(formData);
      }}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h2 className="text-sm font-medium">{t("add")}</h2>
      <FormError error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={t("name")}
          name="name"
          placeholder="5ème A"
          error={errorFor("name")}
          required
        />
        <SelectField label={t("level")} name="levelId" error={errorFor("levelId")} required>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("mainTeacher")}
          name="mainTeacherId"
          error={errorFor("mainTeacherId")}
        >
          <option value="">{tc("none")}</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </SelectField>
        <Field
          label={t("capacity")}
          name="capacity"
          type="number"
          min={1}
          max={80}
          defaultValue={35}
          error={errorFor("capacity")}
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
