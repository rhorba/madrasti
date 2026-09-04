import { Link } from "@/i18n/navigation";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Layers,
  LayoutGrid,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Admin sections.
 *
 * Ordered the way a school year is actually set up: the calendar first, then
 * the structure it hangs on, then the people, then settings. An admin doing
 * this for the first time in September can work straight down the list.
 */
const SECTIONS = [
  { href: "/admin/year", key: "year", Icon: CalendarDays },
  { href: "/admin/levels", key: "levels", Icon: Layers },
  { href: "/admin/subjects", key: "subjects", Icon: BookOpen },
  { href: "/admin/classes", key: "classes", Icon: LayoutGrid },
  { href: "/admin/students", key: "students", Icon: GraduationCap },
  { href: "/admin/guardians", key: "guardians", Icon: Users },
  { href: "/admin/teachers", key: "teachers", Icon: UserCog },
  { href: "/admin/settings", key: "settings", Icon: Settings },
] as const;

export async function AdminNav() {
  const t = await getTranslations("nav");

  return (
    <nav
      aria-label={t("sections")}
      data-print="hide"
      className="border-b bg-[var(--surface-raised)]"
    >
      {/* Scrolls horizontally on a phone rather than wrapping into three rows. */}
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-5 py-1">
        {SECTIONS.map(({ href, key, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)]"
            >
              <Icon aria-hidden className="size-4" />
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
