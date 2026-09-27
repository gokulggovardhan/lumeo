import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EDIT_PERFORMANCE_120_PDF,
  EDIT_PERFORMANCE_320_PDF,
  writeEditPerformanceFixtures,
} from "./edit-performance-fixtures.ts";
import { runSelectorFor } from "./helpers.ts";

type PerformanceReport = {
  document: { fileSizeBytes: number | null; pageCount: number | null };
  durations: Record<string, { count: number; maxMs: number; averageMs: number }>;
  memory: { peakUsedJsHeapBytes: number | null };
  fontRegistry: Record<string, number> | null;
};

test.beforeAll(async () => {
  await writeEditPerformanceFixtures();
});

async function openFixture(page: Page, path: string, expectedPageCount: number) {
  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({
    timeout: 30_000,
  });
  await page.locator('input[type="file"]').first().setInputFiles(path);
  await expect(page.locator(runSelectorFor("Performance page 1")).first()).toBeVisible({
    timeout: 180_000,
  });
  await expect(
    page.getByRole("button", { name: `Open page ${expectedPageCount}` }),
  ).toBeAttached({ timeout: 30_000 });
}

async function openMeasuredPage(page: Page, pageNumber: number) {
  await page.getByRole("button", { name: `Open page ${pageNumber}` }).click();
  await expect(
    page.locator(runSelectorFor(`Performance page ${pageNumber}`)).first(),
  ).toBeVisible({ timeout: 180_000 });
}

async function exerciseRailScroll(page: Page) {
  const rail = page.getByRole("complementary", { name: "Pages" }).locator("ul");
  await rail.evaluate((node) => {
    node.scrollTop = Math.max(0, node.scrollHeight / 2);
  });
  await rail.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = window as typeof window & {
            __LUMEO_EDIT_PDF_PERFORMANCE__?: { report: () => PerformanceReport };
          };
          return host.__LUMEO_EDIT_PDF_PERFORMANCE__?.report().durations[
            "scroll-raf"
          ]?.count ?? 0;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

async function collectScenario(
  page: Page,
  fixturePath: string,
  pageCount: number,
  name: string,
) {
  await openFixture(page, fixturePath, pageCount);
  await openMeasuredPage(page, Math.ceil(pageCount / 2));
  await openMeasuredPage(page, pageCount);
  await exerciseRailScroll(page);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = window as typeof window & {
            __LUMEO_EDIT_PDF_PERFORMANCE__?: { report: () => PerformanceReport };
          };
          return host.__LUMEO_EDIT_PDF_PERFORMANCE__?.report().durations[
            "thumbnail-batch"
          ]?.count ?? 0;
        }),
      {
        timeout: 600_000,
        message: "eager thumbnail batch should finish so its cost can be measured",
      },
    )
    .toBeGreaterThan(0);

  const report = await page.evaluate(() => {
    const host = window as typeof window & {
      __LUMEO_EDIT_PDF_PERFORMANCE__?: { report: () => PerformanceReport };
    };
    if (!host.__LUMEO_EDIT_PDF_PERFORMANCE__) {
      throw new Error("Edit PDF performance diagnostics were not enabled.");
    }
    return host.__LUMEO_EDIT_PDF_PERFORMANCE__.report();
  });

  expect(report.document.pageCount).toBe(pageCount);
  expect(report.durations["document-open"].count).toBe(1);
  expect(report.durations["page-raster"].count).toBeGreaterThanOrEqual(3);
  expect(report.durations["text-detection"].count).toBeGreaterThanOrEqual(3);
  expect(report.durations["native-match"].count).toBeGreaterThanOrEqual(3);
  expect(report.durations["thumbnail-batch"].count).toBeGreaterThanOrEqual(1);

  const outputDir = join(process.cwd(), "test-results", "edit-performance");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, `${name}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `[edit-performance] ${name} ${JSON.stringify({
      pageCount,
      documentOpenMs: report.durations["document-open"].maxMs,
      maxRasterMs: report.durations["page-raster"].maxMs,
      maxTextDetectionMs: report.durations["text-detection"].maxMs,
      maxNativeMatchMs: report.durations["native-match"].maxMs,
      thumbnailBatchMs: report.durations["thumbnail-batch"].maxMs,
      peakUsedJsHeapBytes: report.memory.peakUsedJsHeapBytes,
      fontRegistry: report.fontRegistry,
    })}`,
  );
}

test("profiles Edit PDF with 120 pages without turning timings into release thresholds", async ({
  page,
}) => {
  test.setTimeout(900_000);
  await collectScenario(
    page,
    EDIT_PERFORMANCE_120_PDF,
    120,
    "edit-performance-120",
  );
});

test("profiles Edit PDF with 320 pages without turning timings into release thresholds", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  await collectScenario(
    page,
    EDIT_PERFORMANCE_320_PDF,
    320,
    "edit-performance-320",
  );
});
