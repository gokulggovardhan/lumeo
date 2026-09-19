import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("mobile batch converts a JPEG still, isolates corrupt HEIC, and downloads", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/heic-to-jpeg");
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 20;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#cc2244"; ctx.fillRect(0,0,40,20);
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  const uploads: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST") uploads.push(request.url()); });
  await page.locator('input[type="file"]').setInputFiles([
    { name: "CURRENT.JPG", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") },
    { name: "CURRENT.MOV", mimeType: "video/quicktime", buffer: Buffer.from("synthetic companion") },
    { name: "BROKEN.HEIC", mimeType: "image/heic", buffer: Buffer.from("corrupt input") },
  ]);
  await expect(page.getByRole("heading", { name: "2 photos detected" })).toBeVisible();
  await expect(page.getByText("Your photos are processed in your browser.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Convert to JPEG" }).click();
  await expect(page.getByText("1 converted, 1 failed.", { exact: false })).toBeVisible({ timeout: 120_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JPEG", exact: true }).first().click();
  const result = await download;
  expect(result.suggestedFilename()).toBe("CURRENT.jpg");
  const bytes = await readFile((await result.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([255,216,255]);
  const allowed = new Set(["record_public_analytics_event", "get_public_analytics_setting", "get_public_announcements"]);
  expect(uploads.filter((url) => !allowed.has(new URL(url).pathname.split("/").pop()!))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Start new" }).click();
  await expect(page.getByText("Choose photos", { exact: true })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Choose photos", { exact: true }).click();
  expect((await chooser).isMultiple()).toBe(true);
  await page.screenshot({ path: "test-results/heic-mobile-empty.png", fullPage: true });
});

for (const width of [320, 360, 390, 393, 414, 430]) {
  test(`workspace has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/heic-to-jpeg");
    await expect(page.getByText("Choose photos", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("desktop drop imports a photo batch and ZIP preserves unique JPEG names", async ({ page }) => {
  await page.goto("/heic-to-jpeg");
  await page.locator(".l2-upload-stage").evaluate(async (element) => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0,0,32,16);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "PHOTO.jpg", { type: "image/jpeg" }));
    transfer.items.add(new File([blob], "PHOTO.jpeg", { type: "image/jpeg" }));
    element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.getByRole("button", { name: "Convert to JPEG" }).click();
  await expect(page.getByRole("button", { name: "Download all (2)" })).toBeVisible();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all (2)" }).click();
  const download = await promise;
  expect(download.suggestedFilename()).toBe("lumeo-heic-to-jpeg.zip");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(Object.keys(zip.files).sort()).toEqual(["PHOTO (2).jpg", "PHOTO.jpg"]);
  await page.screenshot({ path: "test-results/heic-desktop-results.png", fullPage: true });
});


test("native picker accepts uppercase JPEG and renders the selected asset", async ({ page }) => {
  await page.goto("/heic-to-jpeg");
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 24; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 24, 16);
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Choose photos", { exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "IMG_1864.JPG", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") });
  await expect(page.getByRole("heading", { name: "1 photo detected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "IMG_1864.JPG" })).toBeVisible();

  await page.getByRole("button", { name: "Start new" }).click();
  const secondChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Choose photos", { exact: true }).click();
  const secondChooser = await secondChooserPromise;
  await secondChooser.setFiles({ name: "IMG_1864.JPG", mimeType: "", buffer: Buffer.from(jpeg, "base64") });
  await expect(page.getByRole("heading", { name: "IMG_1864.JPG" })).toBeVisible();
});


test("batch controls remove a selected file and convert-more resets cleanly", async ({ page }) => {
  await page.goto("/heic-to-jpeg");
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 20; canvas.height = 12;
    canvas.getContext("2d")!.fillRect(0, 0, 20, 12);
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  const input = page.locator('input[type="file"]');
  await input.setInputFiles([
    { name: "keep.JPG", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") },
    { name: "remove.JPG", mimeType: "", buffer: Buffer.from(jpeg, "base64") },
  ]);
  await expect(page.getByRole("heading", { name: "2 photos detected" })).toBeVisible();
  await page.getByRole("button", { name: "Remove remove.JPG" }).click();
  await expect(page.getByRole("heading", { name: "1 photo detected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "remove.JPG" })).toHaveCount(0);
  await page.getByLabel("Quality").selectOption("85");
  await page.getByRole("button", { name: "Convert to JPEG" }).click();
  await expect(page.getByRole("button", { name: "Convert more photos" })).toBeVisible();
  await page.getByRole("button", { name: "Convert more photos" }).click();
  await expect(page.getByText("Choose photos", { exact: true })).toBeVisible();
  await input.setInputFiles({ name: "keep.JPG", mimeType: "", buffer: Buffer.from(jpeg, "base64") });
  await expect(page.getByRole("heading", { name: "keep.JPG" })).toBeVisible();
});

test("unsupported drop is explained instead of disappearing silently", async ({ page }) => {
  await page.goto("/heic-to-jpeg");
  await page.locator(".l2-upload-stage").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["not an image"], "notes.txt", { type: "text/plain" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByText("Unsupported file. Choose HEIC, HEIF or JPEG photos.")).toBeVisible();
});
