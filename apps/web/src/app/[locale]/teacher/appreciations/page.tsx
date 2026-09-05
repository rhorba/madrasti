import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableClassSubjects } from "@/lib/auth/scope";
import { localizedLabel, localizedName, personName } from "@/lib/localized";
import { getCurrentTerm, getCurrentYear, listTerms } from "@/lib/queries/academic";
import { getAppreciationSheet } from "@/lib/queries/bulletins";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AppreciationSheet } from "./appreciation-sheet";

/**
 * The teacher's appreciation sheet, one class+subject and one term at a time.
 *
 * Reached from the marks screen rather than from the teacher's home, which
 * stays four links wide: this is written once a term, and always from the
 * context of a class and a subject the teacher was already looking at.
 *
 * The term *is* offered here, unlike everywhere else in the product where the
 * current one is simply assumed. Appreciations are written when a term closes,
 * which is often after the next one has begun — assuming "current" would put
 * trimestre 1's remarks on trimestre 2's bulletin.
 */
export default async function AppreciationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cs?: string; term?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { cs, term: termParam } = await searchParams;

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("appreciations");
  const currentLocale = await getLocale();

  const [taught, currentTerm, year] = await Promise.all([
    reachableClassSubjects(session),
    getCurrentTerm(),
    getCurrentYear(),
  ]);
  const allTerms = year ? await listTerms(year.id) : [];

  if (taught.length === 0 || allTerms.length === 0) {
    return (
      <RoleShell session={session}>
        <PageHeader title={t("title")} />
        <EmptyState>{t("noClasses")}</EmptyState>
      </RoleShell>
    );
  }

  // Both ids come from the URL, so each is matched against what this session
  // may reach rather than trusted — an unreachable id falls back.
  const active = taught.find((entry) => entry.id === cs) ?? taught[0];
  const term =
    allTerms.find((entry) => entry.id === termParam) ??
    allTerms.find((entry) => entry.id === currentTerm?.id) ??
    allTerms[0];
  if (!active || !term) return null;

  const roster = await getAppreciationSheet(active.id, term.id);

  const subjectName = localizedName(
    {
      nameFr: active.subjectNameFr,
      nameAr: active.subjectNameAr,
      nameEn: active.subjectNameEn,
    },
    currentLocale
  );

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("title")}
          description={`${active.className} · ${subjectName} · ${localizedLabel(term, currentLocale)}`}
          action={
            <Link
              href={`/teacher/grades?cs=${active.id}`}
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToMarks")}
            </Link>
          }
        />

        <nav aria-label={t("chooseClass")} className="flex flex-wrap gap-1" data-print="hide">
          {taught.map((entry) => {
            const name = localizedName(
              {
                nameFr: entry.subjectNameFr,
                nameAr: entry.subjectNameAr,
                nameEn: entry.subjectNameEn,
              },
              currentLocale
            );
            return (
              <Link
                key={entry.id}
                href={`/teacher/appreciations?cs=${entry.id}&term=${term.id}`}
                aria-current={entry.id === active.id ? "page" : undefined}
                className={
                  entry.id === active.id
                    ? "rounded-md bg-[var(--action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--action-primary-text)]"
                    : "rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
                }
              >
                {entry.className} · {name}
              </Link>
            );
          })}
        </nav>

        <nav aria-label={t("chooseTerm")} className="flex flex-wrap gap-1" data-print="hide">
          {allTerms.map((entry) => (
            <Link
              key={entry.id}
              href={`/teacher/appreciations?cs=${active.id}&term=${entry.id}`}
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

        <p className="text-sm text-[var(--text-secondary)]">{t("intro")}</p>

        {roster.length === 0 ? (
          <EmptyState>{t("noStudents")}</EmptyState>
        ) : (
          <AppreciationSheet
            classSubjectId={active.id}
            termId={term.id}
            students={roster.map((row) => ({
              studentId: row.studentId,
              name: personName(row, currentLocale),
              average: row.average,
              text: row.text,
            }))}
          />
        )}
      </div>
    </RoleShell>
  );
}
