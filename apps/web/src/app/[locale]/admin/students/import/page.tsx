import { PageHeader } from "@/components/page-header";
import { getCurrentYear, listClasses } from "@/lib/queries/academic";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ImportWizard } from "./wizard";

const SAMPLE = [
  "Nom,Prénom,Nom ar,Prénom ar,Date de naissance,Sexe,Massar",
  "Kabbaj,Amine,قباج,أمين,31/12/2015,M,R130012345",
  "Rami,Salma,رامي,سلمى,15/01/2016,F,",
].join("\n");

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.import");
  const year = await getCurrentYear();
  const classes = year ? await listClasses(year.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-sunken)] p-4">
        <h2 className="text-sm font-medium">{t("formatHeading")}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("formatBody")}</p>
        <pre className="mt-3 overflow-x-auto rounded-md border bg-[var(--surface-raised)] p-3 text-xs">
          {SAMPLE}
        </pre>
        {/* The point the client asked for: Massar is supported but never
            required — the last row above has no code and imports fine. */}
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("massarOptionalNote")}</p>
      </section>

      <ImportWizard
        yearId={year?.id ?? null}
        classes={classes.map((klass) => ({ id: klass.id, name: klass.name }))}
      />
    </div>
  );
}
