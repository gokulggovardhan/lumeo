import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import {
  CLIPPED_TEXT_PDF,
  MIXED_STYLE_PDF,
  SPLIT_RUN_PDF,
  TEXT_ONLY_PDF,
  TWO_PAGE_PDF,
  writeFixtures,
} from "./fixtures.ts";
import { waitForStageReady } from "./helpers.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

async function uploadEditFixture(page: Page, fixturePath: string) {
  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
}

test("vinext Edit PDF explains read-only clipped text before an edit is attempted", async ({
  page,
}) => {
  await uploadEditFixture(page, CLIPPED_TEXT_PDF);

  const limitedRun = page
    .locator(
      'div[role="button"][aria-label^="Not yet editable text: "][aria-label*="Clipped sample"]',
    )
    .first();
  // This fixture is intentionally read-only, so the generic
  // waitForStageReady helper (which requires an EDITABLE run to prevent
  // absence-based false greens in redaction tests) is the wrong readiness
  // contract here. A visible limited run already proves detection + matching
  // completed; separately prove the raster loading shell is gone.
  await expect(limitedRun).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Loading page preview")).toHaveCount(0, {
    timeout: 90_000,
  });

  const pageCapability = page.locator("[data-edit-page-capability]");
  await expect(pageCapability).toHaveAttribute(
    "data-edit-page-capability",
    "view-only",
  );
  await expect(pageCapability).toHaveAttribute("title", /clipping shape/i);

  await limitedRun.hover();
  const explanation = page.locator("[data-edit-capability-explanation]");
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText(/clipping shape/i);
  await expect(explanation).toContainText(/read-only/i);

  // Keyboard users get the same proactive explanation. Selecting a limited
  // run must not produce the normal inline edit textbox.
  await limitedRun.focus();
  await expect(explanation).toBeVisible();
  await limitedRun.press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);
  await expect(explanation).toBeVisible();
});

test("vinext Edit PDF supports text matching, editing, and export", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });