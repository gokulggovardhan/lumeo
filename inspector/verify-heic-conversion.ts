import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { inspectSampleDirectory } from "../lib/heic-to-jpeg/inspection/index.ts";

const INCLUDED = /\.(heic|heif|jpe?g|aae|mov|dng)$/i;

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
      name: row.querySelector("h3")?.textContent?.trim() ?? "unknown",
      status: row.dataset.status ?? "unknown",
      outputDimensions: row.dataset.outputDimensions || null,
      summary: row.textContent?.replace(/\s+/g, " ").trim() ?? "",
    })));
    const result = { generatedAt: new Date().toISOString(), sourceFolder, url, inspection: inspection.summary, conversion };
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
