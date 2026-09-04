"use client";

import { useTranslations } from "next-intl";

/**
 * A form-level error, translated at render.
 *
 * Actions return a translation key rather than a sentence, so the same action
 * serves all three languages and no Postgres or Zod text can reach a user
 * (`docs/ux-madrasti.md` §8.6).
 */
export function FormError({
  error,
  values,
}: {
  error: string | null;
  values?: Record<string, string | number>;
}) {
  const t = useTranslations();
  if (!error) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-red-700 bg-red-100 px-3 py-2 text-sm text-red-700"
    >
      {t(error, values)}
    </p>
  );
}
