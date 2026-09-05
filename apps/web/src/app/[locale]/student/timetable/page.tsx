import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { TimetableGrid } from "@/components/timetable-grid";
import { requirePageSession } from "@/lib/auth/page-session";
import { reachableClasses } from "@/lib/auth/scope";
import { listClassTimetable } from "@/lib/queries/timetable";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function StudentTimetablePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requirePageSession({ roles: ["student"] });
  const t = await getTranslations("timetable");

  // Derived from the student's own enrolment, so there is no class id to
  // tamper with.
  const [ownClass] = await reachableClasses(session);
  const entries = ownClass ? await listClassTimetable(ownClass.id) : [];

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t("myTimetable")} description={ownClass?.name} />
        {entries.length === 0 ? (
          <EmptyState>{t("noneYet")}</EmptyState>
        ) : (
          <TimetableGrid entries={entries} variant="class" />
        )}
      </div>
    </RoleShell>
  );
}
