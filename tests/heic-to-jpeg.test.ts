import test from "node:test";
import assert from "node:assert/strict";
import { groupPhotos, jpegName, jpegQuality, orientationTransform, releasePhotoUrls, runPhotoQueue, selectPrimary } from "../lib/heic-to-jpeg/pipeline.ts";
import { inspectHeifStructure } from "../lib/heic-to-jpeg/inspection/bmff.ts";
import { inspectAaeXml } from "../lib/heic-to-jpeg/inspection/aae.ts";

test("Apple export combinations retain stills, companions, orphans and unsupported items", () => {
  for (const names of [["A.HEIC"], ["A.heif", "a.MOV"], ["A.HEIC", "A.AAE"], ["A.HEIC", "A.AAE", "A.MOV"], ["A.JPG", "A.MOV"]]) {
    const { assets } = groupPhotos(names.map((name) => ({ name })));
    assert.equal(assets.length, 1); assert.equal(assets[0].source?.name, names[0]); assert.equal(assets[0].companions.length, names.length - 1);
  }
  const { assets, ignored } = groupPhotos(["orphan.MOV", "other.AAE", "raw.DNG", "bad.txt", "._photo.HEIC", "__MACOSX/file.heic"].map((name) => ({ name })));
  assert.equal(assets.length, 4); assert.equal(ignored, 2); assert.ok(assets.every((asset) => !asset.source && asset.warning));
});
test("duplicates are distinct, ambiguous companions unpaired, output names collision safe", () => {
  const { assets } = groupPhotos(["IMG_1.HEIC", "IMG_1 2.HEIC", "IMG_1.JPG", "IMG_1.AAE"].map((name) => ({ name })));
  assert.equal(assets.filter((asset) => asset.source).length, 3);
  assert.equal(new Set(assets.filter((asset) => asset.source).map((asset) => asset.outputName)).size, 3);
  assert.ok(assets.find((asset) => asset.name === "IMG_1.AAE")?.warning);
  assert.equal(jpegName("IMG_1 2.HEIC"), "IMG_1 2.jpg");
  assert.equal(jpegName("../photo.heif"), "photo.jpg");
});
test("primary selection excludes thumbnails and refuses ambiguity", () => {
  const primary = { is_primary: () => true };
  assert.equal(selectPrimary([{ is_primary: () => false }, primary]), primary);
  assert.throws(() => selectPrimary([{ is_primary: () => false }]));
  assert.throws(() => selectPrimary([primary, primary]));
});
test("quality and orientation transforms preserve intended bounds", () => {
  assert.equal(jpegQuality(92), .92); assert.equal(jpegQuality(96), .96); assert.equal(jpegQuality(NaN), .92);
  for (let orientation = 1; orientation <= 8; orientation++) {
    const [a,b,c,d,e,f] = orientationTransform(orientation, 40, 20);
    const corners = [[0,0],[40,0],[0,20],[40,20]].map(([x,y]) => [a*x+c*y+e,b*x+d*y+f]);
    assert.equal(Math.min(...corners.map(([x]) => x)), 0);
    assert.equal(Math.min(...corners.map(([,y]) => y)), 0);
    assert.equal(Math.max(...corners.map(([x]) => x)), orientation >= 5 ? 20 : 40);
    assert.equal(Math.max(...corners.map(([,y]) => y)), orientation >= 5 ? 40 : 20);
  }
});
test("queue bounds concurrency and isolates failed jobs", async () => {
  let active = 0, maximum = 0;
  const completed: number[] = [], failed: number[] = [];
  await runPhotoQueue([1,2,3,4,5], 20, async (item) => {
    active++; maximum = Math.max(active, maximum);
    await new Promise((resolve) => setTimeout(resolve, 2)); active--;
    if (item === 2) throw new Error("controlled failure"); completed.push(item);
  }, (item) => failed.push(item));
  assert.equal(maximum, 2); assert.deepEqual(failed, [2]); assert.equal(completed.length, 4);
});
test("abort stops queued work and URL cleanup revokes every output", async () => {
  const controller = new AbortController(); const seen: number[] = [];
  await runPhotoQueue([1,2,3], 1, async (item) => { seen.push(item); controller.abort(); }, () => {}, controller.signal);
  assert.deepEqual(seen, [1]);
  const revoked: string[] = []; releasePhotoUrls(["blob:a", "blob:b"], (url) => revoked.push(url)); assert.deepEqual(revoked, ["blob:a", "blob:b"]);
});
test("corrupt HEIF and malformed AAE do not invent edit or HDR evidence", () => {
  assert.equal(inspectHeifStructure(new Uint8Array([1,2,3])).inspectionStatus, "failed");
  assert.equal(inspectAaeXml("<plist><dict>").parseStatus, "malformed");
  assert.equal(inspectAaeXml('<plist><dict><key>adjustmentFormatIdentifier</key><string>apple</string></dict></plist>').classification, "unknown");
});
