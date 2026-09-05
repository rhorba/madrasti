"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

/**
 * The only client-side code on this screen.
 *
 * `window.print()` is a convenience, not the mechanism: Ctrl+P and the
 * browser's own menu produce exactly the same sheets, which is what makes the
 * print stylesheet the deliverable rather than this button.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden size={18} strokeWidth={1.5} />
      {label}
    </Button>
  );
}
