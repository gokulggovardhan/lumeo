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

async function openAdminNavigation(page: Page) {
  const openButton = page.getByRole("button", {
    name: "Open Control Center navigation",
  });

  if (await openButton.isVisible().catch(() => false)) {
    await expect(openButton).toHaveAttribute("aria-expanded", "false");
    await openButton.click();

    const closeButton = page.getByRole("button", {
      name: "Close Control Center navigation",
    });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");

    const mobileNavigation = page.getByRole("navigation", {
      name: "Mobile Control Center navigation",
    });
    await expect(mobileNavigation).toBeVisible();
    return { navigation: mobileNavigation, mobile: true, closeButton };
  }

  const desktopNavigation = page.getByRole("navigation", {
    name: "Control Center navigation",
  });
  await expect(desktopNavigation).toBeVisible();
  return { navigation: desktopNavigation, mobile: false, closeButton: null };
}

async function exerciseResponsiveNavigation(page: Page) {
  const state = await openAdminNavigation(page);
  if (!state.mobile || !state.closeButton) return;

  await page.keyboard.press("Escape");
  const reopenedButton = page.getByRole("button", {
    name: "Open Control Center navigation",
  });
  await expect(reopenedButton).toBeVisible();
  await expect(reopenedButton).toHaveAttribute("aria-expanded", "false");
  await expect(reopenedButton).toBeFocused();
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

    await exerciseResponsiveNavigation(page);

    const { navigation: overviewNavigation } = await openAdminNavigation(page);
    await overviewNavigation.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics/);
    await expect(
      page.getByRole("heading", {
        name: "Discovery & operation analytics",
        exact: true,
      }),
    ).toBeVisible();

    // vinext may retain a hidden previous route tree during navigation.
    // Scope assertions to the active main content instead of matching hidden
    // framework transition state outside the user-visible page.
    const analyticsMain = page.locator("#main-content");
    const rangeSelect = analyticsMain.getByLabel("Range");
    await expect(rangeSelect).toHaveCount(1);
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    await expect(rangeSelect).toHaveCSS(
      "font-size",
      viewportWidth < 640 ? "16px" : "14px",
    );
    await rangeSelect.selectOption("30d");
    await analyticsMain.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\?range=30d/);
    await expect(
      page.locator("#main-content").getByText("Selected: Last 30 days"),
    ).toBeVisible();

    const adminOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(adminOverflow).toBe(false);

    await page.reload();
    await expect(page).toHaveURL(/\/admin\/analytics\?range=30d/);

    const { navigation: analyticsNavigation } = await openAdminNavigation(page);
    await analyticsNavigation.getByRole("link", { name: "Inbox" }).click();
    await expect(page).toHaveURL(/\/admin\/inbox/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

    const inboxReload = await page.reload();
    await expect(page).toHaveURL(/\/admin\/inbox/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(inboxReload?.headers()["cache-control"]).toContain("no-store");

    const { navigation: inboxNavigation } = await openAdminNavigation(page);
    await inboxNavigation.getByRole("link", { name: "Errors" }).click();
    await expect(page).toHaveURL(/\/admin\/errors/);
    await expect(page.getByRole("heading", { name: "Errors" })).toBeVisible();
    const firstError = page.locator("details").first();
    await expect(firstError).toBeVisible();
    await firstError.locator("summary").click();
    await expect(firstError.locator("code")).toContainText("<script>not-executed</script>");
    await expect(firstError.locator("code")).not.toContainText("should-not-matter");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);

    const { navigation: errorsNavigation } = await openAdminNavigation(page);
    await errorsNavigation.getByRole("link", { name: "Health" }).click();
    await expect(page).toHaveURL(/\/admin\/health/);
    await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
    await expect(
      page.locator("#main-content").getByText("LibreOffice converter", {
        exact: true,
      }),
    ).toBeVisible();

    const { navigation: healthNavigation } = await openAdminNavigation(page);
    await healthNavigation.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    const maintenanceForm = page.getByRole("form", {
      name: "Maintenance mode setting",
    });
    const maintenanceToggle = maintenanceForm.getByRole("checkbox", {
      name: "Enabled",
    });
    if (await maintenanceToggle.isChecked()) {
      await maintenanceToggle.uncheck();
      await maintenanceForm
        .getByRole("button", { name: "Save changes" })
        .click();
      await expect(maintenanceToggle).not.toBeChecked();
    }

    await maintenanceToggle.check();
    await maintenanceForm
      .getByRole("button", { name: "Save changes" })
      .click();
    const maintenanceDialog = maintenanceForm.getByRole("alertdialog");
    await expect(maintenanceDialog).toBeVisible();
    await maintenanceDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(maintenanceDialog).toHaveCount(0);

    // Server-side transition checking must also reject an enable submit that
    // lacks the explicit confirmation field (for example, implicit Enter).
    // Use the real form submission path instead of requestSubmit()+immediate
    // reload, which WebKit can abort mid-navigation and report as a browser
    // network error even though the server correctly rejects the transition.
    const implicitSubmitResponse = page.waitForResponse((response) => {
      const request = response.request();
      return (
        request.method() === "POST" &&
        new URL(response.url()).pathname === "/admin/settings"
      );
    });
    await maintenanceForm.evaluate((form: HTMLFormElement) => form.requestSubmit());
    const rejectedEnableResponse = await implicitSubmitResponse;
    expect(rejectedEnableResponse.ok()).toBe(true);

    const maintenanceAfterCancel = page
      .getByRole("form", { name: "Maintenance mode setting" })
      .getByRole("checkbox", { name: "Enabled" });
    await expect(maintenanceAfterCancel).not.toBeChecked();

    await maintenanceAfterCancel.check();
    const maintenanceFormAfterCancel = page.getByRole("form", {
      name: "Maintenance mode setting",
    });
    await maintenanceFormAfterCancel
      .getByRole("button", { name: "Save changes" })
      .click();
    await maintenanceFormAfterCancel
      .getByRole("button", { name: "Enable maintenance mode" })
      .click();
    await expect(page.getByText("Live: site is down for visitors")).toBeVisible();

    const enabledMaintenanceForm = page.getByRole("form", {
      name: "Maintenance mode setting",
    });
    const enabledMaintenanceToggle = enabledMaintenanceForm.getByRole(
      "checkbox",
      { name: "Enabled" },
    );
    await enabledMaintenanceToggle.uncheck();
    await enabledMaintenanceForm
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect(page.getByText("Live: site is down for visitors")).toHaveCount(0);

    const { navigation: settingsNavigation } = await openAdminNavigation(page);
    await settingsNavigation.getByRole("link", { name: "Inbox" }).click();
    await expect(page).toHaveURL(/\/admin\/inbox/);

    await openAdminNavigation(page);
    const protectedOrigin = new URL(page.url()).origin;
    await page.getByRole("button", { name: "Sign out" }).click();
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
    const finalNavigation = await openAdminNavigation(page);
    await expect(finalNavigation.navigation).toBeVisible();

    expect(
      browserErrors,
      `Unexpected browser errors:\n${browserErrors.join("\n")}`,
    ).toEqual([]);
  });
});
