import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { personName } from "@/lib/localized";
import { getCurrentYear, listClasses } from "@/lib/queries/academic";
import { countStudents, listStudents } from "@/lib/queries/students";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { StudentForm } from "./form";
import { StudentSearch } from "./search";

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q, page } = await searchParams;

  const t = await getTranslations("admin.students");
  const currentLocale = await getLocale();

  const year = await getCurrentYear();
  const [{ students, hasMore, page: currentPage }, total, classes] = await Promise.all([
    listStudents({ query: q ?? "", page: Number(page ?? 1) }),
    countStudents(),
    year ? listClasses(year.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description", { total })}
        action={
          <Link href="/admin/students/import">
            <Button variant="secondary">{t("import")}</Button>
          </Link>
        }
      />

      <StudentSearch defaultValue={q ?? ""} />

      {students.length === 0 ? (
        <EmptyState>{q ? t("noMatches", { query: q }) : t("empty")}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("name")}</TH>
              <TH>{t("massar")}</TH>
              <TH>{t("class")}</TH>
              <TH>{t("birthDate")}</TH>
              <TH>{t("status")}</TH>
            </TR>
          </THead>
          <TBody>
            {students.map((student) => (
              <TR key={student.id}>
                <TD>
                  <Link
                    href={`/admin/students/${student.id}`}
                    className="font-medium text-[var(--action-primary)] underline underline-offset-2"
                  >
                    {personName(student, currentLocale)}
                  </Link>
                </TD>
                {/* Optional by design — no code is not a problem to flag. */}
                <TD className="font-mono text-xs text-[var(--text-muted)]">
                  {student.massarCode ?? "—"}
                </TD>
                <TD>{student.className ?? <span className="text-[var(--text-muted)]">—</span>}</TD>
                <TD className="tabular">{student.birthDate}</TD>
                <TD>
                  {student.status === "active" ? (
                    <Chip tone="green">{t(`statuses.${student.status}`)}</Chip>
                  ) : (
                    <Chip tone="neutral">{t(`statuses.${student.status}`)}</Chip>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {(hasMore || currentPage > 1) && (
        <nav className="flex items-center justify-between" aria-label={t("pagination")}>
          {currentPage > 1 ? (
            <Link
              href={`/admin/students?page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link
              href={`/admin/students?page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="text-sm text-[var(--action-primary)] underline underline-offset-2"
            >
              {t("next")}
            </Link>
          )}
        </nav>
      )}

      <StudentForm
        yearId={year?.id ?? null}
        classes={classes.map((klass) => ({ id: klass.id, name: klass.name }))}
      />
    </div>
  );
}
