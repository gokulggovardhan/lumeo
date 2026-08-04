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
