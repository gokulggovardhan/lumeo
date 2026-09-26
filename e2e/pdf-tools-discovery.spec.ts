import { expect, test } from "@playwright/test";

test.describe("PDF Tools discovery", () => {

  test("homepage keeps the premium hierarchy responsive across desktop, tablet, and mobile", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 768, height: 900 },
      { width: 320, height: 760 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Your PDFs stay yours." })).toBeVisible();
      await expect(page.getByRole("link", { name: "Explore PDF tools" })).toBeVisible();

      for (const tool of [
        "Merge PDF",
        "Compress PDF",
        "Edit PDF",
        "PDF to Word",
        "Word to PDF",
        "Sign PDF",
      ]) {
        await expect(page.getByRole("link", { name: new RegExp(`^Open ${tool}`) })).toBeVisible();
      }

      await expect(page.getByRole("heading", { name: "Useful next steps, without the clutter" })).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
    }
  });

  test("specialist tools stay out of homepage prominence but remain discoverable", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /^Open Crop PDF/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Open HEIC to JPEG/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View all tools" })).toBeVisible();

    await page.goto("/pdf-tools");
    await expect(page.getByRole("link", { name: /Open Crop PDF/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open HEIC to JPEG/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Extract Text/ })).toBeVisible();
  });

  test("supports direct discovery, combined filters, and keyboard shortcuts", async ({ page }) => {
    await page.goto("/pdf-tools");

    await expect(page.getByRole("heading", { name: "Find the right tool" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toHaveAttribute("href", "/pdf/merge");

    const search = page.getByRole("searchbox", { name: "Search tools and actions" });
    await expect(search).toHaveAttribute("data-search-shortcut-ready", "true", { timeout: 30_000 });
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("rotate");
    await expect(page.getByRole("link", { name: /Open Organize PDF/ })).toBeVisible();
    await expect(page.getByText("1 tool", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("No tools match that search")).toBeVisible();

    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(page.getByText(/\d+ tools?/, { exact: true })).toBeVisible();

    const commandTrigger = page.getByRole("button", { name: /Open command palette/ });
    await commandTrigger.click();
    const commandSearch = page.getByRole("combobox", { name: "Search Lumeo tools and pages" });
    await expect(commandSearch).toBeFocused();
    await commandSearch.fill("rotate");
    await expect(page.getByRole("option", { name: /Organize PDF/ })).toBeVisible();
    await commandSearch.press("Escape");
    await expect(commandTrigger).toBeFocused();
  });

  test("stays usable without horizontal overflow on a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await page.goto("/pdf-tools");

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));

    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole("searchbox", { name: "Search tools and actions" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toBeVisible();
  });
});
