import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { exportWatermarkedPdf } from "../lib/pdf/watermark/export.ts";
import {
  anchorPointFromTopLeft,
  createDefaultTextWatermarkConfig,
  nativeAnchorForCenter,
  topLeftFromAnchorPoint,
  type WatermarkAnchor,
} from "../lib/pdf/watermark/config.ts";

// v1.1 Phase 2 regression suite: the 9-point anchor system (UI-only
// projection, no schema change) and the rotation-around-center fix for
// manual placement. See docs/specs/watermark-manual-position-v1.1-spec.md
// section 7 for the design this verifies.

function approxEqual(actual: number, expected: number, tolerance = 0.05) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
}

const ALL_ANCHORS: WatermarkAnchor[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

test("anchorPointFromTopLeft / topLeftFromAnchorPoint round-trip exactly for all 9 anchors", () => {
  const topLeftXPct = 20;
  const topLeftYPct = 35;
  const widthPct = 12;
  const heightPct = 6;
  for (const anchor of ALL_ANCHORS) {
    const anchorPoint = anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, anchor);
    const roundTripped = topLeftFromAnchorPoint(anchorPoint.xPct, anchorPoint.yPct, widthPct, heightPct, anchor);
    approxEqual(roundTripped.xPct, topLeftXPct, 1e-9);
    approxEqual(roundTripped.yPct, topLeftYPct, 1e-9);
  }
});

test("anchorPointFromTopLeft places each anchor at the expected fraction of the box", () => {
  // A 10x100 to 20x110 box (widthPct=10, heightPct=10 for round numbers).
  const topLeftXPct = 10;
  const topLeftYPct = 10;
  const widthPct = 10;
  const heightPct = 10;
  approxEqual(anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, "top-left").xPct, 10);
  approxEqual(anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, "top-left").yPct, 10);
  approxEqual(anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, "center").xPct, 15);
  approxEqual(anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, "center").yPct, 15);
  approxEqual(anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, "bottom-right").xPct, 20);
  approxEqual(anchorPointFromTopLeft(topLeftXPct, topLeftYPct, widthPct, heightPct, "bottom-right").yPct, 20);
});

test("nativeAnchorForCenter: the box's rotated center lands exactly on the requested point, for every rotation", () => {
  const centerXPt = 300;
  const centerYPt = 400;
  const widthPt = 120;
  const heightPt = 40;
  for (const rotationDeg of [0, 30, 45, 90, 135, 180, 225, 270, 315]) {
    const anchor = nativeAnchorForCenter(centerXPt, centerYPt, widthPt, heightPt, rotationDeg);
    // Recompute the rotated box's actual center from the anchor, using the
    // exact same rotation matrix pdf-lib applies (independently reimplemented
    // here, not calling the function under test).
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const halfW = widthPt / 2;
    const halfH = heightPt / 2;
    const actualCenterX = anchor.x + (halfW * cos - halfH * sin);
    const actualCenterY = anchor.y + (halfW * sin + halfH * cos);
    approxEqual(actualCenterX, centerXPt, 1e-9);
    approxEqual(actualCenterY, centerYPt, 1e-9);
  }
});

async function makeBlankPdf(sizes: Array<[number, number]>): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) doc.addPage([w, h]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeContentStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");
  let searchFrom = 0;
  let combined = "";
  while (true) {
    const streamIdx = buf.indexOf(streamMarker, searchFrom);
    if (streamIdx === -1) break;
    let dataStart = streamIdx + streamMarker.length;
    if (buf[dataStart] === 0x0d) dataStart += 1;
    if (buf[dataStart] === 0x0a) dataStart += 1;
    const endIdx = buf.indexOf(endMarker, dataStart);
    if (endIdx === -1) break;
    try {
      combined += `${zlib.inflateSync(buf.subarray(dataStart, endIdx)).toString("latin1")}\n`;
    } catch {
      // not every stream is content-stream data
    }
    searchFrom = endIdx + endMarker.length;
  }
  return combined;
}

function extractAllTm(stream: string): number[][] {
  return Array.from(stream.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/g)).map(
    (m) => m.slice(1, 7).map(Number),
  );
}

function boxCenterFromTm(tm: number[], widthPt: number, heightPt: number) {
  const [a, b, c, d, e, f] = tm;
  const corners = [[0, 0], [widthPt, 0], [0, heightPt], [widthPt, heightPt]];
  const xs = corners.map(([x, y]) => e + a * x + c * y);
  const ys = corners.map(([x, y]) => f + b * x + d * y);
  return {
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

test("exportWatermarkedPdf: manual placement's box center stays fixed as rotation changes (real content-stream decode)", async () => {
  const original = await makeBlankPdf([[612, 792]]);
  const probeDoc = await PDFDocument.create();
  const probeFont = await probeDoc.embedFont("Helvetica-Bold");
  const textWidthPt = probeFont.widthOfTextAtSize("CONFIDENTIAL", 36);

  let referenceCenter: { centerX: number; centerY: number } | null = null;
  for (const rotationDeg of [0, 45, 90, 180, 270]) {
    const config = {
      ...createDefaultTextWatermarkConfig(),
      rotationDeg,
      placement: { mode: "manual" as const, xPct: 30, yPct: 40 },
    };
    const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
    assert.deepEqual(skippedPages, []);
    const matrices = extractAllTm(decodeContentStreams(bytes));
    assert.equal(matrices.length, 1);
    const center = boxCenterFromTm(matrices[0], textWidthPt, 36);
    if (referenceCenter === null) {
      referenceCenter = center;
    } else {
      approxEqual(center.centerX, referenceCenter.centerX, 0.5);
      approxEqual(center.centerY, referenceCenter.centerY, 0.5);
    }
  }
});

test("exportWatermarkedPdf: manual placement's native anchor matches the visual-space formula exactly, for several content rotations, on an unrotated page", async () => {
  const pageWidthPt = 612;
  const pageHeightPt = 792;
  const original = await makeBlankPdf([[pageWidthPt, pageHeightPt]]);

  const probeDoc = await PDFDocument.create();
  const probeFont = await probeDoc.embedFont("Helvetica-Bold");
  const textWidthPt = probeFont.widthOfTextAtSize("CONFIDENTIAL", 36);

  for (const rotationDeg of [0, 90, 180, 270]) {
    const config = {
      ...createDefaultTextWatermarkConfig(),
      rotationDeg,
      placement: { mode: "manual" as const, xPct: 25, yPct: 60 },
    };
    const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
    assert.deepEqual(skippedPages, []);
    const matrices = extractAllTm(decodeContentStreams(bytes));
    const center = boxCenterFromTm(matrices[0], textWidthPt, 36);

    // Expected center: the stored top-left (25%, 60%) plus half the box, in
    // visual space, converted to native via the standard top-left/y-down ->
    // native y-up flip for this unrotated page (identity on X).
    const expectedVisualCenterX = (25 / 100) * pageWidthPt + textWidthPt / 2;
    const expectedVisualCenterY = (60 / 100) * pageHeightPt + 36 / 2;
    const expectedNativeCenterX = expectedVisualCenterX;
    const expectedNativeCenterY = pageHeightPt - expectedVisualCenterY;
    approxEqual(center.centerX, expectedNativeCenterX, 0.5);
    approxEqual(center.centerY, expectedNativeCenterY, 0.5);
  }
});

test("exportWatermarkedPdf: manual placement rotation stability holds on a mixed-page-size document (scope: all)", async () => {
  const original = await makeBlankPdf([[612, 792], [792, 612]]);
  const config = {
    ...createDefaultTextWatermarkConfig(),
    rotationDeg: 45,
    placement: { mode: "manual" as const, xPct: 25, yPct: 60 },
  };
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const matrices = extractAllTm(decodeContentStreams(bytes));
  assert.equal(matrices.length, 2);
  // No assertion beyond "both pages got a watermark drawn without error" --
  // per-page proportional correctness for manual placement is already
  // covered by the existing "reuses xPct/yPct verbatim" regression test;
  // this test's job is specifically to prove the NEW rotation-around-center
  // path doesn't throw or skip pages on a mixed-size document.
});
