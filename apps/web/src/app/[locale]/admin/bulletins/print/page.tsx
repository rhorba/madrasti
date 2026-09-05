import { BulletinDocument } from "@/components/bulletin-document";
import { EmptyState } from "@/components/empty-state";
import { PrintButton } from "@/components/print-button";
import { Link } from "@/i18n/navigation";
import { localizedLabel } from "@/lib/localized";
import {
  getCurrentTerm,
  getCurrentYear,
  getSchool,
  listClasses,
  listTerms,
} from "@/lib/queries/academic";
import { getStoredBulletins } from "@/lib/queries/bulletins";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * A class's bulletins, ready for the printer.
 *
 * **Published only.** `getStoredBulletins` returns the frozen rows and nothing
 * else, so a class the council has not published prints nothing at all rather
 * than a draft that looks exactly like a real bulletin but was never agreed.
 * That is the whole reason this screen is not simply "print the review sheet":
 * the review sheet shows live figures, and live figures must never reach paper.
 *
 * The school prints a whole class in one run — thirty sheets, one pupil each —
 * because that is how bulletins are handed out. Story 8.5 gives a family its
 * own single copy from the same `BulletinDocument`.
 */
export default async function PrintBulletinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; term?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { class: classParam, term: termParam } = await searchParams;

  const t = await getTranslations("bulletinDoc");
  const tb = await getTranslations("bulletins");
  const currentLocale = await getLocale();

  const [year, school] = await Promise.all([getCurrentYear(), getSchool()]);
  if (!year || !school) return <EmptyState>{tb("needYear")}</EmptyState>;

  const [classes, allTerms, currentTerm] = await Promise.all([
    listClasses(year.id),
    listTerms(year.id),
    getCurrentTerm(),
  ]);

  const active = classes.find((entry) => entry.id === classParam) ?? classes[0];
  const term =
    allTerms.find((entry) => entry.id === termParam) ??
    allTerms.find((entry) => entry.id === currentTerm?.id) ??
    allTerms[0];
  if (!active || !term) return <EmptyState>{tb("needClasses")}</EmptyState>;

  const bulletins = await getStoredBulletins(active.id, term.id);
  const termLabel = localizedLabel(term, currentLocale);

  return (
    <div className="flex flex-col gap-4">
      {/* Everything in this bar is chrome for the person at the printer. None
          of it reaches paper. */}
      <div className="flex flex-wrap items-center justify-between gap-3" data-print="hide">
        <div>
          <h1 className="text-xl font-semibold">{t("printTitle")}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {active.name} · {termLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/bulletins?class=${active.id}&term=${term.id}`}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
          >
            {t("backToReview")}
          </Link>
          {bulletins.length > 0 && <PrintButton label={t("print")} />}
        </div>
      </div>

      {bulletins.length === 0 ? (
        <div data-print="hide">
          <EmptyState>{t("notPublished")}</EmptyState>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--text-secondary)]" data-print="hide">
            {t("sheetCount", { count: bulletins.length })}
          </p>
          {/* On screen the sheets are spaced so the run reads as a stack of
              pages; on paper the separator is the page break itself. */}
          <div className="bulletin-run">
            {bulletins.map((bulletin) => (
              <BulletinDocument
                key={bulletin.bulletinId}
                bulletin={bulletin}
                school={school}
                className={active.name}
                termLabel={termLabel}
                yearLabel={year.label}
                locale={currentLocale}
                gradingMax={Number(school.gradingMax)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
