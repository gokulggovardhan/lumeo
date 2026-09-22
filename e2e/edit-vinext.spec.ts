import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { SPLIT_RUN_PDF, TEXT_ONLY_PDF, TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";
import { waitForStageReady } from "./helpers.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

test("vinext Edit PDF supports text matching, editing, and export", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`,
    );
  });

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const editable = page.locator(
    'div[role="button"][aria-label^="Editable text: "]',
  );
  await expect(editable.first()).toBeVisible({ timeout: 90_000 });
  await waitForStageReady(page);

  const capability = page.locator("[data-edit-page-capability]");
  await expect(capability).toBeVisible();
  await expect(capability).toHaveAttribute("data-edit-page-capability", /native-editable|mixed/);

  const labels = await editable.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  expect(labels.join(" ")).toContain("Employee record");
  expect(labels.join(" ")).toContain("123-45-6789");

  const employeeRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    )
    .first();
  await employeeRun.click();

  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  const inheritedStyle = await editor.evaluate((node) => {
    const style = getComputedStyle(node);
    return { fontFamily: style.fontFamily, fontStyle: style.fontStyle, fontWeight: style.fontWeight };
  });
  expect(inheritedStyle.fontFamily).toMatch(/Arial|Helvetica/i);
  expect(Number(inheritedStyle.fontWeight)).toBeGreaterThanOrEqual(400);

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  await editor.fill("Employee record with a deliberately much longer replacement that would overlap nearby PDF content");
  const layoutWarning = page.locator("[data-edit-layout-strategy]");
  await expect(layoutWarning).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply edit" })).toBeDisabled();

  await editor.fill("Employee file");
  await expect(layoutWarning).toHaveCount(0);
  await page.getByRole("button", { name: "Apply edit" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");

  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee file"]',
    ),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadButton = page.getByRole("button", {
    name: "Download edited PDF",
  });
  await expect(downloadButton).toBeVisible({ timeout: 90_000 });

  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const bytes = await readFile(outputPath!);
  expect(bytes.length).toBeGreaterThan(500);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

  const exported = await PDFDocument.load(bytes);
  expect(exported.getPageCount()).toBe(1);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});


test("vinext Edit PDF applies native formatting without converting text to an overlay", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const employeeRun = page
    .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]')
    .first();
  await expect(employeeRun).toBeVisible({ timeout: 90_000 });
  await waitForStageReady(page);
  await employeeRun.click();

  await page.getByRole("button", { name: "Format" }).click();
  const panel = page.locator("[data-native-text-formatting]");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/Helvetica|Arial/i);

  const scale = page.getByRole("spinbutton", { name: "Native horizontal scale" });
  await expect(scale).toHaveValue("100");
  await scale.fill("95");

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");
  await page.getByRole("button", { name: "Apply edit" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");

  await waitForStageReady(page);
  const refreshedRun = page
    .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]')
    .first();
  await expect(refreshedRun).toBeVisible({ timeout: 90_000 });
  await refreshedRun.click();
  await page.getByRole("button", { name: "Format" }).click();
  await expect(page.getByRole("spinbutton", { name: "Native horizontal scale" })).toHaveValue("95");

  // The operation stayed a native-text rewrite: no placed overlay text was
  // introduced just to change formatting.
  await expect(page.locator('[data-edit-operation-count="1"]')).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});


test("vinext Edit PDF reconstructs and edits a pdf.js run split across consecutive Tj operators", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(SPLIT_RUN_PDF);

  const splitRun = page
    .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="SSN 123-45-6789"]')
    .first();
  await expect(splitRun).toBeVisible({ timeout: 90_000 });
  await waitForStageReady(page);

  await splitRun.click();
  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toHaveValue(/SSN 123-45-6789/);
  await editor.fill("SSN 000-00-0000");

  const apply = page.locator("[data-edit-inline-apply]");
  await expect(apply).toHaveCount(1);
  await expect(apply).toBeEnabled();
  await apply.click();

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");
  await waitForStageReady(page);
  await expect(
    page.locator('div[role="button"][aria-label^="Editable text: "][aria-label*="SSN 000-00-0000"]'),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadButton = page.getByRole("button", { name: "Download edited PDF" });
  await expect(downloadButton).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();
  const bytes = await readFile(outputPath!);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("vinext Edit PDF searches across pages, highlights matches, and prepares a partial replacement", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TWO_PAGE_PDF);
  await waitForStageReady(page);

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("record");

  const count = page.locator("[data-edit-search-match-count]");
  await expect(count).toHaveAttribute("data-edit-search-match-count", "2", { timeout: 90_000 });
  await expect(page.locator('[data-edit-search-highlight="active"]')).toBeVisible();

  await page.getByRole("button", { name: "Next search match" }).click();
  await expect(
    page.locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Second page record"]'),
  ).toBeVisible({ timeout: 90_000 });
  await waitForStageReady(page);
  await expect(page.locator('[data-edit-search-highlight="active"]')).toBeVisible();

  const replace = page.getByRole("textbox", { name: "Replace search match with" });
  await replace.fill("entry");
  const replaceThis = page.getByRole("button", { name: "Replace this match" });
  await expect(replaceThis).toBeEnabled({ timeout: 90_000 });
  await replaceThis.click();

  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toHaveValue("Second page entry");
  const apply = page.getByRole("button", { name: "Apply edit" });
  await expect(apply).toBeEnabled();
  await apply.click();

  await waitForStageReady(page);
  await expect(
    page.locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Second page entry"]'),
  ).toBeVisible({ timeout: 90_000 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
