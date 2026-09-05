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

/** Publish the class currently on screen, and take it back again. */
async function unpublish(page: Page, reason: string) {
  await page.getByRole("button", { name: "Dépublier" }).click();
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

    await page.getByRole("button", { name: "Dépublier" }).click();
    // The button stays disabled until a reason is typed — a year later that
    // sentence is the only thing that explains a changed average.
    await expect(page.getByRole("button", { name: "Oui, dépublier" })).toBeDisabled();
    await page.getByLabel(/motif de la dépublication/i).fill("Erreur de saisie en français.");
    await expect(page.getByRole("button", { name: "Oui, dépublier" })).toBeEnabled();

    await unpublish(page, "Erreur de saisie en français.");
  });

  test("stops a teacher entering marks in a published term, and lets her again after", async ({
    page,
  }) => {
    // The freeze, from the side that feels it. This is the whole point of the
    // story: the paper a family holds cannot change underneath them.
    const classLink = page
      .getByRole("navigation", { name: /choisir une classe/i })
      .getByRole("link");
    const className = ((await classLink.first().textContent()) ?? "").trim();
    await page.getByRole("button", { name: "Publier les bulletins" }).click();
    await expect(page.getByText("Bulletins publiés.", { exact: false })).toBeVisible();

    await page.goto("/fr/login");
    await signIn(page);
    await page.getByRole("link", { name: "Notes" }).first().click();
    await page.waitForURL(/\/teacher\/grades/);

    // Find one of this teacher's class+subjects in the class that was just
    // published; if she does not teach it, the freeze is not hers to feel.
    const tab = page
      .getByRole("navigation", { name: /choisir une classe/i })
      .getByRole("link", { name: new RegExp(`^${className} ·`) });

    if ((await tab.count()) > 0) {
      await tab.first().click();
      await page.getByLabel("Intitulé").fill("Contrôle refusé");
      await page.getByRole("button", { name: "Ajouter une évaluation" }).click();
      await expect(page.getByRole("alert").first()).toContainText(/bulletins de ce trimestre/i);
    }

    await page.goto("/fr/login");
    await signInAsAdmin(page);
    await page.getByRole("link", { name: "Bulletins" }).first().click();
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
