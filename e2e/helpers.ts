// e2e/helpers.ts
//
// Shared driving for the redaction e2e tests. Kept separate so the specs
// read as assertions rather than as plumbing.

import { expect, type Page } from "@playwright/test";

export const RUN_SELECTOR = 'div[role="button"][aria-label^="Editable text"]';
export const LAYER_SELECTOR = '[aria-label="Draw a box over text to redact it"]';

export async function openWithPdf(page: Page, pdfPath: string): Promise<void> {
  await page.goto("/pdf/edit");
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  // Text detection is the last stage of the page pipeline, so waiting for a
  // run means the raster, the pdf-lib load and the operator match are all
  // done -- a single wait that covers the whole chain.
  await expect(page.locator(RUN_SELECTOR).first()).toBeVisible({ timeout: 90_000 });
}

export async function enterRedactMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Redact", exact: true }).click();
  await expect(page.locator(LAYER_SELECTOR)).toBeVisible();
}

/**
 * Drags a box over the run whose text contains `needle`, using real mouse
 * input so the component's own pointer handling is what is exercised.
 */
export async function dragBoxOverRun(page: Page, needle: string): Promise<void> {
  const run = page.locator(RUN_SELECTOR, { hasText: needle }).first();
  const box = await run.boundingBox();
  if (!box) throw new Error(`run containing "${needle}" has no box`);

  await page.mouse.move(box.x + 2, box.y + 1);
  await page.mouse.down();
  // Two intermediate moves: one alone can be coalesced with the up event,
  // which is precisely the condition that used to lose the box.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 1);
  await page.mouse.up();

  await expect(page.locator('[aria-label^="Remove redaction box"]')).toHaveCount(1);
}

export async function applyRedactionThroughModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Redact \d+ runs?$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Redact", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 60_000 });
}

/** What pdfjs can extract from the page currently on screen. */
export async function detectedRunTexts(page: Page): Promise<string[]> {
  return page.locator(RUN_SELECTOR).evaluateAll((nodes) =>
    nodes.map((node) => (node.getAttribute("aria-label") ?? "").replace(/^Editable text: /, "")),
  );
}

export async function blackMaskCount(page: Page): Promise<number> {
  // Redaction masks are placed whiteout elements. EditElementView labels
  // every placed element `"<type> element. Arrow keys move…"`, so the type
  // prefix is the stable handle -- no test-only attribute needed.
  return page.locator('[aria-label^="whiteout element."]').count();
}
