import { type Page, expect, test } from "@playwright/test";

/**
 * The walkthrough — CTS rule 9, story 9.7.
 *
 * Recorded against whatever `WALKTHROUGH_BASE` points at, which is the **live
 * deployment** by default, so what the film shows is the product as it actually
 * runs and not a laptop pretending. It follows the order the school will meet
 * it in: a teacher takes a register, enters marks and sets homework; the head
 * publishes the trimestre; a family reads the bulletin it was given.
 *
 * It reads deliberately slowly. This is meant to be watched by someone who has
 * never seen the product, so each screen is given a beat to be understood
 * rather than being driven at the speed a test would run.
 *
 * Run it with:
 *   npx playwright test walkthrough --config=playwright.walkthrough.config.ts
 */

const PASSWORD = "madrasti2026!";
const ACCOUNTS = {
  admin: "admin@almassira.example.ma",
  teacher: "prof1@almassira.example.ma",
  parent: "parent0.lina.rami@example.ma",
};

/** A beat, so a viewer can read the screen before it changes. */
async function beat(page: Page, ms = 1600) {
  await page.waitForTimeout(ms);
}

async function signIn(page: Page, role: keyof typeof ACCOUNTS, locale = "fr") {
  await page.goto(`/${locale}/login`);
  await beat(page, 1200);
  await page.getByLabel(/e-mail|email|البريد/i).fill(ACCOUNTS[role]);
  await page.getByLabel(/mot de passe|password|كلمة المرور/i).fill(PASSWORD);
  await beat(page, 800);
  await page.getByRole("button", { name: /se connecter|sign in|دخول/i }).click();
  await page.waitForURL(new RegExp(`/${locale}/${role === "admin" ? "admin" : role}$`), {
    timeout: 45_000,
  });
  await beat(page);
}

test.describe.configure({ mode: "serial" });

test("1 · a teacher signs in and sees what she is teaching", async ({ page }) => {
  await signIn(page, "teacher");
  // The teacher's home is "what am I teaching right now", not a dashboard
  // (CLAUDE.md §10.1).
  await expect(page.getByRole("heading").first()).toBeVisible();
  await beat(page, 2500);
});

test("2 · she takes the register", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/fr/teacher/attendance");
  await beat(page, 2000);

  // Everyone is present by default; only the exceptions are touched, which is
  // what makes a class of thirty markable in seconds (§3A).
  const absent = page.getByRole("button", { name: /absent/i });
  if ((await absent.count()) > 2) {
    await absent.nth(1).click();
    await beat(page, 900);
    await absent.nth(4).click();
    await beat(page, 1400);
  }
  await beat(page, 1800);
});

test("3 · she enters marks, and the absent are not given a zero", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/fr/teacher/grades");
  await beat(page, 2200);

  const assessment = page.locator('a[href*="/teacher/grades/"]').first();
  if ((await assessment.count()) > 0) {
    await assessment.click();
    await page.waitForURL(/\/teacher\/grades\/[0-9a-f-]{36}/, { timeout: 30_000 });
    // A flat list of the class — enter, tab, next. Never one pupil per page.
    await beat(page, 3000);
  }
});

test("4 · she sets homework", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/fr/teacher/homework");
  await beat(page, 3000);
});

test("5 · the head publishes the trimestre", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/fr/admin/bulletins");
  await beat(page, 2500);

  // Averages, ranks and absences for the whole class, then one button turns it
  // into documents a family holds.
  const publish = page.getByRole("button", { name: "Publier les bulletins" });
  if ((await publish.count()) > 0) {
    await publish.click();
    await expect(page.getByText("Bulletins publiés.", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await beat(page, 2200);
  }
});

test("6 · the bulletin, on A4, in French and in Arabic", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/fr/admin/bulletins/print");
  await beat(page, 3200);
  await page.mouse.wheel(0, 600);
  await beat(page, 2400);

  // The same document, mirrored. This is the sprint's whole point.
  await page.goto("/ar/admin/bulletins/print");
  await beat(page, 3600);
  await page.mouse.wheel(0, 600);
  await beat(page, 2600);
});

test("7 · a parent reads their child's report card", async ({ page }) => {
  await signIn(page, "parent");
  await beat(page, 2000);

  const child = page.locator('a[href*="/parent/children/"]').first();
  if ((await child.count()) > 0) {
    await child.click();
    await page.waitForURL(/\/parent\/children\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await beat(page, 2000);

    const bulletin = page.getByRole("link", { name: "Bulletin" });
    if ((await bulletin.count()) > 0) {
      await bulletin.click();
      await beat(page, 3600);
    }
  }
});

test("8 · the same portal in Arabic, which is the first language here", async ({ page }) => {
  await signIn(page, "parent", "ar");
  await beat(page, 3000);
  await page.goto("/ar/parent/timetable");
  await beat(page, 3000);
});

test("9 · and the school is put back as it was found", async ({ page }) => {
  // The walkthrough publishes a real class on a live deployment, so it takes
  // it back again — the demo should not be left in a state the next viewer has
  // to undo.
  await signIn(page, "admin");
  await page.goto("/fr/admin/bulletins");
  const unpublish = page.getByRole("button", { name: "Dépublier", exact: true });
  if ((await unpublish.count()) > 0) {
    await unpublish.click();
    await page.getByLabel(/motif de la dépublication/i).fill("Fin de la démonstration.");
    await page.getByRole("button", { name: "Oui, dépublier" }).click();
    await expect(page.getByText("Bulletins dépubliés.", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
  }
  await beat(page, 1200);
});
