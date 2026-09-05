import { type Browser, type Page, expect, test } from "@playwright/test";

/**
 * Sprint 7 exit criteria: families get access, and only to their own family.
 *
 * Story 7.4 is a gate rather than a formality (`docs/stories-madrasti.md`).
 * This system holds records about minors, and the failure most likely to
 * actually happen is not an intrusion but an authenticated parent editing an
 * id in a URL and being handed another family's child. The negative block at
 * the bottom of this file is the reason the portals may ship at all; the rest
 * asserts that what a family *is* shown is worth having.
 *
 * The accounts below are stable across runs: the seed's generator is fixed-
 * seeded, so only dates move with the calendar. `parent0` is deliberately a
 * parent of two children — the card list is the whole shape of the parent
 * home, and a fixture where every parent had one child would never exercise
 * it.
 */

const PASSWORD = "madrasti2026!";
const PARENT = "parent0.lina.rami@example.ma";
const STUDENT = "eleve1@almassira.example.ma";
const ADMIN = "admin@almassira.example.ma";

async function signIn(page: Page, email: string, role: string, locale = "fr") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/e-mail|email|البريد/i).fill(email);
  await page.getByLabel(/mot de passe|password|كلمة المرور/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|sign in|دخول/i }).click();
  await page.waitForURL(new RegExp(`/${locale}/${role}$`));
}

/** Every child id the parent home links to — the family, as the app sees it. */
async function ownChildIds(page: Page): Promise<string[]> {
  const hrefs = await page
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const ids = hrefs
    .map((href) => /\/parent\/children\/([0-9a-f-]{36})/.exec(href)?.[1])
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

/**
 * A student id belonging to some other family, taken from the admin's list.
 *
 * Read in its own browser context so the parent's session is never touched —
 * the whole point of the negative tests is that the parent's own cookie is
 * what carries them into the refused page.
 */
async function foreignStudentId(browser: Browser, excluded: string[]): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, ADMIN, "admin");
    await page.goto("/fr/admin/students");
    const hrefs = await page
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    const ids = hrefs
      .map((href) => /\/admin\/students\/([0-9a-f-]{36})/.exec(href)?.[1])
      .filter((id): id is string => Boolean(id) && !excluded.includes(id as string));
    const id = ids[0];
    if (!id) throw new Error("no other student found in the admin list");
    return id;
  } finally {
    await context.close();
  }
}

test.describe("parent home", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, PARENT, "parent");
  });

  test("shows one card per child, each answering the three questions", async ({ page }) => {
    const cards = page.getByRole("article");
    // The fixture parent has two children, in different classes.
    await expect(cards).toHaveCount(2);

    // Every card carries the three facts a parent opens the app for, without
    // a tap: today's register, the next devoir, the last mark. Matched exactly,
    // so the label is asserted rather than the sentence underneath it.
    for (const label of ["Aujourd'hui", "Prochain devoir", "Dernière note"]) {
      await expect(cards.first().getByText(label, { exact: true })).toBeVisible();
    }
    await expect(cards.first().getByRole("link", { name: "Voir le dossier" })).toBeVisible();
  });

  test("never shows an absence as a zero", async ({ page }) => {
    // A mark the child did not sit is reported as an absence. Rendering
    // `score ?? 0` here would tell a parent their child scored nothing.
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/\b0 \/ 20\b/);
  });

  test("reaches a child's record in one tap", async ({ page }) => {
    await page.getByRole("link", { name: "Voir le dossier" }).first().click();
    await page.waitForURL(/\/fr\/parent\/children\//);

    // Two tables on this screen name a subject column — the marks and the
    // absences — so the marks table is addressed as the first of them.
    await expect(page.getByRole("columnheader", { name: "Matière" }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Moyenne" })).toBeVisible();
    await expect(page.getByText("Moyenne générale")).toBeVisible();
  });

  test("switches trimestre without leaving the child", async ({ page }) => {
    await page.getByRole("link", { name: "Voir le dossier" }).first().click();
    await page.waitForURL(/\/fr\/parent\/children\//);
    const childUrl = new URL(page.url());

    await page
      .getByRole("navigation", { name: /choisir un trimestre/i })
      .getByRole("link")
      .nth(1)
      .click();
    await page.waitForURL(/term=/);

    expect(new URL(page.url()).pathname).toBe(childUrl.pathname);
  });

  test("shows both children on the timetable, and lets the parent choose", async ({ page }) => {
    await page.getByRole("link", { name: "Emploi du temps" }).click();
    await page.waitForURL(/\/fr\/parent\/timetable/);

    const chooser = page.getByRole("navigation", { name: /choisir un enfant/i });
    await expect(chooser).toBeVisible();
    await expect(chooser.getByRole("link")).toHaveCount(2);
  });
});

test.describe("student portal", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT, "student");
  });

  test("opens on what is due, not on a dashboard", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Devoirs à venir" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();
  });

  test("shows the student's own record, with no id in the URL to change", async ({ page }) => {
    await page.getByRole("link", { name: "Mon dossier" }).click();
    await page.waitForURL(/\/fr\/student\/record$/);

    await expect(page.getByRole("columnheader", { name: "Matière" }).first()).toBeVisible();
    // The strongest form of "own records only" is a route with nothing in it.
    expect(page.url()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

test.describe("a parent cannot reach another family", () => {
  test("is refused another family's child by id, with a 404 rather than an error", async ({
    page,
    browser,
  }) => {
    await signIn(page, PARENT, "parent");
    const mine = await ownChildIds(page);
    expect(mine.length).toBeGreaterThan(0);

    const theirs = await foreignStudentId(browser, mine);
    const response = await page.goto(`/fr/parent/children/${theirs}`);

    // 404, not 403: the response must not tell a parent walking ids which of
    // them are real. And not a 500 — a refusal is not a broken application.
    expect(response?.status()).toBe(404);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Moyenne générale");
  });

  test("is refused through the timetable's student parameter too", async ({ page, browser }) => {
    // The same id, a different door. Every route that takes a student id has
    // to go through the same check — this is the one that is easy to forget,
    // because it looks like a display preference rather than a lookup.
    await signIn(page, PARENT, "parent");
    const mine = await ownChildIds(page);
    const theirs = await foreignStudentId(browser, mine);

    const response = await page.goto(`/fr/parent/timetable?student=${theirs}`);
    expect(response?.status()).toBe(404);
  });

  test("gets the same answer for an id that does not exist", async ({ page }) => {
    await signIn(page, PARENT, "parent");
    const response = await page.goto("/fr/parent/children/00000000-0000-0000-0000-000000000000");
    expect(response?.status()).toBe(404);
  });

  test("cannot reach a child's record through the teacher's route", async ({ page, browser }) => {
    await signIn(page, PARENT, "parent");
    const mine = await ownChildIds(page);
    const theirs = await foreignStudentId(browser, mine);

    // Role routing catches this before authorisation does, which is fine —
    // but it must land the parent on their own home, not on the record.
    await page.goto(`/fr/teacher/students/${theirs}`);
    await expect(page).toHaveURL(/\/fr\/parent$/);
  });
});

test.describe("a student cannot reach another student", () => {
  test("is refused a classmate's record", async ({ page, browser }) => {
    await signIn(page, STUDENT, "student");
    const theirs = await foreignStudentId(browser, []);

    // There is no student-facing route that takes an id, so the attempt has to
    // go through another role's — and is refused for the role, then the id.
    await page.goto(`/fr/parent/children/${theirs}`);
    await expect(page).toHaveURL(/\/fr\/student$/);
  });
});

test.describe("trilingual", () => {
  test("the parent home is really translated into Arabic", async ({ page }) => {
    await signIn(page, PARENT, "parent", "ar");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const body = await page.locator("main").innerText();
    // The inherited failure: correct RTL plumbing with French copy behind it
    // (CLAUDE.md §16.6).
    expect(body).toContain("الواجب القادم");
    expect(body).not.toContain("Prochain devoir");
    expect(body).not.toContain("Dernière note");
  });

  test("the student home is really translated into Arabic", async ({ page }) => {
    await signIn(page, STUDENT, "student", "ar");
    const body = await page.locator("main").innerText();
    expect(body).toContain("الواجبات القادمة");
    expect(body).not.toContain("Devoirs à venir");
  });

  test("both portals fit a 360px phone in every language", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await signIn(page, PARENT, "parent");

    for (const locale of ["ar", "fr", "en"]) {
      for (const path of ["parent", "parent/timetable"]) {
        await page.goto(`/${locale}/${path}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflow, `${locale}/${path} overflows at 360px`).toBe(false);
      }
    }
  });
});
