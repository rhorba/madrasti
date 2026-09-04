import { LOCALES } from "@madrasti/core";
import { defineRouting } from "next-intl/routing";

/**
 * Three locales, always prefixed.
 *
 * Arabic is listed first because it is the client's first-named language and
 * the one most likely to be neglected — see `CLAUDE.md` §1. French is the
 * default because it is what the school's paperwork already uses.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "fr",
  localePrefix: "always",
});
