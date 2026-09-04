import { cn } from "@/lib/cn";
import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

/**
 * Borders, never shadows (DESIGN.md §3). Shadows are reserved for genuinely
 * floating layers; a button sits on the page.
 */
const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--action-primary)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]",
        secondary:
          "border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--bg-sunken)]",
        ghost: "text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]",
        danger: "bg-red-700 text-white hover:bg-red-500",
      },
      size: {
        // 44px minimum touch target — a teacher marking a register on a phone.
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { pending?: boolean };

export function Button({
  className,
  variant,
  size,
  pending,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(button({ variant, size }), className)}
      // A pending button must also be disabled: showing a spinner while still
      // accepting clicks is how a register gets submitted twice.
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {children}
    </button>
  );
}
