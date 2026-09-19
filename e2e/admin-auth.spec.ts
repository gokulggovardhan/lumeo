import { expect, test } from "@playwright/test";

const adminEmail = process.env.ADMIN_E2E_EMAIL ?? "";
const adminPassword = process.env.ADMIN_E2E_PASSWORD ?? "";
const hasAdminCredentials = Boolean(adminEmail && adminPassword);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Lumeo Control Center" })).toBeVisible();
}

test.describe("Control Center authentication", () => {
  test("unauthenticated protected route redirects to the login page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Lumeo Control Center" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("login form remains usable at a narrow mobile viewport", async ({ page }) => {
    await page.goto("/admin/login");

    await expect(page.getByLabel("Email")).toHaveCSS("font-size", "16px");
    await expect(page.getByLabel("Password")).toHaveCSS("font-size", "16px");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("login, persistence, navigation, logout, back protection and re-login", async ({ page }) => {
    test.skip(!hasAdminCredentials, "Disposable local admin credentials are required for the authenticated lifecycle test.");

    await signIn(page);

    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);

    const analyticsLink = page.getByRole("link", { name: "Analytics" }).first();
    await analyticsLink.click();
    await expect(page).toHaveURL(/\/admin\/analytics/);
    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/admin\/analytics/);

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/admin\/login\?message=signed-out$/);

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);

    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
  });
});
