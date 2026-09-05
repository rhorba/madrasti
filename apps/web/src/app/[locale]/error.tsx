"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * The error boundary for everything inside a locale.
 *
 * Two rules from `CLAUDE.md`, both of which the default Next error page broke:
 *
 * 1. **§10.6 — errors in the user's language, in plain words.** The built-in
 *    page is English, unstyled, and carries an opaque digest.
 * 2. **§11 — no student personal data in logs or error reports.** So this
 *    renders the digest to nobody and logs only that an error occurred plus
 *    its digest, which is the handle a maintainer needs to find the real stack
 *    on the server. The message itself is never shown: a Postgres sentence
 *    about a constraint on `students` is exactly what must not reach a parent.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("appError");

  useEffect(() => {
    // The digest only — never `error.message`, which can carry a row's
    // contents, and never the stack.
    console.error("[madrasti] unhandled error", error.digest ?? "(no digest)");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-[var(--text-secondary)]">{t("body")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 h-11 rounded-md bg-[var(--action-primary)] px-4 font-medium text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]"
      >
        {t("retry")}
      </button>
    </main>
  );
}
