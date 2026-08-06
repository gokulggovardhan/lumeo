import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { textRunsFromContent, findTextRunAtPoint } from "../lib/pdf/edit/textRuns.ts";

async function loadPdfjsPage(bytes: Uint8Array, pageNumber = 1) {
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  return doc.getPage(pageNumber);
}

test("textRunsFromContent places an unrotated run at the expected screen position and scale", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // PDF origin is bottom-left; y=700 puts the text near the top of the page.
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const bytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(bytes);
  const scale = 2;
  const viewport = pdfjsPage.getViewport({ scale });
  const content = await pdfjsPage.getTextContent();

  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 1);
  const [run] = runs;

  assert.equal(run.str, "Hello World");
  assert.equal(run.rotated, false);
  // Font size in device px should scale with the viewport's scale factor.
  assert.ok(Math.abs(run.fontSizePx - 18 * scale) < 1, `expected ~${18 * scale}px, got ${run.fontSizePx}`);
  // x=50pt at scale 2 -> 100px from the left edge.
  assert.ok(Math.abs((run.xPct / 100) * viewport.width - 100) < 2);
  // Page is 792pt tall; text baseline at y=700 is near the top, so yPct
  // should be small (well under 50% down the rendered page).
  assert.ok(run.yPct >= 0 && run.yPct < 25, `expected run near the top of the page, got yPct=${run.yPct}`);
  assert.ok(run.widthPct > 0);
  assert.ok(run.heightPct > 0);
  // A single short run can never be wider than the page itself -- locks in
  // the fix below (widthPx used to double-count the font-size scale).
  assert.ok(run.widthPct < 50, `expected a modest widthPct, got ${run.widthPct}`);
});

// Regression for a real, proven bug (Phase 9.1 of true PDF text editing):
// widthPx used to be computed as `item.width * Math.hypot(tx[0], tx[1])`,
// where tx is the item's own FULL combined transform (viewport . item's
// own text matrix) -- but pdfjs's item.width is already the real advance
// width AT THE ITEM'S OWN FONT SIZE (i.e. already includes that same font-
// size scale tx's a/b components also carry), so multiplying by tx's own
// scale double-counted it. For a 24pt "Hello World" (real advance
// 124.008pt) this produced widthPct=486% -- the run's bounding box was
// rendered many times wider than the page itself. Fixed by scaling
// item.width with the VIEWPORT's own scale factor alone
// (Math.hypot(viewportTransform[0], viewportTransform[1])), independent of
// any per-item transform. Verified against an independently-computed
// expected width (item.width * viewport scale, in px) rather than just a
// loose bound, and across several font sizes/scales so the fix isn't
// tuned to one accidental cancellation.
test("textRunsFromContent's widthPct matches the run's real advance width, not inflated by double-counting font size", async () => {
  for (const [text, fontSizePt, scale] of [
    ["Hello World", 24, 1.3],
    ["A much longer line of sample text.", 12, 2],
    ["Big", 72, 1],
  ] as const) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x: 50, y: 700, size: fontSizePt, font });
    const bytes = await doc.save();

    const pdfjsPage = await loadPdfjsPage(bytes);
    const viewport = pdfjsPage.getViewport({ scale });
    const content = await pdfjsPage.getTextContent();
    const [item] = content.items as unknown as { width: number }[];

    const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
    assert.equal(runs.length, 1);

    const expectedWidthPx = item.width * scale;
    const actualWidthPx = (runs[0].widthPct / 100) * viewport.width;
    assert.ok(
      Math.abs(actualWidthPx - expectedWidthPx) < 1,
      `"${text}" @ ${fontSizePt}pt, scale ${scale}: expected widthPx ~${expectedWidthPx}, got ${actualWidthPx}`,
    );
    // Never wider than the page for a single short/medium line at a normal
    // font size -- the exact symptom the bug produced (400%+ widths).
    assert.ok(runs[0].widthPct < 100, `"${text}": expected widthPct < 100, got ${runs[0].widthPct}`);
  }
});

test("textRunsFromContent flags a rotated page's text as rotated", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.setRotation(degrees(90));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rotated text.", { x: 50, y: 700, size: 18, font });
  const bytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(bytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();

  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].rotated, true);
});

test("textRunsFromContent skips whitespace-only items and returns nothing for a blank page", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(bytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();

  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 0);
});

test("findTextRunAtPoint hit-tests a point against a run's box and misses outside it", () => {
  const runs = [
    { str: "Hello", fontName: "F1", xPct: 10, yPct: 10, widthPct: 20, heightPct: 5, fontSizePx: 16, rotated: false },
  ];

  const hit = findTextRunAtPoint(runs, 15, 12);
  assert.equal(hit?.str, "Hello");

  const miss = findTextRunAtPoint(runs, 50, 50);
  assert.equal(miss, null);
});

test("findTextRunAtPoint prefers the last (visually topmost) run when boxes overlap", () => {
  const runs = [
    { str: "Bottom", fontName: "F1", xPct: 10, yPct: 10, widthPct: 20, heightPct: 5, fontSizePx: 16, rotated: false },
    { str: "Top", fontName: "F1", xPct: 10, yPct: 10, widthPct: 20, heightPct: 5, fontSizePx: 16, rotated: false },
  ];

  const hit = findTextRunAtPoint(runs, 15, 12);
  assert.equal(hit?.str, "Top");
});
