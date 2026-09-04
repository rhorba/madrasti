import { LOCALES, type Locale, isRtl } from "@madrasti/core";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";

/**
 * One family with genuine Arabic coverage.
 *
 * IBM Plex Sans Arabic is a designed companion to the Latin rather than a
 * substitute face, so an Arabic screen and a French screen feel like the same
 * product — which matters when the same teacher switches between them daily
 * (DESIGN.md §4.3). `next/font` self-hosts these at build time, so there is no
 * third-party request at runtime and the CSP stays tight.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Madrasti",
  description: "Gestion scolaire — grades, homework, attendance",
  robots: { index: false, follow: false },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(LOCALES as readonly string[]).includes(locale)) notFound();

  const typed = locale as Locale;
  setRequestLocale(typed);
  const messages = await getMessages();

  return (
    <html
      lang={typed}
      dir={isRtl(typed) ? "rtl" : "ltr"}
      className={`${plexSans.variable} ${plexArabic.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
