import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { personName } from "@/lib/localized";
import { listGuardians } from "@/lib/queries/students";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { GuardianAccountControls, GuardianForm } from "./forms";

export default async function GuardiansPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;

  const t = await getTranslations("admin.guardians");
  const currentLocale = await getLocale();
  const guardians = await listGuardians({ query: q ?? "" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {guardians.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("name")}</TH>
              <TH>{t("relation")}</TH>
              <TH>{t("phone")}</TH>
              <TH numeric>{t("children")}</TH>
              <TH>{t("account")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {guardians.map((guardian) => (
              <TR key={guardian.id}>
                <TD className="font-medium">{personName(guardian, currentLocale)}</TD>
                <TD>{t(`relations.${guardian.relation}`)}</TD>
                {/* Phone numbers read left-to-right even on an Arabic page. */}
                <TD className="tabular" dir="ltr">
                  {guardian.phone}
                </TD>
                <TD numeric>{guardian.childCount}</TD>
                <TD>
                  {guardian.userId ? (
                    <Chip tone={guardian.isActive ? "green" : "red"}>
                      {guardian.isActive ? t("hasAccount") : t("disabled")}
                    </Chip>
                  ) : (
                    // Not every guardian wants a login, and that is a normal
                    // state rather than something to fix (CLAUDE.md §6).
                    <span className="text-[var(--text-muted)]">{t("noAccount")}</span>
                  )}
                </TD>
                <TD className="text-end">
                  <GuardianAccountControls
                    guardianId={guardian.id}
                    userId={guardian.userId}
                    isActive={guardian.isActive ?? false}
                    suggestedEmail={guardian.email}
                    name={personName(guardian, currentLocale)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <GuardianForm />
    </div>
  );
}
