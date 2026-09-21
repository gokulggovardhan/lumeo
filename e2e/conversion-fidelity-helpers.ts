import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type PdfWordBox = {
  page: number;
  pageWidth: number;
  pageHeight: number;
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export type PdfPageGeometry = {
  page: number;
  width: number;
  height: number;
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function attributeMap(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of value.matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
    attributes.set(match[1], match[2]);
  }
  return attributes;
}

export async function renderDocxWithLibreOffice(
  bytes: Buffer,
  outputDirectory: string,
  stem: string,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const sourcePath = join(outputDirectory, `${stem}.docx`);
  await writeFile(sourcePath, bytes);

  await execFile(
    "libreoffice",
    [
      "--headless",
      "--nologo",
      "--nodefault",
      "--nolockcheck",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDirectory,
      sourcePath,
    ],
    { timeout: 120_000 },
  );

  const pdfPath = join(outputDirectory, `${stem}.pdf`);
  await readFile(pdfPath);
  return pdfPath;
}

export async function writePdfFixture(
  bytes: Buffer,
  outputDirectory: string,
  stem: string,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const path = join(outputDirectory, `${stem}.pdf`);
  await writeFile(path, bytes);
  return path;
}

export async function extractPdfWordBoxes(
  pdfPath: string,
  outputDirectory: string,
  stem: string,
): Promise<{
  pages: PdfPageGeometry[];
  words: PdfWordBox[];
}> {
  await mkdir(outputDirectory, { recursive: true });
  const htmlPath = join(outputDirectory, `${stem}.bbox.html`);
  await execFile("pdftotext", ["-bbox-layout", pdfPath, htmlPath], {
    timeout: 60_000,
  });
  const html = await readFile(htmlPath, "utf8");

  const pages: PdfPageGeometry[] = [];
  const words: PdfWordBox[] = [];
  let pageNumber = 0;

  for (const pageMatch of html.matchAll(
    /<page\b([^>]*)>([\s\S]*?)<\/page>/g,
  )) {
    pageNumber += 1;
    const pageAttributes = attributeMap(pageMatch[1]);
    const pageWidth = Number(pageAttributes.get("width"));
    const pageHeight = Number(pageAttributes.get("height"));
    if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight)) {
      throw new Error(`Unable to read page geometry from ${pdfPath}`);
    }
    pages.push({ page: pageNumber, width: pageWidth, height: pageHeight });

    for (const wordMatch of pageMatch[2].matchAll(
      /<word\b([^>]*)>([\s\S]*?)<\/word>/g,
    )) {
      const attributes = attributeMap(wordMatch[1]);
      const xMin = Number(attributes.get("xMin"));
      const yMin = Number(attributes.get("yMin"));
      const xMax = Number(attributes.get("xMax"));
      const yMax = Number(attributes.get("yMax"));
      if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) continue;

      words.push({
        page: pageNumber,
        pageWidth,
        pageHeight,
        text: decodeXmlText(wordMatch[2]).trim(),
        xMin,
        yMin,
        xMax,
        yMax,
      });
    }
  }

  if (!pages.length) {
    throw new Error(`No PDF pages were extracted from ${pdfPath}`);
  }
  return { pages, words };
}

export async function assertPdfAnchorFidelity(
  referencePdf: string,
  candidatePdf: string,
  outputDirectory: string,
  anchors: Array<{ page: number; text: string }>,
  tolerance = 0.025,
): Promise<void> {
  const [reference, candidate] = await Promise.all([
    extractPdfWordBoxes(referencePdf, outputDirectory, "reference"),
    extractPdfWordBoxes(candidatePdf, outputDirectory, "candidate"),
  ]);

  if (reference.pages.length !== candidate.pages.length) {
    throw new Error(
      `Page count changed: reference=${reference.pages.length}, candidate=${candidate.pages.length}`,
    );
  }

  for (let index = 0; index < reference.pages.length; index += 1) {
    const expected = reference.pages[index];
    const actual = candidate.pages[index];
    const widthDelta = Math.abs(expected.width - actual.width) / expected.width;
    const heightDelta =
      Math.abs(expected.height - actual.height) / expected.height;
    if (widthDelta > 0.005 || heightDelta > 0.005) {
      throw new Error(
        `Page ${index + 1} size changed materially: ` +
          `${expected.width}x${expected.height} -> ${actual.width}x${actual.height}`,
      );
    }
  }

  for (const anchor of anchors) {
    const expected = reference.words.find(
      (word) => word.page === anchor.page && word.text === anchor.text,
    );
    const actual = candidate.words.find(
      (word) => word.page === anchor.page && word.text === anchor.text,
    );

    if (!expected || !actual) {
      throw new Error(
        `Missing fidelity anchor "${anchor.text}" on page ${anchor.page} ` +
          `(reference=${Boolean(expected)}, candidate=${Boolean(actual)}).`,
      );
    }

    const expectedX = expected.xMin / expected.pageWidth;
    const expectedY = expected.yMin / expected.pageHeight;
    const actualX = actual.xMin / actual.pageWidth;
    const actualY = actual.yMin / actual.pageHeight;
    const xDelta = Math.abs(expectedX - actualX);
    const yDelta = Math.abs(expectedY - actualY);

    if (xDelta > tolerance || yDelta > tolerance) {
      throw new Error(
        `Fidelity anchor "${anchor.text}" moved too far on page ${anchor.page}: ` +
          `Δx=${xDelta.toFixed(4)}, Δy=${yDelta.toFixed(4)}, tolerance=${tolerance.toFixed(4)}.`,
      );
    }
  }
}

export async function countPdfImages(pdfPath: string): Promise<number> {
  const { stdout } = await execFile("pdfimages", ["-list", pdfPath], {
    timeout: 60_000,
  });
  return stdout
    .split("\n")
    .filter((line) => /^\s*\d+\s+\d+\s+/.test(line)).length;
}

export async function assertRenderedPdfSimilarity(
  referencePdf: string,
  candidatePdf: string,
  options: {
    maxMae?: number;
    maxChanged?: number;
  } = {},
): Promise<void> {
  await execFile(
    "python3",
    [
      join(process.cwd(), "scripts/compare-pdf-fidelity.py"),
      referencePdf,
      candidatePdf,
      "--max-mae",
      String(options.maxMae ?? 18),
      "--max-changed",
      String(options.maxChanged ?? 0.20),
    ],
    {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );
}
