import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { assertCanReachClass, reachableClasses } from "@/lib/auth/scope";
import { personName } from "@/lib/localized";
import { getCurrentTerm } from "@/lib/queries/academic";
import { getClassAbsenceTotals } from "@/lib/queries/attendance";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Absence totals for a class over the current term.
 *
 * The numbers that feed a bulletin, and the ones a parent phones about.
 */
export default async function AbsencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { class: requestedClassId } = await searchParams;

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("absences");
  const currentLocale = await getLocale();

  const [classes, term] = await Promise.all([reachableClasses(session), getCurrentTerm()]);

  if (classes.length === 0 || !term) {
    return (
      <RoleShell session={session}>
        <PageHeader title={t("title")} />
        <EmptyState>{t("nothing")}</EmptyState>
      </RoleShell>
    );
  }

  // A class id from the URL is authorised before use.
  if (requestedClassId) await assertCanReachClass(session, requestedClassId);
  const active = classes.find((klass) => klass.id === requestedClassId) ?? classes[0];
  if (!active) return null;

  const totals = await getClassAbsenceTotals(active.id, term.id);

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} description={t("forTerm", { class: active.name })} />

        <nav aria-label={t("chooseClass")} className="flex flex-wrap gap-1" data-print="hide">
          {classes.map((klass) => (
            <Link
              key={klass.id}
              href={`/teacher/absences?class=${klass.id}`}
              aria-current={klass.id === active.id ? "page" : undefined}
              className={
                klass.id === active.id
                  ? "rounded-md bg-[var(--action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--action-primary-text)]"
                  : "rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
              }
            >
              {klass.name}
            </Link>
          ))}
        </nav>

        {totals.length === 0 ? (
          <EmptyState>{t("noStudents")}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("student")}</TH>
                <TH numeric>{t("absent")}</TH>
                <TH numeric>{t("late")}</TH>
                <TH numeric>{t("excused")}</TH>
                <TH numeric>{t("marked")}</TH>
              </TR>
            </THead>
            <TBody>
              {totals.map((row) => (
                <TR key={row.studentId}>
                  <TD className="font-medium">{personName(row, currentLocale)}</TD>
                  <TD numeric>
                    {/* Only the counts that need attention are emphasised;
                        a zero is not news. */}
                    {row.absent > 0 ? <Chip tone="red">{row.absent}</Chip> : "0"}
                  </TD>
                  <TD numeric>{row.late > 0 ? <Chip tone="amber">{row.late}</Chip> : "0"}</TD>
                  <TD numeric>{row.excused > 0 ? <Chip tone="blue">{row.excused}</Chip> : "0"}</TD>
                  <TD numeric className="text-[var(--text-muted)]">
                    {row.totalMarked}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </RoleShell>
  );
}
