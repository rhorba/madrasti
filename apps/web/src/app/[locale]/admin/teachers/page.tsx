import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/ui/chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { personName } from "@/lib/localized";
import { listTeachersWithAccounts } from "@/lib/queries/students";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AccountControls, TeacherForm } from "./forms";

export default async function TeachersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.teachers");
  const currentLocale = await getLocale();
  const teachers = await listTeachersWithAccounts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {teachers.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("name")}</TH>
              <TH>{t("email")}</TH>
              <TH>{t("phone")}</TH>
              <TH numeric>{t("classes")}</TH>
              <TH>{t("account")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {teachers.map((teacher) => (
              <TR key={teacher.id}>
                <TD className="font-medium">{personName(teacher, currentLocale)}</TD>
                <TD className="font-mono text-xs" dir="ltr">
                  {teacher.email}
                </TD>
                <TD className="tabular" dir="ltr">
                  {teacher.phone ?? "—"}
                </TD>
                <TD numeric>{teacher.classCount}</TD>
                <TD>
                  {/* Three states worth distinguishing: disabled, never signed
                      in, and in use. Colour is paired with a word in each. */}
                  {!teacher.accountActive ? (
                    <Chip tone="red">{t("disabled")}</Chip>
                  ) : teacher.mustChangePassword ? (
                    <Chip tone="amber">{t("pendingFirstLogin")}</Chip>
                  ) : (
                    <Chip tone="green">{t("active")}</Chip>
                  )}
                </TD>
                <TD className="text-end">
                  <AccountControls
                    userId={teacher.userId}
                    isActive={teacher.accountActive}
                    name={personName(teacher, currentLocale)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <TeacherForm />
    </div>
  );
}
