import { localizedName, personName } from "@/lib/localized";
import type { TimetableEntry } from "@/lib/queries/timetable";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * The week, Monday–Saturday.
 *
 * Saturday is a teaching day in Morocco, so the grid is six columns wide, not
 * five. Column order mirrors under RTL for free: the layout is source order
 * plus logical properties, with no `left`/`right` anywhere.
 */
const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;

export type GridVariant = "class" | "teacher";

/**
 * A week timetable.
 *
 * One set of markup, two arrangements. On a phone a six-column week is
 * unreadable at any size a teacher would accept, so it stacks into a
 * day-after-day list; from `md` up it becomes the six-column grid
 * (`docs/ui-madrasti.md` §3).
 *
 * Rendering both layouts as separate subtrees and hiding one would double the
 * DOM and make every lesson appear twice to a screen reader, which reads the
 * hidden copy just as happily.
 */
export async function TimetableGrid({
  entries,
  variant = "class",
  renderSlot,
  emptyDayLabel,
}: {
  entries: TimetableEntry[];
  variant?: GridVariant;
  /** Extra controls per slot — the admin builder passes delete here. */
  renderSlot?: ((entry: TimetableEntry) => ReactNode) | undefined;
  emptyDayLabel?: string | undefined;
}) {
  const t = await getTranslations("timetable");
  const locale = await getLocale();

  const byDay = new Map<number, TimetableEntry[]>(WEEKDAYS.map((day) => [day, []]));
  for (const entry of entries) {
    byDay.get(entry.weekday)?.push(entry);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <div className="flex flex-col gap-5 md:grid md:grid-cols-6 md:gap-3">
      {WEEKDAYS.map((day) => (
        <section key={day} className="flex min-w-0 flex-col gap-2">
          <h3 className="border-b-2 border-[var(--border-strong)] pb-1 text-sm font-medium">
            {t(`weekdays.${day}`)}
          </h3>
          {(byDay.get(day) ?? []).length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{emptyDayLabel ?? t("noLessons")}</p>
          ) : (
            (byDay.get(day) ?? []).map((entry) => (
              <SlotCard key={entry.id} entry={entry} variant={variant} locale={locale}>
                {renderSlot?.(entry)}
              </SlotCard>
            ))
          )}
        </section>
      ))}
    </div>
  );
}

function SlotCard({
  entry,
  variant,
  locale,
  children,
}: {
  entry: TimetableEntry;
  variant: GridVariant;
  locale: string;
  children?: ReactNode;
}) {
  const subject = localizedName(
    { nameFr: entry.subjectNameFr, nameAr: entry.subjectNameAr, nameEn: entry.subjectNameEn },
    locale
  );

  const secondary =
    variant === "class"
      ? personName(
          {
            firstNameFr: entry.teacherFirstNameFr,
            lastNameFr: entry.teacherLastNameFr,
            firstNameAr: entry.teacherFirstNameAr,
            lastNameAr: entry.teacherLastNameAr,
          },
          locale
        )
      : entry.className;

  return (
    <article
      // A start-edge bar, never a filled cell: a coloured fill would fail
      // contrast for the text sitting on it (docs/ui-madrasti.md §3).
      className="flex min-w-0 flex-col gap-1 rounded-md border border-s-4 border-[var(--border-default)] bg-[var(--surface-raised)] p-2"
      style={{ borderInlineStartColor: entry.subjectColor }}
    >
      {/* Times read left-to-right even on an Arabic page — 08:00–09:00 is a
          range, not a sentence. */}
      <p className="tabular whitespace-nowrap text-xs text-[var(--text-muted)]" dir="ltr">
        {entry.startTime.slice(0, 5)}–{entry.endTime.slice(0, 5)}
      </p>
      <p className="text-sm font-medium leading-tight break-words">{subject}</p>
      <p className="text-xs text-[var(--text-secondary)] break-words">{secondary}</p>
      {entry.room && <p className="text-xs text-[var(--text-muted)] break-words">{entry.room}</p>}
      {children}
    </article>
  );
}
