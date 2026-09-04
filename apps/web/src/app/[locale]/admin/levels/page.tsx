import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listLevels } from "@/lib/queries/academic";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { LevelForm } from "./form";

export default async function LevelsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.levels");
  const currentLocale = await getLocale();
  const levels = await listLevels();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {levels.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH numeric>{t("order")}</TH>
              <TH>{t("nameFr")}</TH>
              <TH>{t("nameAr")}</TH>
              <TH>{t("nameEn")}</TH>
            </TR>
          </THead>
          <TBody>
            {levels.map((level) => (
              <TR key={level.id}>
                <TD numeric>{level.order}</TD>
                <TD className={currentLocale === "fr" ? "font-medium" : undefined}>
                  {level.nameFr}
                </TD>
                <TD dir="rtl" className={currentLocale === "ar" ? "font-medium" : undefined}>
                  {level.nameAr}
                </TD>
                <TD className={currentLocale === "en" ? "font-medium" : undefined}>
                  {level.nameEn}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <LevelForm nextOrder={levels.length + 1} />
    </div>
  );
}
