import { auth } from "@/auth";
import { homePathFor } from "@/lib/auth/session";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

/**
 * The locale root sends people where they belong: their role's home if signed
 * in, the login page otherwise. Nobody ever sees this page.
 */
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  redirect(session?.user ? `/${locale}${homePathFor(session.user.role)}` : `/${locale}/login`);
}
