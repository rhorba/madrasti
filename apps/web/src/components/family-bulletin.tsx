import { BulletinDocument } from "@/components/bulletin-document";
import { EmptyState } from "@/components/empty-state";
import { PrintButton } from "@/components/print-button";
import { Link } from "@/i18n/navigation";
import { formatInteger, formatMark, formatRank } from "@/lib/format";
import { localizedLabel } from "@/lib/localized";
import { getCurrentYear, getSchool } from "@/lib/queries/academic";
import {
  type PublishedTerm,
  getStudentBulletin,
  listPublishedTerms,
} from "@/lib/queries/bulletins";
import { getStudentEnrolment } from "@/lib/queries/students";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * A family's own bulletin, for a parent or for the student themselves.
 *
 * The same document the school printed, from the same component — not a
 * family-friendly summary of it. A parent holding the paper copy and looking at
 * the screen must see one document, not two renderings that could drift apart.
 *
 * **Published only, and it is the query that says so.** `getStudentBulletin`
 * filters on `published_at`, and `listPublishedTerms` offers only the terms
 * that have one. A draft is the council's working note — it carries a remark
 * and no figures — and a family must never meet one.
 *
 * This component performs **no authorisation of its own**, deliberately. It is
 * given a `studentId` its caller has already proved the session may reach —
 * from `requireReachableStudent` for a parent, or from the session's own
 * student row for a student, which has nothing to tamper with. A helper that
 * did its own check as well would invite a caller that skipped theirs.
 */
export async function FamilyBulletin({
  studentId,
  requestedTermId,
  termHref,
}: {
  studentId: string;
  requestedTermId: string | undefined;
  /** Where a term chip points — the two portals have different routes. */
  termHref: (termId: string) => string;
}) {
  const t = await getTranslations("bulletinDoc");
  const locale = await getLocale();

  const [publishedTerms, year, school] = await Promise.all([
    listPublishedTerms(studentId),
    getCurrentYear(),
    getSchool(),
  ]);

  if (publishedTerms.length === 0 || !year || !school) {
    return <EmptyState>{t("noneForFamily")}</EmptyState>;
  }

  // A term id from the query string is only honoured if the family actually has
  // that bulletin. Anything else falls back to the most recent one published,
  // which is what they came to read.
  const term =
    publishedTerms.find((row) => row.id === requestedTermId) ??
    publishedTerms[publishedTerms.length - 1];
  if (!term) return <EmptyState>{t("noneForFamily")}</EmptyState>;

  const [bulletin, enrolment] = await Promise.all([
    getStudentBulletin(studentId, term.id),
    getStudentEnrolment(studentId, year.id),
  ]);
  if (!bulletin) return <EmptyState>{t("noneForFamily")}</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print="hide">
        <TermChips
          terms={publishedTerms}
          active={term}
          href={termHref}
          label={t("chooseTerm")}
          locale={locale}
        />
        <PrintButton label={t("print")} />
      </div>

      {/* The three figures a parent opens this page to read, before the
          document itself.

          Not a second bulletin: the same frozen values, surfaced as page
          context the way `PageHeader` does elsewhere. It earns its place on the
          phone. The sheet below keeps its A4 width and scrolls sideways inside
          its own container — right for a document, and wrong as the only way to
          learn an average. A parent standing in a doorway gets the answer
          without scrolling anything; the full sheet is underneath for whoever
          wants it. Screen only: on paper the document speaks for itself. */}
      <dl
        className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"
        data-print="hide"
      >
        <Headline
          label={t("generalAverage")}
          value={
            bulletin.generalAverage === null
              ? "—"
              : t("outOf", {
                  value: formatMark(bulletin.generalAverage, locale),
                  max: formatInteger(Number(school.gradingMax), locale),
                })
          }
          ltr
        />
        <Headline
          label={t("rank")}
          value={
            bulletin.rank === null || bulletin.classSize === null
              ? "—"
              : t("rankValue", {
                  rank: formatRank(bulletin.rank, locale),
                  of: formatInteger(bulletin.classSize, locale),
                })
          }
        />
        <Headline label={t("absences")} value={formatInteger(bulletin.absenceCount, locale)} />
      </dl>

      <div className="bulletin-run">
        <BulletinDocument
          bulletin={bulletin}
          school={school}
          className={enrolment?.className ?? "—"}
          termLabel={localizedLabel(term, locale)}
          yearLabel={year.label}
          locale={locale}
          gradingMax={Number(school.gradingMax)}
        />
      </div>
    </div>
  );
}

/**
 * The terms this family has been given, as chips.
 *
 * Rendered even when there is only one, so that a second trimestre appearing in
 * March is a change to a control the parent already knows rather than a new one
 * they have to find.
 */
function TermChips({
  terms,
  active,
  href,
  label,
  locale,
}: {
  terms: PublishedTerm[];
  active: PublishedTerm;
  href: (termId: string) => string;
  label: string;
  locale: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {terms.map((term) => (
        <Link
          key={term.id}
          href={href(term.id)}
          aria-current={term.id === active.id ? "page" : undefined}
          className={
            term.id === active.id
              ? "rounded-md border border-[var(--action-primary)] px-3 py-1 text-sm font-medium text-[var(--action-primary)]"
              : "rounded-md border border-transparent px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
          }
        >
          {localizedLabel(term, locale)}
        </Link>
      ))}
    </nav>
  );
}

/** One headline figure, big enough to read at arm's length on a phone. */
function Headline({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      {/* `dir="ltr"` for "13,71 / 20": two left-to-right numbers around a
          neutral slash reverse in an RTL paragraph (issues.md, story 8.4). */}
      <dd dir={ltr ? "ltr" : undefined} className="tabular text-lg font-semibold">
        {value}
      </dd>
    </div>
  );
}
