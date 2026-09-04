import { requirePageSession } from "@/lib/auth/page-session";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChangePasswordForm } from "./form";

export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession({ allowPasswordChange: true });
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{t("auth.changePasswordTitle")}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t("auth.changePasswordSubtitle")}</p>
      </header>
      <ChangePasswordForm role={session.role} />
    </main>
  );
}
