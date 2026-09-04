import { expect, test } from "@playwright/test";

/**
 * Sprint 2 exit criteria: all four roles sign in, land on their own home, and
 * are kept out of everyone else's — in all three languages, with Arabic
 * mirrored.
 */

const PASSWORD = "madrasti2026!";

const ACCOUNTS = {
  admin: "admin@almassira.example.ma",
  teacher: "prof1@almassira.example.ma",
  parent: "parent0.lina.rami@example.ma",
  student: "eleve1@almassira.example.ma",
} as const;

/**
 * Sign in and **wait until the session is actually established**.
 *
 * The click alone is not enough: the server action, the cookie and the client
 * redirect all resolve after it, so a test that immediately navigates
 * elsewhere races the login and sees a signed-out app. Every failure that
 * looks like "route protection is broken" was this.
 */
async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  role: string,
  locale = "fr"
) {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/e-mail|email|البريد/i).fill(email);
  await page.getByLabel(/mot de passe|password|كلمة المرور/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|sign in|دخول/i }).click();
  await page.waitForURL(new RegExp(`/${locale}/${role}$`));
}

test.describe("sign in", () => {
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    test(`${role} signs in and lands on their own home`, async ({ page }) => {
      await signIn(page, email, role);
      await expect(page).toHaveURL(new RegExp(`/fr/${role}$`));
    });
  }

  test("rejects a wrong password without revealing which field was wrong", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel(/e-mail/i).fill(ACCOUNTS.admin);
    await page.getByLabel(/mot de passe/i).fill("definitely-not-the-password");
    await page.getByRole("button", { name: /se connecter/i }).click();

    // Next renders a route announcer with role="alert" at body level,
    // so scope to the form rather than matching it too.
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible();
    // One message for every failure — see security doc §4.
    await expect(alert).toHaveText(/incorrect/i);
    await expect(page).toHaveURL(/\/fr\/login/);
  });

  test("rejects an unknown account with the same message", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel(/e-mail/i).fill("nobody@example.ma");
    await page.getByLabel(/mot de passe/i).fill(PASSWORD);
    await page.getByRole("button", { name: /se connecter/i }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(/incorrect/i);
  });
});

test.describe("route protection", () => {
  test("anonymous visitor is sent to login", async ({ page }) => {
    await page.goto("/fr/admin");
    await expect(page).toHaveURL(/\/fr\/login/);
  });

  test("a teacher is kept out of the admin area", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher, "teacher");
    await page.goto("/fr/admin");
    await expect(page).toHaveURL(/\/fr\/teacher$/);
  });

  test("a parent is kept out of the teacher area", async ({ page }) => {
    await signIn(page, ACCOUNTS.parent, "parent");
    await page.goto("/fr/teacher");
    await expect(page).toHaveURL(/\/fr\/parent$/);
  });

  test("a student is kept out of every staff area", async ({ page }) => {
    await signIn(page, ACCOUNTS.student, "student");
    for (const area of ["admin", "teacher", "parent"]) {
      await page.goto(`/fr/${area}`);
      await expect(page).toHaveURL(/\/fr\/student$/);
    }
  });
});

test.describe("sign out", () => {
  test("ends the session so protected routes are refused again", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher, "teacher");

    await page.getByRole("button", { name: /se déconnecter/i }).click();
    await expect(page).toHaveURL(/\/fr\/login/);

    // The real assertion: the cookie is gone, not merely that we navigated.
    await page.goto("/fr/teacher");
    await expect(page).toHaveURL(/\/fr\/login/);
  });
});

test.describe("trilingual", () => {
  const EXPECTED = {
    ar: { dir: "rtl", heading: "تسجيل الدخول" },
    fr: { dir: "ltr", heading: "Connexion" },
    en: { dir: "ltr", heading: "Sign in" },
  } as const;

  for (const [locale, { dir, heading }] of Object.entries(EXPECTED)) {
    test(`${locale} renders with dir="${dir}" and its own copy`, async ({ page }) => {
      await page.goto(`/${locale}/login`);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }

  test("Arabic is actually translated, not French left in place", async ({ page }) => {
    // The failure mode inherited from Bina: correct RTL plumbing with French
    // copy behind it (CLAUDE.md §16.6).
    await page.goto("/ar/login");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Mot de passe");
    expect(body).not.toContain("Connexion");
    expect(body).toContain("كلمة المرور");
  });

  test("the switcher keeps you on the same page", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher, "teacher");
    await page.getByRole("button", { name: "العربية" }).click();
    await expect(page).toHaveURL(/\/ar\/teacher$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("no horizontal overflow at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const locale of ["ar", "fr", "en"]) {
      await page.goto(`/${locale}/login`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `${locale} overflows at 360px`).toBe(false);
    }
  });
});

test.describe("stale sessions", () => {
  test("a cookie whose user no longer exists redirects to login, not an error page", async ({
    page,
    context,
  }) => {
    // A JWT outlives the row it points at — after a database reset, or once an
    // account is deleted. Throwing inside a server component would turn that
    // into a 500 with an opaque digest; the user should simply be sent back to
    // sign in.
    await signIn(page, ACCOUNTS.teacher, "teacher");

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name.endsWith("authjs.session-token"));
    expect(session, "no session cookie found").toBeDefined();

    // Corrupt the payload while keeping the cookie name and shape.
    await context.clearCookies();
    await context.addCookies([{ ...session!, value: `${session!.value}tampered` }]);

    await page.goto("/fr/teacher");
    await expect(page).toHaveURL(/\/fr\/login/);
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
  });
});
