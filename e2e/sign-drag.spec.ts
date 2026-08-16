import { expect, test, type Page } from "@playwright/test";
import { TEXT_ONLY_PDF, writeFixtures } from "./fixtures.ts";

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

async function openSignWithPlacedText(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/pdf/sign");
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  // "+ Text" places an element without needing a drawn signature first.
  const addText = page.getByRole("button", { name: "+ Text", exact: true });
  await expect(addText).toBeVisible({ timeout: 90_000 });
  await addText.click();
  await expect(page.locator(PLACED)).toHaveCount(1, { timeout: 30_000 });
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

/** A real drag: press, several moves, one release. */
async function dragBy(page: Page, dx: number, dy: number, steps: number) {
  const box = await page.locator(PLACED).first().boundingBox();
  if (!box) throw new Error("placed element has no box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

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

  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await expect
    .poll(async () => positionOf(page), {
      timeout: 30_000,
      message: "one undo must restore the pre-drag position in a single step",
    })
    .toEqual(before);

  // The entry count, not just the outcome. Undo stays ENABLED here because
  // the placement is still on the stack -- so the proof that the drag was
  // exactly one entry is that the NEXT undo removes the element itself. If
  // the drag had left more than one entry, this second undo would move the
  // element again instead of deleting it.
  expect(await undoDisabled(page), "the placement entry should still be undoable").toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(PLACED), "the second undo must remove the placement, not rewind more drag")
    .toHaveCount(0, { timeout: 30_000 });
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
