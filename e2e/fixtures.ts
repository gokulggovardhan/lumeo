// e2e/fixtures.ts
//
// Generates the two PDFs the redaction e2e tests need, into e2e/.tmp/ (which
// is gitignored). Deterministic: the same bytes every run, so a failing
// assertion is never the fixture having drifted.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument, PDFName, StandardFonts, TextRenderingMode, beginText, endText, rgb, setTextRenderingMode } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { inspectPdfFontProgram } from "../lib/pdf/edit/fontProgramIntelligence.ts";
import { shapeEmbeddedFontText } from "../lib/pdf/edit/harfbuzzShaping.ts";
import { buildPreservedLineParagraphPdf } from "../tests/fixtures/paragraphFixture.ts";

// Playwright transpiles specs to CJS, where import.meta is a syntax error --
// resolve from the repo root (the runner's cwd) instead.
export const TMP_DIR = path.join(process.cwd(), "e2e", ".tmp");
export const TEXT_ONLY_PDF = path.join(TMP_DIR, "text-only.pdf");
export const WITH_IMAGE_PDF = path.join(TMP_DIR, "with-image.pdf");
export const IMAGE_ONLY_PDF = path.join(TMP_DIR, "image-only.pdf");
export const ROTATED_SCAN_PDF = path.join(TMP_DIR, "rotated-scan.pdf");
export const SPANISH_SCAN_PDF = path.join(TMP_DIR, "spanish-scan.pdf");
export const SEARCHABLE_SCAN_PDF = path.join(TMP_DIR, "searchable-scan.pdf");
export const SPLIT_RUN_PDF = path.join(TMP_DIR, "split-run.pdf");
export const TWO_PAGE_PDF = path.join(TMP_DIR, "two-page.pdf");
export const MIXED_STYLE_PDF = path.join(TMP_DIR, "mixed-style.pdf");
export const CLIPPED_TEXT_PDF = path.join(TMP_DIR, "clipped-text.pdf");
export const LARGE_DOCUMENT_PDF = path.join(TMP_DIR, "large-document-120-pages.pdf");
export const SHAPED_LTR_PDF = path.join(TMP_DIR, "shaped-ltr-type0.pdf");
export const PARAGRAPH_PDF = path.join(TMP_DIR, "paragraph-native-lines.pdf");

/** Widely spaced so each line is its own detected run and boxes cannot straddle two. */
function drawSensitiveText(page: import("pdf-lib").PDFPage, font: import("pdf-lib").PDFFont) {
  page.drawText("Employee record", { x: 60, y: 740, size: 18, font, color: rgb(0, 0, 0) });
  page.drawText("SSN 123-45-6789", { x: 60, y: 680, size: 16, font, color: rgb(0, 0, 0) });
  page.drawText("Contact ada@example.com", { x: 60, y: 620, size: 16, font, color: rgb(0, 0, 0) });
  page.drawText("Salary 84500 GBP", { x: 60, y: 560, size: 16, font, color: rgb(0, 0, 0) });
}

async function textOnly(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  drawSensitiveText(doc.addPage([595, 842]), font);
  return doc.save();
}

async function imageOnly(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);

  const canvas = createCanvas(595, 842);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f3f4f6";
  context.fillRect(0, 0, 595, 842);
  context.fillStyle = "#111111";
  context.font = "30px sans-serif";
  context.fillText("SCANNED PAGE SAMPLE", 80, 160);
  context.font = "22px sans-serif";
  context.fillText("This text exists only in image pixels.", 80, 220);
  const png = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });

  return doc.save();
}

async function spanishScan(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);

  const canvas = createCanvas(595, 842);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f3f4f6";
  context.fillRect(0, 0, 595, 842);
  context.fillStyle = "#111111";
  context.font = "bold 34px sans-serif";
  context.fillText("FACTURA ESPANOLA", 70, 155);
  context.font = "26px sans-serif";
  context.fillText("TOTAL PAGADO 12345", 70, 220);
  context.fillText("DOCUMENTO LOCAL", 70, 275);

  const png = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save();
}

async function rotatedScan(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);

  const canvas = createCanvas(595, 842);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f3f4f6";
  context.fillRect(0, 0, 595, 842);
  context.save();
  // The pixels are intentionally rotated 90 degrees clockwise inside an
  // otherwise normal portrait PDF page. OCR orientation correction must rotate
  // the raster LEFT 90 degrees locally, then inverse-map recognized word boxes
  // back to this unchanged page geometry.
  context.translate(595, 0);
  context.rotate(Math.PI / 2);
  context.fillStyle = "#111111";
  context.font = "30px sans-serif";
  context.fillText("SIDEWAYS OCR SAMPLE", 80, 160);
  context.font = "22px sans-serif";
  context.fillText("Rotate locally before recognition.", 80, 220);
  context.restore();

  const png = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save();
}

async function searchableScan(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);

  const canvas = createCanvas(595, 842);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f3f4f6";
  context.fillRect(0, 0, 595, 842);
  context.fillStyle = "#111111";
  context.font = "30px sans-serif";
  context.fillText("SEARCHABLE SCAN SAMPLE", 80, 160);
  context.font = "22px sans-serif";
  context.fillText("Hidden text layer must stay read-only.", 80, 220);
  const png = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });

  // The image above is the visible page. These matching strings are a true
  // PDF invisible text layer (Tr=3), the pattern used by searchable scans.
  // Text state survives BT/ET; pdf-lib's drawText does not override Tr, so
  // both strings remain extractable while painting no glyphs.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.pushOperators(
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    endText(),
  );
  page.drawText("SEARCHABLE SCAN SAMPLE", {
    x: 80,
    y: 682,
    size: 20,
    font,
  });
  page.drawText("Hidden text layer must stay read-only.", {
    x: 80,
    y: 622,
    size: 16,
    font,
  });
  page.pushOperators(
    beginText(),
    setTextRenderingMode(TextRenderingMode.Fill),
    endText(),
  );

  return doc.save();
}

/**
 * Same text, plus a real image XObject on the page. The image is what makes
 * `pageDrawsImages` true, which is what drives the "text inside an image is
 * not removed" warning -- the branch that turns the outcome panel red.
 */
async function withImage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  drawSensitiveText(page, font);

  const canvas = createCanvas(320, 150);
  const context = canvas.getContext("2d");
  context.fillStyle = "#dfe3ea";
  context.fillRect(0, 0, 320, 150);
  context.fillStyle = "#111111";
  context.font = "26px sans-serif";
  // Text that lives in PIXELS, so redaction cannot touch it -- exactly what
  // the warning is about.
  context.fillText("SCAN SSN 987-65-4321", 12, 85);
  const png = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(png, { x: 60, y: 330, width: 320, height: 150 });

  return doc.save();
}

/**
 * A page whose sensitive value is SPLIT across two back-to-back show
 * operators with no positioning between them. pdfjs merges those into one
 * visual run, so no single operator covers it and runSpansMultipleOperators
 * rejects the edit -- the run is masked but NOT removed.
 *
 * This is the fixture the "named individually" test needs. On the image
 * fixture every targeted run is strippable, so unremovedRuns is legitimately
 * empty there and the naming path never executes; asserting against it was
 * testing nothing.
 */
async function splitRun(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const context = doc.context;
  const fonts = context.obj({});
  fonts.set(PDFName.of("F1"), font.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  // The WHOLE page is written by hand, both lines in one stream. The earlier
  // version called drawText and then replaced /Contents, which silently threw
  // that line away -- the fixture looked right and was missing half of itself.
  // Appending to pdf-lib's own stream would work too, but hand-writing both
  // keeps the split entirely under this file's control rather than depending
  // on how pdf-lib happens to emit its half.
  //
  // "SSN 123-45-" and "6789" are separate show operators with no positioning
  // between them, so pdfjs merges them into ONE visual run that no single
  // operator covers -- which is exactly what runSpansMultipleOperators
  // rejects, making the run masked-but-not-removed.
  const body = [
    "BT",
    "/F1 18 Tf",
    "1 0 0 1 60 740 Tm",
    "(Employee record) Tj",
    "ET",
    "BT",
    "/F1 16 Tf",
    "1 0 0 1 60 680 Tm",
    "(SSN 123-45-) Tj (6789) Tj",
    "ET",
  ].join("\n");
  page.node.set(PDFName.of("Contents"), context.register(context.flateStream(new TextEncoder().encode(body))));
  return doc.save();
}

/**
 * Proves the split-run fixture is actually split before any test relies on
 * it. A fixture that quietly stopped being split would make the
 * "named individually" test pass for the wrong reason -- it would assert
 * against an empty list and find nothing to complain about.
 */
async function assertGenuinelySplit(bytes: Uint8Array): Promise<void> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl =
    pathToFileURL(
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") +
        path.sep,
    ).href;
  const doc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    standardFontDataUrl,
  }).promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items as { str?: string }[];
  const strings = items.map((item) => item.str ?? "");

  // The split is only real if pdfjs MERGES the two show operators into one
  // visual run: that mismatch between what the user sees and what any single
  // operator covers is the whole condition runSpansMultipleOperators rejects.
  // If pdfjs reported them separately, each half would be independently
  // strippable and the fixture would prove nothing.
  const merged = strings.find((value) => value.includes("123-45-6789"));
  if (!merged) {
    throw new Error(`split-run fixture: pdfjs did not merge the SSN into one run, got ${JSON.stringify(strings)}`);
  }
  // Neither half may stand alone as its own run.
  if (strings.some((value) => value.trim() === "SSN 123-45-" || value.trim() === "6789")) {
    throw new Error(`split-run fixture: the halves did not merge, got ${JSON.stringify(strings)}`);
  }
  if (!strings.some((value) => value.includes("Employee record"))) {
    throw new Error(`split-run fixture: lost the Employee record line, got ${JSON.stringify(strings)}`);
  }
}

/**
 * Two native text runs with intentionally different PDF formatting. This is
 * privacy-safe and deterministic; Phase 2.4 uses it to prove the selection UI
 * reports mixed state instead of borrowing the first run's appearance.
 */
async function mixedStyle(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const times = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);

  page.drawText("Mixed alpha", {
    x: 60,
    y: 740,
    size: 12,
    font: helvetica,
    color: rgb(0, 0, 0),
  });
  page.drawText("Mixed beta", {
    x: 60,
    y: 690,
    size: 18,
    font: times,
    color: rgb(0.2, 0.4, 0.8),
  });

  return doc.save();
}

/**
 * Visible native text using PDF text rendering mode 4 (fill + clipping).
 * The glyphs are readable, but rewriting them could alter the page clipping
 * path. Phase 4A uses this to prove Lumeo explains the limitation BEFORE an
 * edit is attempted instead of silently exposing a normal editable caret.
 */
async function clippedText(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const context = doc.context;
  const fonts = context.obj({});
  fonts.set(PDFName.of("FClip"), font.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  const body = [
    "BT",
    "/FClip 18 Tf",
    "4 Tr",
    "1 0 0 1 60 740 Tm",
    "(Clipped sample) Tj",
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(
      context.flateStream(new TextEncoder().encode(body)),
    ),
  );

  return doc.save();
}


function utf16BeHex(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes.push((unit >> 8) & 0xff, unit & 0xff);
  }
  return bytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function cidHex(cid: number): string {
  if (!Number.isInteger(cid) || cid <= 0 || cid > 0xffff) {
    throw new Error(`Fixture CID ${cid} is outside the two-byte Type0 range.`);
  }
  return cid.toString(16).padStart(4, "0").toUpperCase();
}

async function ciTrueTypeFontBytes(): Promise<Uint8Array> {
  const candidates = [
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "standard_fonts",
      "LiberationSans-Regular.ttf",
    ),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      if (bytes.byteLength > 1_000) return new Uint8Array(bytes);
    } catch {
      // Try the next deterministic Linux CI font.
    }
  }
  throw new Error("No deterministic TrueType font was found for the shaped-text fixture.");
}

function metric1000(value: number | null, unitsPerEm: number, fallback: number): number {
  return value === null || !Number.isFinite(value)
    ? fallback
    : Math.round((value / unitsPerEm) * 1000);
}

/**
 * Real embedded Type0/CIDFontType2 fixture for the first bounded shaped writer.
 * The source text is AB. Replacing it with decomposed e + combining acute
 * requires canonical shaping; common CI fonts compose that cluster into one
 * precomposed glyph with no per-glyph offsets, which is exactly the first
 * shaped-writer scope.
 */
async function shapedLtrType0(): Promise<Uint8Array> {
  const fontBytes = await ciTrueTypeFontBytes();
  const inspection = await inspectPdfFontProgram(fontBytes);
  if (inspection.kind !== "ok") {
    throw new Error(`Could not inspect shaped fixture font: ${inspection.reason}`);
  }
  const intelligence = inspection.intelligence;
  const unitsPerEm = intelligence.metadata.unitsPerEm;
  if (!unitsPerEm || unitsPerEm <= 0) {
    throw new Error("Shaped fixture font has no valid units-per-em.");
  }

  const gidA = intelligence.glyphIdForCodePoint("A".codePointAt(0)!);
  const gidB = intelligence.glyphIdForCodePoint("B".codePointAt(0)!);
  if (!gidA || !gidB) {
    throw new Error("Shaped fixture font does not contain A/B glyphs.");
  }

  const replacement = "e\u0301";
  const shaped = await shapeEmbeddedFontText(fontBytes, replacement, {
    direction: "ltr",
    script: "Latn",
    language: "en",
  });
  if (
    shaped.glyphs.length !== 1 ||
    shaped.clusterMap.length !== 1 ||
    shaped.clusterMap[0]?.text !== replacement ||
    shaped.clusterMap[0]?.glyphIndices.length !== 1 ||
    shaped.glyphs[0]?.xOffset !== 0 ||
    shaped.glyphs[0]?.yOffset !== 0 ||
    shaped.glyphs[0]?.yAdvance !== 0 ||
    shaped.glyphs[0]?.xAdvance <= 0
  ) {
    throw new Error(
      "The CI font does not produce the bounded one-glyph LTR composition required by the shaped fixture.",
    );
  }
  const gidShaped = shaped.glyphs[0].glyphId;

  const widthFor = (gid: number) => {
    const width = intelligence.advanceWidthForGlyphId(gid);
    if (width === null || !Number.isFinite(width) || width <= 0) {
      throw new Error(`Missing advance width for fixture glyph ${gid}.`);
    }
    return Math.round((width / unitsPerEm) * 1000);
  };

  const widthEntries: (number | number[])[] = [];
  for (const gid of [...new Set([gidA, gidB, gidShaped])].sort((a, b) => a - b)) {
    widthEntries.push(gid, [widthFor(gid)]);
  }

  const cmapEntries: Array<[number, string]> = [
    [gidA, "A"],
    [gidB, "B"],
    [gidShaped, replacement],
  ];
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${cmapEntries.length} beginbfchar`,
    ...cmapEntries.map(([cid, text]) => `<${cidHex(cid)}> <${utf16BeHex(text)}>`),
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const context = doc.context;
  const fontName =
    intelligence.metadata.postScriptName?.replace(/[^A-Za-z0-9_.-]/g, "") ||
    "LumeoShapedFixture";
  const fontFileRef = context.register(context.flateStream(fontBytes));
  const bbox = intelligence.metadata.bbox;
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: fontName,
      Flags: 32,
      ItalicAngle: intelligence.metadata.italicAngle ?? 0,
      Ascent: metric1000(intelligence.metadata.ascent, unitsPerEm, 800),
      Descent: metric1000(intelligence.metadata.descent, unitsPerEm, -200),
      CapHeight: metric1000(intelligence.metadata.capHeight, unitsPerEm, 700),
      FontBBox: bbox
        ? [
            metric1000(bbox.minX, unitsPerEm, 0),
            metric1000(bbox.minY, unitsPerEm, -200),
            metric1000(bbox.maxX, unitsPerEm, 1000),
            metric1000(bbox.maxY, unitsPerEm, 900),
          ]
        : [0, -200, 1000, 900],
      StemV: 80,
      FontFile2: fontFileRef,
    }),
  );
  const descendantRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: fontName,
      CIDSystemInfo: {
        Registry: "Adobe",
        Ordering: "Identity",
        Supplement: 0,
      },
      FontDescriptor: descriptorRef,
      DW: 1000,
      W: widthEntries,
      CIDToGIDMap: "Identity",
    }),
  );
  const toUnicodeRef = context.register(context.stream(cmap));
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: fontName,
      Encoding: "Identity-H",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );
  page.node.set(
    PDFName.of("Resources"),
    context.obj({ Font: context.obj({ FShape: fontRef }) }),
  );
  const content = [
    "BT",
    "/FShape 20 Tf",
    "1 0 0 1 60 740 Tm",
    `<${cidHex(gidA)}${cidHex(gidB)}> Tj`,
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.flateStream(new TextEncoder().encode(content))),
  );

  return doc.save();
}

/** Large but lightweight document for page-rail virtualization regressions. */
async function largeDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 120; index += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Large document page ${index + 1}`, {
      x: 60,
      y: 740,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return doc.save();
}

/** Two pages, so the PAGES rail renders -- it is hidden for a single page. */
async function twoPage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of ["Employee record", "Second page record"]) {
    const page = doc.addPage([595, 842]);
    page.drawText(label, { x: 60, y: 740, size: 18, font, color: rgb(0, 0, 0) });
    page.drawText("SSN 123-45-6789", { x: 60, y: 680, size: 16, font, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

export async function writeFixtures(): Promise<void> {
  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(TEXT_ONLY_PDF, await textOnly());
  await writeFile(WITH_IMAGE_PDF, await withImage());
  await writeFile(IMAGE_ONLY_PDF, await imageOnly());
  await writeFile(ROTATED_SCAN_PDF, await rotatedScan());
  await writeFile(SPANISH_SCAN_PDF, await spanishScan());
  await writeFile(SEARCHABLE_SCAN_PDF, await searchableScan());
  const split = await splitRun();
  await assertGenuinelySplit(split);
  await writeFile(SPLIT_RUN_PDF, split);
  await writeFile(TWO_PAGE_PDF, await twoPage());
  await writeFile(MIXED_STYLE_PDF, await mixedStyle());
  await writeFile(CLIPPED_TEXT_PDF, await clippedText());
  await writeFile(LARGE_DOCUMENT_PDF, await largeDocument());
  await writeFile(SHAPED_LTR_PDF, await shapedLtrType0());
  await writeFile(PARAGRAPH_PDF, await buildPreservedLineParagraphPdf());
}
