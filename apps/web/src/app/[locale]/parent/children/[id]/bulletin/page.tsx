import { FamilyBulletin } from "@/components/family-bulletin";
import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { Link } from "@/i18n/navigation";
import { requireReachableStudent } from "@/lib/auth/page-scope";
import { requirePageSession } from "@/lib/auth/page-session";
import { personName } from "@/lib/localized";
import { getStudent } from "@/lib/queries/students";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * One child's bulletin, for their parent.
 *
 * The id is in the URL, so it is the most attackable value on the page — and
 * this is the most sensitive document the product holds about a named minor.
 * `requireReachableStudent` intersects it with `student_guardians` before a
 * single row is read, and answers **404 rather than 403**, so a parent probing
 * another family's id learns nothing about whether it exists
 * (`docs/security-madrasti.md` §5).
 */
export default async function ParentChildBulletinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { term } = await searchParams;

  const session = await requirePageSession({ roles: ["parent"] });
  const t = await getTranslations("bulletinDoc");
  const tp = await getTranslations("parentHome");
  const currentLocale = await getLocale();

  // Authorised before anything is read.
  await requireReachableStudent(session, id);

  const student = await getStudent(id);
  if (!student) notFound();

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("documentTitle")}
          description={personName(student, currentLocale)}
          action={
            <Link
              href={`/parent/children/${id}`}
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {tp("backToChild")}
            </Link>
          }
        />

        <FamilyBulletin
          studentId={id}
          requestedTermId={term}
          termHref={(termId) => `/parent/children/${id}/bulletin?term=${termId}`}
        />
      </div>
    </RoleShell>
  );
}
