import { LocaleSwitcher } from "@/components/locale-switcher";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">{t("app.name")}</h1>
          <LocaleSwitcher />
        </div>
        <p className="text-sm text-[var(--text-muted)]">{t("app.tagline")}</p>
      </header>

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-medium">{t("auth.signInTitle")}</h2>
        <p className="text-sm text-[var(--text-secondary)]">{t("auth.signInSubtitle")}</p>
      </div>

      {/* Only `next` values that stay on this site are honoured — an absolute
          URL here would turn the login page into an open redirect. */}
      <LoginForm next={next?.startsWith("/") && !next.startsWith("//") ? next : undefined} />

      <section className="border-t pt-5">
        <h3 className="text-sm font-medium">{t("auth.noAccountTitle")}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("auth.noAccountBody")}</p>
      </section>
    </main>
  );
}
