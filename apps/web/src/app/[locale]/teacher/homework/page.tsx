import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableClassSubjects } from "@/lib/auth/scope";
import { localizedName } from "@/lib/localized";
import { listAssignments } from "@/lib/queries/homework";
import { isStorageConfigured } from "@/lib/storage";
import { SCHOOL_TIMEZONE } from "@madrasti/core";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AssignmentForm, AttachmentLink, DeleteAssignment } from "./forms";

/** Today in the school's timezone, not the server's. */
function schoolToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIMEZONE }).format(new Date());
}

/**
 * Homework, one class+subject at a time.
 *
 * No submission pipeline: the work comes back on paper (`CLAUDE.md` §3.C).
 * This screen exists so a parent can find out what was set, and so a teacher
 * can check what she set last week.
 */
export default async function HomeworkPage({
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
  const t = await getTranslations("homework");
  const currentLocale = await getLocale();

  const taught = await reachableClassSubjects(session);
  if (taught.length === 0) {
    return (
      <RoleShell session={session}>
        <PageHeader title={t("title")} />
        <EmptyState>{t("noClasses")}</EmptyState>
      </RoleShell>
    );
  }

  const active = taught.find((entry) => entry.id === cs) ?? taught[0];
  if (!active) return null;

  const assignments = await listAssignments(active.id);
  const today = schoolToday();

  const subjectName = localizedName(
    {
      nameFr: active.subjectNameFr,
      nameAr: active.subjectNameAr,
      nameEn: active.subjectNameEn,
    },
    currentLocale
  );

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("title")}
          description={`${active.className} · ${subjectName}`}
          action={
            <Link
              href="/teacher"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToDay")}
            </Link>
          }
        />

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
                href={`/teacher/homework?cs=${entry.id}`}
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

        <AssignmentForm classSubjectId={active.id} uploadsEnabled={isStorageConfigured()} />

        {assignments.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.map((assignment) => {
              const overdue = assignment.dueOn < today;
              return (
                <li
                  key={assignment.id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-medium">{assignment.title}</h3>
                    {/* Date and word, never colour alone. */}
                    <Chip tone={overdue ? "neutral" : "green"}>
                      {overdue
                        ? t("wasDue", { date: assignment.dueOn })
                        : t("due", { date: assignment.dueOn })}
                    </Chip>
                  </div>

                  {assignment.description && (
                    <p className="whitespace-pre-line text-sm text-[var(--text-secondary)]">
                      {assignment.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="tabular text-xs text-[var(--text-muted)]">
                      {t("assignedOn", { date: assignment.assignedOn })}
                    </span>
                    {assignment.attachmentKey && <AttachmentLink id={assignment.id} />}
                    <DeleteAssignment id={assignment.id} title={assignment.title} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </RoleShell>
  );
}
