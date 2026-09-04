"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Search by name in either script, or by Massar code.
 *
 * Debounced and pushed into the URL so a result list can be shared, bookmarked
 * and reloaded — the secretary looks up the same family repeatedly.
 */
export function StudentSearch({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("admin.students");
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (value === defaultValue) return;
    const timer = setTimeout(() => {
      const query = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";
      router.replace(`${pathname}${query}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [value, defaultValue, pathname, router]);

  return (
    <div className="relative max-w-sm" data-print="hide">
      <Search
        aria-hidden
        className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]"
        style={{ insetInlineStart: "0.75rem" }}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        className="h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] ps-9 pe-3 text-base"
      />
    </div>
  );
}
