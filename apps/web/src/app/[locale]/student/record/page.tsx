import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { StudentRecord } from "@/components/student-record";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableClasses } from "@/lib/auth/scope";
import { localizedLabel } from "@/lib/localized";
import { getCurrentTerm, getCurrentYear, listTerms } from "@/lib/queries/academic";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * A student's own record.
 *
 * There is no student id in this route at all — it comes from the session's
 * own student row. The strongest form of "a student may only see their own
 * records" is a screen with nothing to tamper with.
 */
export default async function StudentRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { term: requestedTermId } = await searchParams;

  const session = await requirePageSession({ roles: ["student"] });
  const t = await getTranslations("studentHome");
  const currentLocale = await getLocale();

  const studentId = session.studentId;
  if (!studentId) {
    return (
      <RoleShell session={session}>
        <div className="flex flex-col gap-4">
          <PageHeader title={t("myRecord")} />
          <EmptyState>{t("notLinked")}</EmptyState>
        </div>
      </RoleShell>
    );
  }

  const [year, currentTerm, ownClasses] = await Promise.all([
    getCurrentYear(),
    getCurrentTerm(),
    reachableClasses(session),
  ]);
  if (!year) notFound();

  const terms = await listTerms(year.id);
  const term = terms.find((row) => row.id === requestedTermId) ?? currentTerm ?? terms[0];
  if (!term) notFound();

  const ownClass = ownClasses[0];

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("myRecord")}
          description={`${ownClass?.name ?? "—"} · ${localizedLabel(term, currentLocale)}`}
          action={
            <Link
              href="/student"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backHome")}
            </Link>
          }
        />

        <StudentRecord
          studentId={studentId}
          classGroupId={ownClass?.id ?? null}
          term={term}
          terms={terms}
          termHref={(termId) => `/student/record?term=${termId}`}
        />
      </div>
    </RoleShell>
  );
}
