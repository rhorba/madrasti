import type { ReactNode } from "react";
import "./globals.css";

/**
 * The real document shell is `app/[locale]/layout.tsx` — it is the one that
 * knows the language and the direction. This root exists only because Next
 * requires a layout at the top of the tree.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
