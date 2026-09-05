import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { cn } from "@/lib/cn";
import { localizedName } from "@/lib/localized";
import { listTeacherDay } from "@/lib/queries/attendance";
import { schoolNow } from "@/lib/school-time";
import { currentAndNext, weekdayOf } from "@madrasti/timetable";
import { CalendarDays, Check } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * The teacher's home: **what am I teaching right now**.
 *
 * Not a dashboard. No charts, no totals. A time-ordered list of today's
 * lessons with the current one promoted and carrying the primary action, so
 * login → register is two taps (`docs/ux-madrasti.md` §5).
 */
export default async function TeacherHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("teacherHome");
  const ta = await getTranslations("attendance");
  const tn = await getTranslations("nav");
  const currentLocale = await getLocale();

  const { date, minutes } = schoolNow();
  const weekday = weekdayOf(date);

  const lessons = session.teacherId ? await listTeacherDay(session.teacherId, date, weekday) : [];

  // Sunday, or a teacher with no lessons today.
  if (lessons.length === 0) {
    return (
      <RoleShell session={session}>
        <div className="flex flex-col gap-4">
          <PageHeader title={t("title")} description={date} />
          <EmptyState
            action={
              // Absences too, not just the week: with no lesson today this is
              // otherwise a dead end, and Sunday is when a teacher catches up.
              <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <Link
                  href="/teacher/timetable"
                  className="text-sm text-[var(--action-primary)] underline underline-offset-2"
                >
                  {t("seeWeek")}
                </Link>
                <Link
                  href="/teacher/absences"
                  className="text-sm text-[var(--action-primary)] underline underline-offset-2"
                >
                  {tn("absences")}
                </Link>
                <Link
                  href="/teacher/grades"
                  className="text-sm text-[var(--action-primary)] underline underline-offset-2"
                >
                  {tn("grades")}
                </Link>
                <Link
                  href="/teacher/homework"
                  className="text-sm text-[var(--action-primary)] underline underline-offset-2"
                >
                  {tn("homework")}
                </Link>
              </span>
            }
          >
            {weekday === 7 ? t("sunday") : t("nothingToday")}
          </EmptyState>
        </div>
      </RoleShell>
    );
  }

  const { current, next } = currentAndNext(
    lessons.map((lesson) => ({
      id: lesson.slotId,
      weekday,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    })),
    date,
    minutes
  );

  // The lesson to promote: the one in progress, else the one coming up.
  const promotedId = current?.id ?? next?.id ?? null;
  const remaining = lessons.filter((lesson) => lesson.markCount === 0).length;

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={remaining === 0 ? t("allTaken") : t("remaining", { count: remaining })}
          action={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href="/teacher/timetable"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--action-primary)] underline underline-offset-2"
              >
                <CalendarDays aria-hidden className="size-4" />
                {t("seeWeek")}
              </Link>
              <Link
                href="/teacher/absences"
                className="text-sm text-[var(--action-primary)] underline underline-offset-2"
              >
                {tn("absences")}
              </Link>
              <Link
                href="/teacher/grades"
                className="text-sm text-[var(--action-primary)] underline underline-offset-2"
              >
                {tn("grades")}
              </Link>
              <Link
                href="/teacher/homework"
                className="text-sm text-[var(--action-primary)] underline underline-offset-2"
              >
                {tn("homework")}
              </Link>
            </span>
          }
        />

        <ol className="flex flex-col gap-3">
          {lessons.map((lesson) => {
            const promoted = lesson.slotId === promotedId;
            const taken = lesson.markCount > 0;
            const subject = localizedName(
              {
                nameFr: lesson.subjectNameFr,
                nameAr: lesson.subjectNameAr,
                nameEn: lesson.subjectNameEn,
              },
              currentLocale
            );

            return (
              <li key={lesson.slotId}>
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-[var(--surface-raised)] p-3",
                    // The current lesson is emphasised with a heavier rule, not
                    // a shadow — shadows are for floating layers only.
                    promoted
                      ? "border-2 border-[var(--action-primary)]"
                      : "border-[var(--border-default)]"
                  )}
                >
                  <span
                    aria-hidden
                    className="h-10 w-1 shrink-0 rounded-sm"
                    style={{ backgroundColor: lesson.subjectColor }}
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className="tabular whitespace-nowrap text-xs text-[var(--text-muted)]"
                      dir="ltr"
                    >
                      {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}
                      {lesson.room ? ` · ${lesson.room}` : ""}
                    </p>
                    <p className="truncate text-base font-medium">
                      {lesson.className} · {subject}
                    </p>
                  </div>

                  {taken ? (
                    <span className="inline-flex items-center gap-1 text-sm text-green-700">
                      <Check aria-hidden className="size-4" />
                      {t("taken")}
                    </span>
                  ) : null}

                  {/* The whole point of this screen: one tap into the register. */}
                  <Link
                    href={`/teacher/attendance?slot=${lesson.slotId}&date=${date}`}
                    className={cn(
                      "inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
                      promoted && !taken
                        ? "bg-[var(--action-primary)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]"
                        : "border border-[var(--border-strong)] hover:bg-[var(--bg-sunken)]"
                    )}
                  >
                    {taken ? ta("correct") : ta("take")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </RoleShell>
  );
}
