import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableClasses } from "@/lib/auth/scope";
import { localizedSubject } from "@/lib/localized";
import { listDayMarks, listLatestMarks } from "@/lib/queries/family";
import { listUpcomingHomework } from "@/lib/queries/homework";
import { schoolToday } from "@/lib/school-time";
import { CalendarDays } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * The student's home: **what is due, and how am I doing**.
 *
 * Deliberately the same three facts as a parent's card, in the same order, so
 * a family looking at two phones is looking at one answer. What differs is the
 * emphasis: homework comes first here and is a list rather than a single line,
 * because a pupil opens this to find out what to do tonight.
 */
export default async function StudentHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The middleware already redirected the wrong role away from here. This is
  // the check that actually enforces it — middleware is a convenience, not the
  // security boundary (`docs/architecture-madrasti.md` §5).
  const session = await requirePageSession({ roles: ["student"] });

  const t = await getTranslations("studentHome");
  const tp = await getTranslations("parentHome");
  const ta = await getTranslations("attendance");
  const currentLocale = await getLocale();

  // From the session's own student row — there is no id on this screen, so
  // there is nothing to tamper with.
  const studentId = session.studentId;
  if (!studentId) {
    return (
      <RoleShell session={session}>
        <div className="flex flex-col gap-4">
          <PageHeader title={t("title")} />
          <EmptyState>{t("notLinked")}</EmptyState>
        </div>
      </RoleShell>
    );
  }

  const today = schoolToday();
  const [ownClass] = await reachableClasses(session);

  const [dayMarks, upcoming, latestMarks] = await Promise.all([
    listDayMarks([studentId], today),
    listUpcomingHomework(ownClass ? [ownClass.id] : [], today),
    listLatestMarks([studentId]),
  ]);

  const exceptions = dayMarks.filter((mark) => mark.status !== "present");
  const lastMark = latestMarks[0];

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("title")}
          description={`${ownClass?.name ?? ""} · ${today}`.trim()}
          action={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href="/student/timetable"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--action-primary)] underline underline-offset-2"
              >
                <CalendarDays aria-hidden className="size-4" />
                {t("timetable")}
              </Link>
              <Link
                href="/student/record"
                className="text-sm text-[var(--action-primary)] underline underline-offset-2"
              >
                {t("myRecord")}
              </Link>
            </span>
          }
        />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("todayLabel")}</h2>
          {dayMarks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{tp("noRegisterYet")}</p>
          ) : exceptions.length === 0 ? (
            <p>
              <Chip tone="green">{tp("presentToday", { count: dayMarks.length })}</Chip>
            </p>
          ) : (
            <p className="flex flex-wrap gap-1">
              {exceptions.map((mark) => (
                <Chip
                  key={`${mark.startTime}-${mark.subjectNameFr}`}
                  tone={
                    mark.status === "absent" ? "red" : mark.status === "late" ? "amber" : "blue"
                  }
                >
                  {ta(`statuses.${mark.status}`)} · {localizedSubject(mark, currentLocale)}
                </Chip>
              ))}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("homework")}</h2>
          {upcoming.length === 0 ? (
            <EmptyState>{t("noHomework")}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.slice(0, 8).map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="tabular text-xs text-[var(--text-muted)]">
                      {localizedSubject(item, currentLocale)} · {item.dueOn}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-[var(--text-secondary)]">{item.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">{t("lastMark")}</h2>
          {!lastMark ? (
            <p className="text-sm text-[var(--text-muted)]">{tp("noMark")}</p>
          ) : (
            <p className="text-sm">
              {/* An absence is never shown as a zero. */}
              <span className="tabular font-medium">
                {lastMark.isAbsent || lastMark.score === null
                  ? tp("markAbsent")
                  : `${Number(lastMark.score)} / ${Number(lastMark.maxScore)}`}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                {localizedSubject(lastMark, currentLocale)} · {lastMark.title}
              </span>
            </p>
          )}
        </section>
      </div>
    </RoleShell>
  );
}
