import { expect, test } from "@playwright/test";

test.describe("Phase 11 — missing-route recovery", () => {
  test("unknown public URL has an accessible recovery path", async ({ page }) => {
    const response = await page.goto("/phase11-this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page is not here." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Page recovery" })).toBeVisible();
    await expect(page.getByText("Your PDF files have not been uploaded by this page.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse PDF Tools" })).toHaveAttribute("href", "/pdf-tools");
    const workspace = page.getByRole("link", { name: "Open PDF Workspace" });
    await expect(workspace).toHaveAttribute("href", "/pdf");
    await page.keyboard.press("Tab");
    await workspace.focus();
    await expect(workspace).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/pdf\/?$/);
  });

  test("404 recovery fits a narrow phone without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/phase11-mobile-missing");
    await expect(page.getByRole("heading", { name: "This page is not here." })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("navigation", { name: "Page recovery" })).toBeVisible();
  });
});

// These tests use real App Router boundaries. The routes are generated only in
// an isolated checkout, and removed before the production Worker build.
test.describe("Phase 11 — controlled recovery @isolated", () => {
  test.beforeEach(() => {
    expect(process.env.LUMEO_RECOVERY_FIXTURES, "Install the isolated fixtures before this suite").toBe("1");
  });

  for (const [path, title] of [
    ["/phase11-recovery-fixture", "We could not open this page."],
    ["/pdf/phase11-recovery-fixture", "This tool hit a snag."],
  ]) {
    test(`${path} retries without a redirect loop or exposing exception details`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.getByRole("button", { name: "Trigger controlled render failure" }).click();
      const heading = page.getByRole("heading", { name: title });
      await expect(heading).toBeVisible();
      const fallback = page.locator("main").filter({ has: heading });
      await expect(fallback.getByRole("alert")).toHaveCount(1);
      await expect(fallback).not.toContainText("PHASE11_PRIVATE_DOCUMENT_SENTINEL");
      await expect(fallback.getByRole("button", { name: "Try again" })).toHaveCount(1);
      await testInfo.attach("recovery", { body: await fallback.screenshot(), contentType: "image/png" });
      await fallback.getByRole("button", { name: "Try again" }).press("Enter");
      await expect(page.getByRole("heading", { name: "Recovery fixture ready" })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }

  test("PDF retry retains the document and unsaved-work navigation requires consent", async ({ page }) => {
    await page.goto("/pdf/phase11-recovery-fixture");
    await page.getByRole("button", { name: "Keep test document" }).click();
    await expect(page.getByLabel("Retained document")).toHaveText("private-fixture.pdf");
    const revision = await page.getByLabel("Document revision").textContent();
    await page.getByRole("button", { name: "Trigger controlled render failure" }).click();
    const fallback = page.locator("main").filter({ has: page.getByRole("heading", { name: "This tool hit a snag." }) });
    const dialogPromise = page.waitForEvent("dialog");
    const click = fallback.getByRole("link", { name: "Back home" }).click();
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
    await click;
    await expect(page).toHaveURL(/\/pdf\/phase11-recovery-fixture$/);
    await fallback.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByLabel("Retained document")).toHaveText("private-fixture.pdf");
    await expect(page.getByLabel("Document revision")).toHaveText(revision!);
    // The existing native unload guard must remain registered after recovery.
    expect(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
  });

  test("maintenance is disabled before hydration and requires explicit confirmation afterwards", async ({ browser, page }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const unhydrated = await context.newPage();
    await unhydrated.goto("http://localhost:3000/phase11-recovery-fixture");
    await expect(unhydrated.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await context.close();
    await page.goto("/phase11-recovery-fixture");
    const form = page.getByRole("form", { name: "Fixture maintenance" });
    await expect(form.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form.getByRole("alertdialog")).toBeVisible();
    await expect(form.getByLabel("Submission count")).toHaveText("0");
    await form.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(form.getByLabel("Submission count")).toHaveText("0");
    await form.getByRole("button", { name: "Save changes" }).click();
    await form.getByRole("button", { name: "Enable maintenance mode", exact: true }).click();
    await expect(form.getByLabel("Submission count")).toHaveText("1");
  });

  test("admin recovery preserves authentication boundaries and sign-in recovery", async ({ page, context }) => {
    expect(process.env.ADMIN_E2E_EMAIL, "Disposable admin credentials are mandatory").toBeTruthy();
    expect(process.env.ADMIN_E2E_PASSWORD).toBeTruthy();
    await page.goto("/admin/phase11-recovery-fixture");
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.getByLabel("Email").fill(process.env.ADMIN_E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin(?:\/phase11-recovery-fixture)?$/);
    await page.goto("/admin/phase11-recovery-fixture");
    await page.getByRole("button", { name: "Trigger controlled render failure" }).click();
    await expect(page.getByRole("heading", { name: "This admin page could not load." })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Recovery fixture ready" })).toBeVisible();
    await page.getByRole("button", { name: "Trigger controlled render failure" }).click();
    await context.clearCookies();
    await page.getByRole("link", { name: "Admin sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/phase11-recovery-fixture");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("button", { name: "Trigger controlled render failure" })).toHaveCount(0);
  });
});

for (const width of [375, 768, 1440]) {
  test(`404 keyboard recovery and 200% zoom at ${width}px @live`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/phase11-this-route-does-not-exist");
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    const navigation = page.getByRole("navigation", { name: "Page recovery" });
    await expect(navigation).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    const home = navigation.getByRole("link", { name: "Go home" });
    for (let index = 0; index < 8 && !(await home.evaluate(el => el === document.activeElement)); index++) {
      await page.keyboard.press("Tab");
    }
    await expect(home).toBeFocused();
    expect(await home.evaluate(el => {
      const style = getComputedStyle(el);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    })).toBe(true);
    await testInfo.attach(`404-${width}-zoom`, { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Start PDF Workspace", exact: true }).first()).toBeVisible();
  });
}
