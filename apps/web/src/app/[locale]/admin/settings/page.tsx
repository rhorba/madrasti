import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getSchool } from "@/lib/queries/academic";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SchoolForm } from "./form";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.settings");
  const school = await getSchool();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {!school ? (
        <EmptyState>{t("missing")}</EmptyState>
      ) : (
        <SchoolForm
          school={{
            id: school.id,
            nameFr: school.nameFr,
            nameAr: school.nameAr,
            nameEn: school.nameEn,
            address: school.address,
            phone: school.phone,
            email: school.email,
            defaultLocale: school.defaultLocale,
            gradingMax: Number(school.gradingMax),
          }}
        />
      )}
    </div>
  );
}
