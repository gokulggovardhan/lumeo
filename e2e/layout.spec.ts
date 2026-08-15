import { expect, test, type Locator, type Page } from "@playwright/test";
import { dragBoxOverRun, enterRedactMode, openWithPdf } from "./helpers.ts";
import { TEXT_ONLY_PDF, TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";

// "Is this control actually clickable?" kept being answered by looking at a
// screenshot and judging. Three fixes were attempted on that basis and the
// floating page pill still covered the action bar after all of them.
//
// This asks the browser instead. For each control, elementFromPoint at its
// centre must return the control itself or something inside it. Anything
// else -- a glass panel, an overlay, a floating island -- means a real user
// clicking there hits the wrong thing.
//
// Note this is a STRICTER check than Playwright's own actionability. Since
// the pill was given pointer-events-none its chrome no longer intercepts
// clicks, so Playwright will happily click straight through it. That fix was
// correct and necessary, but it also means a click test can no longer tell
// whether a button is VISUALLY covered. Hit-testing can.

async function hitTestOwner(page: Page, target: Locator): Promise<string> {
  if ((await target.count()) === 0) return "(not rendered)";
  // Scroll into view and measure INSIDE the page. Playwright's boundingBox()
  // is document-relative while elementFromPoint takes viewport coordinates,
  // so mixing them reports "nothing at that point" for anything below the
  // fold -- which looks exactly like a covered control and is not.
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return "(zero-sized)";
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return "(outside the viewport)";
    const found = document.elementFromPoint(x, y);
    if (!found) return "(nothing at that point)";
    if (found === node || node.contains(found)) return "SELF";
    // Describe whatever is on top, so a failure names the culprit rather
    // than just reporting a mismatch.
    const tag = found.tagName.toLowerCase();
    const cls = (found.getAttribute("class") ?? "").slice(0, 90);
    const label = found.getAttribute("aria-label") ?? found.textContent?.trim().slice(0, 40) ?? "";
    return `${tag}[${label}] class="${cls}"`;
  });
}

async function expectClickable(page: Page, target: Locator, name: string): Promise<void> {
  const owner = await hitTestOwner(page, target);
  expect(owner, `"${name}" is covered at its centre by: ${owner}`).toBe("SELF");
}

test.beforeAll(async () => {
  await writeFixtures();
});

// Four widths, because which control the floating pill lands on depends on
// the viewport. Judging from a single screenshot is what produced three
// wrong fixes: the overlap was real every time, but it moved, so each fix
// was aimed at whichever button happened to be under it that day.
const WIDTHS = [1024, 1280, 1440, 1600];

const ACTION_BAR_CONTROLS = ["Add pages", "Delete selected", "Extract selected", "Find sensitive data", "Exit redact"];

for (const width of WIDTHS) {
  test(`no interactive control is visually occluded at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openWithPdf(page, TEXT_ONLY_PDF);
    await enterRedactMode(page);
    // Draw a box so "Redact N runs" is enabled and at its real width.
    await dragBoxOverRun(page, "123-45-6789");

    const occluded: string[] = [];
    for (const name of ACTION_BAR_CONTROLS) {
      const button = page.getByRole("button", { name, exact: true });
      if ((await button.count()) === 0) continue;
      const owner = await hitTestOwner(page, button);
      if (owner !== "SELF") occluded.push(`${name} <- ${owner}`);
    }

    const redactOwner = await hitTestOwner(page, page.getByRole("button", { name: /^Redact \d+ runs?$/ }));
    if (redactOwner !== "SELF") occluded.push(`Redact N runs <- ${redactOwner}`);

    const exportOwner = await hitTestOwner(page, page.getByRole("button", { name: /Export PDF/ }));
    if (exportOwner !== "SELF") occluded.push(`Export PDF <- ${exportOwner}`);

    expect(occluded, `occluded at ${width}px: ${occluded.join(" | ")}`).toEqual([]);
  });
}

// Item 7: the tool rail is absolutely positioned over the canvas and the
// PAGES column sits beneath it.
for (const width of WIDTHS) {
  test(`the PAGES thumbnail checkboxes are reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openWithPdf(page, TWO_PAGE_PDF);

    // The rail is desktop-only by design; below lg there is nothing to check.
    const rail = page.getByRole("checkbox", { name: "Select page 1" });
    if ((await rail.count()) === 0) {
      test.skip(width < 1024, "the PAGES rail is hidden below the lg breakpoint");
    }

    for (const pageNumber of [1, 2]) {
      const checkbox = page.getByRole("checkbox", { name: `Select page ${pageNumber}` });
      if ((await checkbox.count()) === 0) continue;
      await expectClickable(page, checkbox, `Select page ${pageNumber} checkbox at ${width}px`);
    }
  });
}
