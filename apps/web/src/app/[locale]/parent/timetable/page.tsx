import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { TimetableGrid } from "@/components/timetable-grid";
import { Link } from "@/i18n/navigation";
import { requireReachableStudent } from "@/lib/auth/page-scope";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableStudentIds } from "@/lib/auth/scope";
import { personName } from "@/lib/localized";
import { listChildren } from "@/lib/queries/family";
import { listClassTimetable } from "@/lib/queries/timetable";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * A parent's view of a child's class timetable.
 *
 * The child is chosen from a query parameter, so it is checked against the
 * parent's own children before anything is read — a refused id is a 404, not
 * an empty grid that would look like a school with no lessons.
 */
export default async function ParentTimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { student: requestedStudentId } = await searchParams;

  const session = await requirePageSession({ roles: ["parent"] });
  const t = await getTranslations("timetable");
  const tp = await getTranslations("parentHome");
  const currentLocale = await getLocale();

  const childIds = await reachableStudentIds(session);
  const children = await listChildren(childIds);

  if (children.length === 0) {
    return (
      <RoleShell session={session}>
        <div className="flex flex-col gap-4">
          <PageHeader title={t("myTimetable")} />
          <EmptyState>{t("noChildren")}</EmptyState>
        </div>
      </RoleShell>
    );
  }

  // A supplied id is authorised before use; otherwise fall back to the first
  // child rather than trusting the parameter.
  if (requestedStudentId) await requireReachableStudent(session, requestedStudentId);
  const active = children.find((child) => child.id === requestedStudentId) ?? children[0];

  const entries = active?.classGroupId ? await listClassTimetable(active.classGroupId) : [];

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("myTimetable")}
          description={
            active ? `${personName(active, currentLocale)} · ${active.className ?? ""}` : undefined
          }
          action={
            <Link
              href="/parent"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {tp("backToChildren")}
            </Link>
          }
        />

        {children.length > 1 && (
          <nav aria-label={t("chooseChild")} className="flex flex-wrap gap-1" data-print="hide">
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/parent/timetable?student=${child.id}`}
                aria-current={child.id === active?.id ? "page" : undefined}
                className={
                  child.id === active?.id
                    ? "rounded-md bg-[var(--action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--action-primary-text)]"
                    : "rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
                }
              >
                {personName(child, currentLocale)}
              </Link>
            ))}
          </nav>
        )}

        {entries.length === 0 ? (
          <EmptyState>{t("noneYet")}</EmptyState>
        ) : (
          <TimetableGrid entries={entries} variant="class" />
        )}
      </div>
    </RoleShell>
  );
}
