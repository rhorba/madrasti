import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { personName } from "@/lib/localized";
import { getCurrentYear, listClasses } from "@/lib/queries/academic";
import {
  getStudent,
  getStudentEnrolment,
  listGuardians,
  listStudentGuardians,
} from "@/lib/queries/students";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EnrolmentPanel, GuardianPanel, StudentAccountPanel, StudentDetailsForm } from "./panels";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.students");
  const currentLocale = await getLocale();

  const student = await getStudent(id);
  if (!student) notFound();

  const year = await getCurrentYear();
  const [enrolment, linked, allGuardians, classes] = await Promise.all([
    year ? getStudentEnrolment(id, year.id) : Promise.resolve(null),
    listStudentGuardians(id),
    listGuardians(),
    year ? listClasses(year.id) : Promise.resolve([]),
  ]);

  const linkedIds = new Set(linked.map((guardian) => guardian.id));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={personName(student, currentLocale)}
        description={
          student.massarCode
            ? t("massarIs", { code: student.massarCode })
            : // Never framed as missing data — the school may not use Massar
              // codes at all, and the record is complete without one.
              t("noMassar")
        }
        action={
          student.status === "active" ? (
            <Chip tone="green">{t(`statuses.${student.status}`)}</Chip>
          ) : (
            <Chip tone="neutral">{t(`statuses.${student.status}`)}</Chip>
          )
        }
      />

      <StudentDetailsForm
        student={{
          id: student.id,
          firstNameFr: student.firstNameFr,
          lastNameFr: student.lastNameFr,
          firstNameAr: student.firstNameAr,
          lastNameAr: student.lastNameAr,
          birthDate: student.birthDate,
          gender: student.gender,
          massarCode: student.massarCode,
          status: student.status,
        }}
      />

      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">{t("enrolmentHeading")}</h2>
        {!year ? (
          <EmptyState>{t("needYear")}</EmptyState>
        ) : (
          <EnrolmentPanel
            studentId={id}
            yearId={year.id}
            yearLabel={year.label}
            current={
              enrolment ? { className: enrolment.className, since: enrolment.enrolledOn } : null
            }
            classes={classes.map((klass) => ({ id: klass.id, name: klass.name }))}
          />
        )}
      </section>

      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">{t("guardiansHeading")}</h2>

        {linked.length === 0 ? (
          <EmptyState>{t("noGuardians")}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("guardian")}</TH>
                <TH>{t("relation")}</TH>
                <TH>{t("phone")}</TH>
                <TH>{t("account")}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {linked.map((guardian) => (
                <TR key={guardian.id}>
                  <TD className="font-medium">{personName(guardian, currentLocale)}</TD>
                  <TD>{t(`relations.${guardian.relation}`)}</TD>
                  <TD className="tabular" dir="ltr">
                    {guardian.phone}
                  </TD>
                  <TD>
                    {guardian.userId ? (
                      <Chip tone={guardian.isActive ? "green" : "neutral"}>
                        {guardian.userEmail}
                      </Chip>
                    ) : (
                      <span className="text-[var(--text-muted)]">{t("noAccount")}</span>
                    )}
                  </TD>
                  <TD className="text-end">
                    <GuardianPanel
                      mode="unlink"
                      studentId={id}
                      guardianId={guardian.id}
                      guardianName={personName(guardian, currentLocale)}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <GuardianPanel
          mode="add"
          studentId={id}
          available={allGuardians
            .filter((guardian) => !linkedIds.has(guardian.id))
            .slice(0, 200)
            .map((guardian) => ({
              id: guardian.id,
              name: `${personName(guardian, currentLocale)} · ${guardian.phone}`,
            }))}
        />
      </section>

      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">{t("studentAccountHeading")}</h2>
        <StudentAccountPanel studentId={id} hasAccount={student.userId !== null} />
      </section>
    </div>
  );
}
