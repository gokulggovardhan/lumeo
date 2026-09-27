import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EDIT_PERFORMANCE_120_PDF,
  EDIT_PERFORMANCE_320_PDF,
  writeEditPerformanceFixtures,
} from "./edit-performance-fixtures.ts";
import { runSelectorFor } from "./helpers.ts";
import { THUMBNAIL_VIRTUALIZE_AFTER } from "../lib/pdf/edit/thumbnailVirtualization.ts";

type PerformanceReport = {
  document: { fileSizeBytes: number | null; pageCount: number | null };
  durations: Record<string, { count: number; maxMs: number; averageMs: number }>;
  recentEvents: Array<{
    kind: string;
    durationMs: number;
    detail: Record<string, number | string | boolean | null>;
  }>;
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
  const rail = page.locator("ul[data-thumbnail-virtualized]");
  await expect(rail).toHaveAttribute(
    "data-thumbnail-virtualized",
    expectedPageCount > THUMBNAIL_VIRTUALIZE_AFTER ? "true" : "false",
    { timeout: 30_000 },
  );
}

async function openMeasuredPage(
  page: Page,
  pageNumber: number,
  pageCount: number,
) {
  const rail = page.locator("ul[data-thumbnail-virtualized]");
  await rail.evaluate(
    (node, { pageNumber, pageCount }) => {
      const list = node as HTMLUListElement;
      const ratio =
        pageCount <= 1 ? 0 : Math.max(0, Math.min(1, (pageNumber - 1) / (pageCount - 1)));
      list.scrollTop = ratio * Math.max(0, list.scrollHeight - list.clientHeight);
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    },
    { pageNumber, pageCount },
  );
  const button = page.getByRole("button", { name: `Open page ${pageNumber}` });
  await expect(button).toBeAttached({ timeout: 30_000 });
  await button.click();
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
  await openMeasuredPage(page, Math.ceil(pageCount / 2), pageCount);
  await openMeasuredPage(page, pageCount, pageCount);
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
        message: "thumbnail window batch should finish so its cost can be measured",
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

  const thumbnailEvents = report.recentEvents.filter(
    (event) => event.kind === "thumbnail-batch",
  );
  expect(thumbnailEvents.length).toBeGreaterThan(0);
  expect(
    thumbnailEvents.some(
      (event) =>
        event.detail.virtualized === true &&
        typeof event.detail.mountedRowCount === "number" &&
        event.detail.mountedRowCount > 0 &&
        event.detail.mountedRowCount < pageCount,
    ),
  ).toBe(true);

  const maxMountedRows = Math.max(
    ...thumbnailEvents
      .map((event) => event.detail.mountedRowCount)
      .filter((value): value is number => typeof value === "number"),
  );
  expect(maxMountedRows).toBeLessThan(30);

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
      maxMountedThumbnailRows: maxMountedRows,
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
