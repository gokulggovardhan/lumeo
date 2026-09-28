import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  applyEditPlanToDocument,
  applyShapedGlyphEditPlanToDocument,
} from "../lib/pdf/edit/applyEditPlan.ts";
import {
  buildEditPlan,
  decodeTextShowOperator,
} from "../lib/pdf/edit/editPlan.ts";
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { shapeEmbeddedFontText } from "../lib/pdf/edit/harfbuzzShaping.ts";
import { buildShapedGlyphEditPlan } from "../lib/pdf/edit/shapedGlyphEditPlan.ts";
import { createLocalCustomFontAsset } from "../lib/pdf/edit/localCustomFont.ts";
import { buildReviewedOcrSearchableInput } from "../lib/pdf/edit/ocrReview.ts";
import { inverseMapOcrBoundsPct } from "../lib/pdf/edit/localOcr.ts";
import {
  addSearchableOcrTextLayer,
  firstMissingSearchableOcrWord,
} from "../lib/pdf/edit/searchableOcrLayer.ts";
import {
  applyLocalFontSubstitutionToBytes,
  buildLocalFontSubstitutionPlan,
} from "../lib/pdf/edit/localFontSubstitution.ts";
import {
  applyParagraphEditPlanToDocument,
  buildParagraphEditPlan,
} from "../lib/pdf/edit/paragraphEditPlan.ts";
import {
  buildShapedLtrType0Pdf,
  readCiTrueTypeFontBytes,
  SHAPED_LTR_REPLACEMENT,
} from "../tests/fixtures/shapedGlyphFixture.ts";
import {
  buildPreservedLineParagraphPdf,
  PARAGRAPH_REPLACEMENT_LINES,
  PARAGRAPH_SOURCE_LINES,
} from "../tests/fixtures/paragraphFixture.ts";
import {
  buildOperatorSpatialIndex,
  matchDetectedRunToOperatorIndexed,
} from "../lib/pdf/edit/matchTextRun.ts";
import {
  textRunsFromContent,
  transformPoint2x3,
} from "../lib/pdf/edit/textRuns.ts";
import {
  compareRgbaImages,
  type PixelRect,
} from "../lib/pdf/edit/visualDiff.ts";
import {
  buildEditPdfFidelityCorpusReport,
  type EditPdfFidelityFixtureMeasurement,
} from "../lib/pdf/edit/fidelityMetrics.ts";

const RENDER_SCALE = 2;
const EDIT_MASK_MARGIN_PX = 2;
const MAX_BASELINE_ERROR_PT = 0.05;

type Fixture = {
  id: string;
  category: string;
  expectedRuns: readonly string[];
  editTarget: string;
  replacementText: string;
  bytes: Uint8Array;
  editMode?: "ordinary" | "shaped-ltr" | "paragraph" | "native-local-font";
};

type RenderedPage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  runs: ReturnType<typeof textRunsFromContent>;
  viewportTransform: readonly number[];
};

type FixtureFonts = {
  helvetica: PDFFont;
  helveticaBold: PDFFont;
  helveticaOblique: PDFFont;
  times: PDFFont;
  timesBold: PDFFont;
  courier: PDFFont;
};

async function standardFonts(doc: PDFDocument): Promise<FixtureFonts> {
  const [
    helvetica,
    helveticaBold,
    helveticaOblique,
    times,
    timesBold,
    courier,
  ] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBold),
    doc.embedFont(StandardFonts.Courier),
  ]);
  return {
    helvetica,
    helveticaBold,
    helveticaOblique,
    times,
    timesBold,
    courier,
  };
}

function drawLine(
  page: PDFPage,
  text: string,
  {
    x,
    y,
    size = 12,
    font,
  }: {
    x: number;
    y: number;
    size?: number;
    font: PDFFont;
  },
): void {
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(0.08, 0.09, 0.11),
  });
}

async function structuredFixture({
  id,
  category,
  expectedRuns,
  editTarget,
  replacementText,
  draw,
}: {
  id: string;
  category: string;
  expectedRuns: readonly string[];
  editTarget: string;
  replacementText: string;
  draw: (
    page: PDFPage,
    fonts: FixtureFonts,
    doc: PDFDocument,
  ) => void | Promise<void>;
}): Promise<Fixture> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const fonts = await standardFonts(doc);
  await draw(page, fonts, doc);
  return {
    id,
    category,
    expectedRuns,
    editTarget,
    replacementText,
    bytes: await doc.save(),
  };
}

async function makeSimpleFixture(
  id: string,
  category: string,
  text: string,
  replacementText: string,
  options: {
    font?: typeof StandardFonts[keyof typeof StandardFonts];
    rotation?: 0 | 90 | 180 | 270;
    size?: number;
  } = {},
): Promise<Fixture> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  if (options.rotation) page.setRotation(degrees(options.rotation));
  const font = await doc.embedFont(
    options.font ?? StandardFonts.Helvetica,
  );
  page.drawText(text, {
    x: 72,
    y: 680,
    size: options.size ?? 12,
    font,
  });
  return {
    id,
    category,
    expectedRuns: [text],
    editTarget: text,
    replacementText,
    bytes: await doc.save(),
  };
}

function measurableTextCharacters(value: string): number {
  // textRunsFromContent intentionally discards whitespace-only PDF.js items:
  // they are not useful interactive/editable runs. Counting those separator
  // items in the denominator made monospaced documents look like detection
  // failures even though every visible glyph was detected and matched.
  // Span matching below still proves the document structure independently.
  return [...value].filter((character) => !/\s/u.test(character)).length;
}

function expectedText(fixture: Fixture): string {
  return fixture.expectedRuns.join("");
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function renderFirstPage(bytes: Uint8Array): Promise<RenderedPage> {
  const doc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
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
      viewportTransform: [...viewport.transform],
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
  viewportTransform: readonly number[],
): PixelRect {
  const x = (run.xPct / 100) * width;
  const y = (run.yPct / 100) * height;
  const runWidth = (run.widthPct / 100) * width;
  const runHeight = (run.heightPct / 100) * height;

  if (!run.rotated || !run.pdfJsTransform) {
    return {
      x: x - EDIT_MASK_MARGIN_PX,
      y: y - EDIT_MASK_MARGIN_PX,
      width: runWidth + EDIT_MASK_MARGIN_PX * 2,
      height: runHeight + EDIT_MASK_MARGIN_PX * 2,
    };
  }

  // x/y is the same top-left text-layer origin produced by
  // boxOriginFromTransform(). For rotated text, the local width/height axes
  // are rotated by the combined PDF.js viewport/text transform. Build the
  // four local rectangle corners in raster space and take their AABB; this
  // keeps the mask tied to PDF.js/PDF geometry rather than DOM measurement.
  const combined = transformPoint2x3(
    [...viewportTransform],
    [...run.pdfJsTransform],
  );
  const angle = Math.atan2(combined[1], combined[0]);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [0, 0],
    [runWidth, 0],
    [0, runHeight],
    [runWidth, runHeight],
  ].map(([localX, localY]) => ({
    x: x + localX * cos - localY * sin,
    y: y + localX * sin + localY * cos,
  }));

  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));

  return {
    x: minX - EDIT_MASK_MARGIN_PX,
    y: minY - EDIT_MASK_MARGIN_PX,
    width: maxX - minX + EDIT_MASK_MARGIN_PX * 2,
    height: maxY - minY + EDIT_MASK_MARGIN_PX * 2,
  };
}

function unionRects(a: PixelRect, b: PixelRect): PixelRect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
  };
}

function rectForExpectedTexts({
  rendered,
  texts,
}: {
  rendered: RenderedPage;
  texts: readonly string[];
}): PixelRect | null {
  let combined: PixelRect | null = null;
  for (const text of texts) {
    const rect = uniqueRunSequenceRect({
      runs: rendered.runs,
      expectedText: text,
      width: rendered.width,
      height: rendered.height,
      viewportTransform: rendered.viewportTransform,
    });
    if (!rect) return null;
    combined = combined ? unionRects(combined, rect) : rect;
  }
  return combined;
}

function normalizedVisibleText(value: string): string {
  return value.replace(/\s+/gu, "");
}

function uniqueRunSequenceRect({
  runs,
  expectedText,
  width,
  height,
  viewportTransform,
}: {
  runs: ReturnType<typeof textRunsFromContent>;
  expectedText: string;
  width: number;
  height: number;
  viewportTransform: readonly number[];
}): PixelRect | null {
  const expected = normalizedVisibleText(expectedText);
  if (!expected) return null;

  const matches: PixelRect[] = [];
  for (let start = 0; start < runs.length; start += 1) {
    let combined = "";
    let rect: PixelRect | null = null;

    for (let end = start; end < runs.length; end += 1) {
      combined += normalizedVisibleText(runs[end].str);
      if (!combined) continue;

      const current = runPixelRect(
        runs[end],
        width,
        height,
        viewportTransform,
      );
      rect = rect ? unionRects(rect, current) : current;

      if (combined === expected) {
        if (rect) matches.push(rect);
        break;
      }
      if (
        combined.length > expected.length ||
        !expected.startsWith(combined)
      ) {
        break;
      }
    }
  }

  // Duplicate visible strings are deliberately not guessed. A corpus target
  // must resolve to one unique PDF.js sequence before its raster mask can
  // authorize changed pixels.
  return matches.length === 1 ? matches[0] : null;
}

async function measure(
  fixture: Fixture,
): Promise<EditPdfFidelityFixtureMeasurement> {
  const pdfJsDoc = await pdfjsLib.getDocument({
    data: fixture.bytes.slice(),
    useWorkerFetch: false,
  }).promise;
  const pdfJsPage = await pdfJsDoc.getPage(1);
  const viewport = pdfJsPage.getViewport({ scale: 1 });
  const content = await pdfJsPage.getTextContent();
  const runs = textRunsFromContent(
    content.items as never,
    viewport.transform,
    viewport.width,
    viewport.height,
    content.styles as never,
  );

  const pdfLibDoc = await PDFDocument.load(fixture.bytes.slice());
  const located = collectPageTextOperators(pdfLibDoc, 0);
  const flat = located.map((item) => item.operator);
  const index = buildOperatorSpatialIndex(flat, viewport.transform);
  const byOperator = new Map(
    located.map((item) => [item.operator, item] as const),
  );
  const registry = new PdfFontRegistry(pdfLibDoc);

  // PDF.js may emit separator-only text items between otherwise substantive
  // runs (especially Courier/table-like layouts). They carry no visible glyph
  // characters and are not editable user text, so counting them as
  // "unsupported spans" depresses the corpus match ratio even when every
  // expected visible span is detected and mapped correctly. Keep them in the
  // raw render/run list for visual masking, but exclude them from capability
  // coverage metrics exactly as character recall already excludes whitespace.
  const substantiveRuns = runs.filter(
    (run) => measurableTextCharacters(run.str) > 0,
  );

  let matchedSpans = 0;
  let correctFontResolutions = 0;
  let unresolvedFonts = 0;
  const baselineErrorsPt: number[] = [];

  for (const run of substantiveRuns) {
    const operator = matchDetectedRunToOperatorIndexed(
      run,
      viewport.width,
      viewport.height,
      index,
    );
    if (!operator) continue;
    const source = byOperator.get(operator);
    if (!source) continue;
    matchedSpans += 1;

    if (
      typeof run.baselineXPct === "number" &&
      Number.isFinite(run.baselineXPct) &&
      typeof run.baselineYPct === "number" &&
      Number.isFinite(run.baselineYPct)
    ) {
      const nativeBaseline = transformPoint2x3(
        viewport.transform,
        operator.textRenderingMatrix,
      );
      const detectedBaselineX =
        (run.baselineXPct / 100) * viewport.width;
      const detectedBaselineY =
        (run.baselineYPct / 100) * viewport.height;
      baselineErrorsPt.push(
        Math.hypot(
          detectedBaselineX - nativeBaseline[4],
          detectedBaselineY - nativeBaseline[5],
        ),
      );
    }

    if (!operator.fontResourceName) {
      unresolvedFonts += 1;
      continue;
    }
    const profile = registry.resolve(
      source.resources,
      operator.fontResourceName,
    );
    if (profile && profile.encodingSource !== "Unknown") {
      correctFontResolutions += 1;
    } else {
      unresolvedFonts += 1;
    }
  }

  const detectedText = runs.map((run) => run.str).join("");
  const destroy = (pdfJsDoc as {
    destroy?: () => Promise<void> | void;
  }).destroy;
  if (typeof destroy === "function") await destroy.call(pdfJsDoc);

  let nativeEditSuccess = false;
  let exportSuccess = false;
  let reopenSuccess = false;
  let visualDiffPass = false;

  const editableDoc = await PDFDocument.load(fixture.bytes.slice());
  const editableLocated = collectPageTextOperators(editableDoc, 0);
  const editableRegistry = new PdfFontRegistry(editableDoc);
  let target:
    | {
        located: (typeof editableLocated)[number];
        profile: NonNullable<
          ReturnType<PdfFontRegistry["resolve"]>
        >;
      }
    | null = null;

  for (const entry of editableLocated) {
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) continue;
    const profile = editableRegistry.resolve(
      entry.resources,
      resourceName,
    );
    if (!profile) continue;
    const decoded = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    if (
      decoded.allDecoded &&
      decoded.text === fixture.editTarget
    ) {
      target = { located: entry, profile };
      break;
    }
  }

  if (target) {
    let writeApplied = false;
    let editedOverride: Uint8Array | null = null;

    if (fixture.editMode === "paragraph") {
      const targetStreamIndex =
        target.located.locator.kind === "page"
          ? target.located.locator.contentStreamIndex
          : null;
      const pageEntries =
        targetStreamIndex === null
          ? []
          : editableLocated
              .filter(
                (entry) =>
                  entry.locator.kind === "page" &&
                  entry.locator.contentStreamIndex === targetStreamIndex,
              )
              .sort((left, right) => left.operatorIndex - right.operatorIndex);
      const resourceName = pageEntries[0]?.operator.fontResourceName;
      if (resourceName && pageEntries.length === PARAGRAPH_SOURCE_LINES.length) {
        const profile = editableRegistry.resolve(
          pageEntries[0].resources,
          resourceName,
        );
        if (profile) {
          const paragraphPlan = buildParagraphEditPlan({
            pageIndex: 0,
            contentStreamIndex:
              pageEntries[0].locator.kind === "page"
                ? pageEntries[0].locator.contentStreamIndex
                : 0,
            allOperators: pageEntries.map((entry) => entry.operator),
            operatorIndices: pageEntries.map((_entry, index) => index),
            replacementText: fixture.replacementText,
            resolvedFont: profile.resolvedFont,
            fontMetrics: profile.metrics,
            embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
          });
          if (paragraphPlan.editable) {
            await applyParagraphEditPlanToDocument(
              editableDoc,
              paragraphPlan,
            );
            writeApplied = true;
          }
        }
      }
    } else if (fixture.editMode === "native-local-font") {
      if (target.located.locator.kind === "page") {
        const fontBytes = await readCiTrueTypeFontBytes();
        const assetResult = await createLocalCustomFontAsset(
          fontBytes,
          "fidelity-native-local.ttf",
        );
        if (assetResult.kind === "ready") {
          const localPlan = await buildLocalFontSubstitutionPlan({
            pageIndex: 0,
            contentStreamIndex:
              target.located.locator.contentStreamIndex,
            operatorIndex: target.located.operatorIndex,
            operator: target.located.operator,
            replacementText: fixture.replacementText,
            resolvedFont: target.profile.resolvedFont,
            fontMetrics: target.profile.metrics,
            sourceResourceIdentity: target.profile.resourceIdentity,
            sourceEmbeddedProgramSha256:
              target.profile.embeddedProgramSha256,
            embeddedGlyphEvidence:
              target.profile.embeddedGlyphEvidence,
            asset: assetResult.asset,
          });
          if (localPlan.editable) {
            const localResult = await applyLocalFontSubstitutionToBytes({
              sourceBytes: fixture.bytes,
              plan: localPlan,
              asset: assetResult.asset,
            });
            editedOverride = localResult.bytes;
            writeApplied = true;
          }
        }
      }
    } else if (fixture.editMode === "shaped-ltr") {
      const resourceName = target.located.operator.fontResourceName;
      if (resourceName) {
        const shapingInspection =
          await editableRegistry.inspectShapingCompatibility(
            target.located.resources,
            resourceName,
            fixture.replacementText,
            {
              direction: "ltr",
              script: "Latn",
              language: "en",
            },
            shapeEmbeddedFontText,
          );
        if (shapingInspection.kind === "reconciled") {
          const addressability =
            editableRegistry.inspectShapedGlyphAddressability(
              target.located.resources,
              resourceName,
              shapingInspection.shaped,
            );
          const shapedPlan = buildShapedGlyphEditPlan({
            pageIndex: 0,
            contentStreamIndex:
              target.located.locator.kind === "page"
                ? target.located.locator.contentStreamIndex
                : 0,
            formPath:
              target.located.locator.kind === "xobject"
                ? target.located.locator.formPath
                : null,
            operatorIndex: target.located.operatorIndex,
            operator: target.located.operator,
            replacementText: fixture.replacementText,
            resolvedFont: target.profile.resolvedFont,
            fontMetrics: target.profile.metrics,
            resourceIdentity: target.profile.resourceIdentity,
            embeddedProgramSha256: target.profile.embeddedProgramSha256,
            shapingInspection,
            addressability,
          });
          if (shapedPlan.editable) {
            await applyShapedGlyphEditPlanToDocument(
              editableDoc,
              shapedPlan,
              {
                isolate: target.located.locator.kind === "xobject",
              },
            );
            writeApplied = true;
          }
        }
      }
    } else {
      const plan = buildEditPlan({
        pageIndex: 0,
        contentStreamIndex:
          target.located.locator.kind === "page"
            ? target.located.locator.contentStreamIndex
            : 0,
        formPath:
          target.located.locator.kind === "xobject"
            ? target.located.locator.formPath
            : null,
        operatorIndex: target.located.operatorIndex,
        operator: target.located.operator,
        replacementText: fixture.replacementText,
        resolvedFont: target.profile.resolvedFont,
        fontMetrics: target.profile.metrics,
        embeddedGlyphEvidence:
          target.profile.embeddedGlyphEvidence,
      });

      if (plan.editable) {
        await applyEditPlanToDocument(
          editableDoc,
          plan,
          target.profile.resolvedFont.bytesPerCode,
          {
            isolate: target.located.locator.kind === "xobject",
          },
        );
        writeApplied = true;
      }
    }

    if (writeApplied) {
      const edited = editedOverride ?? (await editableDoc.save());
      nativeEditSuccess = true;

      const exported = await exportEditedPdf(
        asArrayBuffer(edited),
        [],
      );
      exportSuccess =
        exported.skippedPages.length === 0 &&
        exported.bytes.length > 5;

      if (exportSuccess) {
        try {
          const reopened = await PDFDocument.load(
            exported.bytes.slice(),
          );
          const reopenedPageCount = reopened.getPageCount();

          const reopenedPdfJs = await pdfjsLib.getDocument({
            data: exported.bytes.slice(),
            useWorkerFetch: false,
          }).promise;
          try {
            const page = await reopenedPdfJs.getPage(1);
            const reopenedContent = await page.getTextContent();
            const reopenedText = reopenedContent.items
              .map((item) => ("str" in item ? item.str : ""))
              .join("");
            const expectedReopenText =
              fixture.editMode === "paragraph"
                ? fixture.replacementText.split("\n")
                : [fixture.replacementText];
            reopenSuccess =
              reopenedPageCount === 1 &&
              expectedReopenText.every((text) =>
                reopenedText.includes(text),
              );
          } finally {
            const destroyReopened = (reopenedPdfJs as {
              destroy?: () => Promise<void> | void;
            }).destroy;
            if (typeof destroyReopened === "function") {
              await destroyReopened.call(reopenedPdfJs);
            }
          }
        } catch {
          reopenSuccess = false;
        }

        const before = await renderFirstPage(fixture.bytes);
        const after = await renderFirstPage(exported.bytes);
        const beforeRect =
          fixture.editMode === "paragraph"
            ? rectForExpectedTexts({
                rendered: before,
                texts: fixture.expectedRuns,
              })
            : uniqueRunSequenceRect({
                runs: before.runs,
                expectedText: fixture.editTarget,
                width: before.width,
                height: before.height,
                viewportTransform: before.viewportTransform,
              });
        const afterRect =
          fixture.editMode === "paragraph"
            ? rectForExpectedTexts({
                rendered: after,
                texts: fixture.replacementText.split("\n"),
              })
            : uniqueRunSequenceRect({
                runs: after.runs,
                expectedText: fixture.replacementText,
                width: after.width,
                height: after.height,
                viewportTransform: after.viewportTransform,
              });

        if (
          beforeRect &&
          afterRect &&
          before.width === after.width &&
          before.height === after.height
        ) {
          const mask = unionRects(beforeRect, afterRect);
          const diff = compareRgbaImages({
            before: before.rgba,
            after: after.rgba,
            width: before.width,
            height: before.height,
            maskRects: [mask],
          });
          visualDiffPass =
            diff.changedPixelsInsideMask > 0 &&
            diff.changedPixelsOutsideMask === 0;
        }
      }
    }
  }

  const expected = expectedText(fixture);
  return {
    id: fixture.id,
    category: fixture.category,
    expectedTextCharacters: measurableTextCharacters(expected),
    detectedTextCharacters: measurableTextCharacters(detectedText),
    expectedSpans: fixture.expectedRuns.length,
    matchedSpans,
    // "unmatchedSpans" measures expected native source-span coverage, not
    // PDF.js fragmentation. One native source operator can legitimately
    // surface as several visible PDF.js runs (for example Courier/table
    // layouts), so using substantiveRuns as this denominator falsely reports
    // missing source spans even when every expected operator was matched.
    // Keep those extra visible fragments in unsupportedRuns as diagnostics.
    unmatchedSpans: Math.max(0, fixture.expectedRuns.length - matchedSpans),
    correctFontResolutions,
    unresolvedFonts,
    baselineErrorsPt,
    unsupportedRuns: Math.max(0, substantiveRuns.length - matchedSpans),
    nativeEditSuccess,
    exportSuccess,
    reopenSuccess,
    visualDiffPass,
  };
}

async function assertReviewedOcrFidelityGate(): Promise<void> {
  const sourceDoc = await PDFDocument.create();
  const sourcePage = sourceDoc.addPage([300, 200]);
  const raster = createCanvas(600, 400);
  const context = raster.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, raster.width, raster.height);
  context.fillStyle = "#111111";
  context.font = "48px sans-serif";
  context.fillText("OCR tota1", 80, 190);
  const image = await sourceDoc.embedPng(raster.toBuffer("image/png"));
  sourcePage.drawImage(image, { x: 0, y: 0, width: 300, height: 200 });
  const sourceBytes = await sourceDoc.save();

  const boundsPct = Object.freeze({
    xPct: 34,
    yPct: 37,
    widthPct: 22,
    heightPct: 16,
  });
  const recognizedWord = Object.freeze({
    textSource: "ocr" as const,
    text: "tota1",
    confidence: 52,
    boundsPct,
  });
  const reviewed = buildReviewedOcrSearchableInput(
    { pageIndex: 0, words: Object.freeze([recognizedWord]) },
    new Map([[0, "total"]]),
  );
  if (
    reviewed.kind !== "ready" ||
    reviewed.correctionCount !== 1 ||
    reviewed.words[0]?.text !== "total" ||
    reviewed.words[0]?.confidence !== recognizedWord.confidence ||
    reviewed.words[0]?.boundsPct !== boundsPct
  ) {
    throw new Error(
      "Reviewed OCR fidelity gate failed: correction evidence did not preserve OCR confidence/geometry.",
    );
  }

  const searchable = await addSearchableOcrTextLayer(
    asArrayBuffer(sourceBytes),
    { pageIndex: reviewed.pageIndex, words: reviewed.words },
  );
  if (
    searchable.writtenWords.length !== 1 ||
    searchable.writtenWords[0] !== "total"
  ) {
    throw new Error(
      "Reviewed OCR fidelity gate failed: corrected searchable word was not written exactly.",
    );
  }

  const exported = await exportEditedPdf(
    asArrayBuffer(searchable.bytes),
    [],
  );
  if (exported.skippedPages.length > 0 || exported.bytes.length <= 5) {
    throw new Error(
      "Reviewed OCR fidelity gate failed: corrected searchable PDF could not be exported.",
    );
  }

  const reopened = await PDFDocument.load(exported.bytes.slice());
  const reopenedEntries = collectPageTextOperators(reopened, 0);
  const registry = new PdfFontRegistry(reopened);
  let invisibleCorrectedTextFound = false;
  for (const entry of reopenedEntries) {
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) continue;
    const profile = registry.resolve(entry.resources, resourceName);
    if (!profile) continue;
    const decoded = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    if (
      decoded.allDecoded &&
      decoded.text === "total" &&
      entry.operator.renderMode === 3
    ) {
      invisibleCorrectedTextFound = true;
      break;
    }
  }
  if (!invisibleCorrectedTextFound) {
    throw new Error(
      "Reviewed OCR fidelity gate failed: corrected searchable text did not reopen as invisible PDF text.",
    );
  }

  const reopenedPdfJs = await pdfjsLib.getDocument({
    data: exported.bytes.slice(),
    useWorkerFetch: false,
  }).promise;
  try {
    const page = await reopenedPdfJs.getPage(1);
    const content = await page.getTextContent();
    const extractedItems = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((item) => item.trim().length > 0);
    const missing = firstMissingSearchableOcrWord(
      ["total"],
      extractedItems,
    );
    if (missing) {
      throw new Error(
        "Reviewed OCR fidelity gate failed: PDF.js could not extract the corrected searchable word.",
      );
    }
  } finally {
    const destroy = (reopenedPdfJs as {
      destroy?: () => Promise<void> | void;
    }).destroy;
    if (typeof destroy === "function") await destroy.call(reopenedPdfJs);
  }

  const before = await renderFirstPage(sourceBytes);
  const after = await renderFirstPage(exported.bytes);
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(
      "Reviewed OCR fidelity gate failed: searchable metadata changed rendered page dimensions.",
    );
  }
  if (before.rgba.length !== after.rgba.length) {
    throw new Error(
      "Reviewed OCR fidelity gate failed: searchable metadata changed rendered pixel geometry.",
    );
  }
  for (let index = 0; index < before.rgba.length; index += 1) {
    if (before.rgba[index] !== after.rgba[index]) {
      throw new Error(
        "Reviewed OCR fidelity gate failed: invisible searchable text changed scan pixels.",
      );
    }
  }
}

async function assertRotatedOcrFidelityGate(): Promise<void> {
  const sourceDoc = await PDFDocument.create();
  const sourcePage = sourceDoc.addPage([300, 200]);
  const raster = createCanvas(600, 400);
  const context = raster.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, raster.width, raster.height);
  context.fillStyle = "#111111";
  context.font = "44px sans-serif";
  context.save();
  context.translate(raster.width, 0);
  context.rotate(Math.PI / 2);
  context.fillText("SIDEWAYS", 90, 180);
  context.restore();
  const image = await sourceDoc.embedPng(raster.toBuffer("image/png"));
  sourcePage.drawImage(image, { x: 0, y: 0, width: 300, height: 200 });
  const sourceBytes = await sourceDoc.save();

  const mapped = inverseMapOcrBoundsPct(
    { xPct: 20, yPct: 10, widthPct: 30, heightPct: 20 },
    270,
  );
  if (
    mapped.xPct !== 70 ||
    mapped.yPct !== 20 ||
    mapped.widthPct !== 20 ||
    mapped.heightPct !== 30
  ) {
    throw new Error(
      "Rotated OCR fidelity gate failed: inverse-mapped word geometry was not deterministic.",
    );
  }

  const searchable = await addSearchableOcrTextLayer(
    asArrayBuffer(sourceBytes),
    {
      pageIndex: 0,
      words: [
        {
          textSource: "ocr",
          text: "SIDEWAYS",
          confidence: 94,
          boundsPct: mapped,
        },
      ],
    },
  );
  if (
    searchable.writtenWords.length !== 1 ||
    searchable.writtenWords[0] !== "SIDEWAYS"
  ) {
    throw new Error(
      "Rotated OCR fidelity gate failed: mapped searchable text was not written exactly.",
    );
  }

  const exported = await exportEditedPdf(
    asArrayBuffer(searchable.bytes),
    [],
  );
  if (exported.skippedPages.length > 0 || exported.bytes.length <= 5) {
    throw new Error(
      "Rotated OCR fidelity gate failed: searchable PDF could not be exported.",
    );
  }

  const reopenedPdfJs = await pdfjsLib.getDocument({
    data: exported.bytes.slice(),
    useWorkerFetch: false,
  }).promise;
  try {
    const page = await reopenedPdfJs.getPage(1);
    const content = await page.getTextContent();
    const extractedItems = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((item) => item.trim().length > 0);
    const missing = firstMissingSearchableOcrWord(
      ["SIDEWAYS"],
      extractedItems,
    );
    if (missing) {
      throw new Error(
        "Rotated OCR fidelity gate failed: PDF.js could not extract the mapped searchable word.",
      );
    }
  } finally {
    const destroy = (reopenedPdfJs as {
      destroy?: () => Promise<void> | void;
    }).destroy;
    if (typeof destroy === "function") await destroy.call(reopenedPdfJs);
  }

  const before = await renderFirstPage(sourceBytes);
  const after = await renderFirstPage(exported.bytes);
  if (
    before.width !== after.width ||
    before.height !== after.height ||
    before.rgba.length !== after.rgba.length
  ) {
    throw new Error(
      "Rotated OCR fidelity gate failed: searchable metadata changed page dimensions.",
    );
  }
  for (let index = 0; index < before.rgba.length; index += 1) {
    if (before.rgba[index] !== after.rgba[index]) {
      throw new Error(
        "Rotated OCR fidelity gate failed: invisible searchable text changed scan pixels.",
      );
    }
  }
}

async function assertLatinOcrLanguageFidelityGate(): Promise<void> {
  const sourceDoc = await PDFDocument.create();
  const sourcePage = sourceDoc.addPage([300, 200]);
  const raster = createCanvas(600, 400);
  const context = raster.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, raster.width, raster.height);
  context.fillStyle = "#111111";
  context.font = "44px sans-serif";
  context.fillText("ESPANOLA CAFE", 70, 190);
  const image = await sourceDoc.embedPng(raster.toBuffer("image/png"));
  sourcePage.drawImage(image, { x: 0, y: 0, width: 300, height: 200 });
  const sourceBytes = await sourceDoc.save();

  const expectedWords = ["ESPAÑOLA", "CAFÉ"];
  const searchable = await addSearchableOcrTextLayer(
    asArrayBuffer(sourceBytes),
    {
      pageIndex: 0,
      words: [
        {
          textSource: "ocr",
          text: expectedWords[0],
          confidence: 96,
          boundsPct: { xPct: 12, yPct: 38, widthPct: 36, heightPct: 15 },
        },
        {
          textSource: "ocr",
          text: expectedWords[1],
          confidence: 96,
          boundsPct: { xPct: 52, yPct: 38, widthPct: 20, heightPct: 15 },
        },
      ],
    },
  );
  if (
    searchable.skippedWords.length !== 0 ||
    searchable.writtenWords.length !== expectedWords.length
  ) {
    throw new Error(
      "Latin OCR language fidelity gate failed: safe WinAnsi Spanish words were unexpectedly skipped.",
    );
  }

  const exported = await exportEditedPdf(
    asArrayBuffer(searchable.bytes),
    [],
  );
  if (exported.skippedPages.length > 0 || exported.bytes.length <= 5) {
    throw new Error(
      "Latin OCR language fidelity gate failed: searchable PDF could not be exported.",
    );
  }

  const reopenedPdfJs = await pdfjsLib.getDocument({
    data: exported.bytes.slice(),
    useWorkerFetch: false,
  }).promise;
  try {
    const page = await reopenedPdfJs.getPage(1);
    const content = await page.getTextContent();
    const extractedItems = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((item) => item.trim().length > 0);
    const missing = firstMissingSearchableOcrWord(
      expectedWords,
      extractedItems,
    );
    if (missing) {
      throw new Error(
        `Latin OCR language fidelity gate failed: PDF.js could not extract “${missing}”.`,
      );
    }
  } finally {
    const destroy = (reopenedPdfJs as {
      destroy?: () => Promise<void> | void;
    }).destroy;
    if (typeof destroy === "function") await destroy.call(reopenedPdfJs);
  }

  const reopened = await PDFDocument.load(exported.bytes.slice());
  const entries = collectPageTextOperators(reopened, 0);
  const registry = new PdfFontRegistry(reopened);
  const decodedInvisible = new Set<string>();
  for (const entry of entries) {
    if (entry.operator.renderMode !== 3) continue;
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) continue;
    const profile = registry.resolve(entry.resources, resourceName);
    if (!profile) continue;
    const decoded = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    if (decoded.allDecoded) decodedInvisible.add(decoded.text);
  }
  for (const expected of expectedWords) {
    if (!decodedInvisible.has(expected)) {
      throw new Error(
        `Latin OCR language fidelity gate failed: “${expected}” did not reopen as invisible PDF text.`,
      );
    }
  }

  const before = await renderFirstPage(sourceBytes);
  const after = await renderFirstPage(exported.bytes);
  if (
    before.width !== after.width ||
    before.height !== after.height ||
    before.rgba.length !== after.rgba.length
  ) {
    throw new Error(
      "Latin OCR language fidelity gate failed: searchable metadata changed page dimensions.",
    );
  }
  for (let index = 0; index < before.rgba.length; index += 1) {
    if (before.rgba[index] !== after.rgba[index]) {
      throw new Error(
        "Latin OCR language fidelity gate failed: invisible multilingual text changed scan pixels.",
      );
    }
  }
}

async function buildFixtures(): Promise<Fixture[]> {
  const fixtures = await Promise.all([
    makeSimpleFixture(
      "seed-standard-helvetica",
      "embedded-or-standard-font",
      "Invoice Total 1350.00",
      "Invoice Total 2460.00",
    ),
    makeSimpleFixture(
      "seed-bold-italic",
      "mixed-style-signal",
      "Premium Edit",
      "Premium Tool",
      {
        font: StandardFonts.HelveticaBoldOblique,
        size: 14,
      },
    ),
    makeSimpleFixture(
      "seed-rotated-page",
      "rotated-text",
      "Rotated native text",
      "Rotated edited text",
      {
        rotation: 90,
        size: 13,
      },
    ),
    structuredFixture({
      id: "common-business-invoice",
      category: "business-invoice",
      expectedRuns: [
        "Northwind Services",
        "Invoice INV-2026-104",
        "Cloud support 1250.00",
        "Tax 225.00",
        "Total 1475.00",
      ],
      editTarget: "Total 1475.00",
      replacementText: "Total 1525.00",
      draw: (page, fonts) => {
        drawLine(page, "Northwind Services", {
          x: 60,
          y: 730,
          size: 18,
          font: fonts.helveticaBold,
        });
        drawLine(page, "Invoice INV-2026-104", {
          x: 60,
          y: 700,
          font: fonts.helvetica,
        });
        drawLine(page, "Cloud support 1250.00", {
          x: 60,
          y: 630,
          font: fonts.helvetica,
        });
        drawLine(page, "Tax 225.00", {
          x: 60,
          y: 605,
          font: fonts.helvetica,
        });
        drawLine(page, "Total 1475.00", {
          x: 60,
          y: 565,
          size: 14,
          font: fonts.helveticaBold,
        });
      },
    }),
    structuredFixture({
      id: "common-resume",
      category: "resume",
      expectedRuns: [
        "Avery Morgan",
        "Platform Engineer",
        "Experience",
        "Built local-first document workflows",
        "Skills: TypeScript PDF systems",
      ],
      editTarget: "Platform Engineer",
      replacementText: "Systems Engineer",
      draw: (page, fonts) => {
        drawLine(page, "Avery Morgan", {
          x: 60,
          y: 730,
          size: 20,
          font: fonts.helveticaBold,
        });
        drawLine(page, "Platform Engineer", {
          x: 60,
          y: 700,
          size: 13,
          font: fonts.helveticaOblique,
        });
        drawLine(page, "Experience", {
          x: 60,
          y: 650,
          size: 13,
          font: fonts.helveticaBold,
        });
        drawLine(
          page,
          "Built local-first document workflows",
          { x: 60, y: 625, font: fonts.helvetica },
        );
        drawLine(page, "Skills: TypeScript PDF systems", {
          x: 60,
          y: 580,
          font: fonts.helvetica,
        });
      },
    }),
    structuredFixture({
      id: "common-bank-statement",
      category: "bank-style-statement",
      expectedRuns: [
        "Account statement September 2026",
        "Opening balance 4500.00",
        "Transfer credit 1250.00",
        "Utility debit 180.00",
        "Closing balance 5570.00",
      ],
      editTarget: "Opening balance 4500.00",
      replacementText: "Opening balance 4700.00",
      draw: (page, fonts) => {
        drawLine(page, "Account statement September 2026", {
          x: 50,
          y: 730,
          size: 16,
          font: fonts.helveticaBold,
        });
        [
          "Opening balance 4500.00",
          "Transfer credit 1250.00",
          "Utility debit 180.00",
          "Closing balance 5570.00",
        ].forEach((text, index) =>
          drawLine(page, text, {
            x: 50,
            y: 680 - index * 34,
            font: fonts.courier,
          }),
        );
      },
    }),
    structuredFixture({
      id: "common-multi-column-report",
      category: "multi-column-report",
      expectedRuns: [
        "Quarterly Operations Review",
        "Region West 128",
        "Region South 143",
        "Availability 99.95%",
        "Incidents resolved 42",
      ],
      editTarget: "Region West 128",
      replacementText: "Region West 256",
      draw: (page, fonts) => {
        drawLine(page, "Quarterly Operations Review", {
          x: 55,
          y: 730,
          size: 17,
          font: fonts.timesBold,
        });
        drawLine(page, "Region West 128", {
          x: 55,
          y: 670,
          font: fonts.times,
        });
        drawLine(page, "Region South 143", {
          x: 55,
          y: 640,
          font: fonts.times,
        });
        drawLine(page, "Availability 99.95%", {
          x: 330,
          y: 670,
          font: fonts.helvetica,
        });
        drawLine(page, "Incidents resolved 42", {
          x: 330,
          y: 640,
          font: fonts.helvetica,
        });
      },
    }),
    structuredFixture({
      id: "common-table-heavy",
      category: "table-heavy-document",
      expectedRuns: [
        "Metric Q1 Q2",
        "Revenue 2200 2450",
        "Orders 310 342",
        "Latency 42 38",
        "Q2 Revenue 2450",
      ],
      editTarget: "Q2 Revenue 2450",
      replacementText: "Q2 Revenue 2750",
      draw: (page, fonts) => {
        page.drawRectangle({
          x: 45,
          y: 560,
          width: 520,
          height: 160,
          borderColor: rgb(0.65, 0.67, 0.72),
          borderWidth: 1,
        });
        [
          ["Metric Q1 Q2", 690],
          ["Revenue 2200 2450", 660],
          ["Orders 310 342", 630],
          ["Latency 42 38", 600],
        ].forEach(([text, y]) =>
          drawLine(page, String(text), {
            x: 60,
            y: Number(y),
            font: fonts.courier,
          }),
        );
        drawLine(page, "Q2 Revenue 2450", {
          x: 60,
          y: 530,
          size: 13,
          font: fonts.helveticaBold,
        });
      },
    }),
    structuredFixture({
      id: "common-government-form",
      category: "government-style-form",
      expectedRuns: [
        "Service Request Form",
        "Applicant: Taylor Reed",
        "Reference: GOV-2026-118",
        "Application status: Draft",
        "Declaration: information reviewed",
      ],
      editTarget: "Application status: Draft",
      replacementText: "Application status: Ready",
      draw: (page, fonts) => {
        page.drawRectangle({
          x: 48,
          y: 510,
          width: 516,
          height: 210,
          borderColor: rgb(0.25, 0.28, 0.32),
          borderWidth: 1,
        });
        drawLine(page, "Service Request Form", {
          x: 62,
          y: 690,
          size: 16,
          font: fonts.helveticaBold,
        });
        drawLine(page, "Applicant: Taylor Reed", {
          x: 62,
          y: 645,
          font: fonts.helvetica,
        });
        drawLine(page, "Reference: GOV-2026-118", {
          x: 62,
          y: 615,
          font: fonts.helvetica,
        });
        drawLine(page, "Application status: Draft", {
          x: 62,
          y: 575,
          font: fonts.helvetica,
        });
        drawLine(page, "Declaration: information reviewed", {
          x: 62,
          y: 535,
          size: 10,
          font: fonts.helvetica,
        });
      },
    }),
    structuredFixture({
      id: "common-business-letter",
      category: "letter",
      expectedRuns: [
        "Lumeo Systems",
        "26 September 2026",
        "Reference: LUM-2026-09",
        "Dear Customer",
        "Your document review is complete.",
      ],
      editTarget: "Reference: LUM-2026-09",
      replacementText: "Reference: LUM-2026-10",
      draw: (page, fonts) => {
        drawLine(page, "Lumeo Systems", {
          x: 60,
          y: 730,
          size: 16,
          font: fonts.timesBold,
        });
        drawLine(page, "26 September 2026", {
          x: 60,
          y: 700,
          font: fonts.times,
        });
        drawLine(page, "Reference: LUM-2026-09", {
          x: 60,
          y: 660,
          font: fonts.times,
        });
        drawLine(page, "Dear Customer", {
          x: 60,
          y: 610,
          font: fonts.times,
        });
        drawLine(page, "Your document review is complete.", {
          x: 60,
          y: 575,
          font: fonts.times,
        });
      },
    }),
    structuredFixture({
      id: "common-receipt",
      category: "receipt",
      expectedRuns: [
        "LOCAL MARKET",
        "Bread 24.50",
        "Milk 32.00",
        "Tax 5.90",
        "Total 62.40",
      ],
      editTarget: "Total 62.40",
      replacementText: "Total 68.10",
      draw: (page, fonts) => {
        [
          ["LOCAL MARKET", fonts.courier, 14],
          ["Bread 24.50", fonts.courier, 11],
          ["Milk 32.00", fonts.courier, 11],
          ["Tax 5.90", fonts.courier, 11],
          ["Total 62.40", fonts.courier, 12],
        ].forEach(([text, font, size], index) =>
          drawLine(page, String(text), {
            x: 190,
            y: 720 - index * 32,
            size: Number(size),
            font: font as PDFFont,
          }),
        );
      },
    }),
    structuredFixture({
      id: "common-academic-paper",
      category: "academic-paper",
      expectedRuns: [
        "Local-first PDF Editing Fidelity",
        "Abstract",
        "We evaluate native text preservation.",
        "Result accuracy 91.2%",
        "Conclusion",
      ],
      editTarget: "Result accuracy 91.2%",
      replacementText: "Result accuracy 94.8%",
      draw: (page, fonts) => {
        drawLine(page, "Local-first PDF Editing Fidelity", {
          x: 70,
          y: 730,
          size: 17,
          font: fonts.timesBold,
        });
        drawLine(page, "Abstract", {
          x: 70,
          y: 685,
          size: 12,
          font: fonts.timesBold,
        });
        drawLine(page, "We evaluate native text preservation.", {
          x: 70,
          y: 660,
          font: fonts.times,
        });
        drawLine(page, "Result accuracy 91.2%", {
          x: 70,
          y: 600,
          font: fonts.times,
        });
        drawLine(page, "Conclusion", {
          x: 70,
          y: 545,
          size: 12,
          font: fonts.timesBold,
        });
      },
    }),
    structuredFixture({
      id: "common-presentation",
      category: "presentation-style-pdf",
      expectedRuns: [
        "Migration Readiness",
        "Milestone 1: Complete",
        "Milestone 2: Review",
        "Risk: Low",
      ],
      editTarget: "Milestone 2: Review",
      replacementText: "Milestone 2: Ready",
      draw: (page, fonts) => {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: 612,
          height: 792,
          color: rgb(0.96, 0.97, 0.99),
        });
        drawLine(page, "Migration Readiness", {
          x: 60,
          y: 700,
          size: 24,
          font: fonts.helveticaBold,
        });
        drawLine(page, "Milestone 1: Complete", {
          x: 80,
          y: 610,
          size: 16,
          font: fonts.helvetica,
        });
        drawLine(page, "Milestone 2: Review", {
          x: 80,
          y: 565,
          size: 16,
          font: fonts.helvetica,
        });
        drawLine(page, "Risk: Low", {
          x: 80,
          y: 500,
          size: 14,
          font: fonts.helveticaBold,
        });
      },
    }),
    makeSimpleFixture("common-legal-contract", "legal-contract", "Agreement term: 24 months", "Agreement term: 36 months", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-purchase-order", "purchase-order", "Purchase Order PO-2048", "Purchase Order PO-4096", { font: StandardFonts.HelveticaBold }),
    makeSimpleFixture("common-payslip", "payslip", "Net Pay 84500.00", "Net Pay 87200.00", { font: StandardFonts.Courier }),
    makeSimpleFixture("common-insurance-policy", "insurance-policy", "Policy status: Active", "Policy status: Renewed", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-shipping-label", "shipping-label", "Shipment PNQ-1182", "Shipment PNQ-2246", { font: StandardFonts.HelveticaBold }),
    makeSimpleFixture("common-certificate", "certificate", "Certificate ID CERT-2026-18", "Certificate ID CERT-2026-19", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-policy-document", "policy-document", "Review cycle: Annual", "Review cycle: Quarterly", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-project-plan", "project-plan", "Phase status: In review", "Phase status: Approved", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-audit-report", "audit-report", "Finding count: 12", "Finding count: 9", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-maintenance-report", "maintenance-report", "Service status: Pending", "Service status: Complete", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-meeting-minutes", "meeting-minutes", "Minutes item 100", "Minutes item 200", { font: StandardFonts.Courier }),
    makeSimpleFixture("common-quotation", "quotation", "Quoted total 18500.00", "Quoted total 19250.00", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-tax-summary", "tax-summary", "Tax payable 12800.00", "Tax payable 13150.00", { font: StandardFonts.Courier }),
    makeSimpleFixture("common-inventory-report", "inventory-report", "Available units 184", "Available units 206", { font: StandardFonts.Courier }),
    makeSimpleFixture("common-timesheet", "timesheet", "Approved hours 38.5", "Approved hours 40.0", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-lease-summary", "lease-summary", "Lease end: June 2027", "Lease end: June 2028", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-internal-memo", "internal-memo", "Priority: Normal", "Priority: High", { font: StandardFonts.HelveticaOblique }),
    makeSimpleFixture("common-checklist", "checklist", "Validation: Pending", "Validation: Passed", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-incident-report", "incident-report", "Severity: Medium", "Severity: Low", { font: StandardFonts.HelveticaBold }),
    makeSimpleFixture("common-service-level-report", "service-level-report", "SLA achieved 99.90%", "SLA achieved 99.95%", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-technical-manual", "technical-manual", "Revision 4.2", "Revision 4.3", { font: StandardFonts.Courier }),
    makeSimpleFixture("common-compliance-record", "compliance-record", "Control status: Open", "Control status: Closed", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-operating-schedule", "operating-schedule", "Window 09:00-17:00", "Window 08:00-18:00", { font: StandardFonts.Helvetica }),
    makeSimpleFixture("common-work-order", "work-order", "Work Order WO-8801", "Work Order WO-8802", { font: StandardFonts.HelveticaBold }),
    makeSimpleFixture("common-delivery-note", "delivery-note", "Delivered quantity 72", "Delivered quantity 75", { font: StandardFonts.Courier }),
    makeSimpleFixture("common-balance-sheet", "balance-sheet", "Total assets 920000", "Total assets 945000", { font: StandardFonts.TimesRoman }),
    makeSimpleFixture("common-procurement-record", "procurement-record", "Bid status: Evaluating", "Bid status: Awarded", { font: StandardFonts.Helvetica }),

  ]);
  fixtures.push({
    id: "advanced-shaped-ltr-type0",
    category: "shaped-glyph-ltr",
    expectedRuns: ["AB"],
    editTarget: "AB",
    replacementText: SHAPED_LTR_REPLACEMENT,
    bytes: await buildShapedLtrType0Pdf(),
    editMode: "shaped-ltr",
  });
  fixtures.push(
    await structuredFixture({
      id: "advanced-native-local-font-substitution",
      category: "native-local-font-substitution",
      expectedRuns: ["WWWW"],
      editTarget: "WWWW",
      replacementText: "iiii",
      draw: (page, fonts) => {
        drawLine(page, "WWWW", {
          x: 72,
          y: 700,
          size: 20,
          font: fonts.helvetica,
        });
      },
    }).then((fixture) => ({
      ...fixture,
      editMode: "native-local-font" as const,
    })),
  );
  fixtures.push({
    id: "advanced-preserved-line-paragraph",
    category: "native-paragraph-preserved-lines",
    expectedRuns: [...PARAGRAPH_SOURCE_LINES],
    editTarget: PARAGRAPH_SOURCE_LINES[0],
    replacementText: PARAGRAPH_REPLACEMENT_LINES.join("\n"),
    bytes: await buildPreservedLineParagraphPdf(),
    editMode: "paragraph",
  });
  return fixtures;
}

function assertCorpusGate(
  fixtures: readonly Fixture[],
  measurements: readonly EditPdfFidelityFixtureMeasurement[],
): void {
  const failures: string[] = [];

  for (const measurement of measurements) {
    const fixture = fixtures.find(
      (item) => item.id === measurement.id,
    );
    if (!fixture) {
      failures.push(`${measurement.id}: fixture metadata missing`);
      continue;
    }

    if (
      measurement.detectedTextCharacters !==
      measurement.expectedTextCharacters
    ) {
      failures.push(
        `${measurement.id}: text characters ${measurement.detectedTextCharacters}/${measurement.expectedTextCharacters}`,
      );
    }
    if (measurement.matchedSpans !== fixture.expectedRuns.length) {
      failures.push(
        `${measurement.id}: matched spans ${measurement.matchedSpans}/${fixture.expectedRuns.length}`,
      );
    }
    if (
      measurement.correctFontResolutions !==
      measurement.matchedSpans ||
      measurement.unresolvedFonts !== 0
    ) {
      failures.push(
        `${measurement.id}: font resolution ${measurement.correctFontResolutions}/${measurement.matchedSpans}, unresolved ${measurement.unresolvedFonts}`,
      );
    }
    const maxBaseline = Math.max(
      0,
      ...measurement.baselineErrorsPt.map((value) =>
        Math.abs(value),
      ),
    );
    if (maxBaseline > MAX_BASELINE_ERROR_PT) {
      failures.push(
        `${measurement.id}: max baseline error ${maxBaseline.toFixed(4)}pt > ${MAX_BASELINE_ERROR_PT}pt`,
      );
    }
    if (measurement.nativeEditSuccess !== true) {
      failures.push(`${measurement.id}: native edit failed`);
    }
    if (measurement.exportSuccess !== true) {
      failures.push(`${measurement.id}: export failed`);
    }
    if (measurement.reopenSuccess !== true) {
      failures.push(`${measurement.id}: reopen/searchability failed`);
    }
    if (measurement.visualDiffPass !== true) {
      failures.push(
        `${measurement.id}: visual diff changed pixels outside the edited region or edit was vacuous`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "Edit PDF fidelity corpus gate failed:\n- " +
        failures.join("\n- "),
    );
  }
}

async function main() {
  await assertReviewedOcrFidelityGate();
  await assertRotatedOcrFidelityGate();
  await assertLatinOcrLanguageFidelityGate();
  const fixtures = await buildFixtures();
  const measurements: EditPdfFidelityFixtureMeasurement[] = [];
  for (const fixture of fixtures) {
    measurements.push(await measure(fixture));
  }

  assertCorpusGate(fixtures, measurements);

  const report = buildEditPdfFidelityCorpusReport(measurements);
  const output = resolve(
    process.argv[2] ?? "artifacts/edit-pdf-fidelity-report.json",
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );

  process.stdout.write(
    [
      `Edit PDF fidelity corpus report: ${report.fixtureCount} fixtures`,
      "reviewed OCR searchable fidelity: pass",
      "Latin OCR language searchable fidelity: pass",
      `text recall: ${report.aggregate.textRecall === null ? "n/a" : (report.aggregate.textRecall * 100).toFixed(2) + "%"}`,
      `source span coverage: ${report.totals.matchedSpans}/${report.totals.matchedSpans + report.totals.unmatchedSpans}`,
      `extra PDF.js fragments (diagnostic): ${report.totals.unsupportedRuns}`,
      `native edits: ${report.totals.nativeEditSuccesses}/${report.totals.nativeEditMeasured}`,
      `exports: ${report.totals.exportSuccesses}/${report.totals.exportMeasured}`,
      `reopens: ${report.totals.reopenSuccesses}/${report.totals.reopenMeasured}`,
      `visual diffs: ${report.totals.visualDiffPasses}/${report.totals.visualDiffMeasured}`,
      `max baseline error: ${Math.max(0, ...report.fixtures.flatMap((fixture) => fixture.baselineErrorsPt.map((value) => Math.abs(value)))).toFixed(4)}pt`,
      `output: ${output}`,
    ].join("\n") + "\n",
  );
}

await main();
