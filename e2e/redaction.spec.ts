import { expect, test } from "@playwright/test";
import {
  LAYER_SELECTOR,
  runSelectorFor,
  outcomePanel,
  waitForStageReady,
  unremovedRuns,
  applyRedactionThroughModal,
  blackMaskCount,
  detectedRunTexts,
  dragBoxOverRun,
  enterRedactMode,
  openWithPdf,
} from "./helpers.ts";
import { SPLIT_RUN_PDF, TEXT_ONLY_PDF, WITH_IMAGE_PDF, writeFixtures } from "./fixtures.ts";

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

    const panel = outcomePanel(page);
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel).toContainText("read this before sharing the file");
    await expect(panel).toContainText("Text inside an image is part of the picture");

    // The incomplete state, asserted on the attribute the component derives
    // from its own coverage result -- not on colours. A theme pass must not
    // be able to break a security assertion, nor silently satisfy one.
    await expect(panel).toHaveAttribute("data-coverage", "incomplete");
  });

  test("a run that cannot be stripped is named individually, not just counted", async ({ page }) => {
    // The image fixture cannot exercise this: every targeted run there IS
    // strippable, so unremovedRuns is legitimately empty and the naming path
    // never runs. This fixture splits the SSN across two show operators, which
    // runSpansMultipleOperators rejects -- masked, not removed.
    await openWithPdf(page, SPLIT_RUN_PDF);
    await enterRedactMode(page);
    await dragBoxOverRun(page, "123-45-6789");
    await applyRedactionThroughModal(page);

    const panel = outcomePanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-coverage", "incomplete");

    // Asserted on the per-run hook directly. The previous version matched
    // /not removed/i against the panel's whole text, which the image-warning
    // sentence also satisfies -- so it demanded a list that correctly did not
    // exist, and would have passed for the wrong reason on another fixture.
    const named = unremovedRuns(page);
    await expect(named).toHaveCount(1);
    await expect(named.first()).toContainText("123-45-6789");

    // The document must still be readable -- absence of the panel's claim is
    // not evidence, so check the stage rendered with its other run intact.
    await waitForStageReady(page);
    const runs = await detectedRunTexts(page);
    expect(runs.some((run) => run.includes("Employee record"))).toBe(true);
    // And the honest part: it was NOT removed, so it is still there.
    expect(runs.some((run) => run.includes("123-45-6789"))).toBe(true);
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

    // applyRedactionThroughModal already gated on the stage being ready, so
    // what follows reads a real stage rather than a loading skeleton. That
    // matters: an empty stage satisfies "the SSN is gone" while proving
    // nothing, which is how this assertion used to pass.
    const afterRedaction = await detectedRunTexts(page);
    expect(afterRedaction.length, "stage must have rendered before asserting absence").toBeGreaterThan(0);
    expect(afterRedaction.some((run) => run.includes("123-45-6789"))).toBe(false);
    // Other content still present -- absence is only meaningful alongside it.
    expect(afterRedaction.some((run) => run.includes("Employee record"))).toBe(true);
    expect(await blackMaskCount(page)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await waitForStageReady(page);

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
    await waitForStageReady(page);
    await expect
      .poll(async () => (await detectedRunTexts(page)).some((run) => run.includes("123-45-6789")), { timeout: 60_000 })
      .toBe(true);

    await page.getByRole("button", { name: "Redo" }).click();
    await waitForStageReady(page);
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

  const run = page.locator(runSelectorFor("123-45-6789")).first();
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
