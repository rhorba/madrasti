import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import type { AppSession } from "@/lib/auth/session";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * The shell every signed-in screen sits in.
 *
 * Deliberately plain for now — the navigation proper arrives with the screens
 * that need it (Sprint 3 onward). What matters here is that it is built from
 * logical properties throughout, so it mirrors under RTL for free.
 */
export async function RoleShell({
  session,
  title,
  children,
}: {
  session: AppSession;
  title: string;
  children: ReactNode;
}) {
  const t = await getTranslations();

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-[var(--surface-raised)]" data-print="hide">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold">{t("app.name")}</span>
            <span className="text-sm text-[var(--text-muted)]">{t(`roles.${session.role}`)}</span>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="mt-5">{children}</div>
      </main>
    </div>
  );
}
