import { PageHeader } from "@/components/page-header";
import { Link } from "@/i18n/navigation";
import {
  getCurrentTerm,
  getCurrentYear,
  listClasses,
  listLevels,
  listSubjects,
  listTeachers,
} from "@/lib/queries/academic";
import { countStudents } from "@/lib/queries/students";
import { AlertTriangle, Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Setup checklist, not a dashboard.
 *
 * At this point in the product the admin's job is to get the school loaded, in
 * a specific order — a class needs a level and a year, a student needs a class.
 * Showing what is still missing, in the order it has to be done, is more use
 * than charts of data that does not exist yet.
 */
export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.home");
  const year = await getCurrentYear();

  const [term, levels, subjects, teachers, students, classes] = await Promise.all([
    getCurrentTerm(),
    listLevels(),
    listSubjects(),
    listTeachers(),
    countStudents(),
    year ? listClasses(year.id) : Promise.resolve([]),
  ]);

  const steps = [
    { key: "year", href: "/admin/year", done: year !== null, count: year?.label },
    { key: "terms", href: "/admin/year", done: term !== null, count: term ? 1 : 0 },
    { key: "levels", href: "/admin/levels", done: levels.length > 0, count: levels.length },
    { key: "subjects", href: "/admin/subjects", done: subjects.length > 0, count: subjects.length },
    { key: "teachers", href: "/admin/teachers", done: teachers.length > 0, count: teachers.length },
    { key: "classes", href: "/admin/classes", done: classes.length > 0, count: classes.length },
    { key: "students", href: "/admin/students", done: students > 0, count: students },
  ] as const;

  const remaining = steps.filter((step) => !step.done).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={remaining === 0 ? t("allDone") : t("remaining", { count: remaining })}
      />

      <ol className="flex flex-col divide-y rounded-lg border">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-sunken)]"
            >
              {/* State is carried by icon and wording, never by colour alone. */}
              {step.done ? (
                <Check aria-hidden className="size-4 shrink-0 text-green-700" />
              ) : (
                <AlertTriangle aria-hidden className="size-4 shrink-0 text-amber-700" />
              )}
              <span className="flex-1 text-sm font-medium">{t(`steps.${step.key}`)}</span>
              <span className="tabular text-sm text-[var(--text-muted)]">
                {step.done ? (step.count ?? "") : t("todo")}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
