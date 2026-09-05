import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Link } from "@/i18n/navigation";
import { localizedLabel, personName } from "@/lib/localized";
import { getCurrentTerm, getCurrentYear, listClasses, listTerms } from "@/lib/queries/academic";
import {
  computeClassBulletins,
  getBulletinDrafts,
  getPublicationState,
  getStoredBulletins,
} from "@/lib/queries/bulletins";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { type ReviewRow, ReviewSheet } from "./review-sheet";

/**
 * The conseil de classe: review a class's term, then publish it.
 *
 * One class and one term at a time, because that is the unit the school works
 * in and the unit publication freezes. Before publication the figures shown are
 * **live** — a mark entered this morning is in them. After publication they are
 * the **frozen** ones, read back from `bulletins` and `bulletin_lines`, because
 * that is what the family is holding.
 *
 * Those two are read by different functions on purpose. A single "get the
 * bulletins" call that silently recomputed would make the published document
 * drift, which is the defect this whole story exists to prevent.
 */
/** The class as it stands right now, with the council's draft alongside. */
async function computeLiveRows(
  classGroupId: string,
  termId: string,
  locale: string
): Promise<ReviewRow[]> {
  const [computed, drafts] = await Promise.all([
    computeClassBulletins(classGroupId, termId),
    getBulletinDrafts(classGroupId, termId),
  ]);

  return computed.students.map((row) => {
    const draft = drafts.get(row.studentId);
    return {
      studentId: row.studentId,
      name: personName(row, locale),
      average: row.generalAverage,
      rank: row.rank,
      classSize: row.classSize,
      absenceCount: row.absenceCount,
      appreciation: draft?.appreciation ?? "",
      decision: draft?.decision ?? null,
    };
  });
}

export default async function BulletinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; term?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { class: classParam, term: termParam } = await searchParams;

  const t = await getTranslations("bulletins");
  const currentLocale = await getLocale();
  const format = await getFormatter();

  const year = await getCurrentYear();
  if (!year) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <EmptyState>{t("needYear")}</EmptyState>
      </div>
    );
  }

  const [classes, allTerms, currentTerm] = await Promise.all([
    listClasses(year.id),
    listTerms(year.id),
    getCurrentTerm(),
  ]);

  if (classes.length === 0 || allTerms.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <EmptyState>{t("needClasses")}</EmptyState>
      </div>
    );
  }

  const active = classes.find((entry) => entry.id === classParam) ?? classes[0];
  const term =
    allTerms.find((entry) => entry.id === termParam) ??
    allTerms.find((entry) => entry.id === currentTerm?.id) ??
    allTerms[0];
  if (!active || !term) return null;

  const publication = await getPublicationState(active.id, term.id);

  // Published: read the frozen rows. Not published: compute live and pick up
  // whatever the council has drafted. Never both, and never one standing in
  // for the other.
  const students: ReviewRow[] = publication
    ? (await getStoredBulletins(active.id, term.id)).map((row) => ({
        studentId: row.studentId,
        name: personName(row, currentLocale),
        average: row.generalAverage,
        rank: row.rank,
        classSize: row.classSize ?? 0,
        absenceCount: row.absenceCount,
        appreciation: row.appreciation ?? "",
        decision: row.decision,
      }))
    : await computeLiveRows(active.id, term.id, currentLocale);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={`${active.name} · ${localizedLabel(term, currentLocale)}`}
      />

      <nav aria-label={t("chooseClass")} className="flex flex-wrap gap-1" data-print="hide">
        {classes.map((entry) => (
          <Link
            key={entry.id}
            href={`/admin/bulletins?class=${entry.id}&term=${term.id}`}
            aria-current={entry.id === active.id ? "page" : undefined}
            className={
              entry.id === active.id
                ? "rounded-md bg-[var(--action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--action-primary-text)]"
                : "rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
            }
          >
            {entry.name}
          </Link>
        ))}
      </nav>

      <nav aria-label={t("chooseTerm")} className="flex flex-wrap gap-1" data-print="hide">
        {allTerms.map((entry) => (
          <Link
            key={entry.id}
            href={`/admin/bulletins?class=${active.id}&term=${entry.id}`}
            aria-current={entry.id === term.id ? "page" : undefined}
            className={
              entry.id === term.id
                ? "rounded-md border border-[var(--action-primary)] px-3 py-1 text-sm font-medium text-[var(--action-primary)]"
                : "rounded-md border border-transparent px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
            }
          >
            {localizedLabel(entry, currentLocale)}
          </Link>
        ))}
      </nav>

      {students.length === 0 ? (
        <EmptyState>{t("noStudents")}</EmptyState>
      ) : (
        <ReviewSheet
          classGroupId={active.id}
          termId={term.id}
          students={students}
          publishedAt={
            publication ? format.dateTime(publication.publishedAt, { dateStyle: "long" }) : null
          }
        />
      )}
    </div>
  );
}
