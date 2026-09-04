import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing.js";

/**
 * Locale-aware navigation. Always use these rather than `next/link` and
 * `next/navigation` — they carry the active locale through automatically, so a
 * link cannot silently drop the user back into French.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
