import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableStudentIds } from "@/lib/auth/scope";
import { localizedSubject, personName } from "@/lib/localized";
import {
  type DayMark,
  type LatestMark,
  groupByStudent,
  listChildren,
  listDayMarks,
  listLatestMarks,
} from "@/lib/queries/family";
import { type AssignmentRow, listUpcomingHomework } from "@/lib/queries/homework";
import { schoolToday } from "@/lib/school-time";
import { CalendarDays } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * The parent's home: **one card per child**, and nothing else.
 *
 * A parent opens this to answer three questions, in this order — was my child
 * in school today, what do they have to hand in, and how did the last piece of
 * work go. The card answers all three without a tap; everything beyond that is
 * behind the child's name (`docs/ux-madrasti.md` §6).
 *
 * The whole screen is five queries whatever the size of the family: the
 * children, today's register, the latest mark, the homework, and the session
 * itself. Nothing here loops over children and queries inside the loop.
 */
export default async function ParentHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The middleware already redirected the wrong role away from here. This is
  // the check that actually enforces it — middleware is a convenience, not the
  // security boundary (`docs/architecture-madrasti.md` §5).
  const session = await requirePageSession({ roles: ["parent"] });

  const t = await getTranslations("parentHome");
  const currentLocale = await getLocale();

  // The children come from `student_guardians`, never from the URL or the
  // token, so there is nothing on this screen a parent could redirect.
  const childIds = await reachableStudentIds(session);
  const children = await listChildren(childIds);

  if (children.length === 0) {
    return (
      <RoleShell session={session}>
        <div className="flex flex-col gap-4">
          <PageHeader title={t("title")} />
          <EmptyState>{t("noChildren")}</EmptyState>
        </div>
      </RoleShell>
    );
  }

  const today = schoolToday();
  const classIds = children
    .map((child) => child.classGroupId)
    .filter((id): id is string => id !== null);

  const [dayMarks, latestMarks, upcoming] = await Promise.all([
    listDayMarks(childIds, today),
    listLatestMarks(childIds),
    listUpcomingHomework(classIds, today),
  ]);

  const marksByChild = groupByStudent(dayMarks);
  const latestByChild = new Map(latestMarks.map((mark) => [mark.studentId, mark]));

  // Homework is per class, not per child, so it is keyed that way and two
  // siblings in the same class share the row rather than fetching it twice.
  const homeworkByClass = new Map<string, AssignmentRow[]>();
  for (const item of upcoming) {
    const list = homeworkByClass.get(item.classGroupId);
    if (list) list.push(item);
    else homeworkByClass.set(item.classGroupId, [item]);
  }

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={today}
          action={
            <Link
              href="/parent/timetable"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              <CalendarDays aria-hidden className="size-4" />
              {t("timetable")}
            </Link>
          }
        />

        <ul className="flex flex-col gap-3">
          {children.map((child) => {
            const marks = marksByChild.get(child.id) ?? [];
            const nextHomework = child.classGroupId
              ? homeworkByClass.get(child.classGroupId)?.[0]
              : undefined;

            return (
              <li key={child.id}>
                <article className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="text-base font-medium">
                      {/* The child's name is the way in, so it is the link. */}
                      <Link
                        href={`/parent/children/${child.id}`}
                        className="underline decoration-transparent underline-offset-4 hover:decoration-inherit"
                      >
                        {personName(child, currentLocale)}
                      </Link>
                    </h2>
                    <p className="text-sm text-[var(--text-muted)]">{child.className ?? "—"}</p>
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-[var(--text-muted)]">{t("todayLabel")}</dt>
                      <dd>
                        <TodayCell marks={marks} locale={currentLocale} />
                      </dd>
                    </div>

                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-[var(--text-muted)]">{t("nextHomework")}</dt>
                      <dd className="text-sm">
                        {nextHomework ? (
                          <>
                            <span className="font-medium">{nextHomework.title}</span>
                            <span className="block tabular text-xs text-[var(--text-muted)]">
                              {localizedSubject(nextHomework, currentLocale)} · {nextHomework.dueOn}
                            </span>
                          </>
                        ) : (
                          <span className="text-[var(--text-muted)]">{t("noHomework")}</span>
                        )}
                      </dd>
                    </div>

                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-[var(--text-muted)]">{t("lastMark")}</dt>
                      <dd className="text-sm">
                        <LastMarkCell
                          mark={latestByChild.get(child.id)}
                          locale={currentLocale}
                          absentLabel={t("markAbsent")}
                          emptyLabel={t("noMark")}
                        />
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={`/parent/children/${child.id}`}
                    className="self-start text-sm text-[var(--action-primary)] underline underline-offset-2"
                  >
                    {t("seeRecord")}
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </RoleShell>
  );
}

/**
 * Today's register, in one line.
 *
 * Three states, and the third is the one that matters: no register taken is
 * **not** the same as present, and saying "present" for a lesson nobody marked
 * would be the portal telling a parent something the school never recorded.
 */
async function TodayCell({ marks, locale }: { marks: DayMark[]; locale: string }) {
  const t = await getTranslations("parentHome");
  const ta = await getTranslations("attendance");

  if (marks.length === 0) {
    return <span className="text-sm text-[var(--text-muted)]">{t("noRegisterYet")}</span>;
  }

  const exceptions = marks.filter((mark) => mark.status !== "present");
  if (exceptions.length === 0) {
    return <Chip tone="green">{t("presentToday", { count: marks.length })}</Chip>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {exceptions.map((mark) => (
        <Chip
          key={`${mark.startTime}-${mark.subjectNameFr}`}
          tone={mark.status === "absent" ? "red" : mark.status === "late" ? "amber" : "blue"}
        >
          {ta(`statuses.${mark.status}`)} · {localizedSubject(mark, locale)}
        </Chip>
      ))}
    </span>
  );
}

/** The last mark, or why there isn't a number to show. */
function LastMarkCell({
  mark,
  locale,
  absentLabel,
  emptyLabel,
}: {
  mark: LatestMark | undefined;
  locale: string;
  absentLabel: string;
  emptyLabel: string;
}) {
  if (!mark) return <span className="text-[var(--text-muted)]">{emptyLabel}</span>;

  return (
    <>
      {/* An absence is never rendered as a zero — it is not a mark the child
          earned, and a parent reading "0" would draw the wrong conclusion. */}
      {/* `dir="ltr"` on the fraction, not the row. "6 / 10" is two
          left-to-right numbers around a neutral slash: in an Arabic paragraph
          the slash takes the paragraph's direction and a parent reads
          "10 / 6" — their child's mark, inverted. The same defect was fixed on
          the printed bulletin (`.logs/issues.md`, story 8.4) and this is the
          other place it occurs. */}
      <span className="tabular font-medium">
        {mark.isAbsent || mark.score === null ? (
          absentLabel
        ) : (
          // Only the fraction is forced left-to-right; the absent label above
          // is Arabic prose and must keep the paragraph's direction.
          <span dir="ltr">
            {/* `Number` strips the numeric column's trailing zeros: a mark is
                shown as 14 or 14,5 — never as 14.00. */}
            {Number(mark.score)} / {Number(mark.maxScore)}
          </span>
        )}
      </span>
      <span className="block text-xs text-[var(--text-muted)]">
        {localizedSubject(mark, locale)} · {mark.title}
      </span>
    </>
  );
}
