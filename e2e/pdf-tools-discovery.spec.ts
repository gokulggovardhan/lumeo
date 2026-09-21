import { expect, test } from "@playwright/test";

test.describe("PDF Tools discovery", () => {
  test("supports direct discovery, combined filters, and keyboard shortcuts", async ({ page }) => {
    await page.goto("/pdf-tools");

    await expect(page.getByRole("heading", { name: "What do you need to do?" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toHaveAttribute("href", "/pdf/merge");

    const search = page.getByRole("searchbox", { name: "Search tools and actions" });
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("rotate");
    await expect(page.getByRole("link", { name: /Open Organize PDF/ })).toBeVisible();
    await expect(page.getByText("1 tool", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit & sign" }).click();
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
