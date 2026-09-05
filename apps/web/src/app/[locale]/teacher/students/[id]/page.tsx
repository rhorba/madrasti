import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { assertCanReachStudent } from "@/lib/auth/scope";
import { localizedLabel, localizedSubject, personName } from "@/lib/localized";
import { getCurrentTerm, getCurrentYear } from "@/lib/queries/academic";
import { getStudentAbsences } from "@/lib/queries/attendance";
import { getStudentTermRecord } from "@/lib/queries/grades";
import { listStudentHomework } from "@/lib/queries/homework";
import { getStudent, getStudentEnrolment } from "@/lib/queries/students";
import { roundNullable } from "@madrasti/grading";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * One student, everything a teacher needs before a parent phone call.
 *
 * Marks by subject with the term average, the absences behind them, and what
 * homework is outstanding — the three things she is asked about, on one screen
 * rather than three.
 */
export default async function StudentRecordPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("studentRecord");
  const tg = await getTranslations("grades");
  const ta = await getTranslations("attendance");
  const currentLocale = await getLocale();

  // From the URL, so authorised before anything is read: a teacher reaches a
  // student only through a class they actually teach.
  await assertCanReachStudent(session, id);

  const [student, year, term] = await Promise.all([
    getStudent(id),
    getCurrentYear(),
    getCurrentTerm(),
  ]);
  if (!student || !year || !term) notFound();

  const enrolment = await getStudentEnrolment(id, year.id);
  if (!enrolment) notFound();

  const [record, absences, homework] = await Promise.all([
    getStudentTermRecord(id, enrolment.classGroupId, term.id),
    getStudentAbsences(id, 20),
    listStudentHomework(id, 10),
  ]);

  const termLabel = localizedLabel(term, currentLocale);

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={personName(student, currentLocale)}
          description={`${enrolment.className} · ${termLabel}${
            student.massarCode ? ` · ${student.massarCode}` : ""
          }`}
          action={
            <Link
              href="/teacher/grades"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToGrades")}
            </Link>
          }
        />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("marks")}</h2>
            <p className="text-sm">
              {t("general")}{" "}
              <span className="tabular text-base font-medium">
                {record.general === null ? "—" : roundNullable(record.general)}
              </span>
            </p>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>{t("subject")}</TH>
                <TH numeric>{tg("coefficient")}</TH>
                <TH numeric>{t("average")}</TH>
                <TH numeric>{tg("counted")}</TH>
              </TR>
            </THead>
            <TBody>
              {record.subjects.map((subject) => (
                <TR key={subject.classSubjectId}>
                  <TD className="font-medium">{localizedSubject(subject, currentLocale)}</TD>
                  <TD numeric className="tabular text-[var(--text-muted)]">
                    {subject.coefficient}
                  </TD>
                  <TD numeric className="tabular">
                    {/* No mark is an em dash, never a zero. */}
                    {subject.average === null ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      roundNullable(subject.average)
                    )}
                  </TD>
                  <TD numeric className="tabular text-[var(--text-muted)]">
                    {subject.counted}
                    {subject.absent > 0 ? ` (+${subject.absent})` : ""}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("absences")}</h2>
          {absences.length === 0 ? (
            <EmptyState>{t("noAbsences")}</EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("date")}</TH>
                  <TH>{t("subject")}</TH>
                  <TH>{t("status")}</TH>
                </TR>
              </THead>
              <TBody>
                {absences.map((absence) => (
                  <TR key={absence.id}>
                    <TD className="tabular whitespace-nowrap">{absence.date}</TD>
                    <TD>{localizedSubject(absence, currentLocale)}</TD>
                    <TD>
                      <Chip
                        tone={
                          absence.status === "absent"
                            ? "red"
                            : absence.status === "late"
                              ? "amber"
                              : "blue"
                        }
                      >
                        {ta(`statuses.${absence.status}`)}
                        {absence.minutesLate ? ` · ${absence.minutesLate}′` : ""}
                      </Chip>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("homework")}</h2>
          {homework.length === 0 ? (
            <EmptyState>{t("noHomework")}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {homework.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-[var(--border-default)] px-3 py-2"
                >
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="tabular text-xs text-[var(--text-muted)]">
                    {localizedSubject(item, currentLocale)} · {item.dueOn}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </RoleShell>
  );
}
