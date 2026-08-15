import { expect, test } from "@playwright/test";
import {
  LAYER_SELECTOR,
  RUN_SELECTOR,
  applyRedactionThroughModal,
  blackMaskCount,
  detectedRunTexts,
  dragBoxOverRun,
  enterRedactMode,
  openWithPdf,
} from "./helpers.ts";
import { TEXT_ONLY_PDF, WITH_IMAGE_PDF, writeFixtures } from "./fixtures.ts";

// These cover the three things Node cannot: the drag surface, the
// confirmation modal, and the outcome panel's incomplete-coverage state.
//
// They exist because manual verification in this environment was defeated
// by a backgrounded browser window -- requestAnimationFrame stops, pdfjs's
// render loop stalls, and the failure is indistinguishable from a real bug.
// Headless Chromium runs rAF normally, and unlike a manual pass these guard
// against regressions.

test.beforeAll(async () => {
  await writeFixtures();
});

test.describe("redaction on a page containing an image", () => {
  test("the modal warns about image pixels, and the outcome panel goes red naming each un-removed run", async ({ page }) => {
    await openWithPdf(page, WITH_IMAGE_PDF);
    await enterRedactMode(page);
    await dragBoxOverRun(page, "123-45-6789");

    // The caveat has to be stated BEFORE the action, while the user can
    // still decide the output is not safe to share.
    await page.getByRole("button", { name: /^Redact \d+ runs?$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Text inside images");
    await expect(dialog).toContainText("the pixels stay in the file");

    await dialog.getByRole("button", { name: "Redact", exact: true }).click();

    const panel = page.getByRole("alert");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel).toContainText("read this before sharing the file");
    await expect(panel).toContainText("Text inside an image is part of the picture");

    // Red, not the neutral complete-coverage styling. Asserted on the
    // computed colour rather than a class name so a restyle that keeps the
    // class but loses the colour still fails.
    const borderColour = await panel.evaluate((node) => getComputedStyle(node).borderTopColor);
    const [r, g, b] = borderColour.match(/\d+/g)!.map(Number);
    expect(r, `border should be red, got ${borderColour}`).toBeGreaterThan(150);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });

  test("an un-removable run is named individually rather than only counted", async ({ page }) => {
    await openWithPdf(page, WITH_IMAGE_PDF);
    await enterRedactMode(page);
    // Every run at once, so any that cannot be stripped shows up by name.
    for (const needle of ["Employee record", "123-45-6789", "ada@example.com", "84500"]) {
      const run = page.locator(RUN_SELECTOR, { hasText: needle }).first();
      const box = await run.boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + 2, box.y + 1);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width - 2, box.y + box.height - 1);
      await page.mouse.up();
    }
    await applyRedactionThroughModal(page);

    const panel = page.getByRole("alert");
    const text = await panel.innerText();
    // Either everything was removed (then the image warning still fires and
    // the panel is red), or something was not -- and if so it must be named,
    // never reported as a bare count.
    if (/not removed/i.test(text)) {
      expect(text, "un-removed runs must be quoted, not just counted").toMatch(/“[^”]+”/);
    }
    await expect(panel).toContainText("Text inside an image is part of the picture");
  });
});

test.describe("undo and redo move the mask and the stripped text together", () => {
  test("one Undo restores both the text and removes the mask", async ({ page }) => {
    await openWithPdf(page, TEXT_ONLY_PDF);
    const before = await detectedRunTexts(page);
    expect(before.some((run) => run.includes("123-45-6789"))).toBe(true);

    await enterRedactMode(page);
    await dragBoxOverRun(page, "123-45-6789");
    await applyRedactionThroughModal(page);

    await expect
      .poll(async () => (await detectedRunTexts(page)).some((run) => run.includes("123-45-6789")), {
        timeout: 60_000,
        message: "the SSN should be gone from the document after redacting",
      })
      .toBe(false);
    expect(await blackMaskCount(page)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Undo" }).click();

    // ONE assertion block, because the defect this guards against is the two
    // halves moving independently: a mask left over text that is already
    // gone, or text restored while the black box stays on top of it.
    await expect
      .poll(
        async () => ({
          textBack: (await detectedRunTexts(page)).some((run) => run.includes("123-45-6789")),
          masks: await blackMaskCount(page),
        }),
        { timeout: 60_000, message: "undo must restore the text AND remove the mask in one step" },
      )
      .toEqual({ textBack: true, masks: 0 });
  });

  test("Redo re-applies both halves together", async ({ page }) => {
    await openWithPdf(page, TEXT_ONLY_PDF);
    await enterRedactMode(page);
    await dragBoxOverRun(page, "123-45-6789");
    await applyRedactionThroughModal(page);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(async () => (await detectedRunTexts(page)).some((run) => run.includes("123-45-6789")), { timeout: 60_000 })
      .toBe(true);

    await page.getByRole("button", { name: "Redo" }).click();
    await expect
      .poll(
        async () => ({
          textGone: !(await detectedRunTexts(page)).some((run) => run.includes("123-45-6789")),
          hasMask: (await blackMaskCount(page)) > 0,
        }),
        { timeout: 60_000, message: "redo must re-strip the text AND restore the mask" },
      )
      .toEqual({ textGone: true, hasMask: true });
  });
});

// Regression for the bug found during live verification: handlePointerUp
// read the draft from the closure of the render that bound it, so a box only
// survived if React had re-rendered between the last pointermove and
// pointerup. Dispatching move and up with no chance to re-render in between
// is the condition that used to lose the box silently.
test("a box drawn with coalesced pointermove and pointerup still commits", async ({ page }) => {
  await openWithPdf(page, TEXT_ONLY_PDF);
  await enterRedactMode(page);

  const run = page.locator(RUN_SELECTOR, { hasText: "123-45-6789" }).first();
  const box = await run.boundingBox();
  expect(box).not.toBeNull();

  await page.evaluate(
    ({ selector, rect }) => {
      const layer = document.querySelector(selector) as HTMLElement;
      // setPointerCapture on a synthetic event id would throw; the handler
      // calls it unconditionally.
      (layer as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
      const options = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" };
      layer.dispatchEvent(new PointerEvent("pointerdown", { ...options, clientX: rect.x + 2, clientY: rect.y + 1 }));
      // No await between these two: same task, so React cannot re-render.
      layer.dispatchEvent(
        new PointerEvent("pointermove", { ...options, clientX: rect.x + rect.width - 2, clientY: rect.y + rect.height - 1 }),
      );
      layer.dispatchEvent(
        new PointerEvent("pointerup", { ...options, clientX: rect.x + rect.width - 2, clientY: rect.y + rect.height - 1 }),
      );
    },
    { selector: LAYER_SELECTOR, rect: box! },
  );

  await expect(page.locator('[aria-label^="Remove redaction box"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Redact 1 run$/ })).toBeEnabled();
});
