import { cn } from "@/lib/cn";
import { type VariantProps, cva } from "class-variance-authority";
import type { ReactNode } from "react";

/** The only pill-shaped element in the system (DESIGN.md §3). */
const chip = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-[var(--bg-sunken)] text-[var(--text-secondary)]",
      green: "bg-green-50 text-green-700",
      amber: "bg-amber-100 text-amber-700",
      red: "bg-red-100 text-red-700",
      blue: "bg-blue-100 text-blue-700",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Chip({
  tone,
  children,
  className,
}: VariantProps<typeof chip> & { children: ReactNode; className?: string }) {
  return <span className={cn(chip({ tone }), className)}>{children}</span>;
}
