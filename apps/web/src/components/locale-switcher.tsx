"use client";

import { LOCALES, type Locale } from "@madrasti/core";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Each language is shown in its own script, never translated into the current
 * one. Someone looking for Arabic is looking for "العربية", not for "Arabe".
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: string) {
    // Swap the leading locale segment and keep the rest of the path, so the
    // user stays on the page they were reading.
    const segments = pathname.split("/");
    segments[1] = next;
    startTransition(() => {
      router.replace(segments.join("/") || `/${next}`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1" data-print="hide">
      <Languages aria-hidden className="size-4 text-[var(--text-muted)]" />
      <span className="sr-only">{t("switch")}</span>
      {LOCALES.map((locale: Locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          disabled={pending}
          onClick={() => switchTo(locale)}
          aria-current={locale === current ? "true" : undefined}
          className={
            locale === current
              ? "rounded-sm px-2 py-1 text-sm font-semibold text-[var(--action-primary)]"
              : "rounded-sm px-2 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}
