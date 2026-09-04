import { EmptyState } from "@/components/empty-state";
import { RoleShell } from "@/components/role-shell";
import { requirePageSession } from "@/lib/auth/page-session";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function ParentHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The middleware already redirected the wrong role away from here. This is
  // the check that actually enforces it — middleware is a convenience, not the
  // security boundary (`docs/architecture-madrasti.md` §5).
  const session = await requirePageSession({ roles: ["parent"] });

  const t = await getTranslations("home");

  return (
    <RoleShell session={session} title={t("parentTitle")}>
      <EmptyState>{t("parentEmpty")}</EmptyState>
    </RoleShell>
  );
}
