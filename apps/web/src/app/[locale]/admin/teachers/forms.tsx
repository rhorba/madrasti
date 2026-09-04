"use client";

import { CredentialsNotice } from "@/components/credentials-notice";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { createTeacher, resetPassword, setAccountActive } from "../people-actions";

export function TeacherForm() {
  const t = useTranslations("admin.teachers");
  const formRef = useRef<HTMLFormElement>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(
    null
  );

  const { run, pending, error, errorFor } = useAction(createTeacher, {
    onSuccess: (data) => {
      setCredentials({ email: data.email, tempPassword: data.tempPassword });
      formRef.current?.reset();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {credentials && (
        <CredentialsNotice
          email={credentials.email}
          password={credentials.tempPassword}
          onDismiss={() => setCredentials(null)}
        />
      )}

      <form
        ref={formRef}
        action={run}
        className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
        noValidate
      >
        <h2 className="text-sm font-medium">{t("add")}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t("addNote")}</p>
        <FormError error={error} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={t("firstNameFr")}
            name="firstNameFr"
            error={errorFor("firstNameFr")}
            required
          />
          <Field
            label={t("lastNameFr")}
            name="lastNameFr"
            error={errorFor("lastNameFr")}
            required
          />
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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("email")} name="email" type="email" error={errorFor("email")} required />
          <Field label={t("phone")} name="phone" type="tel" error={errorFor("phone")} />
          {/* The teacher's own interface language, not the admin's. Many staff
              here work in Arabic. */}
          <SelectField label={t("locale")} name="locale" defaultValue="fr">
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </SelectField>
        </div>

        <div>
          <Button type="submit" pending={pending}>
            {t("add")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AccountControls({
  userId,
  isActive,
  name,
}: {
  userId: string;
  isActive: boolean;
  name: string;
}) {
  const t = useTranslations("admin.accounts");
  const [credentials, setCredentials] = useState<string | null>(null);

  const reset = useAction(resetPassword, {
    onSuccess: (data) => setCredentials(data.tempPassword),
  });
  const toggle = useAction(setAccountActive);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex justify-end gap-1">
        <form
          action={(formData) => {
            formData.set("userId", userId);
            reset.run(formData);
          }}
        >
          <Button type="submit" variant="ghost" size="sm" pending={reset.pending}>
            {t("resetPassword")}
          </Button>
        </form>

        <form
          action={(formData) => {
            formData.set("userId", userId);
            formData.set("isActive", String(!isActive));
            toggle.run(formData);
          }}
        >
          <Button
            type="submit"
            variant={isActive ? "ghost" : "secondary"}
            size="sm"
            pending={toggle.pending}
            aria-label={isActive ? t("disableFor", { name }) : t("enableFor", { name })}
          >
            {isActive ? t("disable") : t("enable")}
          </Button>
        </form>
      </div>

      {credentials && (
        <CredentialsNotice
          email={name}
          password={credentials}
          onDismiss={() => setCredentials(null)}
        />
      )}

      <FormError error={reset.error ?? toggle.error} />
    </div>
  );
}
