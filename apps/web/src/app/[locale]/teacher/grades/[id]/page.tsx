import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { assertCanGradeAssessment } from "@/lib/auth/scope";
import { localizedName, personName } from "@/lib/localized";
import { getAssessment, getMarkSheet } from "@/lib/queries/grades";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MarkSheet } from "./mark-sheet";

export default async function MarkSheetPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("grades");
  const currentLocale = await getLocale();

  // The id is from the URL, so reach is checked before anything is read — and
  // on the *subject*, not the class: the maths teacher of a class must not be
  // able to open its French marks.
  await assertCanGradeAssessment(session, id);

  const assessment = await getAssessment(id);
  if (!assessment) notFound();

  const roster = await getMarkSheet(assessment.classGroupId, assessment.id);

  const subject = localizedName(
    {
      nameFr: assessment.subjectNameFr,
      nameAr: assessment.subjectNameAr,
      nameEn: assessment.subjectNameEn,
    },
    currentLocale
  );

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={assessment.title}
          description={t("assessmentOn", {
            subject,
            type: t(`types.${assessment.type}`),
            date: assessment.date,
            max: Number(assessment.maxScore),
            coefficient: Number(assessment.coefficient),
          })}
          action={
            <Link
              href={`/teacher/grades?cs=${assessment.classSubjectId}`}
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToSubject")}
            </Link>
          }
        />

        {roster.length === 0 ? (
          <EmptyState>{t("noStudents")}</EmptyState>
        ) : (
          <MarkSheet
            assessmentId={assessment.id}
            maxScore={Number(assessment.maxScore)}
            students={roster.map((row) => ({
              studentId: row.studentId,
              name: personName(row, currentLocale),
              score: row.score,
              isAbsent: row.isAbsent ?? false,
            }))}
          />
        )}
      </div>
    </RoleShell>
  );
}
