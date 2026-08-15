// bench/ocr-gate2/generateCorpus.ts
//
// Renders every corpus document into each of the three classes and writes
// the matching ground-truth JSON. Regenerating is deterministic: the same
// seed produces the same pixels, so a change in error rate between runs is
// a change in the OCR configuration, never in the fixtures.
//
//   node --no-warnings --experimental-strip-types bench/ocr-gate2/generateCorpus.ts

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { CORPUS_DOCUMENTS, groundTruthTextFor, type CorpusDocument } from "./documents.ts";
import { addNoise, applyVignette, boxBlur, mulberry32 } from "./degrade.ts";
import type { CorpusClass, GroundTruth } from "./groundTruth.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// A4 at 300 DPI -- the resolution Gate 1 timed, and the one every scanner
// defaults to. All three classes share it so page size is not a variable.
const PAGE_WIDTH = 2480;
const PAGE_HEIGHT = 3508;
const MARGIN = 220;
const LINE_HEIGHT = 78;
const BODY_FONT_PX = 46;
const HEADING_FONT_PX = 62;

function drawDocument(context: SKRSContext2D, document: CorpusDocument): void {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.fillStyle = "#111111";
  context.textBaseline = "top";

  let y = MARGIN;
  document.lines.forEach((line, index) => {
    if (line === "") {
      y += LINE_HEIGHT * 0.55;
      return;
    }
    // First non-empty line reads as the document's heading.
    const isHeading = index === 0;
    context.font = `${isHeading ? "bold " : ""}${isHeading ? HEADING_FONT_PX : BODY_FONT_PX}px "DejaVu Sans", Arial, sans-serif`;
    context.fillText(line, MARGIN, y);
    y += isHeading ? LINE_HEIGHT * 1.3 : LINE_HEIGHT;
  });
}

/** Class A: what a good flatbed scan of a printed page looks like. */
function renderClean(document: CorpusDocument): Buffer {
  const canvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  drawDocument(canvas.getContext("2d"), document);
  return canvas.toBuffer("image/png");
}

/**
 * Class B: the same page fed through a scanner slightly crooked. Skew alone
 * is the point -- Tesseract's line finder is what is being stressed, so the
 * noise and paper tint are kept mild enough not to confound it.
 */
function renderSkewed(document: CorpusDocument, seed: number): { buffer: Buffer; degradations: string[] } {
  const source = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  drawDocument(source.getContext("2d"), document);

  const canvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  const context = canvas.getContext("2d");
  // Slightly grey paper, so the rotation does not leave pure-white corners
  // that would tell the binariser exactly where the page is not.
  context.fillStyle = "#f2f0ec";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const angle = (2.6 * Math.PI) / 180;
  context.translate(PAGE_WIDTH / 2, PAGE_HEIGHT / 2);
  context.rotate(angle);
  context.scale(0.94, 0.94);
  context.drawImage(source, -PAGE_WIDTH / 2, -PAGE_HEIGHT / 2);
  context.setTransform(1, 0, 0, 1, 0, 0);

  const image = context.getImageData(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  addNoise(image.data, 10, mulberry32(seed));
  context.putImageData(image, 0, 0);

  return { buffer: canvas.toBuffer("image/png"), degradations: ["skew-2.6deg", "paper-tint", "noise-sigma-10"] };
}

/**
 * Ink bounding box of a clean render, so class C can be framed the way a
 * person actually photographs a document -- filling the frame -- rather
 * than as a full A4 sheet that is two-thirds empty. This is not cosmetic:
 * see the note on framing in renderPhoto.
 */
function inkBounds(context: SKRSContext2D): { x: number; y: number; width: number; height: number } {
  const { data } = context.getImageData(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  let minX = PAGE_WIDTH;
  let minY = PAGE_HEIGHT;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < PAGE_HEIGHT; y += 1) {
    for (let x = 0; x < PAGE_WIDTH; x += 1) {
      if (data[(y * PAGE_WIDTH + x) * 4] < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Class C: a hand-held photo of the page. Everything a camera adds at once
 * -- soft focus, uneven light, sensor noise, and lossy compression -- since
 * they never arrive one at a time in practice.
 *
 * Two choices here are load-bearing, both found by measurement rather than
 * assumed (see README, "What the first class-C attempt got wrong"):
 *
 * FRAMING. The first version photographed the whole A4 sheet, leaving the
 * bottom two-thirds blank. Tesseract scored CER 3.9 on it -- worse than
 * emitting nothing -- while the SAME image cropped to the text block scored
 * 93% confidence and near-perfect text. The blank expanse of noise was
 * dominating layout analysis. Nobody photographs a receipt that way, so the
 * fixture was measuring an artefact of its own construction.
 *
 * NOISE AMPLITUDE. Sigma 20 per pixel at 300 DPI is not what a phone
 * produces: its ISP denoises flat regions hard, which is precisely why real
 * photos of paper have smooth white areas. Sigma 8 is closer, and leaves
 * the blur and JPEG ringing -- the degradations that genuinely cost
 * accuracy -- as the things being measured.
 */
async function renderPhoto(document: CorpusDocument, seed: number): Promise<{ buffer: Buffer; degradations: string[] }> {
  const source = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  const sourceContext = source.getContext("2d");
  drawDocument(sourceContext, document);

  const bounds = inkBounds(sourceContext);
  const pad = 90;
  const frameX = Math.max(0, bounds.x - pad);
  const frameY = Math.max(0, bounds.y - pad);
  const frameW = Math.min(PAGE_WIDTH - frameX, bounds.width + pad * 2);
  const frameH = Math.min(PAGE_HEIGHT - frameY, bounds.height + pad * 2);

  const canvas = createCanvas(frameW, frameH);
  const context = canvas.getContext("2d");
  context.fillStyle = "#efece6";
  context.fillRect(0, 0, frameW, frameH);
  // A smaller rotation than class B plus a horizontal squeeze, standing in
  // for holding the phone slightly off-square to the page.
  context.translate(frameW / 2, frameH / 2);
  context.rotate((1.4 * Math.PI) / 180);
  context.scale(0.96, 0.99);
  context.drawImage(source, frameX, frameY, frameW, frameH, -frameW / 2, -frameH / 2, frameW, frameH);
  context.setTransform(1, 0, 0, 1, 0, 0);

  const image = context.getImageData(0, 0, frameW, frameH);
  boxBlur(image.data, frameW, frameH, 2);
  applyVignette(image.data, frameW, frameH, 0.34);
  addNoise(image.data, 8, mulberry32(seed));
  context.putImageData(image, 0, 0);

  // JPEG last, exactly as a camera does it: the compressor sees the noise
  // and spends its bits on it, which is what produces the ringing around
  // glyph edges that hurts OCR.
  const buffer = await canvas.encode("jpeg", 42);
  return {
    buffer,
    degradations: ["framed-to-content", "skew-1.4deg", "anisotropic-scale", "blur-radius-2", "vignette-0.34", "noise-sigma-8", "jpeg-q42"],
  };
}

async function writeFixture(
  corpusClass: CorpusClass,
  document: CorpusDocument,
  buffer: Buffer,
  extension: "png" | "jpg",
  origin: GroundTruth["origin"],
  degradations: string[],
  notes?: string,
): Promise<void> {
  const imageName = `${document.id}.${extension}`;
  await writeFile(path.join(HERE, corpusClass, imageName), buffer);
  const truth: GroundTruth = {
    id: `${corpusClass}--${document.id}`,
    corpusClass,
    image: imageName,
    text: groundTruthTextFor(document),
    origin,
    degradations,
    ...(notes ? { notes } : {}),
  };
  await writeFile(path.join(HERE, "ground-truth", `${truth.id}.json`), `${JSON.stringify(truth, null, 2)}\n`);
}

async function main(): Promise<void> {
  for (const dir of ["class-a-clean", "class-b-skewed", "class-c-photos", "ground-truth"]) {
    await mkdir(path.join(HERE, dir), { recursive: true });
  }

  let seed = 20260815;
  for (const document of CORPUS_DOCUMENTS) {
    await writeFixture("class-a-clean", document, renderClean(document), "png", "synthetic", [], "Rendered directly at 300 DPI; no degradation.");

    const skewed = renderSkewed(document, seed++);
    await writeFixture("class-b-skewed", document, skewed.buffer, "png", "synthetic-degraded", skewed.degradations);

    const photo = await renderPhoto(document, seed++);
    await writeFixture("class-c-photos", document, photo.buffer, "jpg", "synthetic-degraded", photo.degradations);

    console.log(`generated ${document.id}`);
  }
  console.log(`\n${CORPUS_DOCUMENTS.length * 3} fixtures written under ${HERE}`);
}

await main();
