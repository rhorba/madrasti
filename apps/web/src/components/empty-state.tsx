import type { ReactNode } from "react";

/**
 * An empty state says what will appear and what to do about it — never
 * "No data" (`docs/ux-madrasti.md` §8.5).
 */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-5 py-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
