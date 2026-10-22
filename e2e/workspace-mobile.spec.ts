import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { EDITABLE_TWO_PAGE_PDF, TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";

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
  await expectConnectedEditor(page);
}

async function expectConnectedEditor(page: Page) {
  await expect(
    page.locator('[data-workspace-projection-compatible="true"]'),
  ).toBeVisible({ timeout: 90_000 });
  // A route change and persistent navigation alone do not prove the editor
  // survived consuming the one-shot handoff. Wait for its real PDF preview.
  const preview = page.getByRole("img", { name: "Page 1 preview", exact: true });
  await expect(preview).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) =>
    img.complete && img.naturalWidth > 0,
  )).toBe(true);
  await expect(page.getByRole("button", { name: "Select PDF", exact: true })).toHaveCount(0);
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

async function nativeBeforeUnloadIsBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Exercise the real listener without attempting to close the test tab.
    // Actual browser dialogs are user-activation dependent by design.
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test("desktop Workspace opens an editable document directly and can repeat the handoff", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/pdf", { waitUntil: "domcontentloaded" });
  const upload = page.locator('input[type="file"][data-upload-client-ready="true"]').first();
  await expect(upload).toBeAttached({ timeout: 30_000 });
  await upload.setInputFiles(EDITABLE_TWO_PAGE_PDF);
  await expect(page.getByRole("heading", { name: "Choose your next step.", exact: true })).toBeVisible();

  for (let visit = 0; visit < 2; visit += 1) {
    await page.getByRole("button", { name: /^Edit/ }).click();
    await expect(page).toHaveURL(/\/pdf\/edit$/);
    await expectConnectedEditor(page);
    await expect(page.locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]').first()).toBeVisible({ timeout: 90_000 });
    const identity = page.locator("[data-workspace-document-identity]");
    await expect(identity.locator("[data-workspace-document-filename]")).toHaveAttribute("title", "editable-two-page.pdf");
    await expect(identity.locator("[data-workspace-document-pages]")).toHaveText("2 pages");
    await expect(identity).toHaveAttribute("data-workspace-revision-number", "0");
    await expect.poll(() => nativeBeforeUnloadIsBlocked(page)).toBe(false);

    await page.goBack();
    await expect(page).toHaveURL(/\/pdf$/);
    await expect(page.getByRole("heading", { name: "Choose your next step.", exact: true })).toBeVisible();
  }
});

test("upload once can switch tools immediately and Finish exports the latest materialized revision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pdf", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "PDF Workspace", exact: true }),
  ).toBeVisible();

  const journey = page.locator('[data-workspace-onboarding="true"]');
  await expect(journey).toHaveAttribute("data-workspace-onboarding-stage", "upload");
  await expect(journey.locator('[data-workspace-step="upload"]')).toHaveAttribute(
    "aria-current", "step",
  );

  const upload = page
    .locator('input[type="file"][data-upload-client-ready="true"]')
    .first();
  await expect(upload).toBeAttached({ timeout: 30_000 });
  await upload.setInputFiles(TWO_PAGE_PDF);

  await expect(
    page.getByRole("heading", { name: "Choose your next step.", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(journey).toHaveAttribute("data-workspace-onboarding-stage", "work");
  await expect(journey.locator('[data-workspace-step="upload"]')).toHaveAttribute(
    "data-workspace-step-status", "complete",
  );
  await expect(journey.locator('[data-workspace-step="work"]')).toHaveAttribute(
    "aria-current", "step",
  );
  await expect(journey.locator('[data-workspace-step="finish"]')).toHaveAttribute(
    "data-workspace-step-status", "upcoming",
  );
  await page.getByRole("button", { name: /^Pages/ }).click();
  await expect(page).toHaveURL(/\/pdf\/organize$/);

  const workspace = page.locator("[data-workspace-lifecycle]");
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "ready", {
    timeout: 90_000,
  });

  const nav = page.locator("[data-workspace-mobile-nav]");
  await expect(nav).toBeVisible();

  // The persistent identity comes from the connected revision, not new storage.
  const identity = page.locator("[data-workspace-document-identity]");
  await expect(identity).toBeVisible();
  await expect(identity.locator("[data-workspace-document-pages]")).toHaveText("2 pages");
  await expect(identity.locator("[data-workspace-document-filename]")).toHaveAttribute("title", /\.pdf$/i);
  await expect(identity.locator("[data-workspace-document-size]")).toContainText(/(?:B|KB|MB)$/);
  await expect(identity.locator("[data-workspace-document-revision]")).toContainText(/Revision \d+/);
  // A clean upload must never prompt when closing or refreshing.
  await expect.poll(() => nativeBeforeUnloadIsBlocked(page)).toBe(false);
  const initialRevision = Number(await identity.getAttribute("data-workspace-revision-number"));
  expect(Number.isSafeInteger(initialRevision)).toBe(true);
  await identity.getByText("Full details").click();
  await expect(identity.locator("[data-workspace-document-full-description]")).toBeVisible();

  // The PDF was uploaded once on the visible /pdf hybrid Workspace entry.
  // Switching tools does not require Save/Download/Continue first.
  await clickWorkspaceNav(page, "Edit");
  await expect(page).toHaveURL(/\/pdf\/edit$/);
  await expectConnectedEditor(page);
  await expect(identity).toHaveAttribute("data-workspace-revision-number", String(initialRevision));

  await clickWorkspaceNav(page, "Pages");
  await expect(page).toHaveURL(/\/pdf\/organize$/);
  await expect(page.locator("[data-workspace-lifecycle]")).toHaveAttribute(
    "data-workspace-lifecycle",
    "ready",
    { timeout: 90_000 },
  );

  await page.getByRole("button", { name: "Rotate right" }).first().click();
  // Local edits are protected immediately, before the first Save/materialization.
  await expect.poll(() => nativeBeforeUnloadIsBlocked(page)).toBe(true);
  await page.getByRole("button", { name: "Save organized PDF" }).click();
  await expect(page.getByText("Organized PDF ready")).toBeVisible({
    timeout: 90_000,
  });

  // Changes in the shared document must activate the native protection.
  await expect.poll(() => nativeBeforeUnloadIsBlocked(page), { timeout: 30_000 }).toBe(true);

  // The identity must follow the newly materialized revision in-place.
  await expect.poll(async () => Number(await identity.getAttribute("data-workspace-revision-number"))).toBeGreaterThan(initialRevision);
  const savedRevision = Number(await identity.getAttribute("data-workspace-revision-number"));
  const savedFileName = await identity.locator("[data-workspace-document-filename]").getAttribute("title");
  expect(savedFileName).toBeTruthy();

  // Every route mount gets a fresh one-shot handoff. Repeatedly enter Edit
  // after a real page operation and verify it retains the latest revision.
  for (let visit = 0; visit < 2; visit += 1) {
    await clickWorkspaceNav(page, "Edit");
    await expect(page).toHaveURL(/\/pdf\/edit$/);
    await expectConnectedEditor(page);
    await expect(identity).toHaveAttribute("data-workspace-revision-number", String(savedRevision));
    await expect(identity.locator("[data-workspace-document-pages]")).toHaveText("2 pages");
    await expect(identity.locator("[data-workspace-document-filename]")).toHaveAttribute("title", savedFileName!);

    await clickWorkspaceNav(page, "Pages");
    await expect(page).toHaveURL(/\/pdf\/organize$/);
    await expect(page.locator("[data-workspace-lifecycle]")).toHaveAttribute(
      "data-workspace-lifecycle", "ready", { timeout: 90_000 },
    );
  }

  // Do not click a Continue-with-this-PDF action. The successful result is
  // auto-materialized, so persistent Workspace navigation must use it.
  await clickWorkspaceNav(page, "Finish");
  await expect(page).toHaveURL(/\/pdf\/finish$/);
  const finishJourney = page.locator('[data-workspace-onboarding="true"]');
  await expect(finishJourney).toHaveAttribute("data-workspace-onboarding-stage", "finish");
  await expect(finishJourney.locator('[data-workspace-step="finish"]')).toHaveAttribute(
    "aria-current", "step",
  );
  await expect(finishJourney.locator('[data-workspace-step="work"]')).toHaveAttribute(
    "data-workspace-step-status", "complete",
  );
  await expect(identity).toHaveAttribute("data-workspace-revision-number", String(savedRevision));
  await expect(identity.locator("[data-workspace-document-pages]")).toHaveText("2 pages");
  // Client-side tool navigation preserves the dirty Workspace and its guard.
  await expect.poll(() => nativeBeforeUnloadIsBlocked(page)).toBe(true);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const output = await PDFDocument.load(await readFile(outputPath!));
  expect(output.getPageCount()).toBe(2);
  expect(((output.getPage(0).getRotation().angle % 360) + 360) % 360).toBe(90);
  // Finish successfully marks the existing session clean; no unload prompt.
  await expect.poll(() => nativeBeforeUnloadIsBlocked(page)).toBe(false);
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
