"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PASSWORD_MIN_LENGTH } from "@madrasti/core";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm({ role }: { role: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await changePasswordAction(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`/${locale}/${role}`);
      router.refresh();
    });
  }

  const errorFor = (name: string) => {
    const key = fieldErrors[name]?.[0];
    return key ? t(key) : undefined;
  };

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && !fieldErrors[Object.keys(fieldErrors)[0] ?? ""] && (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-100 px-3 py-2 text-sm text-red-700"
        >
          {t(error)}
        </p>
      )}

      <Field
        label={t("auth.currentPassword")}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        error={errorFor("currentPassword")}
        required
        autoFocus
      />
      <Field
        label={t("auth.newPassword")}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint={t("auth.passwordHint", { min: PASSWORD_MIN_LENGTH })}
        error={errorFor("newPassword")}
        required
      />
      <Field
        label={t("auth.confirmPassword")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={errorFor("confirmPassword")}
        required
      />

      <Button type="submit" pending={pending} size="lg" className="mt-2 w-full">
        {t("auth.updatePassword")}
      </Button>
    </form>
  );
}
