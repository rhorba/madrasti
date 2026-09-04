import { AdminNav } from "@/components/admin-nav";
import { RoleShell } from "@/components/role-shell";
import { requirePageSession } from "@/lib/auth/page-session";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * Every admin page is gated here as well as in middleware. The middleware
 * redirect is a convenience; this is the check that enforces it
 * (`docs/architecture-madrasti.md` §5).
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requirePageSession({ roles: ["admin"] });

  return (
    <RoleShell session={session} nav={<AdminNav />}>
      {children}
    </RoleShell>
  );
}
