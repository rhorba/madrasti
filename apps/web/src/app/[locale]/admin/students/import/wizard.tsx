"use client";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { ImportPreview } from "@madrasti/core";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { commitImport, previewImport } from "./actions";

type Preview = ImportPreview & { existingMassar: string[] };

/**
 * Choose a file, see exactly what it contains, then commit.
 *
 * The preview step is not decoration: this writes hundreds of children's
 * records at once, and an admin who cannot see what is about to happen has no
 * way to catch a file whose columns are shifted by one.
 */
export function ImportWizard({
  yearId,
  classes,
}: {
  yearId: string | null;
  classes: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.import");
  const tc = useTranslations("common");
  const router = useRouter();

  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    setPreview(null);
    setFileName(file.name);

    const text = await file.text();
    setFileText(text);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("fileText", text);
      const result = await previewImport(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
    });
  }

  function commit(classGroupId: string) {
    if (!fileText) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("fileText", fileText);
      if (classGroupId && yearId) {
        formData.set("classGroupId", classGroupId);
        formData.set("yearId", yearId);
      }
      formData.set("enrolledOn", new Date().toISOString().slice(0, 10));

      const result = await commitImport(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.data);
      setPreview(null);
      setFileText(null);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-green-200 bg-green-50 p-5">
        <p className="flex items-center gap-2 font-medium text-green-700">
          <CheckCircle2 aria-hidden className="size-5" />
          {t("imported", { count: done.imported })}
        </p>
        {done.skipped > 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            {t("skipped", { count: done.skipped })}
          </p>
        )}
        <Button onClick={() => setDone(null)} variant="secondary">
          {t("importAnother")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <FormError error={error} />

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-[var(--bg-sunken)]">
        <Upload aria-hidden className="size-6 text-[var(--text-muted)]" />
        <span className="text-sm font-medium">{fileName || t("chooseFile")}</span>
        <span className="text-xs text-[var(--text-muted)]">{t("chooseFileHint")}</span>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>

      {pending && <p className="text-sm text-[var(--text-muted)]">{tc("loading")}</p>}

      {preview && (
        <PreviewPanel preview={preview} classes={classes} onCommit={commit} pending={pending} />
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  classes,
  onCommit,
  pending,
}: {
  preview: Preview;
  classes: { id: string; name: string }[];
  onCommit: (classGroupId: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.import");
  const tc = useTranslations("common");
  const te = useTranslations();
  const [classGroupId, setClassGroupId] = useState("");

  const blocked = preview.missingHeaders.length > 0;
  const duplicates = preview.existingMassar.length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-lg font-medium">{t("previewHeading")}</h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("readyCount")} value={preview.rows.length} tone="green" />
        <Stat
          label={t("errorCount")}
          value={preview.errors.length}
          tone={preview.errors.length > 0 ? "red" : "neutral"}
        />
        <Stat
          label={t("massarColumn")}
          value={preview.withoutMassar ? t("absent") : t("present")}
          tone="neutral"
        />
        <Stat
          label={t("alreadyInDb")}
          value={preview.existingMassar.length}
          tone={duplicates ? "amber" : "neutral"}
        />
      </dl>

      {blocked && (
        <p className="flex items-start gap-2 rounded-md border border-red-700 bg-red-100 px-3 py-2 text-sm text-red-700">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("missingColumns", { columns: preview.missingHeaders.join(", ") })}
        </p>
      )}

      {preview.unknownHeaders.length > 0 && (
        // Not fatal, but worth saying out loud: a column the school expected to
        // import is being ignored, and silence would hide that.
        <p className="rounded-md border border-amber-500 bg-amber-100 px-3 py-2 text-sm text-amber-700">
          {t("ignoredColumns", { columns: preview.unknownHeaders.join(", ") })}
        </p>
      )}

      {duplicates && (
        <p className="rounded-md border border-amber-500 bg-amber-100 px-3 py-2 text-sm text-amber-700">
          {t("alreadyInDbWarning", { codes: preview.existingMassar.slice(0, 5).join(", ") })}
        </p>
      )}

      {preview.errors.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">{t("errorsHeading")}</h3>
          <Table>
            <THead>
              <TR>
                <TH numeric>{t("line")}</TH>
                <TH>{t("column")}</TH>
                <TH>{t("problem")}</TH>
              </TR>
            </THead>
            <TBody>
              {preview.errors.slice(0, 25).map((rowError, index) => (
                <TR key={`${rowError.line}-${rowError.field}-${index}`}>
                  <TD numeric>{rowError.line}</TD>
                  <TD className="font-mono text-xs">{rowError.field}</TD>
                  <TD className="text-red-700">{te(rowError.message)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {preview.errors.length > 25 && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {t("moreErrors", { count: preview.errors.length - 25 })}
            </p>
          )}
        </div>
      )}

      {preview.rows.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">{t("firstRows")}</h3>
          <Table>
            <THead>
              <TR>
                <TH>{t("nameFr")}</TH>
                <TH>{t("nameAr")}</TH>
                <TH>{t("birthDate")}</TH>
                <TH>{t("gender")}</TH>
                <TH>{t("massar")}</TH>
              </TR>
            </THead>
            <TBody>
              {preview.rows.slice(0, 5).map((row, index) => (
                <TR key={`${row.lastNameFr}-${row.firstNameFr}-${index}`}>
                  <TD>{`${row.firstNameFr} ${row.lastNameFr}`}</TD>
                  <TD dir="rtl">{`${row.firstNameAr} ${row.lastNameAr}`}</TD>
                  <TD className="tabular">{row.birthDate}</TD>
                  <TD>{row.gender.toUpperCase()}</TD>
                  <TD className="font-mono text-xs text-[var(--text-muted)]">
                    {row.massarCode ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {!blocked && preview.rows.length > 0 && (
        <div className="flex flex-wrap items-end gap-4 border-t pt-4">
          <div className="min-w-48">
            <SelectField
              label={t("enrolInto")}
              value={classGroupId}
              onChange={(event) => setClassGroupId(event.target.value)}
              hint={t("enrolIntoHint")}
            >
              <option value="">{tc("none")}</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Button onClick={() => onCommit(classGroupId)} pending={pending} size="lg">
            {t("confirmImport", { count: preview.rows.length })}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "green" | "red" | "amber" | "neutral";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-[var(--text-primary)]";

  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className={`tabular text-xl font-semibold ${color}`}>{value}</dd>
    </div>
  );
}
