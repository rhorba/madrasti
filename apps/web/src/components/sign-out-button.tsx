import { signOutAction } from "@/app/actions";
import { LogOut } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * A plain form posting to the server action.
 *
 * Not a client component with `startTransition`: signing out finishes with a
 * redirect, and wrapping that in a transition swallows it — the session clears
 * server-side but the browser never navigates, so the user appears to still be
 * signed in. A form submission handles the redirect natively and works with no
 * client JavaScript at all.
 */
export async function SignOutButton() {
  const t = await getTranslations("common");
  const locale = await getLocale();

  return (
    <form action={signOutAction.bind(null, locale)}>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        {/* Non-directional icon — it does not flip under RTL. */}
        <LogOut aria-hidden className="size-4" />
        {t("signOut")}
      </button>
    </form>
  );
}
