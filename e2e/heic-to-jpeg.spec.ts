import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG");
  let offset = 2;
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (sof.has(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    offset += length;
  }
  throw new Error("JPEG dimensions not found");
}

function be16(value: number): Buffer {
  const out = Buffer.alloc(2); out.writeUInt16BE(value); return out;
}
function be32(value: number): Buffer {
  const out = Buffer.alloc(4); out.writeUInt32BE(value); return out;
}
function bmffBox(type: string, ...parts: Buffer[]): Buffer {
  const size = 8 + parts.reduce((total, part) => total + part.length, 0);
  const out = Buffer.alloc(size);
  out.writeUInt32BE(size, 0); out.write(type, 4, 4, "ascii");
  let offset = 8;
  for (const part of parts) { part.copy(out, offset); offset += part.length; }
  return out;
}
function heicFtyp(): Buffer {
  return bmffBox("ftyp", Buffer.from("heic"), be32(0), Buffer.from("heic"));
}
function maliciousHeifFixtures(): { itemFlood: Buffer; auxCycle: Buffer; uncompressed: Buffer } {
  const fullBox = Buffer.from([0, 0, 0, 0]);
  const itemFlood = Buffer.concat([
    heicFtyp(),
    bmffBox("meta", fullBox, bmffBox("iinf", Buffer.from([1, 0, 0, 0]), be32(1001))),
  ]);

  const ref = (type: string, from: number, to: number) => bmffBox(type, be16(from), be16(1), be16(to));
  const auxCycle = Buffer.concat([
    heicFtyp(),
    bmffBox("meta", fullBox,
      bmffBox("pitm", fullBox, be16(1)),
      bmffBox("iref", fullBox, ref("auxl", 1, 2), ref("auxl", 2, 1))),
  ]);

  const infe = bmffBox("infe", Buffer.from([2, 0, 0, 0]), be16(1), be16(0), Buffer.from("unci"), Buffer.from([0]));
  const uncompressed = Buffer.concat([
    heicFtyp(),
    bmffBox("meta", fullBox,
      bmffBox("pitm", fullBox, be16(1)),
      bmffBox("iinf", fullBox, be16(1), infe)),
  ]);

  return { itemFlood, auxCycle, uncompressed };
}

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


test("full-resolution HEIC exports the primary image instead of its embedded 1152x1536 thumbnail", async ({ page }, testInfo) => {
  const fixture = process.env.HEIC_RESOLUTION_FIXTURE;
  test.skip(!fixture, "HEIC resolution fixture is generated by the release workflow");

  const qualities = testInfo.project.name === "chromium" ? ["85", "92", "96"] : ["92"];
  const outputSizes: number[] = [];

  for (const quality of qualities) {
    await page.goto("/heic-to-jpeg");
    await page.locator('input[type="file"]').setInputFiles(fixture!);
    await expect(page.getByRole("heading", { name: "1 photo detected" })).toBeVisible();
    await page.getByLabel("Quality").selectOption(quality);
    await page.getByRole("button", { name: "Convert to JPEG" }).click();

    const startedAt = Date.now();
    const asset = page.locator("[data-photo-asset]").first();
    await expect(asset).toHaveAttribute("data-primary-dimensions", "6048x8064", { timeout: 120_000 });
    await expect(asset).toHaveAttribute("data-decoded-dimensions", "6048x8064");
    await expect(asset).toHaveAttribute("data-output-dimensions", "6048x8064");
    await expect(page.getByText("6048 × 8064 source → 6048 × 8064 JPEG", { exact: false })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JPEG", exact: true }).first().click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
    expect(jpegDimensions(bytes)).toEqual({ width: 6048, height: 8064 });
    outputSizes.push(bytes.length);
    console.info(`[heic-resolution] ${testInfo.project.name} q${quality}: primary=6048x8064 decoded=6048x8064 jpeg=6048x8064 bytes=${bytes.length} elapsedMs=${Date.now() - startedAt}`);
  }

  if (testInfo.project.name === "chromium") {
    expect(outputSizes).toHaveLength(3);
    expect(outputSizes[0]).toBeLessThan(outputSizes[2]);
  }
});


test("full-resolution batch isolates corruption and ZIP keeps full JPEG dimensions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "large-batch memory proof runs once in Chromium");
  const fixture = process.env.HEIC_RESOLUTION_FIXTURE;
  test.skip(!fixture, "HEIC resolution fixture is generated by the release workflow");

  const heic = await readFile(fixture!);
  await page.goto("/heic-to-jpeg");
  await page.locator('input[type="file"]').setInputFiles([
    { name: "FULL_A.HEIC", mimeType: "image/heic", buffer: heic },
    { name: "BROKEN.HEIC", mimeType: "image/heic", buffer: Buffer.from("corrupt input") },
    { name: "FULL_B.HEIC", mimeType: "image/heic", buffer: heic },
  ]);
  await page.getByLabel("Quality").selectOption("92");
  await page.getByRole("button", { name: "Convert to JPEG" }).click();
  await expect(page.getByText("2 converted, 1 failed.", { exact: false })).toBeVisible({ timeout: 120_000 });

  const successful = page.locator('[data-photo-asset][data-status="done"]');
  await expect(successful).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await expect(successful.nth(index)).toHaveAttribute("data-primary-dimensions", "6048x8064");
    await expect(successful.nth(index)).toHaveAttribute("data-decoded-dimensions", "6048x8064");
    await expect(successful.nth(index)).toHaveAttribute("data-output-dimensions", "6048x8064");
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all (2)" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile(path!));
  expect(Object.keys(zip.files).sort()).toEqual(["FULL_A.jpg", "FULL_B.jpg"]);
  for (const name of ["FULL_A.jpg", "FULL_B.jpg"]) {
    const bytes = await zip.file(name)!.async("nodebuffer");
    expect(jpegDimensions(bytes)).toEqual({ width: 6048, height: 8064 });
  }
});


test("malicious HEIF structures fail per-file before poisoning the next valid conversion", async ({ page }) => {
  const fixture = process.env.HEIC_RESOLUTION_FIXTURE;
  test.skip(!fixture, "HEIC resolution fixture is generated by the release workflow");
  const valid = await readFile(fixture!);
  const { itemFlood, auxCycle, uncompressed } = maliciousHeifFixtures();

  await page.goto("/heic-to-jpeg");
  await page.locator('input[type="file"]').setInputFiles([
    { name: "ITEM-FLOOD.HEIC", mimeType: "image/heic", buffer: itemFlood },
    { name: "AUX-CYCLE.HEIC", mimeType: "image/heic", buffer: auxCycle },
    { name: "UNCOMPRESSED.HEIF", mimeType: "image/heif", buffer: uncompressed },
    { name: "VALID-AFTER-MALICIOUS.HEIC", mimeType: "image/heic", buffer: valid },
  ]);
  await page.getByRole("button", { name: "Convert to JPEG" }).click();
  await expect(page.getByText("1 converted, 3 failed.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-photo-asset][data-status="failed"]')).toHaveCount(3);

  const successful = page.locator('[data-photo-asset][data-status="done"]');
  await expect(successful).toHaveCount(1);
  await expect(successful).toHaveAttribute("data-primary-dimensions", "6048x8064");
  await expect(successful).toHaveAttribute("data-decoded-dimensions", "6048x8064");
  await expect(successful).toHaveAttribute("data-output-dimensions", "6048x8064");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JPEG", exact: true }).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(jpegDimensions(await readFile(path!))).toEqual({ width: 6048, height: 8064 });
});
