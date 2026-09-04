import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { localizedName } from "@/lib/localized";
import { getCurrentYear, listClasses, listLevels, listTeachers } from "@/lib/queries/academic";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { ClassForm } from "./form";

export default async function ClassesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.classes");
  const currentLocale = await getLocale();

  const year = await getCurrentYear();
  if (!year) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <EmptyState>{t("needYear")}</EmptyState>
      </div>
    );
  }

  const [classes, levels, teachers] = await Promise.all([
    listClasses(year.id),
    listLevels(),
    listTeachers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description", { year: year.label })} />

      {classes.length === 0 ? (
        <EmptyState>{levels.length === 0 ? t("needLevels") : t("empty")}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("name")}</TH>
              <TH>{t("level")}</TH>
              <TH numeric>{t("students")}</TH>
              <TH numeric>{t("capacity")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {classes.map((klass) => (
              <TR key={klass.id}>
                <TD className="font-medium">{klass.name}</TD>
                <TD>
                  {localizedName(
                    {
                      nameFr: klass.levelNameFr,
                      nameAr: klass.levelNameAr,
                      nameEn: klass.levelNameEn,
                    },
                    currentLocale
                  )}
                </TD>
                <TD numeric>
                  {/* Over capacity is a fact the office needs to see, not an
                      error to block on — classes do overflow in September. */}
                  {klass.studentCount > klass.capacity ? (
                    <Chip tone="amber">{klass.studentCount}</Chip>
                  ) : (
                    klass.studentCount
                  )}
                </TD>
                <TD numeric className="text-[var(--text-muted)]">
                  {klass.capacity}
                </TD>
                <TD className="text-end">
                  <Link
                    href={`/admin/classes/${klass.id}`}
                    className="text-sm text-[var(--action-primary)] underline underline-offset-2"
                  >
                    {t("manage")}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {levels.length > 0 && (
        <ClassForm
          yearId={year.id}
          levels={levels.map((l) => ({
            id: l.id,
            name: localizedName(l, currentLocale),
          }))}
          teachers={teachers.map((teacher) => ({
            id: teacher.id,
            name:
              currentLocale === "ar"
                ? `${teacher.firstNameAr} ${teacher.lastNameAr}`
                : `${teacher.firstNameFr} ${teacher.lastNameFr}`,
          }))}
        />
      )}
    </div>
  );
}
