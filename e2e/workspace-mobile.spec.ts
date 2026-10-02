import { expect, test, type Page } from "@playwright/test";
import { TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

async function openConnectedWorkspace(page: Page) {
  await page.goto("/pdf/organize", { waitUntil: "domcontentloaded" });
  const upload = page
    .locator('input[type="file"][data-upload-client-ready="true"]')
    .first();
  await expect(upload).toBeAttached({ timeout: 30_000 });
  await upload.setInputFiles(TWO_PAGE_PDF);

  const workspace = page.locator("[data-workspace-lifecycle]");
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "ready", {
    timeout: 90_000,
  });

  await page.getByRole("button", { name: "Save organized PDF" }).click();
  await expect(page.getByText("Organized PDF ready")).toBeVisible({
    timeout: 90_000,
  });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/pdf\/edit$/);
  await expect(page.locator("[data-workspace-mobile-nav]")).toBeVisible();
}

async function expectMobileNavFits(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const nav = page.locator("[data-workspace-mobile-nav]");
  await expect(nav).toBeVisible();

  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    offset: document.documentElement.style.getPropertyValue(
      "--workspace-mobile-nav-offset",
    ),
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.offset).toBe("4.5rem");

  for (const label of ["Edit", "Pages", "More", "Finish"]) {
    await expect(
      nav.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }
}

test("connected PDF Workspace keeps dedicated mobile navigation usable across target widths and landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConnectedWorkspace(page);

  for (const [width, height] of [
    [430, 860],
    [390, 844],
    [375, 812],
    [360, 800],
    [320, 700],
    [844, 390],
  ] as const) {
    await expectMobileNavFits(page, width, height);
  }

  const nav = page.locator("[data-workspace-mobile-nav]");
  await nav.getByRole("button", { name: "More", exact: true }).click();

  const more = page.locator("#workspace-mobile-more");
  await expect(more).toBeVisible();
  for (const label of ["Sign", "Add", "Compress"]) {
    await expect(
      more.getByRole("button", { name: new RegExp("^" + label) }),
    ).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();

  await nav.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(page).toHaveURL(/\/pdf\/organize$/);
  await expect(
    page
      .locator("[data-workspace-mobile-nav]")
      .getByRole("button", { name: "Pages", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page
    .locator("[data-workspace-mobile-nav]")
    .getByRole("button", { name: "Finish", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pdf\/finish$/);
  await expect(page.getByRole("heading", { name: "Finish", exact: true })).toBeVisible();
  await expect(
    page
      .locator("[data-workspace-mobile-nav]")
      .getByRole("button", { name: "Finish", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator("[data-workspace-mobile-nav]")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          "--workspace-mobile-nav-offset",
        ),
      ),
    )
    .toBe("");
});
