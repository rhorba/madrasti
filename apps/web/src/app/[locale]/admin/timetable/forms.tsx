"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { copyDay, createSlot, removeSlot } from "./actions";

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Common Moroccan lesson times, offered as defaults.
 *
 * The secretary enters dozens of these; typing 08:00 and 09:00 every time is
 * the slow part. Times remain free-text, because schools differ.
 */
const COMMON_TIMES = [
  ["08:00", "09:00"],
  ["09:00", "10:00"],
  ["10:15", "11:15"],
  ["11:15", "12:15"],
  ["14:00", "15:00"],
  ["15:00", "16:00"],
] as const;

export function AddSlotForm({ subjects }: { subjects: { id: string; label: string }[] }) {
  const t = useTranslations("timetable");
  const formRef = useRef<HTMLFormElement>(null);
  const [preset, setPreset] = useState(0);

  const { run, pending, error, errorFor } = useAction(createSlot, {
    // Deliberately not resetting the whole form: the next lesson is usually
    // the same day and the following period, so keeping the day selected saves
    // the secretary a click on every single entry.
    onSuccess: () => {
      const room = formRef.current?.querySelector<HTMLInputElement>("[name=room]");
      if (room) room.value = "";
    },
  });

  const [start, end] = COMMON_TIMES[preset] ?? COMMON_TIMES[0];

  return (
    <form
      ref={formRef}
      action={run}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h2 className="text-sm font-medium">{t("addSlot")}</h2>
      <FormError error={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t("subject")}
          name="classSubjectId"
          error={errorFor("classSubjectId")}
          required
        >
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.label}
            </option>
          ))}
        </SelectField>

        <SelectField label={t("weekday")} name="weekday" error={errorFor("weekday")} required>
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {t(`weekdays.${day}`)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={t("period")}
          value={String(preset)}
          onChange={(event) => setPreset(Number(event.target.value))}
          hint={t("periodHint")}
        >
          {COMMON_TIMES.map(([from, to], index) => (
            <option key={from} value={index}>
              {from}–{to}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* `key` forces the input to pick up a new preset — without it React
            keeps the previously typed value and the picker looks broken. */}
        <Field
          key={`start-${preset}`}
          label={t("startTime")}
          name="startTime"
          type="time"
          defaultValue={start}
          error={errorFor("startTime")}
          required
        />
        <Field
          key={`end-${preset}`}
          label={t("endTime")}
          name="endTime"
          type="time"
          defaultValue={end}
          error={errorFor("endTime")}
          required
        />
        <Field label={t("room")} name="room" hint={t("roomOptional")} error={errorFor("room")} />
      </div>

      <div>
        <Button type="submit" pending={pending}>
          {t("addSlot")}
        </Button>
      </div>
    </form>
  );
}

export function SlotControls({ slotId }: { slotId: string }) {
  const t = useTranslations("timetable");
  const { run, pending, error } = useAction(removeSlot);

  return (
    <form
      action={(formData) => {
        formData.set("id", slotId);
        run(formData);
      }}
      className="mt-1 flex justify-end"
      data-print="hide"
    >
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        pending={pending}
        aria-label={t("removeSlot")}
        className="h-7 px-1.5"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
      <FormError error={error} />
    </form>
  );
}

export function CopyDayForm({ classGroupId }: { classGroupId: string }) {
  const t = useTranslations("timetable");
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null);
  const { run, pending, error } = useAction(copyDay, {
    onSuccess: (data) => setResult(data),
  });

  return (
    <form
      action={(formData) => {
        setResult(null);
        formData.set("classGroupId", classGroupId);
        run(formData);
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-4"
    >
      <div className="w-full">
        <h2 className="text-sm font-medium">{t("copyDay")}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("copyDayHint")}</p>
      </div>

      <div className="min-w-36">
        <SelectField label={t("copyFrom")} name="fromWeekday" defaultValue="1">
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {t(`weekdays.${day}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="min-w-36">
        <SelectField label={t("copyTo")} name="toWeekday" defaultValue="2">
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {t(`weekdays.${day}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <Button type="submit" variant="secondary" pending={pending}>
        {t("copy")}
      </Button>

      <FormError error={error} />
      {result && (
        <output className="block text-sm text-green-700">
          {result.skipped > 0
            ? t("copiedWithSkips", { copied: result.copied, skipped: result.skipped })
            : t("copied", { copied: result.copied })}
        </output>
      )}
    </form>
  );
}
