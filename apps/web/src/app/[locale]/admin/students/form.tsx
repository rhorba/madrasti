"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { createStudent, enrolStudent } from "../people-actions";

export function StudentForm({
  yearId,
  classes,
}: {
  yearId: string | null;
  classes: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);

  const { run, pending, error, errorFor } = useAction(createStudent, {
    onSuccess: async (data) => {
      // Enrol as a second step rather than folding it into createStudent: a
      // student can exist before their class is decided, and the school often
      // adds them first and sorts classes out later.
      const classGroupId =
        formRef.current?.querySelector<HTMLSelectElement>("[name=classGroupId]")?.value;

      if (classGroupId && yearId) {
        const enrolment = new FormData();
        enrolment.set("studentId", data.id);
        enrolment.set("classGroupId", classGroupId);
        enrolment.set("yearId", yearId);
        enrolment.set("enrolledOn", new Date().toISOString().slice(0, 10));
        await enrolStudent(enrolment);
      }
      formRef.current?.reset();
    },
  });

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set("enrolledAt", new Date().toISOString().slice(0, 10));
        run(formData);
      }}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h2 className="text-sm font-medium">{t("add")}</h2>
      <FormError error={error} />

      {/* Both scripts are required: the bulletin and the official lists are
          issued in Arabic and French, and a proper noun cannot be translated
          at render time (CLAUDE.md §6). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={t("firstNameFr")}
          name="firstNameFr"
          error={errorFor("firstNameFr")}
          required
        />
        <Field label={t("lastNameFr")} name="lastNameFr" error={errorFor("lastNameFr")} required />
        <Field
          label={t("firstNameAr")}
          name="firstNameAr"
          dir="rtl"
          error={errorFor("firstNameAr")}
          required
        />
        <Field
          label={t("lastNameAr")}
          name="lastNameAr"
          dir="rtl"
          error={errorFor("lastNameAr")}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={t("birthDate")}
          name="birthDate"
          type="date"
          error={errorFor("birthDate")}
          required
        />
        <SelectField label={t("gender")} name="gender" error={errorFor("gender")} required>
          <option value="m">{t("male")}</option>
          <option value="f">{t("female")}</option>
        </SelectField>
        <Field
          label={t("massar")}
          name="massarCode"
          hint={t("massarOptional")}
          error={errorFor("massarCode")}
        />
        <SelectField label={t("class")} name="classGroupId" disabled={!yearId}>
          <option value="">{tc("none")}</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div>
        <Button type="submit" pending={pending}>
          {t("add")}
        </Button>
      </div>
    </form>
  );
}
