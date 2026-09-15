import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { inspectSampleDirectory } from "../lib/heic-to-jpeg/inspection/index.ts";
import type { GroupReport } from "../lib/heic-to-jpeg/inspection/types.ts";

const INCLUDED = /\.(heic|heif|jpe?g|aae|mov|dng)$/i;

function diagnosticEvidence(group: GroupReport) {
  const portraitDepthEvidence = group.heif.auxiliaryImages
    .filter(({ auxiliaryType, evidence }) => /depth|disparity|portrait/i.test(`${auxiliaryType} ${evidence}`));
  return {
    sourceFiles: group.files.map(({ name, extension }) => ({ name, type: extension })),
    logicalAsset: group.basename,
    primaryDimensions: group.heif.dimensions,
    selectedPrimaryImage: group.heif.primaryItemId,
    orientationEvidence: { structural: group.heif.orientation, metadata: group.metadata.orientation },
    aae: group.aae,
    livePhoto: group.livePhoto,
    hdr: group.hdr,
    portraitDepthEvidence,
    colorSpaceEvidence: { heif: group.heif.colorProfiles, metadata: group.metadata.colorProfile },
    warnings: group.warnings,
  };
}

async function discover(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && INCLUDED.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function main(): Promise<void> {
  const sourceFolder = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2]) throw new Error("Usage: npm run verify:heic-samples -- <folder>");
  const outputFolder = path.resolve("inspector-output");
  const files = await discover(sourceFolder);
  if (!files.length) throw new Error("No supported photo assets were found in the sample folder.");
  const { report: inspection } = await inspectSampleDirectory({ sourceFolder, outputFolder, validationMode: "real" });
  const url = process.env.LUMEO_HEIC_URL ?? "http://127.0.0.1:3000/heic-to-jpeg";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const unexpectedPosts: string[] = [];
    const allowed = new Set(["record_public_analytics_event", "get_public_analytics_setting", "get_public_announcements"]);
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      const endpoint = new URL(request.url()).pathname.split("/").pop() ?? "";
      if (!allowed.has(endpoint)) unexpectedPosts.push(request.url());
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(files);
    const convert = page.getByRole("button", { name: "Convert to JPEG" });
    if (await convert.isVisible()) {
      await convert.click();
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>("[data-photo-asset]")].every((row) => ["done", "failed", "needs-review"].includes(row.dataset.status ?? "")), undefined, { timeout: 30 * 60_000 });
    }
    if (unexpectedPosts.length) throw new Error("The browser attempted a non-analytics POST request during local conversion.");
    const conversion = await page.locator("[data-photo-asset]").evaluateAll((rows) => rows.map((row) => ({
      sourceFilename: row.querySelector("h3")?.textContent?.trim() ?? "unknown",
      logicalAsset: row.getAttribute("data-logical-asset") ?? "unknown",
      status: row.dataset.status ?? "unknown",
      jpegDimensions: row.getAttribute("data-output-dimensions") || null,
      jpegFilename: row.getAttribute("data-output-name") || null,
      warningOrFallback: row.getAttribute("data-warning") || null,
    })));
    const result = {
      generatedAt: new Date().toISOString(),
      sourceFolder,
      url,
      summary: inspection.summary,
      samples: inspection.groups.map(diagnosticEvidence),
      conversion,
    };
    await mkdir(outputFolder, { recursive: true });
    await writeFile(path.join(outputFolder, "conversion-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`HEIC browser validation failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1;
});
