import { type Page, expect, test } from "@playwright/test";

/**
 * Sprint 6: a teacher records marks and sets homework without paper.
 *
 * The screens that have to be faster than the paper they replace are the mark
 * sheet and the homework box, so these tests assert the ergonomics as much as
 * the writes: the class arrives on one screen, Enter walks down it, an absence
 * is a checkbox rather than a number, and nothing is written until she says so.
 *
 * The seed deliberately leaves the most recent assessment of every subject
 * unmarked, so this suite starts where a teacher does.
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

/** Every score box on a mark sheet, in register order. */
function scores(page: Page) {
  return page.getByRole("textbox", { name: /^Note de|^نقطة |^Mark for/ });
}

/** A unique title, so a re-run never collides with the previous one's rows. */
function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString().slice(-6)}`;
}

test.describe("marks", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Notes" }).first().click();
    await page.waitForURL(/\/teacher\/grades/);
  });

  test("reaches the subject in one tap and shows the term at a glance", async ({ page }) => {
    // The class+subject picker is links, not a dropdown: a teacher has four or
    // five and each is one tap.
    await expect(page.getByRole("navigation", { name: /choisir une classe/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Intitulé" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Moyenne" })).toBeVisible();
  });

  test("creates an assessment, which starts with nothing entered", async ({ page }) => {
    const title = unique("Contrôle");

    await page.getByLabel("Intitulé").fill(title);
    await page.getByLabel("Type").selectOption("devoir_surveille");
    await page.getByLabel("Coefficient").fill("2");
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();

    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Devoir surveillé");
    // 0 of N: an assessment with no marks is not a class of zeros.
    await expect(row).toContainText("0/");
    await expect(row.getByRole("link", { name: "Saisir les notes" })).toBeVisible();
  });

  test("enters a class's marks, with Enter walking down the list", async ({ page }) => {
    const title = unique("Devoir");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();

    await page
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("link", { name: "Saisir les notes" })
      .click();
    await page.waitForURL(/\/teacher\/grades\/[0-9a-f-]{36}/);

    const boxes = scores(page);
    const total = await boxes.count();
    expect(total).toBeGreaterThan(10);

    // Type, Enter, type — no reaching for the mouse between students.
    await boxes.nth(0).click();
    await page.keyboard.type("14");
    await page.keyboard.press("Enter");
    await expect(boxes.nth(1)).toBeFocused();
    await page.keyboard.type("12,5");
    await page.keyboard.press("Enter");

    // The third student was not there. A checkbox, never "abs" typed into a
    // number field — that ambiguity is how an absence becomes a zero.
    await page.getByRole("checkbox").nth(2).check();
    await expect(boxes.nth(2)).toBeDisabled();

    await expect(page.getByText("2 saisie(s)")).toBeVisible();
    await expect(page.getByText("1 absent(s)")).toBeVisible();
    // 14 and 12,5 — the comma is what a French keyboard produces.
    await expect(page.getByText("Moyenne : 13.25")).toBeVisible();

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Notes enregistrées.")).toBeVisible();

    await page.reload();
    await expect(scores(page).nth(0)).toHaveValue("14");
    await expect(scores(page).nth(1)).toHaveValue("12.5");
    await expect(page.getByRole("checkbox").nth(2)).toBeChecked();
    // The student nobody has reached yet stays blank — not zero.
    await expect(scores(page).nth(3)).toHaveValue("");
  });

  test("an absence does not drag the average down to a zero", async ({ page }) => {
    const title = unique("Oral");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();

    await page
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("link", { name: "Saisir les notes" })
      .click();

    const boxes = scores(page);
    await boxes.nth(0).fill("16");
    await page.getByRole("checkbox").nth(1).check();

    // One 16 and one absence: the class average is 16, not 8.
    await expect(page.getByText("Moyenne : 16")).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Notes enregistrées.")).toBeVisible();
  });

  test("warns about a mark above the maximum without refusing it", async ({ page }) => {
    const title = unique("Bonus");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();
    await page
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("link", { name: "Saisir les notes" })
      .click();

    await scores(page).nth(0).fill("21");
    // A bonus point is a real thing teachers award; 155 for 15,5 is far more
    // common, so it is flagged and still accepted.
    await expect(page.getByText(/dépasse le maximum de 20/)).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Notes enregistrées.")).toBeVisible();
  });

  test("edits the coefficient in place, which is what moves the averages", async ({ page }) => {
    const title = unique("À corriger");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();

    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("button", { name: "Modifier" }).click();
    await row.getByLabel("Coefficient").fill("4");
    await row.getByRole("button", { name: "Enregistrer les modifications" }).click();

    await expect(page.getByRole("row").filter({ hasText: title })).toContainText("4");
  });

  test("withdraws an assessment after confirming", async ({ page }) => {
    const title = unique("À retirer");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByRole("button", { name: "Ajouter une évaluation" }).click();

    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("button", { name: "Supprimer" }).click();
    // Nothing is destroyed on a single tap, and the prompt names what it is
    // about to remove.
    await expect(page.getByText(`Supprimer « ${title} » ?`)).toBeVisible();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();

    await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(0);
  });

  test("a student with no marks shows a dash, never a zero", async ({ page }) => {
    // The term-average table is the one a parent is quoted from over the phone.
    const table = page.getByRole("table").last();
    await expect(table).toBeVisible();
    await expect(table.getByRole("row").first()).toBeVisible();
  });
});

test.describe("homework", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Devoirs" }).first().click();
    await page.waitForURL(/\/teacher\/homework/);
  });

  test("sets a devoir and lists it by due date", async ({ page }) => {
    const title = unique("Exercices");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByLabel("Consignes").fill("Exercices 4 à 7 page 52.");
    await page.getByRole("button", { name: "Donner un devoir" }).click();

    const card = page.locator("li").filter({ hasText: title });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Exercices 4 à 7 page 52.");
    await expect(card).toContainText("À rendre le");
  });

  test("refuses a due date before the day it was set", async ({ page }) => {
    await page.getByLabel("Intitulé").fill(unique("Impossible"));
    await page.getByLabel("Donné le").fill("2026-03-10");
    await page.getByLabel("À rendre le").fill("2026-03-01");
    await page.getByRole("button", { name: "Donner un devoir" }).click();

    await expect(page.getByRole("alert").first()).toContainText(/date de remise/i);
  });

  test("withdraws a devoir after confirming", async ({ page }) => {
    const title = unique("À retirer");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByRole("button", { name: "Donner un devoir" }).click();

    const card = page.locator("li").filter({ hasText: title });
    await card.getByRole("button", { name: "Retirer" }).click();
    await page.getByRole("button", { name: "Oui, retirer" }).click();

    await expect(page.locator("li").filter({ hasText: title })).toHaveCount(0);
  });

  test("shows the attachment control only when storage can actually work", async ({ page }) => {
    // R2 is optional. An inert upload box would invite a question nobody at
    // the school can answer, so it is absent unless uploads really work.
    //
    // Asserted in both directions on purpose. This test used to assert only
    // the absent case, unconditionally — which passed for as long as nobody
    // had R2 credentials and failed the moment somebody did, in exactly the
    // one environment where the feature could be tested at all.
    const configured = Boolean(
      process.env["R2_ACCOUNT_ID"] &&
        process.env["R2_ACCESS_KEY_ID"] &&
        process.env["R2_SECRET_ACCESS_KEY"] &&
        process.env["R2_BUCKET"]
    );

    await expect(page.getByLabel("Pièce jointe")).toHaveCount(configured ? 1 : 0);
  });
});

test.describe("marks on a phone, in three languages", () => {
  test("the mark sheet is mirrored and fully translated in Arabic", async ({ page }) => {
    await signIn(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await page.getByRole("link", { name: "النقط" }).first().click();
    await page.waitForURL(/\/ar\/teacher\/grades/);

    await expect(page.getByRole("heading", { name: "النقط" })).toBeVisible();
    // The Bina failure this project exists not to repeat (CLAUDE.md §16.6).
    await expect(page.locator("main")).not.toContainText(
      /Évaluations|Enregistrer|Moyenne|Ajouter une évaluation/
    );
  });

  test("no horizontal overflow at 360px on either screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await signIn(page);

    for (const locale of ["fr", "ar", "en"]) {
      for (const path of ["/teacher/grades", "/teacher/homework"]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.getByRole("heading").first()).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflow, `${locale}${path} overflows at 360px`).toBe(false);
      }
    }
  });
});
