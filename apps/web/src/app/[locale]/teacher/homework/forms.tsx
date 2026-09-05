"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "@madrasti/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  createAssignment,
  deleteAssignment,
  getAttachmentUrl,
  requestAttachmentUpload,
} from "./actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tomorrow — the default due date, because most homework is for next lesson. */
function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Setting homework.
 *
 * Most of what a teacher writes here is one line — "exercices 4 à 7 page 52" —
 * so the title is the only required field and everything else has a sensible
 * default. The attachment is genuinely optional and is hidden entirely when
 * storage is not configured, rather than offered and then failing.
 */
export function AssignmentForm({
  classSubjectId,
  uploadsEnabled,
}: {
  classSubjectId: string;
  uploadsEnabled: boolean;
}) {
  const t = useTranslations("homework");
  const te = useTranslations();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState(false);

  /**
   * Put the file in R2 first, then post the homework carrying its key.
   *
   * The bytes go straight from the phone to the bucket against a presigned
   * URL — they never pass through this server, so a teacher on a slow
   * connection is not also occupying a request slot.
   */
  async function upload(file: File): Promise<string> {
    const presigned = await requestAttachmentUpload({
      classSubjectId,
      contentType: file.type,
      contentLength: file.size,
    });
    if (!presigned.ok) throw new Error(presigned.error);

    const response = await fetch(presigned.data.url, {
      method: "PUT",
      // Both headers are signed into the URL: sending anything else fails the
      // signature, which is what makes the size limit real rather than polite.
      headers: { "Content-Type": file.type, "Content-Length": String(file.size) },
      body: file,
    });
    if (!response.ok) throw new Error("errors.uploadFailed");

    return presigned.data.key;
  }

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      try {
        const file = fileRef.current?.files?.[0];
        if (file) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            setError("errors.attachmentTooLarge");
            return;
          }
          setUploading(true);
          formData.set("attachmentKey", await upload(file));
        }

        const result = await createAssignment(formData);
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }

        formRef.current?.reset();
        router.refresh();
      } catch (caught) {
        const key = caught instanceof Error ? caught.message : "errors.unexpected";
        setError(key.startsWith("errors.") ? key : "errors.uploadFailed");
      } finally {
        setUploading(false);
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={submit}
      className="flex flex-col gap-4 rounded-lg border border-dashed p-4"
      noValidate
    >
      <h2 className="text-sm font-medium">{t("add")}</h2>
      <FormError error={error} />

      <input type="hidden" name="classSubjectId" value={classSubjectId} />

      <Field
        label={t("titleField")}
        name="title"
        placeholder={t("titlePlaceholder")}
        error={fieldErrors["title"]?.[0]}
        required
      />

      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor="hw-description"
          className="text-sm font-medium text-[var(--text-secondary)]"
        >
          {t("description")}
        </label>
        <textarea
          id="hw-description"
          name="description"
          rows={3}
          className="w-full min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("assignedOnLabel")}
          name="assignedOn"
          type="date"
          defaultValue={today()}
          error={fieldErrors["assignedOn"]?.[0]}
        />
        <Field
          label={t("dueOn")}
          name="dueOn"
          type="date"
          defaultValue={tomorrow()}
          error={fieldErrors["dueOn"]?.[0]}
        />
      </div>

      {/* Hidden rather than disabled when storage is unconfigured: an inert
          control invites a question nobody at the school can answer. */}
      {uploadsEnabled && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="hw-file" className="text-sm font-medium text-[var(--text-secondary)]">
            {t("attachment")}
          </label>
          <input
            id="hw-file"
            ref={fileRef}
            type="file"
            accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
            className="text-sm"
          />
          <p className="text-xs text-[var(--text-muted)]">{t("attachmentHint")}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" pending={pending}>
          {t("add")}
        </Button>
        {uploading && (
          <span className="text-sm text-[var(--text-secondary)]">{t("uploading")}</span>
        )}
        {error && !uploading && <span className="sr-only">{te(error)}</span>}
      </div>
    </form>
  );
}

/**
 * Open an attachment.
 *
 * A button rather than a link, because the URL does not exist until the server
 * has checked that this session may see this homework — and it expires minutes
 * later, so there is nothing durable to leak.
 */
export function AttachmentLink({ id }: { id: string }) {
  const t = useTranslations("homework");
  const te = useTranslations();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await getAttachmentUrl({ id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="text-sm text-[var(--action-primary)] underline underline-offset-2"
      >
        {t("openAttachment")}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {te(error)}
        </span>
      )}
    </>
  );
}

/** Withdraw homework. Confirms, and names what it is about to withdraw. */
export function DeleteAssignment({ id, title }: { id: string; title: string }) {
  const t = useTranslations("homework");
  const te = useTranslations();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAssignment({ id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-red-700"
      >
        {t("delete")}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-red-700">{t("deleteConfirm", { title })}</span>
      <Button type="button" onClick={remove} pending={pending} size="sm" variant="danger">
        {t("deleteYes")}
      </Button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-sm underline underline-offset-2"
      >
        {t("cancel")}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {te(error)}
        </span>
      )}
    </span>
  );
}
