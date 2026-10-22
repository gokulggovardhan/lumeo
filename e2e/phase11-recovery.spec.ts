import { expect, test } from "@playwright/test";

test.describe("Phase 11 — missing-route recovery", () => {
  test("unknown public URL has an accessible recovery path", async ({ page }) => {
    const response = await page.goto("/phase11-this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page isn't here." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Page recovery" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "This page isn't here." })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
  });
});
