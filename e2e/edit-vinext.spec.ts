import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { MIXED_STYLE_PDF, SPLIT_RUN_PDF, TEXT_ONLY_PDF, TWO_PAGE_PDF, writeFixtures } from "./fixtures.ts";
import { waitForStageReady } from "./helpers.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

async function uploadEditFixture(page: Page, fixturePath: string) {
  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
}

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

  await uploadEditFixture(page, TEXT_ONLY_PDF);

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

  const initialText = await editor.inputValue();
  await expect(editor).toHaveAttribute("data-logical-selection-start", "0");
  await expect(editor).toHaveAttribute(
    "data-logical-selection-end",
    String(initialText.length),
  );
  await expect(editor).toHaveAttribute("data-logical-selection-collapsed", "false");

  // Browser selection is only an input signal. Arrow movement updates
  // Lumeo's own logical range and the model is mirrored back to the input.
  await editor.press("ArrowLeft");
  await expect(editor).toHaveAttribute("data-logical-selection-start", "0");
  await expect(editor).toHaveAttribute("data-logical-selection-end", "0");
  await expect(editor).toHaveAttribute("data-logical-selection-collapsed", "true");

  await editor.press("Shift+ArrowRight");
  await expect(editor).toHaveAttribute("data-logical-selection-start", "0");
  await expect(editor).toHaveAttribute("data-logical-selection-end", "1");
  await expect(editor).toHaveAttribute("data-logical-selection-direction", "forward");
  await expect(editor).toHaveAttribute("data-logical-selection-collapsed", "false");

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


test("vinext Edit PDF applies native formatting and colour with one native history transaction", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await uploadEditFixture(page, TEXT_ONLY_PDF);
  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  const selectEmployeeAndOpenFormat = async () => {
    await waitForStageReady(page);
    const run = page
      .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]')
      .first();
    await expect(run).toBeVisible({ timeout: 90_000 });
    await run.click();
    const formatButton = page.getByRole("button", { name: "Format" });
    // The inline editor can appear one React turn before the richer
    // Page→Block→Line→Span model has materialized its selected span. Format
    // must stay non-actionable through that gap rather than accepting a
    // click that silently does nothing (a WebKit race caught in PR #438).
    await expect(formatButton).toBeEnabled({ timeout: 90_000 });
    await formatButton.click();
    const panel = page.locator("[data-native-text-formatting]");
    await expect(panel).toBeVisible();
    return {
      run,
      panel,
      colour: page.getByLabel("Native fill colour"),
      scale: page.getByRole("spinbutton", { name: "Native horizontal scale" }),
      editor: page.getByRole("textbox", { name: "Edit text" }),
    };
  };

  const initial = await selectEmployeeAndOpenFormat();
  await expect(initial.panel).toContainText(/Helvetica|Arial/i);
  await expect(initial.colour).toHaveValue("#000000");
  await expect(initial.scale).toHaveValue("100");
  // Opening Format is inspection only; it must not dirty the document.
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  await initial.colour.evaluate((node) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Browser did not expose the native input value setter.");
    setter.call(input, "#3366cc");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await initial.scale.fill("95");
  await expect(initial.editor).toHaveAttribute("data-native-fill-color", "#3366cc");
  // Draft changes remain UI-only until Apply.
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  await page.getByRole("button", { name: "Apply edit" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");

  const applied = await selectEmployeeAndOpenFormat();
  await expect(applied.colour).toHaveValue("#3366cc");
  await expect(applied.scale).toHaveValue("95");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");
  const undone = await selectEmployeeAndOpenFormat();
  await expect(undone.colour).toHaveValue("#000000");
  await expect(undone.scale).toHaveValue("100");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");
  const redone = await selectEmployeeAndOpenFormat();
  await expect(redone.colour).toHaveValue("#3366cc");
  await expect(redone.scale).toHaveValue("95");

  // The operation stayed a native-text rewrite: no placed overlay text was
  // introduced just to change formatting/paint, and combined style changes
  // remain one semantic history transaction.
  await expect(page.locator('[data-edit-operation-count="1"]')).toBeVisible();

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

  const exported = await PDFDocument.load(bytes);
  expect(exported.getPageCount()).toBe(1);
  const operators = collectPageTextOperators(exported, 0);
  expect(operators.length).toBeGreaterThanOrEqual(2);
  expect(operators[0].operator.fillColor?.colorSpace).toBe("DeviceRGB");
  expect(operators[0].operator.fillColor?.cssHex).toBe("#3366cc");
  expect(operators[0].operator.horizontalScalingPct).toBe(95);
  // Exact local paint restoration means the following source text is still
  // black rather than inheriting the selected run's new blue fill.
  expect(operators[1].operator.fillColor?.cssHex).toBe("#000000");

  // Reopen the exported bytes through the real editor and prove detection sees
  // the persisted native colour and formatting, not just the pre-export UI.
  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "native-colour-reopened.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  const reopened = await selectEmployeeAndOpenFormat();
  await expect(reopened.colour).toHaveValue("#3366cc");
  await expect(reopened.scale).toHaveValue("95");

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});


test("vinext Edit PDF applies one safe formatting transaction across mixed native spans", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await uploadEditFixture(page, MIXED_STYLE_PDF);
  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  const selectMixedAndOpenFormat = async () => {
    await waitForStageReady(page);
    const editableRuns = page.locator('div[role="button"][aria-label^="Editable text: "]');
    await expect(editableRuns).toHaveCount(2, { timeout: 90_000 });

    const labels = await editableRuns.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label") ?? ""),
    );
    const firstIndex = labels.findIndex((label) => label.includes("Mixed alpha"));
    const secondIndex = labels.findIndex((label) => label.includes("Mixed beta"));
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);

    await editableRuns.nth(firstIndex).click();
    await editableRuns.nth(secondIndex).click({ modifiers: ["Shift"] });

    const multiPanel = page.locator("[data-edit-multi-run-panel]");
    await expect(multiPanel).toBeVisible();
    await expect(multiPanel).toHaveAttribute("data-logical-selection-span-count", "2");
    await expect(multiPanel).toHaveAttribute("data-logical-selection-whole-spans", "true");

    await multiPanel.getByRole("button", { name: "Format" }).click();
    const formatting = page.locator("[data-native-mixed-formatting]");
    await expect(formatting).toBeVisible();
    return formatting;
  };

  const initial = await selectMixedAndOpenFormat();
  await expect(initial.locator("[data-native-mixed-font]")).toHaveText("Mixed");
  await expect(initial.locator("[data-native-mixed-font-size]")).toHaveValue("");
  await expect(initial.locator("[data-native-mixed-font-size]")).toHaveAttribute("placeholder", /Mixed/);
  await expect(initial.locator("[data-native-mixed-horizontal-scale]")).toHaveValue("100");
  await expect(initial.locator("[data-native-mixed-fill]")).toHaveValue("");
  await expect(initial.locator("[data-native-mixed-fill]")).toHaveAttribute("placeholder", /Mixed/);

  // Weight/italic are deliberately independent style dimensions: the
  // fixture only changes family/size/fill, so these must not be falsely
  // reported mixed.
  await expect(initial.locator("[data-native-mixed-weight]")).toHaveText("Regular");
  await expect(initial.locator("[data-native-mixed-italic]")).toHaveText("Not italic");

  await initial.locator("[data-native-mixed-font-size]").fill("16");
  await initial.locator("[data-native-mixed-horizontal-scale]").fill("90");
  await initial.locator("[data-native-mixed-fill]").fill("#008800");
  const applyFormatting = initial.locator("[data-native-mixed-apply]");
  await expect(applyFormatting).toBeEnabled();
  await applyFormatting.click();

  // One UI action may append one semantic changeStyle record per native span,
  // but it is committed through ONE history snapshot. Undo below must revert
  // the complete batch rather than exposing a half-formatted intermediate.
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "2");

  const applied = await selectMixedAndOpenFormat();
  await expect(applied.locator("[data-native-mixed-font]")).toHaveText("Mixed");
  await expect(applied.locator("[data-native-mixed-font-size]")).toHaveValue("16");
  await expect(applied.locator("[data-native-mixed-horizontal-scale]")).toHaveValue("90");
  await expect(applied.locator("[data-native-mixed-fill]")).toHaveValue("#008800");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  const undone = await selectMixedAndOpenFormat();
  await expect(undone.locator("[data-native-mixed-font]")).toHaveText("Mixed");
  await expect(undone.locator("[data-native-mixed-font-size]")).toHaveValue("");
  await expect(undone.locator("[data-native-mixed-horizontal-scale]")).toHaveValue("100");
  await expect(undone.locator("[data-native-mixed-fill]")).toHaveValue("");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "2");

  const redone = await selectMixedAndOpenFormat();
  await expect(redone.locator("[data-native-mixed-font]")).toHaveText("Mixed");
  await expect(redone.locator("[data-native-mixed-font-size]")).toHaveValue("16");
  await expect(redone.locator("[data-native-mixed-horizontal-scale]")).toHaveValue("90");
  await expect(redone.locator("[data-native-mixed-fill]")).toHaveValue("#008800");

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

  await uploadEditFixture(page, SPLIT_RUN_PDF);

  const editableRuns = page.locator('div[role="button"][aria-label^="Editable text: "]');
  await expect(editableRuns.first()).toBeVisible({ timeout: 90_000 });
  await waitForStageReady(page);

  const labels = await editableRuns.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  const mergedIndex = labels.findIndex((label) => label.includes("SSN 123-45-6789"));

  if (mergedIndex >= 0) {
    // Chromium/Firefox currently coalesce the adjacent Tj operators into one
    // visual pdf.js run. Edit PDF must reconstruct the underlying operator
    // span and keep the normal single-run inline editing experience.
    await editableRuns.nth(mergedIndex).click();
    const editor = page.getByRole("textbox", { name: "Edit text" });
    await expect(editor).toHaveValue(/SSN 123-45-6789/);
    await editor.fill("SSN 000-00-0000");

    const apply = page.locator("[data-edit-inline-apply]");
    await expect(apply).toHaveCount(1);
    await expect(apply).toBeEnabled();
    await apply.click();
  } else {
    // WebKit's pdf.js build can expose the same byte-adjacent operators as
    // two visual runs instead of coalescing them. That is also legitimate:
    // select the contiguous runs and prove the established multi-run writer
    // produces the same semantic replacement without guessing/merging.
    const firstHalfIndex = labels.findIndex((label) => label.includes("SSN 123-45-"));
    const secondHalfIndex = labels.findIndex((label) => label.includes("6789"));
    expect(firstHalfIndex).toBeGreaterThanOrEqual(0);
    expect(secondHalfIndex).toBeGreaterThan(firstHalfIndex);

    await editableRuns.nth(firstHalfIndex).click();
    await editableRuns.nth(secondHalfIndex).click({ modifiers: ["Shift"] });

    const panel = page.locator("[data-edit-multi-run-panel]");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-logical-selection-span-count", "2");
    await expect(panel).toHaveAttribute("data-logical-selection-whole-spans", "true");
    const editor = page.locator("[data-edit-multi-run-input]");
    await expect(editor).toHaveValue(/SSN 123-45-6789/);
    await editor.fill("SSN 000-00-0000");

    const apply = page.locator("[data-edit-multi-run-apply]");
    await expect(apply).toHaveCount(1);
    await expect(apply).toBeEnabled();
    await apply.click();
  }

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");
  await waitForStageReady(page);

  await expect
    .poll(
      async () => {
        const refreshedLabels = await page
          .locator('div[role="button"][aria-label^="Editable text: "]')
          .evaluateAll((nodes) =>
            nodes.map((node) => (node.getAttribute("aria-label") ?? "").replace(/^Editable text:\s*/, "")),
          );
        return (
          refreshedLabels.some((label) => label.includes("SSN 000-00-0000")) ||
          refreshedLabels.join("").includes("SSN 000-00-0000")
        );
      },
      { timeout: 90_000 },
    )
    .toBe(true);

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

  await uploadEditFixture(page, TWO_PAGE_PDF);
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
