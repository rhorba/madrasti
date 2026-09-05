import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * Story 9.1 — axe on every screen, in French and in Arabic.
 *
 * The gate is **zero critical or serious violations**
 * (`docs/test-strategy-madrasti.md` §7). Moderate and minor findings are
 * reported but do not fail: axe flags things like heading order that are
 * sometimes a deliberate design choice, and a gate that cries wolf gets
 * switched off.
 *
 * Every screen is checked **twice, once in `ar`**. That is not thoroughness for
 * its own sake — this sprint has already found four Arabic-only defects that
 * the French rendering could not have shown (`.logs/issues.md`), and the RTL
 * pass is where contrast, focus order and mirrored controls actually break.
 *
 * The teacher and admin screens carry most of the interaction, so most of the
 * list is theirs. Detail routes that need an id are reached by clicking rather
 * than by URL, so this file never hardcodes a seeded uuid.
 */

const PASSWORD = "madrasti2026!";
const ACCOUNTS = {
  admin: "admin@almassira.example.ma",
  teacher: "prof1@almassira.example.ma",
  parent: "parent0.lina.rami@example.ma",
  student: "eleve1@almassira.example.ma",
} as const;

async function signIn(page: Page, role: keyof typeof ACCOUNTS, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/e-mail|email|البريد/i).fill(ACCOUNTS[role]);
  await page.getByLabel(/mot de passe|password|كلمة المرور/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|sign in|دخول/i }).click();
  await page.waitForURL(new RegExp(`/${locale}/${role}$`));
}

/**
 * Run axe and fail on anything critical or serious.
 *
 * `color-contrast` is included deliberately — §12.12 requires 4.5:1, and a
 * palette that only passes in one direction is exactly what an RTL pass is for.
 */
async function expectNoSeriousViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );

  const detail = blocking
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `      ${node.html.slice(0, 160)}`)
        .join("\n");
      return `${violation.impact} · ${violation.id} · ${violation.help}\n${nodes}`;
    })
    .join("\n");

  expect(blocking, `${where}\n${detail}`).toHaveLength(0);
}

/** The first link on a list screen that points at a record, or null. */
async function firstDetailHref(page: Page, section: "classes" | "students") {
  const hrefs = await page
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return (
    hrefs.find((href) => new RegExp(`/admin/${section}/[0-9a-f]{8}-[0-9a-f]{4}-`).test(href)) ??
    null
  );
}

/** Screens reachable by URL alone, per role. */
const ROUTES: Record<keyof typeof ACCOUNTS, string[]> = {
  admin: [
    "/admin",
    "/admin/year",
    "/admin/levels",
    "/admin/classes",
    "/admin/subjects",
    "/admin/students",
    "/admin/students/import",
    "/admin/teachers",
    "/admin/guardians",
    "/admin/timetable",
    "/admin/bulletins",
    "/admin/settings",
  ],
  teacher: [
    "/teacher",
    "/teacher/attendance",
    "/teacher/grades",
    "/teacher/homework",
    "/teacher/absences",
    "/teacher/appreciations",
    "/teacher/timetable",
  ],
  parent: ["/parent", "/parent/timetable"],
  student: ["/student", "/student/record", "/student/timetable", "/student/bulletin"],
};

for (const locale of ["fr", "ar"]) {
  test.describe(`accessibility · ${locale}`, () => {
    test(`the login page is reachable to everyone (${locale})`, async ({ page }) => {
      await page.goto(`/${locale}/login`);
      await expectNoSeriousViolations(page, `${locale} /login`);
    });

    for (const role of Object.keys(ROUTES) as (keyof typeof ACCOUNTS)[]) {
      test(`${role} screens (${locale})`, async ({ page }) => {
        test.setTimeout(120_000);
        await signIn(page, role, locale);

        for (const route of ROUTES[role]) {
          await page.goto(`/${locale}${route}`);
          await expectNoSeriousViolations(page, `${locale}${route}`);
        }
      });
    }
  });
}

test.describe("accessibility · screens behind an id", () => {
  test("the admin's detail screens", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin", "fr");

    // The id comes from a link on the list rather than from a hardcoded uuid,
    // so the seed is free to change without breaking this. Taken from the href
    // rather than by clicking: the first `/admin/classes/` link on the page is
    // the nav item, not a class.
    for (const section of ["classes", "students"] as const) {
      await page.goto(`/fr/admin/${section}`);
      const href = await firstDetailHref(page, section);
      expect(href, `no ${section} detail link to follow`).not.toBeNull();
      await page.goto(href as string);
      await expectNoSeriousViolations(page, `/admin/${section}/[id]`);
    }
  });

  test("the teacher's mark sheet, where most of the typing happens", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "teacher", "ar");

    await page.goto("/ar/teacher/grades");
    const assessment = page.locator('a[href*="/teacher/grades/"]').first();
    expect(await assessment.count(), "no assessment to open").toBeGreaterThan(0);
    await assessment.click();
    await page.waitForURL(/\/teacher\/grades\/[0-9a-f-]{36}/);
    await expectNoSeriousViolations(page, "ar /teacher/grades/[id]");
  });

  test("a child's record and bulletin, for their parent", async ({ page, browser }) => {
    test.setTimeout(120_000);

    // The bulletin only exists once the school has published it.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await signIn(adminPage, "admin", "fr");
    await adminPage.goto("/fr/admin/bulletins");
    await adminPage.getByRole("button", { name: "Publier les bulletins" }).click();
    await expect(adminPage.getByText("Bulletins publiés.", { exact: false })).toBeVisible();

    try {
      await signIn(page, "parent", "ar");
      await page.goto("/ar/parent");
      const child = page.locator('a[href*="/parent/children/"]').first();
      await child.click();
      await page.waitForURL(/\/parent\/children\/[0-9a-f-]{36}/);
      await expectNoSeriousViolations(page, "ar /parent/children/[id]");

      await page.goto(`${page.url()}/bulletin`);
      await expectNoSeriousViolations(page, "ar /parent/children/[id]/bulletin");

      // And the document as the office prints it.
      await adminPage.goto("/fr/admin/bulletins/print");
      await expectNoSeriousViolations(adminPage, "/admin/bulletins/print");
    } finally {
      await adminPage.goto("/fr/admin/bulletins");
      await adminPage.getByRole("button", { name: "Dépublier", exact: true }).click();
      await adminPage.getByLabel(/motif de la dépublication/i).fill("Fin du test end-to-end.");
      await adminPage.getByRole("button", { name: "Oui, dépublier" }).click();
      await expect(adminPage.getByText("Bulletins dépubliés.", { exact: false })).toBeVisible();
      await admin.close();
    }
  });
});
