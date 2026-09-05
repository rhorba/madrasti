import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { assertCanReachClass } from "@/lib/auth/scope";
import { localizedName, personName } from "@/lib/localized";
import { getRegister, getSessionContext } from "@/lib/queries/attendance";
import { SCHOOL_TIMEZONE } from "@madrasti/core";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Register } from "./register";

/** Today in the school's timezone, not the server's. */
function schoolToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIMEZONE }).format(new Date());
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ slot?: string; date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { slot: slotId, date } = await searchParams;

  const session = await requirePageSession({ roles: ["teacher", "admin"] });
  const t = await getTranslations("attendance");
  const currentLocale = await getLocale();

  if (!slotId) notFound();
  const forDate = date ?? schoolToday();

  const context = await getSessionContext(slotId, forDate);
  if (!context) notFound();

  // The slot comes from the URL, so reach is checked before anything is read.
  // A teacher may only open a register for a class they teach.
  await assertCanReachClass(session, context.classGroupId);

  const roster = await getRegister(context.classGroupId, context.sessionId);

  const subject = localizedName(
    {
      nameFr: context.subjectNameFr,
      nameAr: context.subjectNameAr,
      nameEn: context.subjectNameEn,
    },
    currentLocale
  );

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={`${context.className} · ${subject}`}
          description={t("sessionOn", {
            date: forDate,
            from: context.startTime.slice(0, 5),
            to: context.endTime.slice(0, 5),
          })}
          action={
            <Link
              href="/teacher"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToDay")}
            </Link>
          }
        />

        {roster.length === 0 ? (
          <EmptyState>{t("noStudents")}</EmptyState>
        ) : (
          <Register
            slotId={slotId}
            date={forDate}
            alreadyTaken={roster.some((row) => row.status !== null)}
            students={roster.map((row) => ({
              studentId: row.studentId,
              name: personName(row, currentLocale),
              massarCode: row.massarCode,
              status: row.status,
              minutesLate: row.minutesLate,
            }))}
          />
        )}
      </div>
    </RoleShell>
  );
}
