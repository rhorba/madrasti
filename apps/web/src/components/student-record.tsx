import { EmptyState } from "@/components/empty-state";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { localizedLabel, localizedSubject } from "@/lib/localized";
import { getStudentAbsences } from "@/lib/queries/attendance";
import { getStudentTermRecord } from "@/lib/queries/grades";
import { listStudentHomework } from "@/lib/queries/homework";
import { roundNullable } from "@madrasti/grading";
import { getLocale, getTranslations } from "next-intl/server";

/** The three trimestres, as the term switcher needs them. */
export type RecordTerm = {
  id: string;
  labelFr: string;
  labelAr: string;
  labelEn: string;
  startDate: string;
  endDate: string;
};

/**
 * One student's term: marks by subject, the absences behind them, the homework
 * that was set.
 *
 * The same component serves three roles — a teacher before a parent phone
 * call, the parent, and the student. They are shown identical figures on
 * purpose: a parent told a different average from the one the teacher is
 * reading has no way to tell which is wrong, and the school gets the call.
 *
 * It does not authorise anything. Every caller has already put the student id
 * through the scope layer, which is where that check belongs — a component
 * that re-checked would invite a caller that forgot to.
 */
export async function StudentRecord({
  studentId,
  classGroupId,
  term,
  terms,
  termHref,
}: {
  studentId: string;
  classGroupId: string | null;
  term: RecordTerm;
  terms: RecordTerm[];
  /** Where a term chip links. Differs per role, so the caller builds it. */
  termHref: (termId: string) => string;
}) {
  const t = await getTranslations("studentRecord");
  const tg = await getTranslations("grades");
  const ta = await getTranslations("attendance");
  const locale = await getLocale();

  const within = { from: term.startDate, to: term.endDate };

  // Three queries for the whole screen, whatever the student has done this
  // term. A per-subject loop here would be one round trip per subject.
  const [record, absences, homework] = await Promise.all([
    classGroupId
      ? getStudentTermRecord(studentId, classGroupId, term.id)
      : Promise.resolve({ subjects: [], general: null }),
    getStudentAbsences(studentId, 50, within),
    listStudentHomework(studentId, 15, within),
  ]);

  const counts = absences.reduce(
    (acc, absence) => {
      if (absence.status === "absent") acc.absent += 1;
      if (absence.status === "late") acc.late += 1;
      if (absence.status === "excused") acc.excused += 1;
      return acc;
    },
    { absent: 0, late: 0, excused: 0 }
  );

  return (
    <div className="flex flex-col gap-6">
      {terms.length > 1 && (
        <nav aria-label={t("chooseTerm")} className="flex flex-wrap gap-1" data-print="hide">
          {terms.map((option) => (
            <Link
              key={option.id}
              href={termHref(option.id)}
              aria-current={option.id === term.id ? "page" : undefined}
              className={
                option.id === term.id
                  ? "rounded-md bg-[var(--action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--action-primary-text)]"
                  : "rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
              }
            >
              {localizedLabel(option, locale)}
            </Link>
          ))}
        </nav>
      )}

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

        {record.subjects.length === 0 ? (
          <EmptyState>{t("noMarks")}</EmptyState>
        ) : (
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
                  <TD className="font-medium">{localizedSubject(subject, locale)}</TD>
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
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("absences")}</h2>
          {absences.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {/* Colour is never the only carrier: every total is named. */}
              <Chip tone="red">{ta("absentTotal", { count: counts.absent })}</Chip>
              <Chip tone="amber">{ta("lateTotal", { count: counts.late })}</Chip>
              <Chip tone="blue">{ta("excusedTotal", { count: counts.excused })}</Chip>
            </span>
          )}
        </div>

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
                  <TD>{localizedSubject(absence, locale)}</TD>
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
                  {localizedSubject(item, locale)} · {item.dueOn}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
