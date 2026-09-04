import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { localizedName, personName } from "@/lib/localized";
import { getClass, listClassSubjects, listSubjects, listTeachers } from "@/lib/queries/academic";
import { listClassRoster } from "@/lib/queries/students";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AddSubjectForm, ClassSubjectRow } from "./subject-forms";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.classes");
  const currentLocale = await getLocale();

  const klass = await getClass(id);
  if (!klass) notFound();

  const [taught, allSubjects, teachers, roster] = await Promise.all([
    listClassSubjects(id),
    listSubjects(),
    listTeachers(),
    listClassRoster(id),
  ]);

  const taughtSubjectIds = new Set(taught.map((row) => row.subjectId));
  const available = allSubjects.filter((subject) => !taughtSubjectIds.has(subject.id));

  const teacherOptions = teachers.map((teacher) => ({
    id: teacher.id,
    name: personName(teacher, currentLocale),
  }));

  // The general average weights each subject by its coefficient, so the total
  // is worth showing: it is the denominator of every bulletin for this class.
  const coefficientTotal = taught.reduce((sum, row) => sum + Number(row.coefficient), 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={klass.name}
        description={localizedName(
          { nameFr: klass.levelNameFr, nameAr: klass.levelNameAr, nameEn: klass.levelNameEn },
          currentLocale
        )}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">{t("subjectsHeading")}</h2>
          {taught.length > 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              {t("coefficientTotal", { total: coefficientTotal })}
            </p>
          )}
        </div>

        <p className="rounded-md border border-[var(--border-default)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {t("coefficientExplainer")}
        </p>

        {taught.length === 0 ? (
          <EmptyState>{t("noSubjects")}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("subject")}</TH>
                <TH>{t("teacher")}</TH>
                <TH numeric>{t("coefficient")}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {taught.map((row) => (
                <ClassSubjectRow
                  key={row.id}
                  id={row.id}
                  classGroupId={id}
                  subjectName={localizedName(
                    {
                      nameFr: row.subjectNameFr,
                      nameAr: row.subjectNameAr,
                      nameEn: row.subjectNameEn,
                    },
                    currentLocale
                  )}
                  subjectColor={row.subjectColor}
                  teacherId={row.teacherId}
                  coefficient={Number(row.coefficient)}
                  teachers={teacherOptions}
                />
              ))}
            </TBody>
          </Table>
        )}

        {available.length > 0 && (
          <AddSubjectForm
            classGroupId={id}
            subjects={available.map((subject) => ({
              id: subject.id,
              name: localizedName(subject, currentLocale),
            }))}
            teachers={teacherOptions}
          />
        )}
      </section>

      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">
          {t("rosterHeading")}
          <span className="ms-2 text-sm font-normal text-[var(--text-muted)]">{roster.length}</span>
        </h2>

        {roster.length === 0 ? (
          <EmptyState>{t("noStudents")}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH numeric>#</TH>
                <TH>{t("student")}</TH>
                <TH>{t("massar")}</TH>
              </TR>
            </THead>
            <TBody>
              {roster.map((student, index) => (
                <TR key={student.id}>
                  <TD numeric className="text-[var(--text-muted)]">
                    {index + 1}
                  </TD>
                  <TD>
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="text-[var(--action-primary)] underline underline-offset-2"
                    >
                      {personName(student, currentLocale)}
                    </Link>
                  </TD>
                  {/* Massar codes are optional — a student can be enrolled
                      without one, so the column shows a dash rather than
                      implying something is missing. */}
                  <TD className="font-mono text-xs text-[var(--text-muted)]">
                    {student.massarCode ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
