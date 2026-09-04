import { expect, test } from "@playwright/test";

/**
 * Sprint 3: the admin can load the school.
 *
 * The import cases carry the most weight — that path writes hundreds of
 * children's records in one action, and the client asked specifically that a
 * Massar code never be required.
 */

const ADMIN = "admin@almassira.example.ma";
const PASSWORD = "madrasti2026!";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/fr/login");
  await page.getByLabel(/e-mail/i).fill(ADMIN);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/fr\/admin$/);
}

/** Attach a CSV without touching the filesystem. */
async function uploadCsv(page: import("@playwright/test").Page, content: string) {
  await page.setInputFiles('input[type="file"]', {
    name: "students.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(content, "utf8"),
  });
}

const HEADER = "Nom,Prénom,Nom ar,Prénom ar,Date de naissance,Sexe";

test.describe("admin navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("the home screen is a setup checklist", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /configuration de l'école/i })).toBeVisible();
  });

  for (const [section, heading] of [
    ["year", /année scolaire et trimestres/i],
    ["levels", /^niveaux$/i],
    ["subjects", /^matières$/i],
    ["classes", /^classes$/i],
    ["students", /^élèves$/i],
    ["guardians", /parents et tuteurs/i],
    ["teachers", /^enseignants$/i],
    ["settings", /paramètres de l'école/i],
  ] as const) {
    test(`${section} loads`, async ({ page }) => {
      await page.goto(`/fr/admin/${section}`);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    });
  }
});

test.describe("coefficients", () => {
  test("the same subject carries different coefficients in different classes", async ({ page }) => {
    // The load-bearing property of the schema, visible in the UI: if the
    // coefficient had been modelled on the subject, both classes would show
    // the same number and every collège bulletin would be mis-weighted.
    await signInAsAdmin(page);
    await page.goto("/fr/admin/classes");

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();

    const coefficients: string[] = [];
    for (const name of ["CE1 A", "2AC A"]) {
      await page.goto("/fr/admin/classes");
      await page
        .getByRole("row", { name: new RegExp(name) })
        .getByRole("link")
        .click();
      await page.waitForURL(/\/admin\/classes\/[0-9a-f-]{36}$/);

      const maths = page.getByRole("row", { name: /Math/ });
      await expect(maths).toBeVisible();
      const value = await maths.getByLabel(/coefficient/i).inputValue();
      coefficients.push(value);
    }

    expect(coefficients[0]).not.toBe(coefficients[1]);
  });
});

test.describe("student import", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/students/import");
  });

  test("previews a clean file without writing anything", async ({ page }) => {
    await uploadCsv(page, `${HEADER}\nBenali,Karim,بنعلي,كريم,31/12/2015,M`);

    await expect(page.getByRole("heading", { name: /aperçu avant import/i })).toBeVisible();
    await expect(page.getByText(/prêts à importer/i)).toBeVisible();
    // Still on the import screen; nothing committed until confirmed.
    await expect(page.getByRole("button", { name: /importer 1 élève/i })).toBeVisible();
  });

  test("accepts a file with no Massar column at all", async ({ page }) => {
    // The client's requirement: the school may never use Massar codes.
    await uploadCsv(page, `${HEADER}\nBenali,Karim,بنعلي,كريم,31/12/2015,M`);
    await expect(page.getByText(/colonne massar/i)).toBeVisible();
    await expect(page.getByText(/^absente$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /importer 1 élève/i })).toBeEnabled();
  });

  test("accepts a Massar column left blank for some students", async ({ page }) => {
    await uploadCsv(
      page,
      `Massar,${HEADER}\nR900000001,Benali,Karim,بنعلي,كريم,31/12/2015,M\n,Idrissi,Nada,الإدريسي,ندى,15/01/2016,F`
    );
    await expect(page.getByText(/^présente$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /importer 2 élève/i })).toBeEnabled();
  });

  test("reports a bad row by line number and keeps the good ones", async ({ page }) => {
    await uploadCsv(
      page,
      `${HEADER}\nBenali,Karim,بنعلي,كريم,31/12/2015,M\nIdrissi,Nada,الإدريسي,ندى,pas une date,F`
    );
    await expect(page.getByRole("heading", { name: /lignes en erreur/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: "3", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /importer 1 élève/i })).toBeVisible();
  });

  test("refuses a file missing a required column", async ({ page }) => {
    await uploadCsv(page, "Nom,Prénom\nBenali,Karim");
    await expect(page.getByText(/colonnes obligatoires manquantes/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^importer/i })).toHaveCount(0);
  });

  test("imports for real and the students appear in the list", async ({ page }) => {
    const unique = Date.now().toString().slice(-6);
    await uploadCsv(
      page,
      `${HEADER}\nZitouni${unique},Karim,الزيتوني,كريم,31/12/2015,M\nZitouni${unique},Nada,الزيتوني,ندى,15/01/2016,F`
    );

    await page.getByRole("button", { name: /importer 2 élève/i }).click();
    await expect(page.getByText(/2 élève\(s\) importé/i)).toBeVisible();

    await page.goto(`/fr/admin/students?q=Zitouni${unique}`);
    await expect(page.getByRole("link", { name: `Karim Zitouni${unique}` })).toBeVisible();
    await expect(page.getByRole("link", { name: `Nada Zitouni${unique}` })).toBeVisible();
  });

  test("a semicolon-delimited export from a French Excel works", async ({ page }) => {
    await uploadCsv(
      page,
      "Nom;Prénom;Nom ar;Prénom ar;Date de naissance;Sexe\nSaidi,Omar;سعيدي;عمر;31/12/2015;M".replace(
        "Saidi,Omar",
        "Saidi;Omar"
      )
    );
    await expect(page.getByRole("button", { name: /importer 1 élève/i })).toBeVisible();
  });
});

test.describe("admin is trilingual", () => {
  test("the students screen is translated in Arabic and mirrors", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/ar/admin/students");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "التلاميذ", level: 1 })).toBeVisible();

    const body = await page.locator("main").innerText();
    expect(body).not.toContain("Ajouter un élève");
  });

  test("the import screen is translated in Arabic", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/ar/admin/students/import");
    await expect(page.getByRole("heading", { name: "استيراد التلاميذ", level: 1 })).toBeVisible();
    const body = await page.locator("main").innerText();
    expect(body).not.toContain("Importer des élèves");
  });
});
