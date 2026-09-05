import {
  formatCoefficient,
  formatDocumentDate,
  formatInteger,
  formatMark,
  formatRank,
} from "@/lib/format";
import { localized, localizedName, personName, scriptLang } from "@/lib/localized";
import type { StoredBulletin } from "@/lib/queries/bulletins";
import { bulletinTotals } from "@madrasti/grading";
import { getTranslations } from "next-intl/server";

/**
 * The bulletin, as a document.
 *
 * This is the artefact the whole product exists to produce: one sheet of A4 the
 * school signs and a family keeps, in Arabic, French or English. Four things
 * about it are deliberate.
 *
 * 1. **It reads only frozen rows.** The input is a `StoredBulletin` — what was
 *    published — never a live computation. A document that recomputed itself on
 *    each print would disagree with the copy already in a parent's hands
 *    (`CLAUDE.md` §6).
 * 2. **The screen rendering is the paper rendering.** Same markup, same rules,
 *    same order; print only removes the surrounding application and lets the
 *    `@page` margin take over from the on-screen one. Nobody should have to
 *    print in order to find out what will print.
 * 3. **It has its own table rather than the register's `Table`.** That
 *    primitive is hairline rules and no vertical borders, which is right for a
 *    list you scroll and wrong for a ruled document that gets photocopied and
 *    filed. Different artefact, different rules.
 * 4. **Everything mirrors.** Logical properties throughout, and the table's
 *    column order flips with `dir` for free. Checked in `ar` by E2E — but the
 *    story's real exit criterion is a sheet of paper read by an Arabic reader.
 */

export type BulletinSchool = {
  nameFr: string;
  nameAr: string;
  nameEn: string;
  address: string | null;
  phone: string | null;
};

export type BulletinDocumentProps = {
  bulletin: StoredBulletin;
  school: BulletinSchool;
  className: string;
  termLabel: string;
  yearLabel: string;
  locale: string;
  gradingMax: number;
};

export async function BulletinDocument({
  bulletin,
  school,
  className,
  termLabel,
  yearLabel,
  locale,
  gradingMax,
}: BulletinDocumentProps) {
  const t = await getTranslations("bulletinDoc");
  const tb = await getTranslations("bulletins");

  const totals = bulletinTotals(bulletin.lines);
  const schoolName = localized({ fr: school.nameFr, ar: school.nameAr, en: school.nameEn }, locale);

  return (
    <article className="bulletin-sheet" aria-label={t("documentTitle")}>
      <header className="border-b-2 border-black pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{schoolName}</h2>
            {school.address && (
              // `dir="auto"` because a Latin address inside an Arabic header is
              // reordered by the bidi algorithm — "12, rue Ibn Sina, Rabat"
              // prints as "rue Ibn Sina, Rabat ,12" without it.
              <p dir="auto" className="text-xs text-[var(--text-secondary)]">
                {school.address}
              </p>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t("schoolYear", { year: yearLabel })}
          </p>
        </div>
        <p className="mt-2 text-center text-base font-semibold uppercase tracking-wide">
          {t("documentTitle")} — {termLabel}
        </p>
      </header>

      {/* Identity. `avoid-break` so a page break never separates a pupil's name
          from the marks underneath it. */}
      <dl className="avoid-break mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <Field label={t("student")} value={personName(bulletin, locale)} strong />
        <Field label={t("class")} value={className} />
        <Field label={t("massar")} value={bulletin.massarCode ?? "—"} mono />
        <Field label={t("absences")} value={formatInteger(bulletin.absenceCount, locale)} />
      </dl>

      <table className="bulletin-table mt-3">
        <thead>
          <tr>
            <th scope="col" className="text-start">
              {t("subject")}
            </th>
            <th scope="col" className="numeric">
              {t("subjectAverage")}
            </th>
            <th scope="col" className="numeric">
              {t("coefficient")}
            </th>
            <th scope="col" className="numeric">
              {t("points")}
            </th>
            <th scope="col" className="text-start">
              {t("teacherRemark")}
            </th>
          </tr>
        </thead>
        <tbody>
          {bulletin.lines.map((line) => (
            <tr key={line.subjectId}>
              <th scope="row" className="text-start font-normal">
                {localizedName(line, locale)}
              </th>
              <td className="numeric">{formatMark(line.average, locale)}</td>
              <td className="numeric">{formatCoefficient(line.coefficient, locale)}</td>
              <td className="numeric">{formatMark(line.weightedPoints, locale)}</td>
              {/* `dir="auto"` per cell: an Arabic remark and a French one sit in
                  the same column on the same sheet, and the browser decides
                  from the text itself (`.logs/decisions.md`, story 8.2). */}
              <td dir="auto" lang={scriptLang(line.appreciation)} className="remark">
                {line.appreciation ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="text-start">
              {t("total")}
            </th>
            <td />
            <td className="numeric">{formatCoefficient(totals.coefficient, locale)}</td>
            <td className="numeric">{formatMark(totals.weightedPoints, locale)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <section className="avoid-break mt-3 border-y border-black py-2">
        <dl className="grid grid-cols-3 gap-x-4 text-sm">
          <Field
            label={t("generalAverage")}
            value={
              bulletin.generalAverage === null
                ? "—"
                : t("outOf", {
                    value: formatMark(bulletin.generalAverage, locale),
                    max: formatCoefficient(gradingMax, locale),
                  })
            }
            strong
            ltr
          />
          <Field
            label={t("rank")}
            value={
              bulletin.rank === null || bulletin.classSize === null
                ? "—"
                : t("rankValue", {
                    rank: formatRank(bulletin.rank, locale),
                    of: formatInteger(bulletin.classSize, locale),
                  })
            }
          />
          <Field
            label={t("countedSubjects")}
            value={formatInteger(totals.countedSubjects, locale)}
          />
        </dl>
      </section>

      <section className="avoid-break mt-3 text-sm">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          {t("councilRemark")}
        </h3>
        {/* Ruled whether or not a remark was written: a head teacher who left it
            blank writes on the printed sheet by hand. */}
        <p
          dir="auto"
          lang={scriptLang(bulletin.appreciation)}
          className="min-h-[10mm] border-b border-dotted border-black pt-1"
        >
          {bulletin.appreciation ?? ""}
        </p>
        <p className="mt-2">
          <span className="labelled text-[var(--text-secondary)]">{t("decision")}</span>{" "}
          <span className="font-medium">
            {bulletin.decision ? tb(`decisions.${bulletin.decision}`) : "—"}
          </span>
        </p>
      </section>

      <footer className="avoid-break mt-6 flex items-end justify-between gap-6 text-xs">
        <Signature label={t("signatureHead")} />
        <p className="text-[var(--text-muted)]">
          {t("publishedOn", { date: formatDocumentDate(bulletin.publishedAt, locale) })}
        </p>
        <Signature label={t("signatureGuardian")} />
      </footer>
    </article>
  );
}

function Field({
  label,
  value,
  strong,
  mono,
  ltr,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
  /** Force left-to-right for a value that is an expression rather than prose. */
  ltr?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="labelled text-[var(--text-secondary)]">{label}</dt>
      <dd
        dir={ltr ? "ltr" : undefined}
        className={[strong ? "font-semibold" : "", mono ? "font-mono text-xs" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

/** A ruled space for a real signature — this document is signed by hand. */
function Signature({ label }: { label: string }) {
  return (
    <div className="w-[45mm]">
      <p className="text-[var(--text-secondary)]">{label}</p>
      <div className="mt-[14mm] border-t border-black" />
    </div>
  );
}
