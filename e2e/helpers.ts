// e2e/helpers.ts
//
// Shared driving for the redaction e2e tests. Kept separate so the specs
// read as assertions rather than as plumbing.

import { expect, type Page } from "@playwright/test";

export const RUN_SELECTOR = 'div[role="button"][aria-label^="Editable text"]';

/**
 * Locates a detected run by its text.
 *
 * NOT `.filter({ hasText })`: the run overlays are transparent positioned
 * divs with no text content at all -- the run's text lives only in the
 * aria-label -- so a text filter can never match and simply times out.
 */
export function runSelectorFor(needle: string): string {
  return `div[role="button"][aria-label^="Editable text"][aria-label*="${needle}"]`;
}
export const LAYER_SELECTOR = '[aria-label="Draw a box over text to redact it"]';

/**
 * The redaction outcome panel.
 *
 * By test id, NOT getByRole("alert"): Next.js injects its own route
 * announcer with role="alert", so the role locator is ambiguous and every
 * spec died on a strict-mode violation before reaching an assertion. The
 * panel keeps role="alert" for screen readers -- the test id is additional,
 * not a replacement.
 */
export function outcomePanel(page: Page) {
  return page.getByTestId("redaction-outcome");
}

/** Individually-named runs that were masked but NOT removed. */
export function unremovedRuns(page: Page) {
  return page.getByTestId("redaction-unremoved-run");
}

/**
 * Blocks until the stage is genuinely rendered: the loading skeleton gone
 * AND at least one detected run present.
 *
 * This exists because of a false green. After an action that re-rasterizes
 * the page, the whole stage is replaced by "Loading page preview…" -- no
 * runs, no placed elements, nothing. A poll for "the SSN is gone" is
 * satisfied by that empty stage, so the assertion passed while proving
 * nothing. An assertion about absence is only meaningful once presence has
 * been established.
 *
 * Gates on observable state, never a fixed sleep: the raster time varies
 * with page complexity and machine load, and a timeout that is long enough
 * to be safe is long enough to hide a regression.
 */
export async function waitForStageReady(page: Page): Promise<void> {
  await expect(page.getByText("Loading page preview")).toHaveCount(0, { timeout: 90_000 });
  await expect
    .poll(async () => page.locator(RUN_SELECTOR).count(), {
      timeout: 90_000,
      message: "stage should have rendered detected text runs",
    })
    .toBeGreaterThan(0);
}

export async function openWithPdf(page: Page, pdfPath: string): Promise<void> {
  await page.goto("/pdf/edit");
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  // Text detection is the last stage of the page pipeline, so waiting for a
  // run means the raster, the pdf-lib load and the operator match are all
  // done -- a single wait that covers the whole chain.
  await expect(page.locator(RUN_SELECTOR).first()).toBeVisible({ timeout: 90_000 });
  await waitForStageReady(page);
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
  const run = page.locator(runSelectorFor(needle)).first();
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
  await expect(outcomePanel(page)).toBeVisible({ timeout: 60_000 });
  // Redaction replaces pdfBytes, which re-rasterizes the page. Nothing that
  // reads the stage is trustworthy until that finishes.
  await waitForStageReady(page);
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
