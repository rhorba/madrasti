import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { TimetableGrid } from "@/components/timetable-grid";
import { requirePageSession } from "@/lib/auth/page-session";
import { listTeacherTimetable } from "@/lib/queries/timetable";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function TeacherTimetablePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("timetable");

  // Scoped by the session's own teacher id — never by anything from the URL.
  const entries = session.teacherId ? await listTeacherTimetable(session.teacherId) : [];

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t("myTimetable")} />
        {entries.length === 0 ? (
          <EmptyState>{t("noneYet")}</EmptyState>
        ) : (
          <TimetableGrid entries={entries} variant="teacher" />
        )}
      </div>
    </RoleShell>
  );
}
