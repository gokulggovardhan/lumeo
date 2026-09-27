import { expect, test } from "@playwright/test";

test.describe("PDF Tools discovery", () => {
  test("homepage is tools-first and responsive across desktop, tablet, and mobile", async ({ page }) => {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(
        page.getByRole("heading", { name: "One PDF. One private workspace." }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Start with what you need" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "View all PDF tools" }),
      ).toHaveAttribute("href", "/pdf-tools");

      for (const tool of [
        "Edit PDF",
        "Organize PDF",
        "Merge PDF",
        "Split PDF",
        "Compress PDF",
        "Sign PDF",
        "Word to PDF",
        "PDF to Word",
        "JPG to PDF",
        "PDF to JPG",
      ]) {
        await expect(
          page.getByRole("link", { name: new RegExp(`^Open ${tool}`) }),
        ).toBeVisible();
      }

      if (viewport.width === 1920 && viewport.height === 1080) {
        for (const tool of [
          "Edit PDF",
          "Organize PDF",
          "Merge PDF",
          "Split PDF",
          "Compress PDF",
        ]) {
          await expect(
            page.getByRole("link", { name: new RegExp(`^Open ${tool}`) }),
          ).toBeInViewport();
        }
      }

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
    await expect(page.getByRole("link", { name: "View all PDF tools" })).toBeVisible();

    await page.goto("/pdf-tools");
    await expect(page.getByRole("link", { name: /Open Crop PDF/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open HEIC to JPEG/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Extract Text/ })).toBeVisible();
  });

  test("directory puts compact controls directly before all tools", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/pdf-tools");

    await expect(page.getByRole("heading", { name: "All PDF Tools" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toBeInViewport();
    await expect(page.getByRole("link", { name: /Open Edit PDF/ })).toBeInViewport();
    await expect(page.getByText("17 tools", { exact: true })).toBeVisible();
  });

  test("supports direct discovery, combined filters, slash shortcut, and command search", async ({ page }) => {
    await page.goto("/pdf-tools");

    await expect(page.getByRole("heading", { name: "All PDF Tools" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toHaveAttribute(
      "href",
      "/pdf/merge",
    );

    const search = page.getByRole("searchbox", { name: "Search tools and actions" });
    await expect(search).toHaveAttribute("data-search-shortcut-ready", "true");
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
    const commandSearch = page.getByRole("combobox", {
      name: "Search Lumeo tools and pages",
    });
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
    await expect(
      page.getByRole("searchbox", { name: "Search tools and actions" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toBeVisible();
  });
});
