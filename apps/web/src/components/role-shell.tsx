import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import type { AppSession } from "@/lib/auth/session";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * The chrome every signed-in screen sits in: identity, language, sign out.
 *
 * Built from logical properties throughout, so it mirrors under RTL for free.
 * Pages supply their own `PageHeader` — the shell does not own the title,
 * because a title often needs an action beside it.
 */
export async function RoleShell({
  session,
  nav,
  title,
  children,
}: {
  session: AppSession;
  nav?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const t = await getTranslations();

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-[var(--surface-raised)]" data-print="hide">
        {/* Wraps rather than overflowing: the language switcher and sign-out
            together are wider than a 360px phone, and a teacher on a phone is
            the primary user of every screen inside this shell. */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold">{t("app.name")}</span>
            <span className="text-sm text-[var(--text-muted)]">{t(`roles.${session.role}`)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <LocaleSwitcher />
            <SignOutButton />
          </div>
        </div>
      </header>

      {nav}

      <main className="mx-auto w-full max-w-6xl px-5 py-6">
        {title && <h1 className="mb-5 text-2xl font-semibold">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
