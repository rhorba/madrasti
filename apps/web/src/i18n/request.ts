import { DEFAULT_LOCALE, LOCALES, type Locale } from "@madrasti/core";
import { getRequestConfig } from "next-intl/server";

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Africa/Casablanca",
  };
});
