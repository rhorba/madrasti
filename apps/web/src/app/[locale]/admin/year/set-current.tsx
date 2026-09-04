"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";
import { setCurrentTerm, setCurrentYear } from "../actions";

/**
 * Promote a year or term to "current".
 *
 * Only one of each may be current, and the action swaps them in a single
 * transaction — so this is one button, not a clear-then-set the admin has to
 * perform in the right order.
 */
export function SetCurrentButton({
  kind,
  id,
  label,
}: {
  kind: "year" | "term";
  id: string;
  label: string;
}) {
  const action = kind === "year" ? setCurrentYear : setCurrentTerm;
  const { run, pending } = useAction((formData: FormData) => action(formData));

  return (
    <form
      action={(formData) => {
        formData.set(kind === "year" ? "yearId" : "termId", id);
        run(formData);
      }}
    >
      <Button type="submit" variant="secondary" size="sm" pending={pending}>
        {label}
      </Button>
    </form>
  );
}
