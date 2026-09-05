import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableClassSubjects } from "@/lib/auth/scope";
import { localizedLabel, localizedName, personName } from "@/lib/localized";
import { getCurrentTerm } from "@/lib/queries/academic";
import { getSubjectAverages, listAssessments } from "@/lib/queries/grades";
import { roundNullable } from "@madrasti/grading";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AssessmentForm, DeleteAssessment, EditAssessment } from "./forms";

/**
 * Marks, one class+subject at a time.
 *
 * Everything about one subject in one class sits on this screen: what has been
 * assessed, what is still unmarked, and where every student stands for the
 * term. A teacher's question is never "show me assessments" — it is "how is my
 * 5ème A doing in maths", and that is one page, not three.
 */
export default async function GradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cs?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { cs } = await searchParams;

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("grades");
  const currentLocale = await getLocale();

  const [taught, term] = await Promise.all([reachableClassSubjects(session), getCurrentTerm()]);

  if (taught.length === 0 || !term) {
    return (
      <RoleShell session={session}>
        <PageHeader title={t("title")} />
        <EmptyState>{t("noClasses")}</EmptyState>
      </RoleShell>
    );
  }

  // The id comes from the URL, so it is matched against what this session may
  // reach rather than trusted — an unreachable id simply falls back.
  const active = taught.find((entry) => entry.id === cs) ?? taught[0];
  if (!active) return null;

  const [assessments, averages] = await Promise.all([
    listAssessments(active.id, term.id),
    getSubjectAverages(active.classGroupId, active.id, term.id),
  ]);

  const subjectName = localizedName(
    {
      nameFr: active.subjectNameFr,
      nameAr: active.subjectNameAr,
      nameEn: active.subjectNameEn,
    },
    currentLocale
  );
  const termLabel = localizedLabel(term, currentLocale);

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("title")}
          description={`${active.className} · ${subjectName} · ${termLabel}`}
          action={
            <Link
              href="/teacher"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToDay")}
            </Link>
          }
        />

        {/* One tap per class+subject. A teacher has four or five; a dropdown
            would hide them behind an extra interaction for no gain. */}
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
                href={`/teacher/grades?cs=${entry.id}`}
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

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("assessments")}</h2>

          {assessments.length === 0 ? (
            <EmptyState>{t("noAssessments")}</EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("assessmentTitle")}</TH>
                  <TH>{t("type")}</TH>
                  <TH>{t("date")}</TH>
                  <TH numeric>{t("maxScore")}</TH>
                  <TH numeric>{t("coefficient")}</TH>
                  <TH>{t("entered")}</TH>
                  <TH>{t("actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {assessments.map((assessment) => {
                  const complete =
                    assessment.studentCount > 0 && assessment.markCount >= assessment.studentCount;
                  return (
                    <TR key={assessment.id}>
                      <TD className="font-medium">{assessment.title}</TD>
                      <TD>{t(`types.${assessment.type}`)}</TD>
                      <TD className="tabular whitespace-nowrap">{assessment.date}</TD>
                      <TD numeric className="tabular">
                        {Number(assessment.maxScore)}
                      </TD>
                      <TD numeric className="tabular">
                        {Number(assessment.coefficient)}
                      </TD>
                      <TD>
                        {/* Count and colour, never colour alone. */}
                        <Chip tone={complete ? "green" : "amber"}>
                          {assessment.markCount}/{assessment.studentCount}
                        </Chip>
                      </TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Link
                            href={`/teacher/grades/${assessment.id}`}
                            className="text-sm text-[var(--action-primary)] underline underline-offset-2"
                          >
                            {assessment.markCount === 0 ? t("enterMarks") : t("editMarks")}
                          </Link>
                          <EditAssessment assessment={assessment} />
                          <DeleteAssessment id={assessment.id} title={assessment.title} />
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </section>

        <AssessmentForm classSubjectId={active.id} termId={term.id} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            {t("termAverages", { term: termLabel })}
          </h2>

          {averages.length === 0 ? (
            <EmptyState>{t("noStudents")}</EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("student")}</TH>
                  <TH numeric>{t("average")}</TH>
                  <TH numeric>{t("counted")}</TH>
                  <TH numeric>{t("absences")}</TH>
                </TR>
              </THead>
              <TBody>
                {averages.map((row) => (
                  <TR key={row.studentId}>
                    <TD className="font-medium">
                      <Link
                        href={`/teacher/students/${row.studentId}`}
                        className="text-[var(--action-primary)] underline underline-offset-2"
                      >
                        {personName(row, currentLocale)}
                      </Link>
                    </TD>
                    <TD numeric className="tabular">
                      {/* An em dash, never 0: a student with no counted mark
                          has no average, and printing zero accuses them. */}
                      {row.average === null ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        roundNullable(row.average)
                      )}
                    </TD>
                    <TD numeric className="tabular text-[var(--text-muted)]">
                      {row.counted}
                    </TD>
                    <TD numeric className="tabular">
                      {row.absent > 0 ? <Chip tone="amber">{row.absent}</Chip> : "0"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>
      </div>
    </RoleShell>
  );
}
