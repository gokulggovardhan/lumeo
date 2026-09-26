import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import {
  PDFDocument,
  PDFHexString,
  StandardFonts,
  beginText,
  endText,
  moveText,
  nextLine,
  setFontAndSize,
  setLineHeight,
  showText,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";
import {
  buildEditPlan,
  decodeTextShowOperator,
} from "../lib/pdf/edit/editPlan.ts";
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { textRunsFromContent } from "../lib/pdf/edit/textRuns.ts";
import {
  compareRgbaImages,
  type PixelRect,
} from "../lib/pdf/edit/visualDiff.ts";

const RENDER_SCALE = 2;
const EDIT_MASK_MARGIN_PX = 2;

type RenderedPage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  runs: ReturnType<typeof textRunsFromContent>;
};

function hexOf(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

async function buildVisualFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(56),
    moveText(72, 700),
    showText(PDFHexString.of(hexOf("Invoice 2026"))),
    nextLine(),
    showText(PDFHexString.of(hexOf("Balance 1234.00"))),
    nextLine(),
    showText(PDFHexString.of(hexOf("Approved locally"))),
    endText(),
  );

  return doc.save();
}

async function renderFirstPage(bytes: Uint8Array): Promise<RenderedPage> {
  const doc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    await page.render({
      canvas: canvas as never,
      canvasContext: context as never,
      viewport,
    }).promise;

    const image = context.getImageData(0, 0, width, height);
    const content = await page.getTextContent();
    const runs = textRunsFromContent(
      content.items as never,
      viewport.transform,
      viewport.width,
      viewport.height,
      content.styles as never,
    );

    return {
      width,
      height,
      rgba: new Uint8ClampedArray(image.data),
      runs,
    };
  } finally {
    const destroy = (doc as { destroy?: () => Promise<void> | void }).destroy;
    if (typeof destroy === "function") await destroy.call(doc);
  }
}

function runPixelRect(
  run: ReturnType<typeof textRunsFromContent>[number],
  width: number,
  height: number,
): PixelRect {
  const x = (run.xPct / 100) * width;
  const y = (run.yPct / 100) * height;
  const runWidth = (run.widthPct / 100) * width;
  const runHeight = (run.heightPct / 100) * height;
  return {
    x: x - EDIT_MASK_MARGIN_PX,
    y: y - EDIT_MASK_MARGIN_PX,
    width: runWidth + EDIT_MASK_MARGIN_PX * 2,
    height: runHeight + EDIT_MASK_MARGIN_PX * 2,
  };
}

function unionRects(a: PixelRect, b: PixelRect): PixelRect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

test("visual diff primitive detects an unexplained pixel outside the edit mask", () => {
  const before = new Uint8ClampedArray(4 * 4 * 4);
  const after = before.slice();

  // One allowed changed pixel at (1,1), one forbidden pixel at (3,3).
  after[(1 * 4 + 1) * 4] = 255;
  after[(3 * 4 + 3) * 4] = 255;

  const diff = compareRgbaImages({
    before,
    after,
    width: 4,
    height: 4,
    maskRects: [{ x: 1, y: 1, width: 1, height: 1 }],
  });

  assert.equal(diff.changedPixels, 2);
  assert.equal(diff.changedPixelsInsideMask, 1);
  assert.equal(diff.changedPixelsOutsideMask, 1);
  assert.deepEqual(diff.changedOutsideMaskBounds, {
    x: 3,
    y: 3,
    width: 1,
    height: 1,
  });
});

test("unedited Edit PDF export round-trip has zero visual degradation", async () => {
  const original = await buildVisualFixture();
  const originalBuffer = original.buffer.slice(
    original.byteOffset,
    original.byteOffset + original.byteLength,
  ) as ArrayBuffer;

  const exported = await exportEditedPdf(originalBuffer, []);
  assert.deepEqual(exported.skippedPages, []);

  const before = await renderFirstPage(original);
  const after = await renderFirstPage(exported.bytes);
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);

  const diff = compareRgbaImages({
    before: before.rgba,
    after: after.rgba,
    width: before.width,
    height: before.height,
  });

  assert.equal(
    diff.changedPixels,
    0,
    "An unedited open/export/reopen cycle must not alter a rendered pixel.",
  );
  assert.equal(diff.maxChannelDelta, 0);
});

test("native text edit changes pixels only inside the proven edited glyph region", async () => {
  const original = await buildVisualFixture();
  const doc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(doc, 0);
  const registry = new PdfFontRegistry(doc);

  let target:
    | {
        locatedOperator: (typeof located)[number];
        profile: NonNullable<ReturnType<PdfFontRegistry["resolve"]>>;
      }
    | null = null;

  for (const locatedOperator of located) {
    const resourceName = locatedOperator.operator.fontResourceName;
    if (!resourceName) continue;
    const profile = registry.resolve(locatedOperator.resources, resourceName);
    if (!profile) continue;
    const decoded = decodeTextShowOperator(
      locatedOperator.operator,
      profile.resolvedFont,
    );
    if (decoded.allDecoded && decoded.text === "Balance 1234.00") {
      target = { locatedOperator, profile };
      break;
    }
  }

  assert.ok(target, "The deterministic fixture must expose the target native text operator.");

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex:
      target.locatedOperator.locator.kind === "page"
        ? target.locatedOperator.locator.contentStreamIndex
        : 0,
    formPath:
      target.locatedOperator.locator.kind === "xobject"
        ? target.locatedOperator.locator.formPath
        : null,
    operatorIndex: target.locatedOperator.operatorIndex,
    operator: target.locatedOperator.operator,
    replacementText: "Balance 9876.00",
    resolvedFont: target.profile.resolvedFont,
    fontMetrics: target.profile.metrics,
    embeddedGlyphEvidence: target.profile.embeddedGlyphEvidence,
  });
  assert.equal(plan.editable, true, plan.reason ?? undefined);

  await applyEditPlanToDocument(
    doc,
    plan,
    target.profile.resolvedFont.bytesPerCode,
  );
  const edited = await doc.save();

  const before = await renderFirstPage(original);
  const after = await renderFirstPage(edited);
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);

  const beforeRun = before.runs.find((run) => run.str.includes("Balance 1234.00"));
  const afterRun = after.runs.find((run) => run.str.includes("Balance 9876.00"));
  assert.ok(beforeRun);
  assert.ok(afterRun);

  const mask = unionRects(
    runPixelRect(beforeRun, before.width, before.height),
    runPixelRect(afterRun, after.width, after.height),
  );
  const diff = compareRgbaImages({
    before: before.rgba,
    after: after.rgba,
    width: before.width,
    height: before.height,
    maskRects: [mask],
  });

  // Vacuity check: if the edit were accidentally skipped, this assertion
  // would fail even though the outside-region assertion would otherwise pass.
  assert.ok(
    diff.changedPixelsInsideMask > 0,
    "The edited glyph region must contain a real raster difference.",
  );
  assert.equal(
    diff.changedPixelsOutsideMask,
    0,
    "Native text editing must not alter any rendered pixel outside the edited glyph region.",
  );
  assert.equal(diff.changedOutsideMaskBounds, null);
});
