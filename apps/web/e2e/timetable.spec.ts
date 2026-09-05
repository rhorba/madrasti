import { expect, test } from "@playwright/test";

/**
 * Sprint 4: the timetable can be built, and nobody can be double-booked.
 *
 * The seed already fills every class's week, so these tests work against a
 * real grid rather than an empty one — which is also why they add lessons at
 * unusual times (17:00 onward) that the seed never uses.
 */

const ADMIN = "admin@almassira.example.ma";
const TEACHER = "prof1@almassira.example.ma";
const PASSWORD = "madrasti2026!";

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

/** Fill the add-lesson form and submit. Times are typed, not preset-picked. */
async function addLesson(
  page: import("@playwright/test").Page,
  options: { weekday: string; start: string; end: string; room?: string }
) {
  await page.getByLabel(/^jour$/i).selectOption({ label: options.weekday });
  await page.getByLabel(/^début$/i).fill(options.start);
  await page.getByLabel(/^fin$/i).fill(options.end);
  if (options.room !== undefined) await page.getByLabel(/^salle$/i).fill(options.room);
  await page.getByRole("button", { name: /^ajouter une séance$/i }).click();
}

test.describe("timetable builder", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN, "admin");
    await page.goto("/fr/admin/timetable");
  });

  test("shows the week Monday to Saturday", async ({ page }) => {
    // Saturday is a teaching day in Morocco — a five-day week would silently
    // drop a sixth of the timetable.
    for (const day of ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]) {
      await expect(page.getByRole("heading", { name: day }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Dimanche" })).toHaveCount(0);
  });

  test("the class switcher changes the grid", async ({ page }) => {
    await page.getByRole("link", { name: "2AC A" }).click();
    await expect(page).toHaveURL(/class=[0-9a-f-]{36}/);
    await expect(page.getByRole("link", { name: "2AC A" })).toHaveAttribute("aria-current", "page");
  });

  test("adds a lesson in a free period", async ({ page }) => {
    await addLesson(page, { weekday: "Vendredi", start: "17:00", end: "18:00", room: "TEST-A" });

    // Assert on the lesson itself rather than a total: the seed already fills
    // the week, so a global count is order-dependent and tells you nothing
    // about whether *this* lesson landed.
    const card = page.locator("article").filter({ hasText: "TEST-A" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("17:00");
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("ACCEPTS a back-to-back lesson", async ({ page }) => {
    // The case that matters most: 17:00–18:00 then 18:00–19:00 are adjacent,
    // not overlapping. Treating them as a clash makes a school day unbuildable.
    await addLesson(page, { weekday: "Jeudi", start: "17:00", end: "18:00", room: "ADJ-1" });
    await expect(page.getByText("ADJ-1").first()).toBeVisible();

    await addLesson(page, { weekday: "Jeudi", start: "18:00", end: "19:00", room: "ADJ-2" });
    await expect(page.getByText("ADJ-2").first()).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("REFUSES a lesson that double-books the class", async ({ page }) => {
    await addLesson(page, { weekday: "Mercredi", start: "17:00", end: "18:00", room: "CLASH-1" });
    await expect(page.getByText("CLASH-1").first()).toBeVisible();

    // Same class, overlapping time, different subject and teacher.
    const subject = page.getByLabel(/matière et enseignant/i);
    const options = await subject.locator("option").all();
    if (options.length > 1) {
      await subject.selectOption({ index: 1 });
    }
    await addLesson(page, { weekday: "Mercredi", start: "17:30", end: "18:30", room: "CLASH-2" });

    await expect(page.locator("main").getByRole("alert")).toContainText(/déjà cours/i);
  });

  test("refuses a lesson ending before it starts", async ({ page }) => {
    await addLesson(page, { weekday: "Samedi", start: "18:00", end: "17:00" });
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
  });

  test("removes a lesson", async ({ page }) => {
    await addLesson(page, { weekday: "Vendredi", start: "19:00", end: "20:00", room: "DEL-ME" });
    const card = page.locator("article").filter({ hasText: "DEL-ME" });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: /supprimer la séance/i }).click();
    await expect(page.locator("article").filter({ hasText: "DEL-ME" })).toHaveCount(0);
  });
});

test.describe("read-only timetables", () => {
  test("a teacher sees their own week", async ({ page }) => {
    await signIn(page, TEACHER, "teacher");
    await page.goto("/fr/teacher/timetable");
    await expect(page.getByRole("heading", { name: /mon emploi du temps/i })).toBeVisible();
    // The seed gives every teacher a full week.
    expect(await page.locator("article").count()).toBeGreaterThan(0);
  });

  test("a teacher's timetable carries no edit controls", async ({ page }) => {
    await signIn(page, TEACHER, "teacher");
    await page.goto("/fr/teacher/timetable");
    await expect(page.getByRole("button", { name: /supprimer la séance/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /ajouter une séance/i })).toHaveCount(0);
  });

  test("a teacher cannot reach the builder", async ({ page }) => {
    await signIn(page, TEACHER, "teacher");
    await page.goto("/fr/admin/timetable");
    await expect(page).toHaveURL(/\/fr\/teacher$/);
  });
});

test.describe("timetable is trilingual", () => {
  test("Arabic mirrors and names the days in Arabic", async ({ page }) => {
    await signIn(page, ADMIN, "admin", "fr");
    await page.goto("/ar/admin/timetable");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الاثنين" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "السبت" }).first()).toBeVisible();

    const body = await page.locator("main").innerText();
    expect(body).not.toContain("Lundi");
  });

  test("English names the days in English", async ({ page }) => {
    await signIn(page, ADMIN, "admin", "fr");
    await page.goto("/en/admin/timetable");
    await expect(page.getByRole("heading", { name: "Monday" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saturday" }).first()).toBeVisible();
  });

  test("no horizontal overflow at 360px on any shell screen", async ({ page }) => {
    // The shell header — language switcher plus sign-out — is the piece that
    // overflowed, so this covers several screens rather than one. Teachers use
    // this product on a phone; a page that scrolls sideways is not usable.
    await signIn(page, ADMIN, "admin");
    await page.setViewportSize({ width: 360, height: 740 });

    for (const locale of ["ar", "fr", "en"]) {
      for (const path of ["/admin", "/admin/timetable", "/admin/students"]) {
        await page.goto(`/${locale}${path}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflow, `${locale}${path} overflows at 360px`).toBe(false);
      }
    }
  });
});
