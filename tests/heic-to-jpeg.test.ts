import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessLivePhotoPairing, classifyColorSafety, dimensionsPreserved, groupPhotos, jpegName, jpegQuality, orientationTransform, releasePhotoUrls, runPhotoQueue, selectPrimary } from "../lib/heic-to-jpeg/pipeline.ts";
import { inspectHeifStructure } from "../lib/heic-to-jpeg/inspection/bmff.ts";
import { inspectAaeXml } from "../lib/heic-to-jpeg/inspection/aae.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);
const u32 = (value: number) => bytes(value >>> 24, value >>> 16, value >>> 8, value);
const text = (value: string) => Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  result.set(u32(size)); result.set(text(type), 4);
  let offset = 8;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

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
test("custom names, dots and duplicate AAE companions remain deterministic", () => {
  const { assets } = groupPhotos([
    { name: "Beach.trip.final.HEIC", size: 10, lastModified: 20 },
    { name: "beach.trip.final.aae", size: 8, lastModified: 30 },
    { name: "BEACH.TRIP.FINAL.AAE", size: 7, lastModified: 10 },
  ]);
  assert.equal(assets.length, 1);
  assert.deepEqual(assets[0].companions.map((file) => file.size), [7, 8]);
  assert.match(assets[0].warning ?? "", /Multiple edit companions/);
  assert.equal(assets[0].outputName, "Beach.trip.final.jpg");
});
test("primary selection excludes thumbnails and refuses ambiguity", () => {
  const primary = { is_primary: () => true };
  assert.equal(selectPrimary([{ is_primary: () => false }, primary]), primary);
  assert.throws(() => selectPrimary([{ is_primary: () => false }]));
  assert.throws(() => selectPrimary([primary, primary]));
});
test("HEIF primary property associations exclude auxiliary transforms", () => {
  const ftyp = box("ftyp", text("heic"), u32(0), text("heic"));
  const ispe = box("ispe", bytes(0, 0, 0, 0), u32(4032), u32(3024));
  const primaryRotation = box("irot", bytes(1));
  const auxiliaryRotation = box("irot", bytes(3));
  const auxiliaryType = box("auxC", bytes(0, 0, 0, 0), text("urn:com:apple:photo:2020:aux:depth"), bytes(0));
  const ipco = box("ipco", ispe, primaryRotation, auxiliaryRotation, auxiliaryType);
  const ipma = box("ipma", bytes(0, 0, 0, 0), u32(2), bytes(0, 1, 2, 1, 2), bytes(0, 2, 2, 3, 4));
  const iprp = box("iprp", ipco, ipma);
  const pitm = box("pitm", bytes(0, 0, 0, 0, 0, 1));
  const meta = box("meta", bytes(0, 0, 0, 0), pitm, iprp);
  const sample = new Uint8Array(ftyp.length + meta.length); sample.set(ftyp); sample.set(meta, ftyp.length);
  const structure = inspectHeifStructure(sample);
  assert.deepEqual(structure.dimensions, [{ width: 4032, height: 3024 }]);
  assert.deepEqual(structure.orientation, [{ rotationDegrees: 90 }]);
});
test("quality and orientation transforms preserve intended bounds", () => {
  assert.equal(jpegQuality(85), .85); assert.equal(jpegQuality(92), .92); assert.equal(jpegQuality(96), .96); assert.equal(jpegQuality(NaN), .92);
  for (let orientation = 1; orientation <= 8; orientation++) {
    const [a,b,c,d,e,f] = orientationTransform(orientation, 40, 20);
    const corners = [[0,0],[40,0],[0,20],[40,20]].map(([x,y]) => [a*x+c*y+e,b*x+d*y+f]);
    assert.equal(Math.min(...corners.map(([x]) => x)), 0);
    assert.equal(Math.min(...corners.map(([,y]) => y)), 0);
    assert.equal(Math.max(...corners.map(([x]) => x)), orientation >= 5 ? 20 : 40);
    assert.equal(Math.max(...corners.map(([,y]) => y)), orientation >= 5 ? 40 : 20);
  }
});
test("Live Photo confidence requires container and identifier or time evidence", () => {
  assert.equal(assessLivePhotoPairing({ validQuickTime: false, sourceIdentifiers: [], companionIdentifiers: [], modifiedDeltaMs: 0 }), "unknown");
  assert.equal(assessLivePhotoPairing({ validQuickTime: true, sourceIdentifiers: ["A"], companionIdentifiers: ["B"], modifiedDeltaMs: 0 }), "unknown");
  assert.equal(assessLivePhotoPairing({ validQuickTime: true, sourceIdentifiers: ["A"], companionIdentifiers: ["a"] }), "confirmed");
  assert.equal(assessLivePhotoPairing({ validQuickTime: true, sourceIdentifiers: [], companionIdentifiers: [], modifiedDeltaMs: 60_000 }), "probable");
  assert.equal(assessLivePhotoPairing({ validQuickTime: true, sourceIdentifiers: [], companionIdentifiers: [], modifiedDeltaMs: 600_000 }), "unknown");
});
test("color classification rejects HDR transfer functions conservatively", () => {
  assert.equal(classifyColorSafety([{ colorPrimaries: 1, transferCharacteristics: 1 }]), "srgb");
  assert.equal(classifyColorSafety([{ colorPrimaries: 12, transferCharacteristics: 13 }]), "display-p3");
  assert.equal(classifyColorSafety([{ colorPrimaries: 9, transferCharacteristics: 16 }]), "hdr-unsupported");
  assert.equal(classifyColorSafety([{ colorPrimaries: 9, transferCharacteristics: 18 }]), "hdr-unsupported");
  assert.equal(classifyColorSafety([]), "unknown");
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
test("large logical batches retain every asset without output collisions", () => {
  const files = Array.from({ length: 120 }, (_, index) => ({ name: `Imported photo ${index}.HEIC` }));
  const { assets, ignored } = groupPhotos(files);
  assert.equal(ignored, 0);
  assert.equal(assets.length, files.length);
  assert.equal(new Set(assets.map((asset) => asset.outputName.toLowerCase())).size, files.length);
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
  assert.equal(inspectAaeXml('<!DOCTYPE plist [<!ENTITY xxe SYSTEM "file:///private/data">]><plist><string>&xxe;</string></plist>').parseStatus, "failed");
});
test("public integration uses the canonical private analytics slug and events", () => {
  const source = readFileSync(new URL("../components/heic/HeicToJpegTool.tsx", import.meta.url), "utf8");
  for (const event of ["tool_opened", "processing_started", "processing_succeeded", "processing_failed", "download_started"]) assert.match(source, new RegExp(`eventName: ["']${event}["']`));
  assert.match(source, /toolSlug: ["']heic-to-jpeg["']/);
  assert.doesNotMatch(source, /track\([^)]*(fileName|filename|GPS|metadata)/i);
});

test("resolution invariant allows orientation swaps but rejects downscaling", () => {
  assert.equal(dimensionsPreserved(6048, 8064, 6048, 8064), true);
  assert.equal(dimensionsPreserved(6048, 8064, 8064, 6048), true);
  assert.equal(dimensionsPreserved(6048, 8064, 1152, 1536), false);
  assert.equal(dimensionsPreserved(4032, 3024, 2016, 1512), false);
});
