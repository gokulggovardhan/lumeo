import { expect, test, type Page } from "@playwright/test";
import { TEXT_ONLY_PDF, TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";

// The one invariant Sign's drag depends on, and the only place it can
// actually be tested.
//
// PlacedElementView writes position straight to its DOM node's style during
// a drag -- no React -- and calls onChange exactly ONCE at gesture end. So a
// whole drag is one undo entry. If that ever regresses to firing per
// pointermove (which is what it did before #50), undo silently degrades to
// rewinding a pixel at a time, and nobody notices until they try to undo a
// drag.
//
// A jsdom harness cannot catch this: the property lives in real pointer
// event sequencing, not in the hook. Position-only assertions cannot catch
// it either -- with per-move entries the FIRST undo still moves the element,
// just not all the way back. The entry count is the thing to assert.

const PLACED = '[role="button"][aria-label*="element, use arrow keys"]';

test.beforeAll(async () => {
  await writeFixtures();
});

test("a slower earlier upload cannot replace the latest selected PDF", async ({ page }) => {
  await page.addInitScript(() => {
    const originalArrayBuffer = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function arrayBuffer() {
      if (this.name === "text-only.pdf") {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      return originalArrayBuffer.call(this);
    };
  });
  await page.goto("/pdf/sign");
  const input = page.locator('input[type="file"]').first();

  await input.setInputFiles(TEXT_ONLY_PDF);
  await input.setInputFiles(TWO_PAGE_PDF);

  await expect(page.getByText("two-page.pdf", { exact: true }).first()).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText("two-page.pdf", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("text-only.pdf", { exact: true })).toHaveCount(0);
});

async function openSignWithPlacedText(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // A cold CI browser can occasionally lose the first local fixture handoff
  // while PDF.js/Worker startup is still settling. Retry the whole open once
  // instead of waiting 90 seconds on a missing control. The second attempt
  // still has to prove the real filename, tool control, Workspace projection,
  // and semantic history below, so this cannot turn a product regression into
  // a false green.
  let addText = page.getByRole("button", { name: "+ Text", exact: true });
  let openError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/pdf/sign", { waitUntil: "domcontentloaded" });
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeAttached({ timeout: 30_000 });
    await input.setInputFiles(TEXT_ONLY_PDF);
    addText = page.getByRole("button", { name: "+ Text", exact: true });

    try {
      await expect(
        page.getByText("text-only.pdf", { exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(addText).toBeVisible({ timeout: 30_000 });
      openError = null;
      break;
    } catch (error) {
      openError = error;
    }
  }
  if (openError) throw openError;

  const workspace = page.locator("[data-workspace-lifecycle]");
  await expect(workspace).toHaveAttribute(
    "data-workspace-projection-compatible",
    "true",
  );
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "ready");
  await expect(workspace).toHaveAttribute("data-workspace-operation-count", "0");
  await addText.click();
  await expect(page.locator(PLACED)).toHaveCount(1, { timeout: 30_000 });
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "modified");
  await expect(workspace).toHaveAttribute("data-workspace-active-area", "sign");
  await expect(workspace).toHaveAttribute("data-workspace-operation-count", "1");
  await expect(workspace).toHaveAttribute(
    "data-workspace-has-unsaved-changes",
    "true",
  );
  await expect
    .poll(() => semanticHistoryCount(page), {
      timeout: 30_000,
      message: "placement should append one semantic history entry",
    })
    .toBe(1);
}

/** Percent-space position, which is what the element actually stores. */
async function positionOf(page: Page) {
  return page.locator(PLACED).first().evaluate((node) => ({
    left: (node as HTMLElement).style.left,
    top: (node as HTMLElement).style.top,
  }));
}

async function undoDisabled(page: Page) {
  return page.getByRole("button", { name: "Undo", exact: true }).isDisabled();
}

async function semanticHistoryCount(page: Page) {
  const value = await page
    .locator("[data-sign-semantic-history-count]")
    .getAttribute("data-sign-semantic-history-count");
  return Number(value ?? "0");
}

/** A real drag: press, several moves, one release. */
async function dragBy(page: Page, dx: number, dy: number, steps: number) {
  const placed = page.locator(PLACED).first();

  // The workspace now has a compact status/history row above the canvas.
  // A real user naturally scrolls the document into view before dragging,
  // but raw page.mouse coordinates do not do that for us. Keep this
  // regression focused on Sign's gesture/history invariant rather than on
  // where the canvas happens to land vertically as the workspace chrome
  // evolves.
  await placed.scrollIntoViewIfNeeded();
  await expect(placed).toBeVisible();

  const box = await placed.boundingBox();
  if (!box) throw new Error("placed element has no box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  const hitTarget = await page.evaluate(
    ({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return Boolean(target?.closest('[role="button"][aria-label*="element, use arrow keys"]'));
    },
    { x: startX, y: startY },
  );
  if (!hitTarget) {
    throw new Error("placed element is not the pointer hit target after scrolling into view");
  }

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(startX + (dx * step) / steps, startY + (dy * step) / steps);
  }
  await page.mouse.up();
}

test("one drag is ONE undo entry -- a single undo returns the element and exhausts it", async ({ page }) => {
  await openSignWithPlacedText(page);
  const before = await positionOf(page);

  await dragBy(page, 180, 120, 8);

  const afterDrag = await positionOf(page);
  expect(afterDrag, "the drag must actually move the element").not.toEqual(before);
  await expect
    .poll(() => semanticHistoryCount(page), {
      timeout: 30_000,
      message: "drag should append exactly one semantic history entry",
    })
    .toBe(2);

  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await expect
    .poll(async () => positionOf(page), {
      timeout: 30_000,
      message: "one undo must restore the pre-drag position in a single step",
    })
    .toEqual(before);
  await expect
    .poll(() => semanticHistoryCount(page), {
      timeout: 30_000,
      message: "semantic journal should rewind with the same undo snapshot",
    })
    .toBe(1);

  // The entry count, not just the outcome. Undo stays ENABLED here because
  // the placement is still on the stack -- so the proof that the drag was
  // exactly one entry is that the NEXT undo removes the element itself. If
  // the drag had left more than one entry, this second undo would move the
  // element again instead of deleting it.
  expect(await undoDisabled(page), "the placement entry should still be undoable").toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(PLACED), "the second undo must remove the placement, not rewind more drag")
    .toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => semanticHistoryCount(page), {
      timeout: 30_000,
      message: "semantic journal should be empty after undoing placement",
    })
    .toBe(0);
  expect(await undoDisabled(page), "nothing should remain to undo").toBe(true);
});

// The guard that position alone cannot give. Eight pointermove events must
// not become eight history entries -- after the single undo above, Undo is
// disabled, so there is exactly one entry for the placement and one for the
// drag, and no more.
test("N pointermove events do NOT produce N history entries", async ({ page }) => {
  await openSignWithPlacedText(page);
  const before = await positionOf(page);

  await dragBy(page, 200, 140, 12);
  expect(await positionOf(page)).not.toEqual(before);

  // One undo takes the whole drag.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => positionOf(page), { timeout: 30_000 }).toEqual(before);

  // And nothing of the drag remains: the very next undo removes the
  // placement. If the 12 moves had become 12 entries, this undo would move
  // the element again instead of deleting it -- which is precisely what
  // position-only assertions miss, since the first undo still moves it.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(PLACED), "12 pointermoves must collapse to ONE history entry")
    .toHaveCount(0, { timeout: 30_000 });
});

test("Sign export lifecycle is truthful and undo invalidates the published result", async ({ page }) => {
  await openSignWithPlacedText(page);
  const workspace = page.locator("[data-workspace-lifecycle]");

  // Date has a real nonempty value immediately, so this exercises export
  // without relying on browser-specific prompt/double-click behavior.
  await page.getByRole("button", { name: "+ Date", exact: true }).click();
  await expect(page.locator(PLACED)).toHaveCount(2);
  await expect(workspace).toHaveAttribute("data-workspace-operation-count", "2");

  await page.getByRole("button", { name: "Sign PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download signed PDF", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "exported");
  await expect(workspace).toHaveAttribute("data-workspace-active-area", "export");
  await expect(workspace).toHaveAttribute(
    "data-workspace-has-unsaved-changes",
    "false",
  );

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download signed PDF", exact: true }),
  ).toHaveCount(0);
  await expect(workspace).toHaveAttribute("data-workspace-lifecycle", "modified");
  await expect(workspace).toHaveAttribute("data-workspace-active-area", "sign");
  await expect(workspace).toHaveAttribute(
    "data-workspace-has-unsaved-changes",
    "true",
  );
});


test("signed PDF can continue directly into Pages without reopening the file", async ({ page }) => {
  await openSignWithPlacedText(page);

  // Give export one guaranteed non-empty field without changing the existing
  // signature engine or relying on the signature-library UI.
  await page.getByRole("button", { name: "+ Date", exact: true }).click();
  await expect(page.locator(PLACED)).toHaveCount(2);

  await page.getByRole("button", { name: "Sign PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download signed PDF", exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  const continuation = page.getByRole("region", {
    name: "Continue with this PDF",
  });
  await expect(continuation).toBeVisible();
  await expect(
    continuation.getByRole("button", { name: "Pages", exact: true }),
  ).toBeVisible();

  await continuation
    .getByRole("button", { name: "Pages", exact: true })
    .click();

  await expect(page).toHaveURL(/\/pdf\/organize$/);
  await expect(
    page.locator('[data-workspace-active-area="pages"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Page 1", { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });

  // A continuation arrives already open. The target tool must not send the
  // user back through its standalone file-selection stage.
  await expect(page.locator("#organize-pdf-upload")).toHaveCount(0);
});
