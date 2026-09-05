import { cn } from "@/lib/cn";
import type { SelectHTMLAttributes } from "react";
import { useId } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
};

/**
 * A native `<select>`.
 *
 * Deliberately not a custom listbox: the native control is keyboard- and
 * screen-reader-correct for free, and on a teacher's Android phone it opens
 * the OS picker, which is both faster and familiar. Reach for a combobox only
 * when the list is long enough to need searching.
 */
export function SelectField({
  label,
  error,
  hint,
  className,
  id,
  children,
  ...props
}: SelectFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  // See the note in field.tsx: without min-w-0 a select in a grid refuses to
  // shrink below its intrinsic content width.
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={cn(
          "h-11 w-full min-w-0 rounded-md border bg-[var(--surface-raised)] px-3 text-base",
          "border-[var(--border-strong)] text-[var(--text-primary)]",
          error && "border-red-700",
          className
        )}
        {...props}
      >
        {children}
      </select>
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
