"use client";

import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * A freshly issued credential, shown **once**.
 *
 * It is never emailed, never re-displayed and never written to a log
 * (`docs/system-design-madrasti.md` §4) — the school reads it off the screen
 * and hands it over in person or by SMS. So the panel says plainly that it
 * will not appear again, and it does not vanish on its own: an admin who looks
 * away mid-copy should not lose it to a timeout.
 */
export function CredentialsNotice({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  const t = useTranslations("admin.accounts");

  // <output> announces itself to assistive tech without a role attribute.
  return (
    <output className="flex flex-col gap-3 rounded-lg border border-amber-500 bg-amber-100 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-700">
        <KeyRound aria-hidden className="size-4" />
        {t("credentialsHeading")}
      </p>

      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-amber-700">{t("email")}</dt>
          {/* `select-all` so a tap selects the whole value — these get copied
              onto a slip of paper under time pressure. */}
          <dd className="select-all font-mono text-sm" dir="ltr">
            {email}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-amber-700">{t("temporaryPassword")}</dt>
          <dd className="select-all font-mono text-base font-semibold" dir="ltr">
            {password}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-amber-700">t("credentialsWarning")</p>

      <div>
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          {t("credentialsCopied")}
        </Button>
      </div>
    </output>
  );
}
