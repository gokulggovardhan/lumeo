import { expect, test, type Locator, type Page } from "@playwright/test";
import { applyRedactionThroughModal, dragBoxOverRun, enterRedactMode, openWithPdf } from "./helpers.ts";
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

/**
 * Hit-tests EVERY visible interactive control in the workspace rather than a
 * hand-listed set. An enumeration goes stale the moment a control is added,
 * and the invariant is about all of them, not about the ones someone
 * remembered.
 */
async function occludedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const section = document.querySelector("section.l2-workspace-deep");
    if (!section) return ["(workspace not found)"];
    const controls = [...section.querySelectorAll('button, input, [role="button"], [role="checkbox"]')];
    const bad: string[] = [];

    for (const node of controls) {
      const label = node.getAttribute("aria-label") ?? node.textContent?.trim().slice(0, 30) ?? "(unnamed)";
      // Detected-run overlays deliberately sit under the redaction layer.
      if (label.startsWith("Editable text")) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") continue;
      // Principled skip rule, not a per-state allowlist: a control the app
      // has genuinely marked unavailable is not "occluded", it is off. If a
      // future overlay covers something WITHOUT marking it so, this still
      // fails -- which is the point.
      if (node.hasAttribute("inert") || node.closest("[inert]")) continue;
      if (node.closest('[aria-hidden="true"]')) continue;
      if ((node as HTMLButtonElement).disabled) continue;
      // sr-only inputs (the merge file picker) are clipped to a pixel behind
      // their own trigger by design.
      if (style.opacity === "0" || style.clip === "rect(0px, 0px, 0px, 0px)" || rect.width <= 1 || rect.height <= 1) continue;
      node.scrollIntoView({ block: "center" });
      const scrolled = node.getBoundingClientRect();
      const x = scrolled.left + scrolled.width / 2;
      const y = scrolled.top + scrolled.height / 2;
      // Previously a bare `continue` here, which silently skipped anything
      // below the fold -- including the one control that was really covered.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        bad.push(`${label} <- (could not be scrolled into view)`);
        continue;
      }
      const found = document.elementFromPoint(x, y);
      if (!found || found === node || node.contains(found)) continue;
      const ownerLabel = found.getAttribute("aria-label") ?? found.textContent?.trim().slice(0, 30) ?? found.tagName;
      bad.push(`${label} <- ${ownerLabel}`);
    }
    return bad;
  });
}

type StateName = "default edit mode" | "redact mode" | "outcome panel visible";

async function enterState(page: Page, state: StateName): Promise<void> {
  if (state === "default edit mode") return;
  await enterRedactMode(page);
  await dragBoxOverRun(page, "123-45-6789");
  if (state === "redact mode") return;
  await applyRedactionThroughModal(page);
}

const STATES: StateName[] = ["default edit mode", "redact mode", "outcome panel visible"];

for (const width of WIDTHS) {
  for (const state of STATES) {
    test(`no interactive control is visually occluded at ${width}px in ${state}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openWithPdf(page, TEXT_ONLY_PDF);
      await enterState(page, state);

      const occluded = await occludedControls(page);
      expect(occluded, `occluded at ${width}px in ${state}: ${occluded.join(" | ")}`).toEqual([]);
    });
  }
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

// The invariant, asserted by walking the real tab order rather than by
// checking an attribute. The attribute is the mechanism and can change; what
// must never change is that a control unreachable by mouse is also
// unreachable by keyboard.
//
// This existed as a live defect: in redact mode the inline editor sat behind
// the drag surface but stayed fully focusable, so Tab could reach "Restyle
// this text" -- a document-mutating action -- inside the mode whose whole
// purpose is a confirmed destructive one.
test("no mouse-unreachable editing control can be reached by keyboard in redact mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWithPdf(page, TEXT_ONLY_PDF);
  await enterRedactMode(page);

  const forbidden = ["Restyle this text", "Cancel edit", "Apply edit", "Edit text"];
  const reached: string[] = [];

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  for (let step = 0; step < 120; step += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return active?.getAttribute("aria-label") ?? active?.textContent?.trim().slice(0, 30) ?? "";
    });
    if (forbidden.includes(label) && !reached.includes(label)) reached.push(label);
  }

  expect(reached, `keyboard reached mouse-unreachable controls: ${reached.join(", ")}`).toEqual([]);
});
