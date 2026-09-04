"use client";

import type { ActionResult } from "@madrasti/core";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

/**
 * Drive a server action from a form.
 *
 * Keeps the three things every admin form needs in one place: a pending flag,
 * a form-level error key, and per-field error keys. Errors are **keys**, so
 * the caller renders them in the user's language.
 */
export function useAction<TData>(
  action: (formData: FormData) => Promise<ActionResult<TData>>,
  options?: { onSuccess?: (data: TData) => void; refresh?: boolean }
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = useCallback(
    (formData: FormData) => {
      setError(null);
      setFieldErrors({});
      startTransition(async () => {
        const result = await action(formData);
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        options?.onSuccess?.(result.data);
        // Server components hold the data, so a successful write needs a
        // refresh for the new row to appear.
        if (options?.refresh !== false) router.refresh();
      });
    },
    [action, options, router]
  );

  const errorFor = useCallback(
    (field: string): string | undefined => fieldErrors[field]?.[0],
    [fieldErrors]
  );

  return { run, pending, error, fieldErrors, errorFor };
}
