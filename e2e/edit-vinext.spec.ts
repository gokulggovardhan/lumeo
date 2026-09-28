import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { decodeTextShowOperator } from "../lib/pdf/edit/editPlan.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import {
  CLIPPED_TEXT_PDF,
  IMAGE_ONLY_PDF,
  ROTATED_SCAN_PDF,
  SEARCHABLE_SCAN_PDF,
  SHAPED_LTR_PDF,
  PARAGRAPH_PDF,
  LARGE_DOCUMENT_PDF,
  MIXED_STYLE_PDF,
  SPLIT_RUN_PDF,
  TEXT_ONLY_PDF,
  TWO_PAGE_PDF,
  writeFixtures,
} from "./fixtures.ts";
import {
  applyRedactionThroughModal,
  blackMaskCount,
  detectedRunTexts,
  dragBoxOverRun,
  enterRedactMode,
  waitForStageReady,
} from "./helpers.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

async function uploadEditFixture(page: Page, fixturePath: string) {
  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
}

async function findCiTrueTypeFont(): Promise<string> {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      if (bytes.byteLength > 1_000) return candidate;
    } catch {
      // Try the next font installed by the Linux runner image.
    }
  }
  throw new Error(
    "No deterministic TrueType font was found on the Linux CI runner.",
  );
}

async function replaceCharacterRange(
  page: Page,
  input: Locator,
  start: number,
  end: number,
  replacement: string,
) {
  await input.focus();
  await input.evaluate(
    (element, range) => {
      const field = element as HTMLInputElement;
      field.setSelectionRange(range.start, range.end);
      field.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end },
  );
  await page.keyboard.insertText(replacement);
}

test("vinext Edit PDF explains read-only clipped text before an edit is attempted", async ({
  page,
}) => {
  await uploadEditFixture(page, CLIPPED_TEXT_PDF);

  const limitedRun = page
    .locator(
      'div[role="button"][aria-label^="Not yet editable text: "][aria-label*="Clipped sample"]',
    )
    .first();
  // This fixture is intentionally read-only, so the generic
  // waitForStageReady helper (which requires an EDITABLE run to prevent
  // absence-based false greens in redaction tests) is the wrong readiness
  // contract here. A visible limited run already proves detection + matching
  // completed; separately prove the raster loading shell is gone.
  await expect(limitedRun).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Loading page preview")).toHaveCount(0, {
    timeout: 90_000,
  });

  const pageCapability = page.locator("[data-edit-page-capability]");
  await expect(pageCapability).toHaveAttribute(
    "data-edit-page-capability",
    "view-only",
  );
  await expect(pageCapability).toHaveAttribute("title", /clipping shape/i);

  await limitedRun.hover();
  const explanation = page.locator("[data-edit-capability-explanation]");
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText(/clipping shape/i);
  await expect(explanation).toContainText(/read-only/i);

  // Keyboard users get the same proactive explanation. Selecting a limited
  // run must not produce the normal inline edit textbox.
  await limitedRun.focus();
  await expect(explanation).toBeVisible();
  await limitedRun.press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);
  await expect(explanation).toBeVisible();
});

test("vinext Edit PDF keeps invisible searchable-scan text read-only", async ({
  page,
}) => {
  await uploadEditFixture(page, SEARCHABLE_SCAN_PDF);

  // This fixture is intentionally composed only of an image plus hidden
  // searchable text. Waiting for the generic editable-run helper would be a
  // contradiction: the proof we want is that ZERO native runs become
  // editable. Wait directly for the read-only hidden run instead.
  const hiddenRun = page
    .locator(
      'div[role="button"][aria-label^="Not yet editable text: "][aria-label*="SEARCHABLE SCAN SAMPLE"]',
    )
    .first();
  await expect(hiddenRun).toBeVisible({ timeout: 90_000 });
  await expect(hiddenRun).toHaveAttribute(
    "aria-label",
    /Not yet editable text: SEARCHABLE SCAN SAMPLE/i,
  );

  await hiddenRun.hover();
  const explanation = page.locator("[data-edit-capability-explanation]");
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText(/invisible PDF text layer/i);
  await expect(explanation).toContainText(/read-only/i);

  await hiddenRun.focus();
  await hiddenRun.press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recognize text locally" })).toHaveCount(0);
});

test("vinext Edit PDF recognizes a proven scanned page locally without promoting it to native text", async ({
  page,
}) => {
  await uploadEditFixture(page, IMAGE_ONLY_PDF);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  await expect(page.getByText("Loading page preview")).toHaveCount(0, {
    timeout: 90_000,
  });
  const pageCapability = page.locator("[data-edit-page-capability]");
  await expect(pageCapability).toHaveAttribute("data-edit-page-capability", "no-detected-text", {
    timeout: 90_000,
  });
  await expect(pageCapability).toHaveAttribute("title", /appears to be a scan/i, {
    timeout: 30_000,
  });

  const explanation = page.locator("[data-edit-page-capability-explanation]");
  await expect(explanation).toContainText(
    /image content without a proven native text layer/i,
    { timeout: 30_000 },
  );
  await expect(explanation).toContainText(/recognize it locally with OCR/i);

  const applicationOrigin = new URL(page.url()).origin;
  const externalOcrRequests: string[] = [];
  const recordOcrRequest = (request: { url(): string }) => {
    const value = request.url();
    const isOcrAsset =
      /worker\.min\.js|tesseract-core|\.traineddata(?:\.gz)?/i.test(value);
    if (!isOcrAsset) return;
    const url = new URL(value);
    if (url.origin !== applicationOrigin) externalOcrRequests.push(value);
  };
  page.on("request", recordOcrRequest);

  await page.getByRole("button", { name: "Recognize text locally" }).click();
  const recognizedText = page.getByRole("textbox", { name: "Recognized text (OCR)" });
  await expect(recognizedText).toHaveValue(/SCANNED PAGE SAMPLE/i, {
    timeout: 90_000,
  });
  await expect(recognizedText).toHaveValue(/text exists only in image pixels/i);
  await expect(page.locator("[data-edit-ocr-panel]")).toHaveAttribute(
    "data-edit-ocr-source",
    "ocr",
  );
  const wordCount = Number(
    await page.locator("[data-edit-ocr-overlay]").getAttribute("data-edit-ocr-word-count"),
  );
  expect(wordCount).toBeGreaterThan(0);
  expect(externalOcrRequests).toEqual([]);

  // Recognition is an aid for scanned pixels, never a shortcut into the
  // native content-stream writer.
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);

  // Review is browser-local draft state. Correct one real recognized word,
  // preserving the OCR box/confidence while changing only the text that will
  // be published into the separately verified searchable layer.
  await page.getByRole("button", { name: "Review OCR" }).click();
  const scanWordButton = page.locator(
    '[data-edit-ocr-review-word][aria-label*="SCANNED"]',
  ).first();
  await expect(scanWordButton).toBeVisible({ timeout: 30_000 });
  const originalConfidence = await scanWordButton.getAttribute(
    "data-edit-ocr-confidence",
  );
  expect(originalConfidence).not.toBeNull();
  await scanWordButton.click();

  const correctionInput = page.getByRole("textbox", {
    name: "Correct OCR word",
  });
  await expect(correctionInput).toHaveValue(/SCANNED/i);
  await correctionInput.fill("REVIEWEDSCAN");
  await expect(
    page.getByRole("button", { name: "Make page searchable" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(
    page.getByRole("button", { name: "Make page searchable" }),
  ).toBeEnabled();
  await expect(page.locator("[data-edit-ocr-correction-count]")).toHaveAttribute(
    "data-edit-ocr-correction-count",
    "1",
  );
  const correctedWord = page.locator(
    '[data-edit-ocr-review-word][aria-label*="REVIEWEDSCAN"]',
  ).first();
  await expect(correctedWord).toHaveAttribute("data-edit-ocr-corrected", "true");
  await expect(correctedWord).toHaveAttribute(
    "data-edit-ocr-confidence",
    originalConfidence!,
  );

  await page.getByRole("button", { name: "Make page searchable" }).click();
  const searchableStatus = page.locator("[data-edit-ocr-searchable-status]");
  await expect(searchableStatus).toContainText(/Searchable text added locally/i, {
    timeout: 90_000,
  });
  await expect(searchableStatus).toContainText(/1 reviewed correction/i);
  await expect(searchableStatus).toContainText(/scan pixels were not changed/i);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1", {
    timeout: 90_000,
  });

  // The new PDF revision contains extractable text, but that text is mode-3
  // OCR/search metadata and must remain proactively read-only.
  await expect(page.getByText("Loading page preview")).toHaveCount(0, {
    timeout: 90_000,
  });
  const searchableRun = page
    .locator(
      'div[role="button"][aria-label^="Not yet editable text: "][aria-label*="REVIEWEDSCAN"]',
    )
    .first();
  await expect(searchableRun).toBeVisible({ timeout: 90_000 });
  await searchableRun.focus();
  await searchableRun.press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("REVIEWEDSCAN");
  await expect(page.locator("[data-edit-search-match-count]")).toHaveAttribute(
    "data-edit-search-match-count",
    "1",
    { timeout: 90_000 },
  );

  // One Undo removes the generated text layer and returns to the original
  // image-only PDF revision.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Loading page preview")).toHaveCount(0, {
    timeout: 90_000,
  });
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0", {
    timeout: 90_000,
  });
  await expect(searchableStatus).toHaveCount(0);
  await expect(searchableRun).toHaveCount(0);
  await expect(pageCapability).toHaveAttribute(
    "data-edit-page-capability",
    "no-detected-text",
    { timeout: 90_000 },
  );

  // Undo restores the exact scan revision that owns this OCR result, so the
  // reviewed draft is safely available again instead of being retargeted to a
  // different document/page/recognition result.
  await expect(page.locator("[data-edit-ocr-review-panel]")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-edit-ocr-correction-count]")).toHaveAttribute(
    "data-edit-ocr-correction-count",
    "1",
  );
  await expect(
    page.locator('[data-edit-ocr-review-word][aria-label*="REVIEWEDSCAN"]').first(),
  ).toBeVisible();

  page.off("request", recordOcrRequest);
});

test("vinext Edit PDF corrects sideways scan orientation locally and keeps review geometry page-aligned", async ({
  page,
}) => {
  await uploadEditFixture(page, ROTATED_SCAN_PDF);

  await expect(page.getByText("Loading page preview")).toHaveCount(0, {
    timeout: 90_000,
  });
  const pageCapability = page.locator("[data-edit-page-capability]");
  await expect(pageCapability).toHaveAttribute(
    "data-edit-page-capability",
    "no-detected-text",
    { timeout: 90_000 },
  );
  await expect(pageCapability).toHaveAttribute("title", /appears to be a scan/i);

  const orientation = page.getByRole("combobox", {
    name: "OCR scan orientation",
  });
  await expect(orientation).toHaveValue("0");
  await orientation.selectOption("270");
  await expect(orientation).toHaveValue("270");

  await page.getByRole("button", { name: "Recognize text locally" }).click();
  const recognizedText = page.getByRole("textbox", {
    name: "Recognized text (OCR)",
  });
  await expect(recognizedText).toHaveValue(/SIDEWAYS OCR SAMPLE/i, {
    timeout: 90_000,
  });
  await expect(recognizedText).toHaveValue(/Rotate locally before recognition/i);
  await expect(page.locator("[data-edit-ocr-result-orientation]")).toHaveAttribute(
    "data-edit-ocr-result-orientation",
    "270",
  );
  await expect(page.locator("[data-edit-ocr-result-orientation]")).toContainText(
    /rotated left 90/i,
  );

  await page.getByRole("button", { name: "Review OCR" }).click();
  const sidewaysWord = page
    .locator('[data-edit-ocr-review-word][aria-label*="SIDEWAYS"]')
    .first();
  await expect(sidewaysWord).toBeVisible({ timeout: 30_000 });
  const box = await sidewaysWord.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // Review remains OCR metadata only; orientation correction never promotes
  // scan text into the native content-stream writer.
  await sidewaysWord.click();
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);

  // The inverse-mapped page geometry must also remain valid when the OCR
  // result is published as a verified invisible searchable layer. The
  // original scan pixels stay untouched and the resulting text remains
  // intentionally read-only to native Edit authority.
  await page.getByRole("button", { name: "Make page searchable" }).click();
  const searchableStatus = page.locator("[data-edit-ocr-searchable-status]");
  await expect(searchableStatus).toContainText(/Searchable text added locally/i, {
    timeout: 90_000,
  });
  await waitForStageReady(page);

  const searchableRun = page
    .locator(
      'div[role="button"][aria-label^="Not yet editable text: "][aria-label*="SIDEWAYS"]',
    )
    .first();
  await expect(searchableRun).toBeVisible({ timeout: 90_000 });
  await searchableRun.click();
  await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("SIDEWAYS");
  await expect(page.locator("[data-edit-search-match-count]")).toHaveAttribute(
    "data-edit-search-match-count",
    "1",
    { timeout: 90_000 },
  );
});

test("vinext Edit PDF keeps a 120-page thumbnail rail bounded and scrollable", async ({
  page,
}) => {
  await uploadEditFixture(page, LARGE_DOCUMENT_PDF);
  await waitForStageReady(page);

  const rail = page.locator("ul[data-thumbnail-virtualized]");
  await expect(rail).toHaveAttribute("data-thumbnail-virtualized", "true", {
    timeout: 90_000,
  });

  const initialWindowSize = Number(
    await rail.getAttribute("data-thumbnail-window-size"),
  );
  expect(initialWindowSize).toBeGreaterThan(0);
  expect(initialWindowSize).toBeLessThan(30);
  expect(
    await page.getByRole("button", { name: /^Open page \d+$/ }).count(),
  ).toBeLessThan(30);

  await rail.evaluate((node) => {
    const list = node as HTMLUListElement;
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await expect(page.getByRole("button", { name: "Open page 120" })).toBeVisible({
    timeout: 90_000,
  });
  const finalWindowSize = Number(
    await rail.getAttribute("data-thumbnail-window-size"),
  );
  expect(finalWindowSize).toBeGreaterThan(0);
  expect(finalWindowSize).toBeLessThan(30);
  expect(
    await page.getByRole("button", { name: /^Open page \d+$/ }).count(),
  ).toBeLessThan(30);
});

test("vinext Edit PDF aborts Replace All when the native PDF revision changes during preflight", async ({
  page,
}) => {
  await uploadEditFixture(page, LARGE_DOCUMENT_PDF);
  await waitForStageReady(page);

  const firstRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Large document page 1"]',
    )
    .first();
  await firstRun.click();
  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await editor.fill("Large dossier page 1");
  await page.getByRole("button", { name: "Apply edit" }).click();
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Large dossier page 1"]',
    ),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("page");
  const replace = page.getByRole("textbox", {
    name: "Replace search match with",
  });
  await replace.fill("sheet");

  const replaceAll = page.getByRole("button", { name: "Replace all safely" });
  await expect(replaceAll).toBeEnabled({ timeout: 90_000 });
  await replaceAll.click();

  const status = page.locator("[data-edit-replace-all-status]");
  await expect(status).toContainText(/Checking every match against the native PDF locally/i, {
    timeout: 30_000,
  });

  // Interrupt at the first observable preflight state. WebKit can scan this
  // synthetic 120-page file quickly enough that several actionability
  // assertions before Undo let preflight finish and open confirmation first.
  // The lock contract is still read in one parallel snapshot so this remains
  // proof that request controls freeze while history stays interactive.
  const scope = page.getByRole("combobox", { name: "Search scope" });
  const findButton = page.getByRole("button", { name: "Find", exact: true });
  const undo = page.getByRole("button", { name: "Undo" });
  const [findLocked, replaceLocked, scopeLocked, findButtonLocked, undoEnabled] =
    await Promise.all([
      find.isDisabled(),
      replace.isDisabled(),
      scope.isDisabled(),
      findButton.isDisabled(),
      undo.isEnabled(),
    ]);
  expect({ findLocked, replaceLocked, scopeLocked, findButtonLocked, undoEnabled }).toEqual({
    findLocked: true,
    replaceLocked: true,
    scopeLocked: true,
    findButtonLocked: true,
    undoEnabled: true,
  });

  // Change the authoritative PDF revision while the 120-page preflight is
  // still scanning. Replace All must discard its old clone rather than
  // publishing stale bytes over this Undo result.
  await undo.click({ force: true });

  await expect(status).toContainText(/PDF changed while Replace All was checking matches/i, {
    timeout: 90_000,
  });
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Large document page 1"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Large dossier sheet 1"]',
    ),
  ).toHaveCount(0);
});

test("vinext Edit PDF cancels document Replace All without publishing partial changes", async ({
  page,
}) => {
  await uploadEditFixture(page, LARGE_DOCUMENT_PDF);
  await waitForStageReady(page);

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("page");
  const replace = page.getByRole("textbox", {
    name: "Replace search match with",
  });
  await replace.fill("sheet");

  const replaceAll = page.getByRole("button", { name: "Replace all safely" });
  await expect(replaceAll).toBeEnabled({ timeout: 90_000 });
  await replaceAll.click();

  const status = page.locator("[data-edit-replace-all-status]");
  await expect(status).toContainText(/Checking every match against the native PDF locally/i, {
    timeout: 30_000,
  });
  const cancel = page.getByRole("button", { name: "Cancel Replace All" });
  // Cancel is intentionally present only while preflight is active. Skip
  // Playwright's stability wait so a fast WebKit preflight cannot detach the
  // button between a visibility assertion and the click.
  await cancel.click({ force: true });

  await expect(status).toContainText(/Replace All cancelled\. Nothing was changed/i, {
    timeout: 90_000,
  });
  await expect(cancel).toHaveCount(0);
  await expect(replaceAll).toBeEnabled({ timeout: 30_000 });

  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Large document page 1"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Large document sheet 1"]',
    ),
  ).toHaveCount(0);
});

test("vinext Edit PDF shares one linear semantic undo history across native Edit and Redaction", async ({
  page,
}) => {
  await uploadEditFixture(page, TEXT_ONLY_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  const employeeRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    )
    .first();
  await employeeRun.click();
  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await editor.fill("Employee file");
  await page.getByRole("button", { name: "Apply edit" }).click();
  await waitForStageReady(page);

  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1");
  let texts = await detectedRunTexts(page);
  expect(texts.some((text) => text.includes("Employee file"))).toBe(true);
  expect(texts.some((text) => text.includes("123-45-6789"))).toBe(true);

  await enterRedactMode(page);
  await dragBoxOverRun(page, "123-45-6789");
  await applyRedactionThroughModal(page);

  // Redaction is one undo snapshot containing two semantic facts: the
  // redaction page operation and the inserted black mask. The earlier text
  // edit remains before both in the SAME journal.
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "3");
  texts = await detectedRunTexts(page);
  expect(texts.some((text) => text.includes("Employee file"))).toBe(true);
  expect(texts.some((text) => text.includes("123-45-6789"))).toBe(false);
  expect(await blackMaskCount(page)).toBeGreaterThan(0);

  // Undo redaction only: the prior native edit remains.
  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1");
  await expect
    .poll(
      async () => ({
        employeeEdited: (await detectedRunTexts(page)).some((text) =>
          text.includes("Employee file"),
        ),
        ssnRestored: (await detectedRunTexts(page)).some((text) =>
          text.includes("123-45-6789"),
        ),
        masks: await blackMaskCount(page),
      }),
      {
        timeout: 90_000,
        message: "first undo should reverse only Redaction and preserve the Edit",
      },
    )
    .toEqual({ employeeEdited: true, ssnRestored: true, masks: 0 });

  // Undo again: now the earlier Edit is reversed.
  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");
  texts = await detectedRunTexts(page);
  expect(texts.some((text) => text.includes("Employee record"))).toBe(true);
  expect(texts.some((text) => text.includes("Employee file"))).toBe(false);
  expect(texts.some((text) => text.includes("123-45-6789"))).toBe(true);

  // Redo in the same order: Edit first, then Redaction.
  await page.getByRole("button", { name: "Redo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1");
  texts = await detectedRunTexts(page);
  expect(texts.some((text) => text.includes("Employee file"))).toBe(true);
  expect(texts.some((text) => text.includes("123-45-6789"))).toBe(true);
  expect(await blackMaskCount(page)).toBe(0);

  await page.getByRole("button", { name: "Redo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "3");
  await expect
    .poll(
      async () => ({
        employeeEdited: (await detectedRunTexts(page)).some((text) =>
          text.includes("Employee file"),
        ),
        ssnRemoved: !(await detectedRunTexts(page)).some((text) =>
          text.includes("123-45-6789"),
        ),
        hasMask: (await blackMaskCount(page)) > 0,
      }),
      {
        timeout: 90_000,
        message: "second redo should reapply Redaction after the Edit",
      },
    )
    .toEqual({ employeeEdited: true, ssnRemoved: true, hasMask: true });
});

test("vinext Edit PDF keeps IME composition isolated until the candidate is committed", async ({
  page,
}) => {
  await uploadEditFixture(page, TEXT_ONLY_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  const employeeRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    )
    .first();
  await employeeRun.click();

  const editor = page.getByRole("textbox", { name: "Edit text" });
  const apply = page.getByRole("button", { name: "Apply edit" });
  await expect(editor).toBeVisible();

  // Synthetic composition events are enough to exercise Lumeo's browser
  // event boundary in Chromium/WebKit/Firefox. The PDF writer still sees
  // nothing until compositionend releases the candidate.
  // Fire compositionstart and keyboard actions in the SAME browser task.
  // React has not had a render turn to expose textCompositionActive yet, so
  // this specifically proves the immediate selection-scoped owner ref guards
  // the tiny pre-render race for both Enter and Escape.
  await editor.evaluate((node) => {
    node.dispatchEvent(
      new CompositionEvent("compositionstart", {
        bubbles: true,
        data: "file",
      }),
    );
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      }),
    );
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );
  });
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-ime-composing", "true");

  // Playwright fill() may implicitly terminate composition in Firefox, so
  // drive the browser's real provisional input boundary directly. Calling
  // the native value setter bypasses React's value tracker, allowing the
  // bubbling InputEvent to exercise onChange while isComposing remains true.
  await editor.evaluate((node) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) throw new Error("HTMLInputElement value setter is unavailable");
    setter.call(input, "Employee file");
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "Employee file",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });

  await expect(editor).toHaveValue("Employee file");
  await expect(editor).toHaveAttribute("data-ime-composing", "true");
  await expect(apply).toBeDisabled();
  await editor.press("Enter");
  await editor.press("Escape");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");
  await expect(editor).toBeVisible();

  await editor.dispatchEvent("compositionend", { data: "file" });
  await expect(editor).toHaveAttribute("data-ime-composing", "false");
  await expect(apply).toBeEnabled();

  await editor.press("Enter");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee file"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
});

test("vinext Edit PDF clears an abandoned IME owner when native selection changes", async ({
  page,
}) => {
  await uploadEditFixture(page, TEXT_ONLY_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  const employeeRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    )
    .first();
  const ssnRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="123-45-6789"]',
    )
    .first();

  await employeeRun.click();
  let editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await editor.dispatchEvent("compositionstart", { data: "draft" });
  await expect(editor).toHaveAttribute("data-ime-composing", "true");

  // Deliberately abandon this synthetic composition without dispatching
  // compositionend. A browser can effectively do the same when the input is
  // unmounted because selection/tool state changed. The immediate guard must
  // be selection-scoped rather than surviving forever under the old run key.
  await ssnRun.click();
  editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-ime-composing", "false");

  await employeeRun.click();
  editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await editor.fill("Employee file");
  await page.getByRole("button", { name: "Apply edit" }).click();

  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee file"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
});

test("vinext Edit PDF embeds a selected local font for added text", async ({
  page,
}) => {
  await uploadEditFixture(page, TEXT_ONLY_PDF);
  await waitForStageReady(page);

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const stage = page.getByAltText("Page 1 preview").locator("..");
  await stage.click({ position: { x: 180, y: 180 } });

  const placedText = page.locator('textarea[placeholder="Type here"]').last();
  await expect(placedText).toBeVisible();
  await placedText.fill("AB");

  const fontPath = await findCiTrueTypeFont();
  await page.getByLabel("Choose local font").setInputFiles(fontPath);
  await expect(placedText).toHaveAttribute(
    "data-edit-local-font-active",
    "true",
    { timeout: 30_000 },
  );
  const fontLabel = page.locator("[data-edit-local-font-label]");
  await expect(fontLabel).not.toHaveText("Loading font…");
  await expect(fontLabel).not.toHaveText("Helvetica");

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
  const exported = await PDFDocument.load(bytes);
  expect(exported.getPageCount()).toBe(1);

  const fontFile2 = PDFName.of("FontFile2");
  const fontFile3 = PDFName.of("FontFile3");
  const hasEmbeddedFontProgram = exported.context
    .enumerateIndirectObjects()
    .some(
      ([, object]) =>
        object instanceof PDFDict &&
        (object.has(fontFile2) || object.has(fontFile3)),
    );
  expect(hasEmbeddedFontProgram).toBe(true);
});

test("vinext Edit PDF embeds a local font into one native text run with Undo and reopen proof", async ({
  page,
}) => {
  await uploadEditFixture(page, TEXT_ONLY_PDF);
  await waitForStageReady(page);

  const employeeRun = page
    .locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    )
    .first();
  await expect(employeeRun).toBeVisible({ timeout: 90_000 });
  await employeeRun.click();

  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await editor.fill("iiii");

  await page.getByRole("button", { name: "Format" }).click();
  const panel = page.locator("[data-native-text-formatting]");
  await expect(panel).toBeVisible();

  const fontPath = await findCiTrueTypeFont();
  await panel.locator("[data-native-local-font-input]").setInputFiles(fontPath);
  const fontLabel = panel.locator("[data-native-local-font-label]");
  await expect(fontLabel).not.toHaveText("Inspecting local font…", {
    timeout: 30_000,
  });
  await expect(fontLabel).not.toHaveText("Use current PDF font");

  const status = panel.locator("[data-native-local-font-status]");
  await expect(status).toContainText(
    /Ready for this exact text and native PDF target/i,
    { timeout: 90_000 },
  );

  const localApply = panel.locator("[data-native-local-font-apply]");
  await expect(localApply).toBeEnabled();
  await localApply.click();
  await waitForStageReady(page);

  await expect(
    page
      .locator(
        'div[role="button"][aria-label^="Editable text: "][aria-label*="iiii"]',
      )
      .first(),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(
    page
      .locator(
        'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
      )
      .first(),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Redo" }).click();
  await waitForStageReady(page);
  await expect(
    page
      .locator(
        'div[role="button"][aria-label^="Editable text: "][aria-label*="iiii"]',
      )
      .first(),
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

  const exported = await PDFDocument.load(bytes.slice());
  const registry = new PdfFontRegistry(exported);
  const entries = collectPageTextOperators(exported, 0);
  const decoded = entries.map((entry) => {
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) return null;
    const profile = registry.resolve(entry.resources, resourceName);
    if (!profile) return null;
    const text = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    return text.allDecoded
      ? { entry, profile, text: text.text, resourceName }
      : null;
  });
  const nativeLocal = decoded.find(
    (item) => item?.text === "iiii",
  );
  expect(nativeLocal).toBeTruthy();
  expect(nativeLocal!.resourceName).toMatch(/^LumeoNativeLocal\d+$/);
  expect(nativeLocal!.profile.isEmbedded).toBe(true);
  expect(nativeLocal!.profile.resourceIdentity.fontProgramObjectRef).toBeTruthy();
  expect(nativeLocal!.profile.embeddedProgramSha256).toMatch(/^[a-f0-9]{64}$/i);

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({
    timeout: 30_000,
  });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "native-local-font-output.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
  await waitForStageReady(page);
  await expect(
    page
      .locator(
        'div[role="button"][aria-label^="Editable text: "][aria-label*="iiii"]',
      )
      .first(),
  ).toBeVisible({ timeout: 90_000 });
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
    const panel = page.locator("[data-native-text-formatting]");
    // Format is an intentional toggle. After Apply/Undo/Redo WebKit can keep
    // the panel mounted for the same selected native span; blindly clicking
    // the toggle here would close an already-open panel and turn a valid
    // product state into a false test failure. Open only when needed.
    if (!(await panel.isVisible())) {
      await formatButton.click();
    }
    await expect(panel).toBeVisible({ timeout: 90_000 });
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
  const previewFidelity = initial.panel.locator("[data-font-preview-fidelity]");
  await expect(previewFidelity).toHaveAttribute(
    "data-font-preview-fidelity",
    "fallback",
  );
  await expect(previewFidelity).toContainText("Preview: Fallback font");
  await expect(
    initial.panel.locator("[data-font-preview-fidelity-detail]"),
  ).toContainText(/edit safety is evaluated separately/i);
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

test("vinext Edit PDF edits preserved native paragraph lines as one atomic history transaction", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const originalBytes = await readFile(PARAGRAPH_PDF);
  const originalDoc = await PDFDocument.load(originalBytes);
  const originalOperators = collectPageTextOperators(originalDoc, 0);
  expect(originalOperators).toHaveLength(2);
  const originalLineMatrices = originalOperators.map(
    (entry) => entry.operator.textLineMatrix,
  );

  await uploadEditFixture(page, PARAGRAPH_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  const editableRuns = page.locator('div[role="button"][aria-label^="Editable text: "]');
  await expect(editableRuns).toHaveCount(2, { timeout: 90_000 });
  const labels = await editableRuns.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  const firstIndex = labels.findIndex((label) => label.includes("Paragraph alpha"));
  const secondIndex = labels.findIndex((label) => label.includes("Paragraph beta"));
  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThanOrEqual(0);

  await editableRuns.nth(firstIndex).click();
  await editableRuns.nth(secondIndex).click({ modifiers: ["Shift"] });

  const panel = page.locator("[data-edit-multi-run-panel]");
  await expect(panel).toBeVisible();
  const editor = panel.locator("[data-edit-paragraph-input='true']");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("Paragraph alpha\nParagraph beta");

  const apply = panel.locator("[data-edit-multi-run-apply]");
  await expect(apply).toBeDisabled();
  await editor.fill("Alpha revised\nBeta revised");
  await expect(apply).toBeEnabled();
  await apply.click();

  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1", {
    timeout: 90_000,
  });
  await waitForStageReady(page);

  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");
  await expect(
    page.locator('div[role="button"][aria-label*="Paragraph alpha"]').first(),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Redo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1", {
    timeout: 90_000,
  });
  await expect(
    page.locator('div[role="button"][aria-label*="Alpha revised"]').first(),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.locator('div[role="button"][aria-label*="Beta revised"]').first(),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadButton = page.getByRole("button", { name: "Download edited PDF" });
  await expect(downloadButton).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();
  const exportedBytes = await readFile(outputPath!);

  const exportedDoc = await PDFDocument.load(exportedBytes);
  const exportedOperators = collectPageTextOperators(exportedDoc, 0);
  expect(exportedOperators).toHaveLength(2);
  expect(exportedOperators.map((entry) => entry.operator.textLineMatrix)).toEqual(
    originalLineMatrices,
  );

  const registry = new PdfFontRegistry(exportedDoc);
  const decoded = exportedOperators.map((entry) => {
    const resourceName = entry.operator.fontResourceName;
    expect(resourceName).toBeTruthy();
    const profile = registry.resolve(entry.resources, resourceName!);
    expect(profile).not.toBeNull();
    const text = decodeTextShowOperator(entry.operator, profile!.resolvedFont);
    expect(text.allDecoded).toBe(true);
    return text.text;
  });
  expect(decoded).toEqual(["Alpha revised", "Beta revised"]);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("vinext Edit PDF applies a proven LTR shaped-glyph replacement as one native history transaction", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await uploadEditFixture(page, SHAPED_LTR_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  const source = page
    .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="AB"]')
    .first();
  await expect(source).toBeVisible({ timeout: 90_000 });
  await source.click();

  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toHaveValue("AB");
  const replacement = "e\u0301";
  await editor.fill(replacement);

  const apply = page.locator("[data-edit-inline-apply]");
  await expect(apply).toHaveCount(1);
  await expect(apply).toBeEnabled({ timeout: 90_000 });
  await apply.click();

  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1", {
    timeout: 90_000,
  });
  await waitForStageReady(page);

  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");
  await expect(
    page.locator('div[role="button"][aria-label^="Editable text: "][aria-label*="AB"]').first(),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Redo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1", {
    timeout: 90_000,
  });

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadButton = page.getByRole("button", { name: "Download edited PDF" });
  await expect(downloadButton).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();
  const bytes = await readFile(outputPath!);

  const exported = await PDFDocument.load(bytes);
  const operators = collectPageTextOperators(exported, 0);
  expect(operators).toHaveLength(1);
  expect(operators[0]?.operator.kind).toBe("TJ");
  const registry = new PdfFontRegistry(exported);
  const resourceName = operators[0]?.operator.fontResourceName;
  expect(resourceName).toBeTruthy();
  const profile = registry.resolve(operators[0]!.resources, resourceName!);
  expect(profile).not.toBeNull();
  const decoded = decodeTextShowOperator(
    operators[0]!.operator,
    profile!.resolvedFont,
  );
  expect(decoded.allDecoded).toBe(true);
  expect(decoded.text).toBe(replacement);

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
    // Replace only the SSN characters, leaving the "SSN " prefix untouched.
    // In browsers that coalesce the operators this is a single-span
    // character edit; in the split-run path below the same character range
    // crosses the native Tj boundary while the validated writer still owns
    // the complete proven operator set.
    await replaceCharacterRange(page, editor, 4, 15, "000-00-0000");
    await expect(editor).toHaveValue("SSN 000-00-0000");

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
    // This selected character range begins in the first native span and ends
    // in the second. The UX is character-level, but write authority remains
    // the existing whole-span validated multi-run plan.
    await replaceCharacterRange(page, editor, 4, 15, "000-00-0000");
    await expect(editor).toHaveValue("SSN 000-00-0000");

    const apply = page.locator("[data-edit-multi-run-apply]");
    await expect(apply).toHaveCount(1);
    await expect(apply).toBeEnabled();
    await editor.press("Enter");
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


test("vinext Edit PDF replaces all safe document matches in one undo step", async ({ page }) => {
  await uploadEditFixture(page, TWO_PAGE_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("record");
  const count = page.locator("[data-edit-search-match-count]");
  await expect(count).toHaveAttribute("data-edit-search-match-count", "2", {
    timeout: 90_000,
  });

  const replacement = page.getByRole("textbox", {
    name: "Replace search match with",
  });
  await replacement.fill("file");

  const replaceAll = page.getByRole("button", { name: "Replace all safely" });
  await expect(replaceAll).toBeEnabled({ timeout: 90_000 });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toMatch(/Replace 2 safely editable matches/i);
    expect(dialog.message()).toMatch(/one Undo step/i);
    await dialog.accept();
  });
  await replaceAll.click();

  const status = page.locator("[data-edit-replace-all-status]");
  await expect(status).toContainText(/Replaced 2 matches in one native PDF transaction/i, {
    timeout: 90_000,
  });
  // One history snapshot can carry two semantic native-text operations.
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "2", {
    timeout: 90_000,
  });

  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee file"]',
    ),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Open page 2" }).click();
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Second page file"]',
    ),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0", {
    timeout: 90_000,
  });
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Second page record"]',
    ),
  ).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Open page 1" }).click();
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
});

test("vinext Edit PDF replaces only the current page when Replace All scope is This page", async ({ page }) => {
  await uploadEditFixture(page, TWO_PAGE_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("record");

  const scope = page.getByRole("combobox", { name: "Search scope" });
  await scope.selectOption("page");
  await expect(scope).toHaveValue("page");

  const replacement = page.getByRole("textbox", {
    name: "Replace search match with",
  });
  await replacement.fill("file");

  const replaceAllOnPage = page.getByRole("button", {
    name: "Replace all on page",
  });
  await expect(replaceAllOnPage).toBeEnabled({ timeout: 90_000 });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toMatch(/Replace 1 safely editable match in page 1/i);
    expect(dialog.message()).toMatch(/one Undo step/i);
    await dialog.accept();
  });
  await replaceAllOnPage.click();

  const status = page.locator("[data-edit-replace-all-status]");
  await expect(status).toContainText(/Replaced 1 match in one native PDF transaction/i, {
    timeout: 90_000,
  });
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "1", {
    timeout: 90_000,
  });

  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee file"]',
    ),
  ).toBeVisible({ timeout: 90_000 });

  // Page-scoped replacement must not accidentally mutate later pages through
  // the document-wide best-effort search index.
  await page.getByRole("button", { name: "Open page 2" }).click();
  await waitForStageReady(page);
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Second page record"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Second page file"]',
    ),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Open page 1" }).click();
  await waitForStageReady(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await waitForStageReady(page);
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0", {
    timeout: 90_000,
  });
  await expect(
    page.locator(
      'div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]',
    ),
  ).toBeVisible({ timeout: 90_000 });
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

test("vinext Replace All does not depend on the best-effort Find index", async ({ page }) => {
  await uploadEditFixture(page, TWO_PAGE_PDF);
  await waitForStageReady(page);

  const workspace = page.locator("[data-edit-semantic-history-count]");
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");

  await page.getByRole("button", { name: "Find" }).click();
  const find = page.getByRole("searchbox", { name: "Find text in PDF" });
  await find.fill("definitely-not-present-in-this-pdf");

  // The navigation index truthfully has no matches, but exhaustive Replace
  // All must still be available because it independently re-analyzes every
  // requested page before deciding that there is nothing to change.
  const count = page.locator("[data-edit-search-match-count]");
  await expect(count).toHaveAttribute("data-edit-search-match-count", "0", {
    timeout: 90_000,
  });

  const replaceAll = page.getByRole("button", { name: "Replace all safely" });
  await expect(replaceAll).toBeEnabled();

  await replaceAll.click();

  const status = page.locator("[data-edit-replace-all-status]");
  await expect(status).toContainText(
    /No current matches for .*definitely-not-present-in-this-pdf.* were found in the document\. Nothing was changed\./i,
    { timeout: 90_000 },
  );
  await expect(workspace).toHaveAttribute("data-edit-semantic-history-count", "0");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

