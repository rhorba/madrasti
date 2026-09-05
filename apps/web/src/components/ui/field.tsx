import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
};

/**
 * A labelled input with its error wired to `aria-describedby`.
 *
 * The label is always present — never a placeholder standing in for one. A
 * placeholder disappears the moment someone types, which is precisely when a
 * non-technical user most needs to know what the field was for.
 */
export function Field({ label, error, hint, className, id, ...props }: FieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  // `min-w-0` on the wrapper and `w-full` on the control: a grid or flex item
  // defaults to `min-width: auto`, and an <input> carries an intrinsic
  // ~20-character width, so without these the field refuses to shrink and
  // pushes the page sideways on a phone.
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={cn(
          "h-11 w-full min-w-0 rounded-md border bg-[var(--surface-raised)] px-3 text-base",
          "border-[var(--border-strong)] text-[var(--text-primary)]",
          "placeholder:text-[var(--text-muted)]",
          error && "border-red-700",
          className
        )}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
