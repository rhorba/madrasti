"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { TD, TR } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { addClassSubject, removeClassSubject, updateClassSubject } from "../../actions";

type Option = { id: string; name: string };

/**
 * One taught subject: teacher and coefficient, editable in place.
 *
 * Editing inline rather than on a separate page because setting up a class
 * means touching ten of these in a row, and a round trip per subject makes
 * that a chore.
 */
export function ClassSubjectRow({
  id,
  classGroupId,
  subjectName,
  subjectColor,
  teacherId,
  coefficient,
  teachers,
}: {
  id: string;
  classGroupId: string;
  subjectName: string;
  subjectColor: string;
  teacherId: string;
  coefficient: number;
  teachers: Option[];
}) {
  const t = useTranslations("admin.classes");
  const [dirty, setDirty] = useState(false);

  const update = useAction(updateClassSubject, { onSuccess: () => setDirty(false) });
  const remove = useAction(removeClassSubject);

  return (
    <TR>
      <TD>
        <span className="flex items-center gap-2">
          {/* A start-edge bar, never a filled cell — a filled cell would fail
              contrast for the text sitting on it (docs/ui-madrasti.md §3). */}
          <span
            aria-hidden
            className="inline-block h-4 w-1 rounded-sm"
            style={{ backgroundColor: subjectColor }}
          />
          <span className="font-medium">{subjectName}</span>
        </span>
      </TD>

      <TD colSpan={3}>
        <form
          action={(formData) => {
            formData.set("id", id);
            formData.set("classGroupId", classGroupId);
            update.run(formData);
          }}
          className="flex flex-wrap items-end justify-end gap-2"
        >
          <select
            name="teacherId"
            defaultValue={teacherId}
            onChange={() => setDirty(true)}
            aria-label={t("teacher")}
            className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-sm"
          >
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>

          <input
            name="coefficient"
            type="number"
            step="0.5"
            min="0.5"
            max="10"
            defaultValue={coefficient}
            onChange={() => setDirty(true)}
            aria-label={t("coefficient")}
            className="tabular h-9 w-20 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-end text-sm"
          />

          {dirty && (
            <Button type="submit" size="sm" pending={update.pending}>
              {t("save")}
            </Button>
          )}
        </form>

        {(update.error || remove.error) && (
          <div className="mt-2 flex justify-end">
            <FormError error={update.error ?? remove.error} />
          </div>
        )}
      </TD>

      <TD className="text-end">
        <form
          action={(formData) => {
            formData.set("id", id);
            formData.set("classGroupId", classGroupId);
            remove.run(formData);
          }}
        >
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            pending={remove.pending}
            aria-label={t("removeSubject", { subject: subjectName })}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </form>
      </TD>
    </TR>
  );
}

export function AddSubjectForm({
  classGroupId,
  subjects,
  teachers,
}: {
  classGroupId: string;
  subjects: Option[];
  teachers: Option[];
}) {
  const t = useTranslations("admin.classes");
  const formRef = useRef<HTMLFormElement>(null);
  const { run, pending, error, errorFor } = useAction(addClassSubject, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set("classGroupId", classGroupId);
        run(formData);
      }}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h3 className="text-sm font-medium">{t("addSubject")}</h3>
      <FormError error={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label={t("subject")} name="subjectId" error={errorFor("subjectId")} required>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("teacher")} name="teacherId" error={errorFor("teacherId")} required>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </SelectField>
        <Field
          label={t("coefficient")}
          name="coefficient"
          type="number"
          step="0.5"
          min="0.5"
          max="10"
          defaultValue={1}
          hint={t("coefficientHint")}
          error={errorFor("coefficient")}
          required
        />
      </div>
      <div>
        <Button type="submit" pending={pending}>
          {t("addSubject")}
        </Button>
      </div>
    </form>
  );
}
