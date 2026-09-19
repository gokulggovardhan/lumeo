import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.ADMIN_E2E_EMAIL ?? "";
const adminPassword = process.env.ADMIN_E2E_PASSWORD ?? "";
const hasAdminCredentials = Boolean(adminEmail && adminPassword);

async function signIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Lumeo Control Center" })).toBeVisible();
}

function collectUnexpectedBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error: ${message.text()}`);
    }
  });

  return errors;
}

async function getAdminSessionState(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/admin/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    return (await response.json()) as {
      authenticated: boolean;
      authorized: boolean;
    };
  });
}

async function openMobileNavigation(page: Page) {
  const openButton = page.getByRole("button", {
    name: "Open Control Center navigation",
  });
  await expect(openButton).toBeVisible();
  await expect(openButton).toHaveAttribute("aria-expanded", "false");
  await openButton.click();

  const closeButton = page.getByRole("button", {
    name: "Close Control Center navigation",
  });
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("navigation", {
      name: "Mobile Control Center navigation",
    }),
  ).toBeVisible();

  return closeButton;
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

  test("login, persistence, navigation, realtime, logout, back protection and re-login", async ({ page }) => {
    expect(
      hasAdminCredentials,
      "Disposable local admin credentials are required for the authenticated lifecycle test.",
    ).toBe(true);

    const browserErrors = collectUnexpectedBrowserErrors(page);

    await signIn(page);

    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);

    await openMobileNavigation(page);
    await page.keyboard.press("Escape");
    const reopenedButton = page.getByRole("button", {
      name: "Open Control Center navigation",
    });
    await expect(reopenedButton).toBeVisible();
    await expect(reopenedButton).toHaveAttribute("aria-expanded", "false");
    await expect(reopenedButton).toBeFocused();

    await openMobileNavigation(page);
    const mobileNavigation = page.getByRole("navigation", {
      name: "Mobile Control Center navigation",
    });
    await mobileNavigation.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics/);
    await expect(
      page.getByRole("heading", {
        name: "Discovery & operation analytics",
        exact: true,
      }),
    ).toBeVisible();

    const rangeSelect = page.getByLabel("Range");
    await expect(rangeSelect).toHaveCSS("font-size", "16px");
    await rangeSelect.selectOption("30d");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\?range=30d/);
    await expect(page.getByText("Selected: Last 30 days")).toBeVisible();

    const adminOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(adminOverflow).toBe(false);

    await page.reload();
    await expect(page).toHaveURL(/\/admin\/analytics\?range=30d/);

    await openMobileNavigation(page);
    await page
      .getByRole("navigation", { name: "Mobile Control Center navigation" })
      .getByRole("link", { name: "Inbox" })
      .click();
    await expect(page).toHaveURL(/\/admin\/inbox/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/admin\/inbox/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

    await openMobileNavigation(page);
    const protectedOrigin = new URL(page.url()).origin;
    await page
      .locator("#control-center-mobile-menu")
      .getByRole("button", { name: "Sign out" })
      .click();
    await expect(page).toHaveURL(/\/admin\/login\?message=signed-out$/);
    expect(new URL(page.url()).origin).toBe(protectedOrigin);

    expect(await getAdminSessionState(page)).toEqual({
      authenticated: false,
      authorized: false,
    });

    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toHaveCount(0);

    expect(await getAdminSessionState(page)).toEqual({
      authenticated: false,
      authorized: false,
    });

    // Go back through another protected history entry. The BFCache/history
    // guard must again fail closed instead of revealing stale admin UI.
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);

    // Forward navigation must also remain in signed-out state.
    await page.goForward();
    await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);

    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("button", { name: "Open Control Center navigation" }),
    ).toBeVisible();

    expect(
      browserErrors,
      `Unexpected browser errors:\n${browserErrors.join("\n")}`,
    ).toEqual([]);
  });
});
