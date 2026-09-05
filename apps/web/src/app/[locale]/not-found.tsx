import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

/**
 * The page a refused or mistyped URL lands on.
 *
 * Before this existed, every `notFound()` in the product fell through to
 * Next's built-in 404: an unstyled English page with no `lang` on `<html>`
 * and no `<title>`. axe found it on `/ar/teacher/attendance` — a teacher who
 * opens the register with no session in the URL — but the path that matters
 * most is `requireReachableStudent`, which answers 404 **by design** when a
 * parent reaches for another family's child. The most security-sensitive
 * response in the product was the least designed page in it.
 *
 * It is deliberately vague about *why*. "This page does not exist, or you do
 * not have access to it" is one sentence covering both, because telling the
 * holder of an id which of the two it is defeats the point of answering 404
 * rather than 403 (`docs/security-madrasti.md` §5).
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-[var(--text-secondary)]">{t("body")}</p>
      {/* Home rather than "go back": the previous page is often the one that
          refused them, and a parent should not be invited to retry it. */}
      <Link href="/" className="mt-2 text-[var(--action-primary)] underline underline-offset-2">
        {t("home")}
      </Link>
    </main>
  );
}
