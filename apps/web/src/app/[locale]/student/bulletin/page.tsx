import { EmptyState } from "@/components/empty-state";
import { FamilyBulletin } from "@/components/family-bulletin";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Link } from "@/i18n/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * A student's own bulletin.
 *
 * There is no student id in this route at all — it comes from the session's own
 * student row. The strongest form of "a student may only see their own
 * bulletin" is a screen with nothing to tamper with.
 */
export default async function StudentBulletinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { term } = await searchParams;

  const session = await requirePageSession({ roles: ["student"] });
  const t = await getTranslations("bulletinDoc");
  const ts = await getTranslations("studentHome");

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("documentTitle")}
          action={
            <Link
              href="/student"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {ts("backHome")}
            </Link>
          }
        />

        {session.studentId ? (
          <FamilyBulletin
            studentId={session.studentId}
            requestedTermId={term}
            termHref={(termId) => `/student/bulletin?term=${termId}`}
          />
        ) : (
          <EmptyState>{ts("notLinked")}</EmptyState>
        )}
      </div>
    </RoleShell>
  );
}
