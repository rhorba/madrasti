import { type Page, expect, test } from "@playwright/test";

/**
 * Sprint 8: the bulletin.
 *
 * Story 8.2 — the written half. Everything else on a report card is arithmetic
 * that `@madrasti/grading` already proves; the appreciation is the one field a
 * person composes, in their own language, about a named child. So these tests
 * assert the three things that arithmetic cannot: that the right teacher can
 * reach the sheet, that what she wrote comes back exactly as written — in
 * Arabic as readily as in French — and that clearing a remark removes it
 * rather than leaving a blank line on a printed document.
 */

const TEACHER = "prof1@almassira.example.ma";
const PASSWORD = "madrasti2026!";

async function signIn(page: Page, locale = "fr") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/e-mail|email|البريد/i).fill(TEACHER);
  await page.getByLabel(/mot de passe|password|كلمة المرور/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|sign in|دخول/i }).click();
  await page.waitForURL(new RegExp(`/${locale}/teacher$`));
}

/** Every appreciation box on the sheet, in register order. */
function remarks(page: Page) {
  return page.getByRole("textbox", { name: /^Appréciation pour|^ملاحظة بخصوص|^Appreciation for/ });
}

test.describe("subject appreciations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    // Reached from the marks screen, where the teacher already has the class
    // and the subject in front of her — not from a fifth link on her home page.
    await page.getByRole("link", { name: "Notes" }).first().click();
    await page.waitForURL(/\/teacher\/grades/);
    await page.getByRole("link", { name: "Appréciations" }).click();
    await page.waitForURL(/\/teacher\/appreciations/);
  });

  test("shows the whole class on one screen, with the mark each remark is about", async ({
    page,
  }) => {
    const boxes = remarks(page);
    await expect(boxes.first()).toBeVisible();
    expect(await boxes.count()).toBeGreaterThan(10);

    // The term is offered here, unlike everywhere else in the product: these
    // are written after a trimestre closes, often once the next has begun.
    await expect(page.getByRole("navigation", { name: /choisir un trimestre/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /choisir une classe/i })).toBeVisible();
  });

  test("writes a remark, keeps it, and gives it back unchanged", async ({ page }) => {
    const text = `Élève sérieux, doit participer davantage. ${Date.now().toString().slice(-6)}`;

    await remarks(page).first().fill(text);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appréciations enregistrées.")).toBeVisible();

    await page.reload();
    await expect(remarks(page).first()).toHaveValue(text);
  });

  test("clearing a remark removes it rather than leaving a blank line", async ({ page }) => {
    await remarks(page).first().fill("À supprimer.");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appréciations enregistrées.")).toBeVisible();

    await remarks(page).first().fill("");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appréciations enregistrées.")).toBeVisible();

    await page.reload();
    await expect(remarks(page).first()).toHaveValue("");
  });

  test("flags a remark too long for a bulletin before it is saved", async ({ page }) => {
    await remarks(page).first().fill("a".repeat(320));
    await expect(page.getByText(/caractère\(s\) de trop/)).toBeVisible();
    await expect(remarks(page).first()).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("subject appreciations in Arabic", () => {
  test("mirrors the screen and stores an Arabic remark as written", async ({ page }) => {
    // The screen is RTL and every label is Arabic (§12.14) — and the remark
    // itself is deliberately *not* translated: it is a teacher's judgement
    // about one child, so it prints as authored (`.logs/decisions.md`).
    await signIn(page, "ar");
    await page.getByRole("link", { name: "النقط" }).first().click();
    await page.waitForURL(/\/ar\/teacher\/grades/);
    await page.getByRole("link", { name: "الملاحظات" }).click();
    await page.waitForURL(/\/ar\/teacher\/appreciations/);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("navigation", { name: "اختر الأسدس" })).toBeVisible();

    const text = "تلميذ مجتهد، مستواه في تحسن مستمر. عليه المشاركة أكثر داخل القسم.";
    const box = remarks(page).first();
    await box.fill(text);
    // `dir="auto"` per field, not per screen: the same box is used by the
    // French teacher next door, and the browser decides from the text itself.
    await expect(box).toHaveAttribute("dir", "auto");

    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ الملاحظات.")).toBeVisible();

    await page.reload();
    await expect(remarks(page).first()).toHaveValue(text);
  });
});

/**
 * Story 8.3 — the conseil de classe, publication and the freeze.
 *
 * Every test here publishes and then unpublishes inside its own body. That is
 * not tidiness: publication freezes a class's term, and a suite that left one
 * published would fail `grades.spec.ts` further down the run with an error
 * about bulletins — which reads as a product bug and is not one.
 */

const ADMIN = "admin@almassira.example.ma";

async function signInAsAdmin(page: Page, locale = "fr") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/e-mail|email|البريد/i).fill(ADMIN);
  await page.getByLabel(/mot de passe|password|كلمة المرور/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|sign in|دخول/i }).click();
  await page.waitForURL(new RegExp(`/${locale}/admin$`));
}

/**
 * Take back the class currently on screen.
 *
 * `exact` matters on the opening click: "Dépublier" is a substring of
 * "Oui, dépublier", and role-name matching is substring and case-insensitive,
 * so without it this hits the confirm button and unpublishes with no reason.
 */
async function unpublish(page: Page, reason: string) {
  await page.getByRole("button", { name: "Dépublier", exact: true }).click();
  await confirmUnpublish(page, reason);
}

/** The confirm half, for a test that has already opened the panel itself. */
async function confirmUnpublish(page: Page, reason: string) {
  await page.getByLabel(/motif de la dépublication/i).fill(reason);
  await page.getByRole("button", { name: "Oui, dépublier" }).click();
  await expect(page.getByText("Bulletins dépubliés.", { exact: false })).toBeVisible();
}

test.describe("publishing bulletins", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole("link", { name: "Bulletins" }).first().click();
    await page.waitForURL(/\/admin\/bulletins/);
  });

  test("shows the class with its live averages, ranks and absences", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: /choisir une classe/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /choisir un trimestre/i })).toBeVisible();
    // "3e sur 27" — the classic, and what the client asked to keep (PRD Q3).
    await expect(page.getByText(/\de sur \d+/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Publier les bulletins" })).toBeVisible();
  });

  test("writes the council's remark and decision, publishes, and freezes the screen", async ({
    page,
  }) => {
    const remark = `Trimestre solide. ${Date.now().toString().slice(-6)}`;

    const appreciations = page.getByRole("textbox", { name: /^Appréciation générale pour/ });
    await appreciations.first().fill(remark);
    await page
      .getByRole("combobox", { name: /^Décision du conseil pour/ })
      .first()
      .selectOption("admis_avec_felicitations");

    await page.getByRole("button", { name: "Publier les bulletins" }).click();
    await expect(page.getByText("Bulletins publiés.", { exact: false })).toBeVisible();

    // The screen is now the document, not a draft of it.
    await expect(page.getByText(/Publiés le/)).toBeVisible();
    await expect(appreciations.first()).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Publier les bulletins" })).toHaveCount(0);

    // What the council wrote survived publication rather than being blanked.
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: /^Appréciation générale pour/ }).first()
    ).toHaveValue(remark);

    await unpublish(page, "Fin du test end-to-end.");
    await expect(page.getByRole("button", { name: "Publier les bulletins" })).toBeVisible();
  });

  test("refuses to unpublish without a stated reason", async ({ page }) => {
    await page.getByRole("button", { name: "Publier les bulletins" }).click();
    await expect(page.getByText("Bulletins publiés.", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Dépublier", exact: true }).click();
    // The button stays disabled until a reason is typed — a year later that
    // sentence is the only thing that explains a changed average.
    await expect(page.getByRole("button", { name: "Oui, dépublier" })).toBeDisabled();
    await page.getByLabel(/motif de la dépublication/i).fill("Erreur de saisie en français.");
    await expect(page.getByRole("button", { name: "Oui, dépublier" })).toBeEnabled();

    // The panel is already open; only the confirm half is left to do. Leaving
    // the class published here would freeze it for `grades.spec.ts` further
    // down the run.
    await confirmUnpublish(page, "Erreur de saisie en français.");
  });

  test("stops a teacher entering marks in a published term, and lets her again after", async ({
    page,
    context,
  }) => {
    // The freeze, from the side that feels it. This is the whole point of the
    // story: the paper a family holds cannot change underneath them.
    const classLink = page
      .getByRole("navigation", { name: /choisir une classe/i })
      .getByRole("link");
    const className = ((await classLink.first().textContent()) ?? "").trim();
    await page.getByRole("button", { name: "Publier les bulletins" }).click();
    await expect(page.getByText("Bulletins publiés.", { exact: false })).toBeVisible();

    // The session has to go first: middleware sends anyone already signed in
    // away from /login, so navigating there as the admin would simply bounce
    // back to /fr/admin and never offer the form.
    await context.clearCookies();
    await signIn(page);
    await page.getByRole("link", { name: "Notes" }).first().click();
    await page.waitForURL(/\/teacher\/grades/);

    // The seed gives this teacher Arabic in the first class on the admin's
    // list, which is the one just published. Asserted rather than skipped over:
    // a seed change that broke the overlap would otherwise leave this test
    // passing while exercising nothing at all.
    const tab = page
      .getByRole("navigation", { name: /choisir une classe/i })
      .getByRole("link", { name: new RegExp(`^${className} ·`) });
    expect(await tab.count(), `the teacher does not teach ${className}`).toBeGreaterThan(0);

    await tab.first().click();
    await page.getByLabel("Intitulé").fill("Contrôle refusé");
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();
    await expect(page.getByRole("alert").first()).toContainText(/bulletins de ce trimestre/i);

    await context.clearCookies();
    await signInAsAdmin(page);
    await page.getByRole("link", { name: "Bulletins" }).first().click();
    await page.waitForURL(/\/admin\/bulletins/);
    await unpublish(page, "Fin du test end-to-end.");
  });
});

test.describe("bulletins in Arabic", () => {
  test("mirrors the review screen and names the council's decisions in Arabic", async ({
    page,
  }) => {
    await signInAsAdmin(page, "ar");
    await page.getByRole("link", { name: "كشوف النقط" }).first().click();
    await page.waitForURL(/\/ar\/admin\/bulletins/);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("navigation", { name: "اختر الأسدس" })).toBeVisible();
    await expect(page.getByRole("button", { name: "نشر كشوف النقط" })).toBeVisible();

    // Not French behind an RTL layout (§16.6): the decisions are really Arabic.
    const decision = page.getByRole("combobox", { name: /^قرار المجلس بخصوص/ }).first();
    await expect(decision).toBeVisible();
    await expect(decision.getByRole("option", { name: "ناجح مع التهاني" })).toHaveCount(1);
  });
});

/**
 * Story 8.4 — the bulletin on paper.
 *
 * The exit criterion for this sprint is a sheet of A4 read by an Arabic
 * reader, and no test can stand in for that. What these tests can hold is
 * everything that would make such a sheet wrong before anyone printed it: that
 * only published bulletins reach paper, that the application's chrome does not,
 * that the sheet mirrors in Arabic, and — the one most likely to be missed —
 * that an Arabic bulletin prints the Western digits a Moroccan parent reads
 * rather than the Eastern Arabic-Indic ones ICU may hand over instead.
 *
 * `emulateMedia({ media: "print" })` is what makes these tests about paper
 * rather than about a screen: it applies the real `@media print` rules.
 */

/**
 * Publish the first class, run the body, and always take it back.
 *
 * The `finally` is the point. A test that threw while a class was published
 * would leave that term frozen for everything after it, and `grades.spec.ts`
 * would fail further down the run with an error about bulletins that reads as
 * a product bug and is not one.
 */
async function withPublishedClass(page: Page, body: () => Promise<void>) {
  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Bulletins" }).first().click();
  await page.waitForURL(/\/admin\/bulletins/);
  await page.getByRole("button", { name: "Publier les bulletins" }).click();
  await expect(page.getByText("Bulletins publiés.", { exact: false })).toBeVisible();

  try {
    await body();
  } finally {
    // Restored before the clean-up runs: a body that resized the viewport and
    // then threw would otherwise leave the unpublish button on a 360px layout.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/fr/admin/bulletins");
    await unpublish(page, "Fin du test end-to-end.");
  }
}

/** Every bulletin on the print run, as the reader meets them. */
function sheets(page: Page, name: string | RegExp = "Bulletin scolaire") {
  return page.getByRole("article", { name });
}

const ANY_SHEET = /Bulletin scolaire|كشف النقط|Report card/;

test.describe("the printed bulletin", () => {
  test("prints one sheet per published pupil, with the marks and the totals", async ({ page }) => {
    await withPublishedClass(page, async () => {
      await page.getByRole("link", { name: "Imprimer" }).click();
      await page.waitForURL(/\/admin\/bulletins\/print/);

      expect(await sheets(page).count()).toBeGreaterThan(10);

      const first = sheets(page).first();
      await expect(first.getByRole("columnheader", { name: "Matière" })).toBeVisible();
      await expect(first.getByRole("columnheader", { name: "Coef." })).toBeVisible();
      await expect(
        first.getByRole("columnheader", { name: "Appréciation du professeur" })
      ).toBeVisible();

      // What a school files the sheet by, and what makes it the school's.
      await expect(first.getByText("Code Massar", { exact: true })).toBeVisible();
      await expect(first.getByText("Groupe Scolaire Al Massira")).toBeVisible();

      // Two decimals so a column of marks aligns — 12,50 and not 12,5.
      await expect(first.getByText(/^\d{1,2},\d{2}$/).first()).toBeVisible();

      // Signed by hand, by two people. A bulletin nobody signs is a printout.
      await expect(first.getByText("Le Directeur")).toBeVisible();
      await expect(first.getByText("Signature du parent ou tuteur")).toBeVisible();
    });
  });

  test("the parent's hand-check adds up on the printed page", async ({ page }) => {
    // Points divided by coefficients must give back the general average printed
    // below them. `bulletinTotals` proves that in isolation; this proves the
    // numbers that reach paper are the ones it produced.
    await withPublishedClass(page, async () => {
      await page.goto("/fr/admin/bulletins/print");
      const first = sheets(page).first();

      const parse = (text: string) => Number.parseFloat(text.replace(",", "."));
      const cells = await first.locator("tfoot tr td").allTextContents();
      const [, coefficient, points] = cells;

      const average = await first
        .locator("dd")
        .filter({ hasText: /^\d+,\d+ \/ 20$/ })
        .first()
        .textContent();

      expect(parse((average ?? "").split("/")[0] ?? "")).toBeCloseTo(
        parse(points ?? "") / parse(coefficient ?? ""),
        1
      );
    });
  });

  test("leaves the application behind when it reaches paper", async ({ page }) => {
    await withPublishedClass(page, async () => {
      await page.goto("/fr/admin/bulletins/print");
      await expect(page.getByRole("button", { name: "Imprimer" })).toBeVisible();

      // From here the browser renders for the printer, not for the screen.
      await page.emulateMedia({ media: "print" });

      await expect(page.getByRole("button", { name: "Imprimer" })).toBeHidden();
      await expect(page.getByText("une page par élève.", { exact: false })).toBeHidden();
      // The document itself survives.
      await expect(sheets(page).first()).toBeVisible();

      await page.emulateMedia({ media: "screen" });
    });
  });

  test("refuses to print a class the council has not published", async ({ page }) => {
    // A draft looks exactly like a bulletin. The difference is that nobody has
    // agreed it, so it must never reach a printer.
    await signInAsAdmin(page);
    await page.goto("/fr/admin/bulletins/print");

    await expect(page.getByText(/Aucun bulletin publié pour cette classe/)).toBeVisible();
    await expect(sheets(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Imprimer" })).toHaveCount(0);
  });

  test("fits a 360px phone in every language", async ({ page }) => {
    await withPublishedClass(page, async () => {
      await page.setViewportSize({ width: 360, height: 740 });
      for (const locale of ["ar", "fr", "en"]) {
        await page.goto(`/${locale}/admin/bulletins/print`);
        await expect(sheets(page, ANY_SHEET).first()).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflow, `${locale} print page overflows at 360px`).toBe(false);
      }
    });
  });
});

test.describe("the printed bulletin in Arabic", () => {
  test("mirrors, is really Arabic, and uses the digits a Moroccan parent reads", async ({
    page,
  }) => {
    await withPublishedClass(page, async () => {
      await page.goto("/ar/admin/bulletins/print");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

      const first = sheets(page, "كشف النقط").first();
      await expect(first).toBeVisible();

      // Not French behind an RTL layout (§16.6) — the document is translated.
      await expect(first.getByRole("columnheader", { name: "المادة" })).toBeVisible();
      await expect(first.getByRole("columnheader", { name: "المعامل" })).toBeVisible();
      await expect(first.getByText("رمز مسار", { exact: true })).toBeVisible();
      await expect(first.getByText("توقيع ولي الأمر")).toBeVisible();
      await expect(first.getByText("مجموعة مدارس المسيرة")).toBeVisible();

      // The assertion most likely to be the one that matters: Morocco writes
      // school marks in Western digits. `١٢٫٥٠` is right in Cairo and wrong in
      // Rabat, and which one ICU hands over is not ours to assume.
      const printed = (await first.textContent()) ?? "";
      expect(printed, "Eastern Arabic-Indic digits on a Moroccan bulletin").not.toMatch(/[٠-٩]/);
      expect(printed).toMatch(/\d{1,2},\d{2}/);

      // And the date is still Arabic, rather than having followed the digits
      // into French.
      await expect(first.getByText(/حُرر في .*\d{4}/)).toBeVisible();

      // Bidi, which only shows up by looking at the sheet. Both of these were
      // real defects found by rendering the Arabic bulletin and reading it.
      //
      // "11,30 / 20" is two left-to-right numbers around a neutral slash. In an
      // RTL paragraph the slash takes the paragraph's direction and the whole
      // expression prints reversed, as "20 / 11,30" — an average out of eleven.
      const average = first.locator("dd[dir=ltr]").first();
      await expect(average).toHaveText(/^\d{1,2},\d{2} \/ \d+$/);

      // The school's Latin address inside an Arabic header was reordered the
      // same way: "12, rue Ibn Sina, Rabat" printed as "rue Ibn Sina, Rabat ,12".
      await expect(first.getByText(/^12, rue Ibn Sina/)).toHaveAttribute("dir", "auto");

      // The rank label must not repeat itself. `bulletins.rankOf` reads
      // "الرتبة {rank} من {of}" — beside this document's own label it printed
      // "الرتبة: الرتبة 20 من 23".
      const occurrences = ((await first.textContent()) ?? "").match(/الرتبة/g) ?? [];
      expect(occurrences, "the word الرتبة appears twice — label and value").toHaveLength(1);
    });
  });

  test("carries a mixed-script sheet: Arabic remarks in a French column", async ({ page }) => {
    // The seed writes Arabic appreciations for Arabe and Éducation islamique
    // and French for the rest, so every bulletin is a mixed-script document
    // (story 8.2). `dir="auto"` per cell is what makes both readable on one
    // sheet, and this is the case a single-language seed would have let ship
    // broken.
    await withPublishedClass(page, async () => {
      await page.goto("/fr/admin/bulletins/print");
      const remarks = sheets(page).first().locator("td.remark");
      const texts = (await remarks.allTextContents()).filter((text) => text.trim().length > 0);

      expect(
        texts.some((text) => /[؀-ۿ]/.test(text)),
        "no Arabic remark on the sheet"
      ).toBe(true);
      expect(
        texts.some((text) => /[A-Za-zÀ-ÿ]/.test(text)),
        "no Latin remark on the sheet"
      ).toBe(true);
      // Every remark cell decides its own direction from its own text.
      await expect(remarks.first()).toHaveAttribute("dir", "auto");

      // And an Arabic remark is marked as Arabic, which is what lets the
      // stylesheet give it the Arabic face at a size that matches the Latin
      // around it. Without this it renders in the Latin face, noticeably
      // smaller than the French remark in the row above (§9).
      await expect(remarks.filter({ hasText: /[؀-ۿ]/ }).first()).toHaveAttribute("lang", "ar");
    });
  });
});

test.describe("the printed bulletin in English", () => {
  test("is really English, and dates it the way the rest of the document does", async ({
    page,
  }) => {
    await withPublishedClass(page, async () => {
      await page.goto("/en/admin/bulletins/print");
      const first = sheets(page, "Report card").first();
      await expect(first.getByRole("columnheader", { name: "Subject" })).toBeVisible();
      await expect(first.getByText("Massar code", { exact: true })).toBeVisible();
      await expect(first.getByText("Parent or guardian signature")).toBeVisible();
      // en-GB: "15 January 2026", the order every other language here writes.
      await expect(first.getByText(/Issued on \d{1,2} \w+ \d{4}/)).toBeVisible();
    });
  });
});
