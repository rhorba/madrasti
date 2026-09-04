"use client";

import { CredentialsNotice } from "@/components/credentials-notice";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SelectField } from "@/components/ui/select";
import { useAction } from "@/lib/use-action";
import { Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  createStudentAccount,
  enrolStudent,
  linkGuardian,
  setStudentStatus,
  unlinkGuardian,
  updateStudent,
} from "../../people-actions";

type Option = { id: string; name: string };

export function StudentDetailsForm({
  student,
}: {
  student: {
    id: string;
    firstNameFr: string;
    lastNameFr: string;
    firstNameAr: string;
    lastNameAr: string;
    birthDate: string;
    gender: string;
    massarCode: string | null;
    status: string;
  };
}) {
  const t = useTranslations("admin.students");
  const { run, pending, error, errorFor } = useAction(updateStudent);
  const status = useAction(setStudentStatus);

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(formData) => {
          formData.set("id", student.id);
          run(formData);
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormError error={error} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={t("firstNameFr")}
            name="firstNameFr"
            defaultValue={student.firstNameFr}
            error={errorFor("firstNameFr")}
          />
          <Field
            label={t("lastNameFr")}
            name="lastNameFr"
            defaultValue={student.lastNameFr}
            error={errorFor("lastNameFr")}
          />
          <Field
            label={t("firstNameAr")}
            name="firstNameAr"
            dir="rtl"
            defaultValue={student.firstNameAr}
            error={errorFor("firstNameAr")}
          />
          <Field
            label={t("lastNameAr")}
            name="lastNameAr"
            dir="rtl"
            defaultValue={student.lastNameAr}
            error={errorFor("lastNameAr")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={t("birthDate")}
            name="birthDate"
            type="date"
            defaultValue={student.birthDate}
            error={errorFor("birthDate")}
          />
          <SelectField label={t("gender")} name="gender" defaultValue={student.gender}>
            <option value="m">{t("male")}</option>
            <option value="f">{t("female")}</option>
          </SelectField>
          {/* Clearing this field is allowed: a code entered in error should be
              removable, and the record stays valid without one. */}
          <Field
            label={t("massar")}
            name="massarCode"
            defaultValue={student.massarCode ?? ""}
            hint={t("massarOptional")}
            error={errorFor("massarCode")}
          />
        </div>

        <div>
          <Button type="submit" pending={pending}>
            {t("save")}
          </Button>
        </div>
      </form>

      <form
        action={(formData) => {
          formData.set("id", student.id);
          status.run(formData);
        }}
        className="flex flex-wrap items-end gap-3 border-t pt-4"
      >
        <div className="min-w-48">
          <SelectField label={t("status")} name="status" defaultValue={student.status}>
            <option value="active">{t("statuses.active")}</option>
            <option value="transferred">{t("statuses.transferred")}</option>
            <option value="graduated">{t("statuses.graduated")}</option>
            <option value="withdrawn">{t("statuses.withdrawn")}</option>
          </SelectField>
        </div>
        <Button type="submit" variant="secondary" pending={status.pending}>
          {t("updateStatus")}
        </Button>
        {/* A student who leaves is never deleted — their marks and registers
            stay attributable (docs/ux-madrasti.md §8.5). */}
        <p className="text-xs text-[var(--text-muted)]">{t("statusNote")}</p>
      </form>
      <FormError error={status.error} />
    </div>
  );
}

export function EnrolmentPanel({
  studentId,
  yearId,
  yearLabel,
  current,
  classes,
}: {
  studentId: string;
  yearId: string;
  yearLabel: string;
  current: { className: string; since: string } | null;
  classes: Option[];
}) {
  const t = useTranslations("admin.students");
  const { run, pending, error } = useAction(enrolStudent);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-secondary)]">
        {current
          ? t("enrolledIn", { class: current.className, year: yearLabel, since: current.since })
          : t("notEnrolled", { year: yearLabel })}
      </p>

      <FormError error={error} />

      <form
        action={(formData) => {
          formData.set("studentId", studentId);
          formData.set("yearId", yearId);
          formData.set("enrolledOn", new Date().toISOString().slice(0, 10));
          run(formData);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-48">
          <SelectField label={t("class")} name="classGroupId" required>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="submit" pending={pending}>
          {current ? t("moveClass") : t("enrol")}
        </Button>
      </form>

      {current && <p className="text-xs text-[var(--text-muted)]">{t("moveNote")}</p>}
    </div>
  );
}

export function GuardianPanel(
  props:
    | { mode: "unlink"; studentId: string; guardianId: string; guardianName: string }
    | { mode: "add"; studentId: string; available: Option[] }
) {
  const t = useTranslations("admin.students");
  const unlink = useAction(unlinkGuardian);
  const link = useAction(linkGuardian);

  if (props.mode === "unlink") {
    return (
      <form
        action={(formData) => {
          formData.set("studentId", props.studentId);
          formData.set("guardianId", props.guardianId);
          unlink.run(formData);
        }}
      >
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          pending={unlink.pending}
          aria-label={t("unlinkGuardian", { name: props.guardianName })}
        >
          <Unlink aria-hidden className="size-4" />
        </Button>
      </form>
    );
  }

  if (props.available.length === 0) return null;

  return (
    <form
      action={(formData) => {
        formData.set("studentId", props.studentId);
        link.run(formData);
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-4"
    >
      <div className="min-w-64 flex-1">
        <SelectField label={t("linkGuardian")} name="guardianId" required>
          {props.available.map((guardian) => (
            <option key={guardian.id} value={guardian.id}>
              {guardian.name}
            </option>
          ))}
        </SelectField>
      </div>
      <Button type="submit" variant="secondary" pending={link.pending}>
        {t("link")}
      </Button>
      <FormError error={link.error} />
    </form>
  );
}

export function StudentAccountPanel({
  studentId,
  hasAccount,
}: {
  studentId: string;
  hasAccount: boolean;
}) {
  const t = useTranslations("admin.students");
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(
    null
  );
  const { run, pending, error, errorFor } = useAction(createStudentAccount, {
    onSuccess: (data) => setCredentials(data),
  });

  if (credentials) {
    return (
      <CredentialsNotice
        email={credentials.email}
        password={credentials.tempPassword}
        onDismiss={() => setCredentials(null)}
      />
    );
  }

  if (hasAccount) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("hasAccount")}</p>;
  }

  return (
    <form
      action={(formData) => {
        formData.set("studentId", studentId);
        run(formData);
      }}
      className="flex flex-wrap items-end gap-3"
      noValidate
    >
      <div className="min-w-64">
        <Field
          label={t("accountEmail")}
          name="email"
          type="email"
          hint={t("accountEmailHint")}
          error={errorFor("email")}
          required
        />
      </div>
      <Button type="submit" variant="secondary" pending={pending}>
        {t("createAccount")}
      </Button>
      <FormError error={error} />
    </form>
  );
}
