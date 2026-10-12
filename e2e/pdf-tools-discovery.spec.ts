import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

test.describe("PDF Tools discovery", () => {

  test("homepage keeps the premium hierarchy responsive across desktop, tablet, and mobile", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 768, height: 900 },
      { width: 430, height: 820 },
      { width: 390, height: 844 },
      { width: 320, height: 760 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Your PDFs stay yours." })).toBeVisible();
      await expect(page.getByRole("link", { name: "Explore PDF tools" })).toBeVisible();

      for (const tool of [
        "Merge PDF",
        "Compress PDF",
        "Edit PDF",
        "PDF to Word",
        "Word to PDF",
        "Sign PDF",
      ]) {
        await expect(page.getByRole("link", { name: new RegExp(`^Open ${tool}`) })).toBeVisible();
      }

      await expect(page.getByRole("heading", { name: "Choose what you want to do." })).toBeVisible();
      await expect(page.getByRole("link", { name: "View all tools" })).toBeVisible();

      if (viewport.width < 640) {
        const toolsHeadingBox = await page
          .getByRole("heading", { name: "Choose what you want to do." })
          .boundingBox();
        const trustBox = await page
          .locator('[aria-label="Lumeo trust principles"]')
          .boundingBox();
        expect(toolsHeadingBox).not.toBeNull();
        expect(trustBox).not.toBeNull();
        expect(toolsHeadingBox!.y).toBeLessThan(trustBox!.y);
      }

      const launcherLinks = page.getByRole("link", { name: /^(Open .*|View all tools)$/ });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);

      const launcherBoxes = await launcherLinks.evaluateAll((links) =>
        links
          .map((link) => link.getBoundingClientRect())
          .filter((rect) => rect.top > 0 && rect.top < window.innerHeight * 2)
          .map((rect) => ({ width: rect.width, height: rect.height })),
      );
      expect(launcherBoxes.length).toBeGreaterThan(0);
      for (const box of launcherBoxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("specialist tools stay out of homepage prominence but remain discoverable", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /^Open Crop PDF/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Open HEIC to JPEG/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View all tools" })).toBeVisible();

    await page.goto("/pdf-tools");
    await expect(page.getByRole("link", { name: /Open Crop PDF/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open HEIC to JPEG/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Extract Text/ })).toBeVisible();
  });

  test("supports direct discovery, combined filters, and keyboard shortcuts", async ({ page }) => {
    await page.goto("/pdf-tools");

    await expect(page.getByRole("heading", { name: "All PDF tools in one place." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toHaveAttribute("href", "/pdf/merge");

    const search = page.getByRole("searchbox", { name: "Search tools and actions" });
    // A streamed server component may paint before its client keyboard handler hydrates.
    // Exercise the shortcut only after that real interaction listener is mounted.
    await expect(page.locator("[data-tools-shortcuts-ready]")).toHaveAttribute("data-tools-shortcuts-ready", "true");
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("rotate");
    await expect(page.getByRole("link", { name: /Open Organize PDF/ })).toBeVisible();
    await expect(page.getByText("1 tool", { exact: true })).toBeVisible();

    await search.fill("reduce size");
    await expect(page.getByRole("link", { name: /Open Compress PDF/ })).toBeVisible();

    await search.fill("write");
    await expect(page.getByRole("link", { name: /Open Edit PDF/ })).toBeVisible();

    await search.fill("signature");
    await expect(page.getByRole("link", { name: /Open Sign PDF/ })).toBeVisible();

    await search.fill("rotate");
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("No tools match that search")).toBeVisible();

    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(page.getByText(/\d+ tools?/, { exact: true })).toBeVisible();

    const commandTrigger = page.getByRole("button", { name: /Open command palette/ });
    await commandTrigger.click();
    const commandSearch = page.getByRole("combobox", { name: "Search Lumeo tools and pages" });
    await expect(commandSearch).toBeFocused();
    await commandSearch.fill("rotate");
    await expect(page.getByRole("option", { name: /Organize PDF/ })).toBeVisible();
    await commandSearch.press("Escape");
    await expect(commandTrigger).toBeFocused();
  });

  test("keeps the complete directory compact and touch-safe across responsive widths", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 768, height: 900 },
      { width: 430, height: 820 },
      { width: 390, height: 844 },
      { width: 320, height: 760 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/pdf-tools");

      await expect(page.getByRole("searchbox", { name: "Search tools and actions" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Open Merge PDF/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Pages" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Compress" })).toBeVisible();
      await expect(page.getByRole("button", { name: "OCR & Text" })).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);

      if (viewport.width <= 430) {
        const cards = page.locator('a.lumeo-tool-card[aria-label^="Open "]');
        const first = await cards.nth(0).boundingBox();
        const second = await cards.nth(1).boundingBox();
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(2);
        expect(first!.width).toBeLessThan(viewport.width * 0.55);
        expect(second!.width).toBeLessThan(viewport.width * 0.55);
      }

      const targets = page.locator(
        '#pdf-tool-search, [aria-label="Filter PDF tools by category"] button, a[aria-label^="Open "]',
      );
      const boxes = await targets.evaluateAll((nodes) =>
        nodes.slice(0, 16).map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }
  });
  test("compression preserves searchable text while reaching 200 KB for a mixed image PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/pdf/compress");

    // Deterministic image pixels, generated locally in the browser; no
    // confidential fixtures or network-bound sample files are required.
    const jpgBase64 = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d")!;
      const bitmap = ctx.createImageData(canvas.width, canvas.height);
      let seed = 39843121;
      for (let i = 0; i < bitmap.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        bitmap.data[i] = seed & 255;
        bitmap.data[i + 1] = (seed >>> 8) & 255;
        bitmap.data[i + 2] = (seed >>> 16) & 255;
        bitmap.data[i + 3] = 255;
      }
      ctx.putImageData(bitmap, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.66).split(",")[1];
    });

    const source = await PDFDocument.create();
    const jpg = await source.embedJpg(Buffer.from(jpgBase64, "base64"));
    const sheet = source.addPage([612, 792]);
    sheet.drawImage(jpg, { x: 0, y: 0, width: 612, height: 792 });
    sheet.drawText("Selectable Phase One Text", { x: 70, y: 700, size: 18 });
    const inputBytes = await source.save();
    expect(inputBytes.length).toBeGreaterThan(400_000);

    await page.locator("#compress-pdf-upload").setInputFiles({
      name: "phase1-mixed-content.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(inputBytes),
    });
    await expect(page.getByText("Document profile", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("radio", { name: "Target size" }).click();
    await page.getByRole("button", { name: "Under 200 KB" }).click();
    await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
    await expect(page.getByText("Target achieved", { exact: true })).toBeVisible({ timeout: 90_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download compressed PDF" }).click();
    const downloaded = await downloadPromise;
    const output = await readFile((await downloaded.path())!);
    expect(output.length).toBeLessThan(inputBytes.length);
    expect(output.length).toBeLessThanOrEqual(200 * 1024);

    const parsed = await PDFDocument.load(output);
    expect(parsed.getPageCount()).toBe(1);

    // Reopen the exact downloaded bytes with an independent parser and
    // verify text was not converted into a page-sized raster image.
    const task = pdfjs.getDocument({ data: new Uint8Array(output) });
    try {
      const doc = await task.promise;
      const pageOne = await doc.getPage(1);
      const items = await pageOne.getTextContent();
      expect(items.items.some((item) => "str" in item && item.str.includes("Selectable Phase One Text"))).toBe(true);
    } finally {
      await task.destroy();
    }
  });

  test("compression never silently rewrites interactive forms", async ({ page }) => {
    test.setTimeout(60_000);
    const original = await PDFDocument.create();
    const sheet = original.addPage([612, 792]);
    sheet.drawText("Confidential data stays local");
    const field = original.getForm().createTextField("customer.reference");
    field.addToPage(sheet, { x: 60, y: 550, width: 260, height: 35 });
    field.setText("KEEP-FORM-EDITABLE");
    const sourceBytes = Buffer.from(await original.save());

    await page.goto("/pdf/compress");
    await page.locator("#compress-pdf-upload").setInputFiles({
      name: "phase1-form-preservation.pdf",
      mimeType: "application/pdf",
      buffer: sourceBytes,
    });
    await expect(page.getByText("Document profile", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
    await expect(page.getByText("Original preserved for document safety")).toBeVisible({ timeout: 30_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download unchanged original PDF" }).click();
    const download = await downloadPromise;
    const downloaded = await readFile((await download.path())!);
    expect(downloaded.equals(sourceBytes)).toBe(true);
    const reopened = await PDFDocument.load(downloaded);
    expect(reopened.getForm().getTextField("customer.reference").getText()).toBe("KEEP-FORM-EDITABLE");
  });

});
