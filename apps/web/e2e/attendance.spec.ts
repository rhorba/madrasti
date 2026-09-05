import { type Page, expect, test } from "@playwright/test";

/**
 * Sprint 5 exit criteria: a teacher signs in and marks a class, fast, on a
 * phone, in three languages.
 *
 * The register is the screen the product lives or dies on — if a teacher
 * cannot mark thirty students between two lessons she keeps the paper one and
 * nothing else here matters (`docs/ux-madrasti.md` §1). These tests therefore
 * assert the *ergonomics* as much as the writes: how many taps it takes, that
 * everyone starts present, that a dropped connection does not cost her the
 * marks she has already entered.
 *
 * The seed leaves today's registers untaken on purpose, so this suite works
 * against the same starting state a teacher sees when she opens the app.
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

/** Every row of the register, as the buttons a teacher actually taps. */
function rows(page: Page) {
  return page.getByRole("button", { name: /appuyez pour changer|اضغط للتغيير|tap to change/i });
}

/**
 * Open today's first lesson from the teacher's home, the way she would.
 *
 * Returns the register URL so a test can re-open the same lesson on another
 * date — each test needs its own, or it inherits the previous one's marks.
 */
async function openTodaysRegister(page: Page): Promise<URL> {
  const lesson = page.getByRole("link", { name: /faire l'appel|corriger/i }).first();
  // The seed gives every teacher lessons Monday to Saturday, so an empty day
  // means the suite is being run on a Sunday.
  test.skip((await lesson.count()) === 0, "no lessons today — the suite is running on a Sunday");

  await lesson.click();
  await page.waitForURL(/\/teacher\/attendance\?slot=/);
  return new URL(page.url());
}

/** The same lesson, `weeks` weeks later — a date with no register yet. */
async function openLater(page: Page, register: URL, weeks: number) {
  const url = new URL(register.toString());
  const date = new Date(`${url.searchParams.get("date")}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  url.searchParams.set("date", date.toISOString().slice(0, 10));
  await page.goto(url.pathname + url.search);
  await expect(rows(page).first()).toBeVisible();
}

test.describe("taking the register", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("is two taps from the teacher's home, and everyone starts present", async ({ page }) => {
    // Tap 1: the lesson. The teacher never picks a class and a subject from a
    // dropdown — the app already knows what she is teaching (CLAUDE.md §3.A).
    await openTodaysRegister(page);

    const students = rows(page);
    expect(await students.count()).toBeGreaterThan(10);

    // Present by default is the whole speed argument: a full class is one tap.
    for (const label of await students.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    )) {
      expect(label).toMatch(/actuellement Présent/);
    }

    // Tap 2: the one student who is not here. Three taps from login, spent.
    await students.first().click();
    await expect(students.first()).toHaveAttribute("aria-label", /actuellement Absent/);
  });

  test("cycles a row through the four states and back", async ({ page }) => {
    const register = await openTodaysRegister(page);
    await openLater(page, register, 5);
    const row = rows(page).first();

    for (const status of ["Absent", "Retard", "Excusé", "Présent"]) {
      await row.click();
      await expect(row).toHaveAttribute("aria-label", new RegExp(`actuellement ${status}`));
    }
  });

  test("saves the class, and reopens showing what was recorded", async ({ page }) => {
    const register = await openTodaysRegister(page);
    await openLater(page, register, 6);
    const students = rows(page);

    await students.nth(0).click(); // absent
    await students.nth(1).click();
    await students.nth(1).click(); // late

    // Minutes are optional and only offered for a late arrival.
    await page.getByLabel("Minutes de retard").fill("10");

    // The running tally lets her sanity-check against the room before saving.
    await expect(page.getByText("✗ 1")).toBeVisible();
    await expect(page.getByText("◷ 1")).toBeVisible();

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appel enregistré.")).toBeVisible();

    await page.reload();
    await expect(page.getByText(/L'appel a déjà été fait/)).toBeVisible();
    await expect(rows(page).nth(0)).toHaveAttribute("aria-label", /actuellement Absent/);
    await expect(rows(page).nth(1)).toHaveAttribute("aria-label", /actuellement Retard/);
    await expect(page.getByLabel("Minutes de retard")).toHaveValue("10");
  });

  test("a correction takes the same path as the original", async ({ page }) => {
    const register = await openTodaysRegister(page);
    await openLater(page, register, 7);

    await rows(page).first().click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appel enregistré.")).toBeVisible();

    // The mis-tap, fixed. Same screen, same button — no separate edit mode.
    await page.reload();
    const row = rows(page).first();
    await row.click(); // absent -> late
    await row.click(); // late -> excused
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appel enregistré.")).toBeVisible();

    await page.reload();
    await expect(rows(page).first()).toHaveAttribute("aria-label", /actuellement Excusé/);
  });

  test("a dropped connection keeps every mark on screen", async ({ page }) => {
    const register = await openTodaysRegister(page);
    await openLater(page, register, 8);

    await rows(page).first().click();
    await expect(rows(page).first()).toHaveAttribute("aria-label", /actuellement Absent/);

    // School wifi. Re-entering thirty marks is how you lose a teacher for
    // good, so the failure must be visible and the marks must survive it.
    await page.route(
      (url) => url.pathname.includes("/teacher/attendance"),
      (route) => (route.request().method() === "POST" ? route.abort() : route.continue())
    );

    await page.getByRole("button", { name: "Enregistrer" }).click();
    // Scoped to `main`: Next's own route announcer is also role="alert".
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Vos saisies sont conservées."
    );
    await expect(rows(page).first()).toHaveAttribute("aria-label", /actuellement Absent/);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByText("Appel enregistré.")).toBeVisible();
  });

  test("marking a whole class costs nothing until she saves", async ({ page }) => {
    const register = await openTodaysRegister(page);
    await openLater(page, register, 9);

    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });

    const students = rows(page);
    const total = await students.count();
    const started = Date.now();
    for (let i = 0; i < total; i++) await students.nth(i).click();
    const marking = Date.now() - started;

    // Cycling is pure client state. On school wifi a per-tap write would spend
    // the entire fifteen-second budget before she reached the door, so the
    // register must not touch the network until she says so.
    expect(posts, "marking a student hit the network").toHaveLength(0);

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Appel enregistré.")).toBeVisible();

    // One round trip for the whole class, not one per student.
    expect(posts).toHaveLength(1);
    console.log(`  ${total} students marked in ${marking}ms of taps, saved in one request`);
  });

  test("absence totals reach the class list", async ({ page }) => {
    await page.getByRole("link", { name: "Absences" }).first().click();
    await page.waitForURL(/\/teacher\/absences/);

    await expect(page.getByRole("columnheader", { name: "Absences" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Retards" })).toBeVisible();
    // Three weeks of seeded marks sit behind this — the table is never blank.
    expect(await page.getByRole("row").count()).toBeGreaterThan(5);
  });
});

test.describe("the register on a phone, in three languages", () => {
  test("is mirrored and fully translated in Arabic", async ({ page }) => {
    await signIn(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const lesson = page.getByRole("link", { name: /تسجيل الحضور|تصحيح/ }).first();
    test.skip((await lesson.count()) === 0, "no lessons today — the suite is running on a Sunday");
    await lesson.click();
    await page.waitForURL(/\/teacher\/attendance\?slot=/);

    await expect(rows(page).first()).toHaveAttribute("aria-label", /الحالة الآن حاضر/);
    await expect(page.getByRole("button", { name: "حفظ" })).toBeVisible();

    // The Bina failure this project exists not to repeat: a correctly mirrored
    // layout with French copy still sitting behind it (CLAUDE.md §16.6).
    await expect(page.locator("main")).not.toContainText(/Présent|Enregistrer|Retard|Excusé/);
  });

  test("has thumb-sized rows and no overflow at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await signIn(page);
    const register = await openTodaysRegister(page);

    for (const locale of ["fr", "ar", "en"]) {
      await page.goto(
        `/${locale}${register.pathname.replace(/^\/[a-z]{2}/, "")}${register.search}`
      );
      await expect(rows(page).first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `${locale} overflows at 360px`).toBe(false);

      // The whole row is the target, and a thumb needs 44px of it.
      const box = await rows(page).first().boundingBox();
      expect(box?.height ?? 0, `${locale} rows are too small to tap`).toBeGreaterThanOrEqual(44);
    }
  });
});
