import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { localizedLabel } from "@/lib/localized";
import { getCurrentYear, listTerms, listYears } from "@/lib/queries/academic";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { TermForm, YearForm } from "./forms";
import { SetCurrentButton } from "./set-current";

export default async function YearPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const currentLocale = await getLocale();

  const [years, current] = await Promise.all([listYears(), getCurrentYear()]);
  const terms = current ? await listTerms(current.id) : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("year.title")} description={t("year.description")} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("year.yearsHeading")}</h2>

        {years.length === 0 ? (
          <EmptyState>{t("year.noYears")}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("year.label")}</TH>
                <TH>{t("year.startDate")}</TH>
                <TH>{t("year.endDate")}</TH>
                <TH>{tc("status")}</TH>
              </TR>
            </THead>
            <TBody>
              {years.map((year) => (
                <TR key={year.id}>
                  <TD className="font-medium">{year.label}</TD>
                  <TD className="tabular">{year.startDate}</TD>
                  <TD className="tabular">{year.endDate}</TD>
                  <TD>
                    {year.isCurrent ? (
                      <Chip tone="green">{t("year.current")}</Chip>
                    ) : (
                      <SetCurrentButton kind="year" id={year.id} label={t("year.setCurrent")} />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <YearForm />
      </section>

      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">
          {t("year.termsHeading")}
          {current && <span className="ms-2 text-[var(--text-muted)]">{current.label}</span>}
        </h2>

        {!current ? (
          // Terms hang off a year, so there is nothing sensible to show until
          // one exists. Say that, rather than an empty table.
          <EmptyState>{t("year.needYearFirst")}</EmptyState>
        ) : (
          <>
            {terms.length === 0 ? (
              <EmptyState>{t("year.noTerms")}</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH numeric>#</TH>
                    <TH>{t("year.termLabel")}</TH>
                    <TH>{t("year.startDate")}</TH>
                    <TH>{t("year.endDate")}</TH>
                    <TH>{tc("status")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {terms.map((term) => (
                    <TR key={term.id}>
                      <TD numeric>{term.order}</TD>
                      <TD className="font-medium">{localizedLabel(term, currentLocale)}</TD>
                      <TD className="tabular">{term.startDate}</TD>
                      <TD className="tabular">{term.endDate}</TD>
                      <TD>
                        {term.isCurrent ? (
                          <Chip tone="green">{t("year.current")}</Chip>
                        ) : (
                          <SetCurrentButton kind="term" id={term.id} label={t("year.setCurrent")} />
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}

            {terms.length < 3 && <TermForm yearId={current.id} nextOrder={terms.length + 1} />}
          </>
        )}
      </section>
    </div>
  );
}
