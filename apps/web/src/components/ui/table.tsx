import { cn } from "@/lib/cn";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * A register, not a data grid.
 *
 * Hairline rules and a heavy header rule, no zebra striping, no card wrapper —
 * the rhythm of a paper cahier de notes (DESIGN.md §2, reference A). Numeric
 * columns opt into tabular figures with `numeric`, which is what makes a
 * column of thirty marks line up.
 */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  // Wide tables scroll inside their own container; the page never scrolls
  // sideways.
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b-2 border-[var(--border-strong)] text-start">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-[var(--border-default)]", className)}>{children}</tr>;
}

type CellProps = {
  numeric?: boolean | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
};

export function TH({
  numeric,
  children,
  className,
  ...props
}: CellProps & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 text-start align-bottom font-medium text-[var(--text-secondary)]",
        numeric && "text-end tabular",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({
  numeric,
  children,
  className,
  ...props
}: CellProps & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 py-2 align-middle", numeric && "text-end tabular", className)}
      {...props}
    >
      {children}
    </td>
  );
}
