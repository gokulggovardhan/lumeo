import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

async function clickWorkspaceNav(
  page: Page,
  label: "Edit" | "Pages" | "More" | "Finish",
) {
  // next dev injects a localhost-only Dev Tools portal that can sit above
  // fixed bottom navigation. Production builds do not render this portal.
  // Neutralize only that framework-owned test overlay so Playwright still
  // performs a normal pointer click on the real Lumeo navigation control.
  if (new URL(page.url()).hostname === "localhost") {
    await page.locator("nextjs-portal").evaluateAll((portals) => {
      for (const portal of portals) {
        (portal as HTMLElement).style.pointerEvents = "none";
      }
    });
  }

  await page
    .locator("[data-workspace-mobile-nav]")
    .getByRole("button", { name: label, exact: true })
    .click();
}

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

  const nav = page.locator("[data-workspace-mobile-nav]");
  await expect(nav).toBeVisible();
  await clickWorkspaceNav(page, "Edit");
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
    const button = nav.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible();
    const buttonBox = await button.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
  }
}

test("upload once can switch tools immediately and Finish exports the latest materialized revision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pdf", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "PDF Workspace", exact: true }),
  ).toBeVisible();

  const upload = page
    .locator('input[type="file"][data-upload-client-ready="true"]')
    .first();
  await expect(upload).toBeAttached({ timeout: 30_000 });
  await upload.setInputFiles(TWO_PAGE_PDF);

  await expect(
    page.getByRole("heading", { name: "Choose your next step.", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Pages/ }).click();
  await expect(page).toHaveURL(/\/pdf\/organize$/);

  const workspace = page.locator("[data-workspace-lifecycle]");
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "ready", {
    timeout: 90_000,
  });

  const nav = page.locator("[data-workspace-mobile-nav]");
  await expect(nav).toBeVisible();

  // The PDF was uploaded only once on the visible /pdf Workspace entry.
  // Switching tools does not require Save/Download/Continue first.
  await clickWorkspaceNav(page, "Edit");
  await expect(page).toHaveURL(/\/pdf\/edit$/);
  await expect(
    page.locator('[data-workspace-projection-compatible="true"]'),
  ).toBeVisible({ timeout: 90_000 });

  await clickWorkspaceNav(page, "Pages");
  await expect(page).toHaveURL(/\/pdf\/organize$/);
  await expect(page.locator("[data-workspace-lifecycle]")).toHaveAttribute(
    "data-workspace-lifecycle",
    "ready",
    { timeout: 90_000 },
  );

  await page.getByRole("button", { name: "Rotate right" }).first().click();
  await page.getByRole("button", { name: "Save organized PDF" }).click();
  await expect(page.getByText("Organized PDF ready")).toBeVisible({
    timeout: 90_000,
  });

  // Do not click a Continue-with-this-PDF action. The successful result is
  // auto-materialized, so persistent Workspace navigation must use it.
  await clickWorkspaceNav(page, "Finish");
  await expect(page).toHaveURL(/\/pdf\/finish$/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const output = await PDFDocument.load(await readFile(outputPath!));
  expect(output.getPageCount()).toBe(2);
  expect(((output.getPage(0).getRotation().angle % 360) + 360) % 360).toBe(90);
});

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
  await clickWorkspaceNav(page, "More");

  const more = page.locator("#workspace-mobile-more");
  await expect(more).toBeVisible();
  for (const label of ["Sign", "Add", "Compress"]) {
    await expect(
      more.getByRole("button", { name: new RegExp("^" + label) }),
    ).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();

  await clickWorkspaceNav(page, "Pages");
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
