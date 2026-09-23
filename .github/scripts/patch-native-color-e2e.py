from pathlib import Path
import re

path = Path("e2e/edit-vinext.spec.ts")
text = path.read_text()

import_anchor = 'import { PDFDocument } from "pdf-lib";\n'
import_replacement = 'import { PDFDocument } from "pdf-lib";\nimport { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";\n'
if text.count(import_anchor) != 1:
    raise SystemExit(f"expected one PDFDocument import anchor, found {text.count(import_anchor)}")
text = text.replace(import_anchor, import_replacement, 1)

pattern = re.compile(
    r'test\("vinext Edit PDF applies native formatting without converting text to an overlay", async \(\{ page \}\) => \{.*?\n\}\);\n\n\n(?=test\("vinext Edit PDF reconstructs)',
    re.S,
)
replacement = r'''test("vinext Edit PDF applies native formatting and colour with one native history transaction", async ({ page }) => {
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
    await page.getByRole("button", { name: "Format" }).click();
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
    input.value = "#3366cc";
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


'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"expected one native-formatting test block, found {count}")

path.write_text(text)
print("native colour browser regression patched")
