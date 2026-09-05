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
