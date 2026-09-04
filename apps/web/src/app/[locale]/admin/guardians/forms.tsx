"use client";

import { CredentialsNotice } from "@/components/credentials-notice";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  createGuardian,
  createGuardianAccount,
  resetPassword,
  setAccountActive,
} from "../people-actions";

export function GuardianForm() {
  const t = useTranslations("admin.guardians");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(createGuardian, {
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

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Phone is required, email is not: in Morocco the school reaches
            families by phone, and many parents have no monitored inbox. */}
        <Field
          label={t("phone")}
          name="phone"
          type="tel"
          dir="ltr"
          placeholder="+2126..."
          error={errorFor("phone")}
          required
        />
        <Field
          label={t("email")}
          name="email"
          type="email"
          hint={t("emailOptional")}
          error={errorFor("email")}
        />
        <SelectField label={t("relation")} name="relation" error={errorFor("relation")} required>
          <option value="mother">{t("relations.mother")}</option>
          <option value="father">{t("relations.father")}</option>
          <option value="tutor">{t("relations.tutor")}</option>
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

export function GuardianAccountControls({
  guardianId,
  userId,
  isActive,
  suggestedEmail,
  name,
}: {
  guardianId: string;
  userId: string | null;
  isActive: boolean;
  suggestedEmail: string | null;
  name: string;
}) {
  const t = useTranslations("admin.accounts");
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(
    null
  );
  const [opening, setOpening] = useState(false);

  const create = useAction(createGuardianAccount, {
    onSuccess: (data) => {
      setCredentials(data);
      setOpening(false);
    },
  });
  const reset = useAction(resetPassword, {
    onSuccess: (data) => setCredentials({ email: name, tempPassword: data.tempPassword }),
  });
  const toggle = useAction(setAccountActive);

  if (credentials) {
    return (
      <CredentialsNotice
        email={credentials.email}
        password={credentials.tempPassword}
        onDismiss={() => setCredentials(null)}
      />
    );
  }

  if (userId) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
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
        <FormError error={reset.error ?? toggle.error} />
      </div>
    );
  }

  if (!opening) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpening(true)}>
        {t("createAccount")}
      </Button>
    );
  }

  return (
    <form
      action={(formData) => {
        formData.set("guardianId", guardianId);
        create.run(formData);
      }}
      className="flex flex-wrap items-end justify-end gap-2"
      noValidate
    >
      <div className="min-w-56">
        <Field
          label={t("email")}
          name="email"
          type="email"
          defaultValue={suggestedEmail ?? ""}
          error={create.errorFor("email")}
          required
        />
      </div>
      <Button type="submit" size="sm" pending={create.pending}>
        {t("create")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpening(false)}>
        {t("cancel")}
      </Button>
      <FormError error={create.error} />
    </form>
  );
}
