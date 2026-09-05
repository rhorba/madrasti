"use client";

/**
 * The last resort: the locale layout itself failed.
 *
 * This one replaces the whole document, so it must render its own `<html>` and
 * `<body>` — and it cannot use `next-intl`, because the provider it would read
 * from is inside the layout that just broke. So it is French, the school's
 * default and the language of its paperwork, with `lang` set explicitly rather
 * than left off: a screen reader must not be handed a page with no language
 * even on the worst path through the product.
 *
 * No stylesheet is assumed either. If the layout failed, the CSS may not have
 * loaded, so the little styling here is inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr" dir="ltr">
      <head>
        <title>Une erreur est survenue — Madrasti</title>
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          margin: 0,
          padding: "1.25rem",
          textAlign: "center",
          color: "#1f1d18",
          background: "#faf9f6",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Une erreur est survenue</h1>
        <p style={{ margin: 0, color: "#4a463d" }}>
          Quelque chose s&apos;est mal passé de notre côté. Réessayez ; si cela se reproduit,
          prévenez l&apos;administration de l&apos;école.
        </p>
        {/* The digest identifies the server-side stack without carrying any of
            it — and never a message, which can quote a row about a child. */}
        {error.digest && (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#726d5e" }}>
            Référence : {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            minHeight: "2.75rem",
            padding: "0 1rem",
            borderRadius: "4px",
            border: "none",
            background: "#2f6b43",
            color: "#ffffff",
            fontSize: "1rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
