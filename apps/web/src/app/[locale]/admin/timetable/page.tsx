import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TimetableGrid } from "@/components/timetable-grid";
import { Link } from "@/i18n/navigation";
import { localizedName, personName } from "@/lib/localized";
import { getCurrentYear, listClassSubjects, listClasses } from "@/lib/queries/academic";
import { listClassTimetable } from "@/lib/queries/timetable";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { AddSlotForm, CopyDayForm, SlotControls } from "./forms";

/**
 * The timetable builder.
 *
 * One class at a time, because that is how a school builds a timetable — the
 * secretary sits with one class's paper grid in front of her and enters it.
 */
export default async function TimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { class: selectedClassId } = await searchParams;

  const t = await getTranslations("timetable");
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

  const classes = await listClasses(year.id);
  if (classes.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <EmptyState>{t("needClasses")}</EmptyState>
      </div>
    );
  }

  const active = classes.find((klass) => klass.id === selectedClassId) ?? classes[0];
  if (!active) return null;

  const [entries, taught] = await Promise.all([
    listClassTimetable(active.id),
    listClassSubjects(active.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description", { year: year.label })}
        action={
          <Link
            href={`/admin/classes/${active.id}`}
            className="text-sm text-[var(--action-primary)] underline underline-offset-2"
          >
            {t("manageSubjects")}
          </Link>
        }
      />

      {/* Class switcher as links, not a dropdown: the URL stays shareable and
          the whole set is visible at a glance for a school this size. */}
      <nav aria-label={t("chooseClass")} className="flex flex-wrap gap-1" data-print="hide">
        {classes.map((klass) => (
          <Link
            key={klass.id}
            href={`/admin/timetable?class=${klass.id}`}
            aria-current={klass.id === active.id ? "page" : undefined}
            className={
              klass.id === active.id
                ? "rounded-md bg-[var(--action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--action-primary-text)]"
                : "rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
            }
          >
            {klass.name}
          </Link>
        ))}
      </nav>

      {taught.length === 0 ? (
        <EmptyState>{t("needSubjects", { class: active.name })}</EmptyState>
      ) : (
        <>
          <TimetableGrid
            entries={entries}
            variant="class"
            renderSlot={(entry) => <SlotControls slotId={entry.id} />}
          />

          <div className="flex flex-col gap-4 border-t pt-6">
            <AddSlotForm
              subjects={taught.map((row) => ({
                id: row.id,
                label: `${localizedName(
                  {
                    nameFr: row.subjectNameFr,
                    nameAr: row.subjectNameAr,
                    nameEn: row.subjectNameEn,
                  },
                  currentLocale
                )} · ${personName(
                  {
                    firstNameFr: row.teacherFirstNameFr,
                    lastNameFr: row.teacherLastNameFr,
                    firstNameAr: row.teacherFirstNameAr,
                    lastNameAr: row.teacherLastNameAr,
                  },
                  currentLocale
                )}`,
              }))}
            />

            {entries.length > 0 && <CopyDayForm classGroupId={active.id} />}
          </div>
        </>
      )}
    </div>
  );
}
