// e2e/fixtures.ts
//
// Generates the two PDFs the redaction e2e tests need, into e2e/.tmp/ (which
// is gitignored). Deterministic: the same bytes every run, so a failing
// assertion is never the fixture having drifted.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFDict, PDFName, StandardFonts, rgb } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";

// Playwright transpiles specs to CJS, where import.meta is a syntax error --
// resolve from the repo root (the runner's cwd) instead.
export const TMP_DIR = path.join(process.cwd(), "e2e", ".tmp");
export const TEXT_ONLY_PDF = path.join(TMP_DIR, "text-only.pdf");
export const WITH_IMAGE_PDF = path.join(TMP_DIR, "with-image.pdf");
export const SPLIT_RUN_PDF = path.join(TMP_DIR, "split-run.pdf");

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
  page.drawText("Employee record", { x: 60, y: 740, size: 18, font, color: rgb(0, 0, 0) });

  const context = doc.context;
  const fonts = context.obj({});
  fonts.set(PDFName.of("F1"), font.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  // Two show operators back to back with no positioning between them.
  const body = ["BT", "/F1 16 Tf", "1 0 0 1 60 680 Tm", "(SSN 123-45-) Tj (6789) Tj", "ET"].join("\n");
  page.node.set(PDFName.of("Contents"), context.register(context.flateStream(new TextEncoder().encode(body))));
  return doc.save();
}

export async function writeFixtures(): Promise<void> {
  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(TEXT_ONLY_PDF, await textOnly());
  await writeFile(WITH_IMAGE_PDF, await withImage());
  await writeFile(SPLIT_RUN_PDF, await splitRun());
}
