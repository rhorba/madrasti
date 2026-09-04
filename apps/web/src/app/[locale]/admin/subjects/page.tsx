import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listSubjects } from "@/lib/queries/academic";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SubjectForm } from "./form";

export default async function SubjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.subjects");
  const subjects = await listSubjects();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {/* The coefficient is deliberately absent from this screen: it belongs
          to a subject *within a class*, and lives on the class page. */}
      <p className="rounded-md border border-[var(--border-default)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        {t("coefficientNote")}
      </p>

      {subjects.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("code")}</TH>
              <TH>{t("nameFr")}</TH>
              <TH>{t("nameAr")}</TH>
              <TH>{t("nameEn")}</TH>
              <TH>{t("color")}</TH>
            </TR>
          </THead>
          <TBody>
            {subjects.map((subject) => (
              <TR key={subject.id}>
                <TD className="font-mono text-xs">{subject.code}</TD>
                <TD className="font-medium">{subject.nameFr}</TD>
                <TD dir="rtl">{subject.nameAr}</TD>
                <TD>{subject.nameEn}</TD>
                <TD>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-sm border"
                      style={{ backgroundColor: subject.color }}
                    />
                    {/* Colour is decorative here, so the value is also given
                        as text — never colour alone (DESIGN.md §3). */}
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {subject.color}
                    </span>
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <SubjectForm />
    </div>
  );
}
