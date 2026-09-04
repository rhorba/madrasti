"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInAction } from "./actions";

const HOME_BY_ROLE: Record<string, string> = {
  admin: "admin",
  teacher: "teacher",
  parent: "parent",
  student: "student",
};

export function LoginForm({ next }: { next?: string | undefined }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorValues, setErrorValues] = useState<Record<string, string>>({});

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signInAction(formData);

      if (!result.ok) {
        setError(result.error);
        // The rate limiter returns its retry window as a field error so the
        // message can be rendered with the real number of minutes.
        const minutes = result.fieldErrors?.["minutes"]?.[0];
        setErrorValues(minutes ? { minutes } : {});
        return;
      }

      const destination = result.data.mustChangePassword
        ? `/${locale}/change-password`
        : (next ?? `/${locale}/${HOME_BY_ROLE[result.data.role] ?? ""}`);

      router.push(destination);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-100 px-3 py-2 text-sm text-red-700"
        >
          {t(error, errorValues)}
        </p>
      )}

      <Field
        label={t("auth.email")}
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
      />

      <Field
        label={t("auth.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <Button type="submit" pending={pending} size="lg" className="mt-2 w-full">
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
