import { PageHeader } from "@/components/page-header";
import { RoleShell } from "@/components/role-shell";
import { StudentRecord } from "@/components/student-record";
import { Link } from "@/i18n/navigation";
import { requireReachableStudent } from "@/lib/auth/page-scope";
import { requirePageSession } from "@/lib/auth/page-session";
import { localizedLabel, personName } from "@/lib/localized";
import { getCurrentTerm, getCurrentYear, listTerms } from "@/lib/queries/academic";
import { getStudent, getStudentEnrolment } from "@/lib/queries/students";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * One child, for their parent.
 *
 * The id comes from the URL, so it is the single most attackable value in the
 * portal: a parent who edits it is asking for another family's child.
 * `requireReachableStudent` intersects it with `student_guardians` before a
 * single row is read, and answers 404 rather than 403 so the response says
 * nothing about whether that id exists (`docs/security-madrasti.md` §5).
 */
export default async function ParentChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { term: requestedTermId } = await searchParams;

  const session = await requirePageSession({ roles: ["parent"] });
  const t = await getTranslations("parentHome");
  const currentLocale = await getLocale();

  // Authorised before anything is read.
  await requireReachableStudent(session, id);

  const [student, year, currentTerm] = await Promise.all([
    getStudent(id),
    getCurrentYear(),
    getCurrentTerm(),
  ]);
  if (!student || !year) notFound();

  const terms = await listTerms(year.id);
  // A term id from the query string is only ever used if it is one of this
  // year's, so a nonsense value falls back to the current trimestre rather
  // than rendering an empty record.
  const term = terms.find((row) => row.id === requestedTermId) ?? currentTerm ?? terms[0];
  if (!term) notFound();

  const enrolment = await getStudentEnrolment(id, year.id);

  return (
    <RoleShell session={session}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={personName(student, currentLocale)}
          description={`${enrolment?.className ?? "—"} · ${localizedLabel(term, currentLocale)}`}
          action={
            <Link
              href="/parent"
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("backToChildren")}
            </Link>
          }
        />

        <StudentRecord
          studentId={id}
          classGroupId={enrolment?.classGroupId ?? null}
          term={term}
          terms={terms}
          termHref={(termId) => `/parent/children/${id}?term=${termId}`}
        />
      </div>
    </RoleShell>
  );
}
