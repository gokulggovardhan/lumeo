import assert from "node:assert/strict";
import test from "node:test";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import { inspectShapedGlyphWriterEligibility } from "../lib/pdf/edit/shapedGlyphWriterEligibility.ts";

const SHA = "a".repeat(64);

function shaped(overrides: Partial<ShapedRun> = {}): ShapedRun {
  return {
    text: "fi",
    glyphs: [{
      glyphId: 7,
      clusterUtf16: 0,
      flags: 0,
      xAdvance: 570,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0,
      xAdvanceEm: 0.57,
      yAdvanceEm: 0,
      xOffsetEm: 0,
      yOffsetEm: 0,
    }],
    clusterMap: [{ startUtf16: 0, endUtf16: 2, text: "fi", glyphIndices: [0] }],
    unitsPerEm: 1000,
    totalAdvance: 570,
    totalAdvanceEm: 0.57,
    totalXAdvance: 570,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
    ...overrides,
  };
}

const resolved = {
  kind: "Type0" as const,
  bytesPerCode: 2 as const,
  encodingSource: "ToUnicode" as const,
  glyphCodeToUnicode: new Map([[7, "fi"]]),
};

const identityH = {
  type0Encoding: "Identity-H",
  writingMode: "horizontal" as const,
  cidToGidMap: { kind: "name" as const, name: "Identity", objectRef: null },
};

test("shaped writer candidate accepts only explicit Identity CID/GID plus exact ToUnicode cluster coverage", () => {
  const result = inspectShapedGlyphWriterEligibility({
    shaped: shaped(),
    resolvedFont: resolved,
    resourceIdentity: identityH,
    embeddedProgramSha256: SHA,
  });
  assert.equal(result.kind, "eligible");
  if (result.kind === "eligible") {
    assert.deepEqual(result.glyphCodes, [7]);
    assert.deepEqual(result.clusterUnicode, ["fi"]);
    assert.equal(result.writingMode, "horizontal");
    assert.equal(result.advisoryOnly, true);
  }
});

test("shaped writer candidate does not infer CID/GID identity from a missing map", () => {
  const result = inspectShapedGlyphWriterEligibility({
    shaped: shaped(),
    resolvedFont: resolved,
    resourceIdentity: { ...identityH, cidToGidMap: null },
    embeddedProgramSha256: SHA,
  });
  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /Identity CID-to-GID/i);
});

test("shaped writer candidate blocks a glyph CID whose ToUnicode value is not the exact HarfBuzz cluster", () => {
  const result = inspectShapedGlyphWriterEligibility({
    shaped: shaped(),
    resolvedFont: { ...resolved, glyphCodeToUnicode: new Map([[7, "f"]]) },
    resourceIdentity: identityH,
    embeddedProgramSha256: SHA,
  });
  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /ToUnicode.*exact source cluster/i);
});

test("shaped writer candidate blocks non-Identity Type0 encodings", () => {
  const result = inspectShapedGlyphWriterEligibility({
    shaped: shaped(),
    resolvedFont: resolved,
    resourceIdentity: { ...identityH, type0Encoding: "UniJIS-UTF16-H" },
    embeddedProgramSha256: SHA,
  });
  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /Identity-H\/Identity-V/i);
});

test("shaped writer candidate binds HarfBuzz direction to PDF writing mode", () => {
  const vertical = inspectShapedGlyphWriterEligibility({
    shaped: shaped({ requestedDirection: "ttb" }),
    resolvedFont: resolved,
    resourceIdentity: {
      ...identityH,
      type0Encoding: "Identity-V",
      writingMode: "vertical",
    },
    embeddedProgramSha256: SHA,
  });
  assert.equal(vertical.kind, "eligible");

  const mismatch = inspectShapedGlyphWriterEligibility({
    shaped: shaped({ requestedDirection: "rtl" }),
    resolvedFont: resolved,
    resourceIdentity: identityH,
    embeddedProgramSha256: SHA,
  });
  assert.equal(mismatch.kind, "eligible");
});

test("shaped writer candidate rejects vertical HarfBuzz output for a horizontal PDF font", () => {
  const result = inspectShapedGlyphWriterEligibility({
    shaped: shaped({ requestedDirection: "ttb" }),
    resolvedFont: resolved,
    resourceIdentity: identityH,
    embeddedProgramSha256: SHA,
  });
  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /direction.*writing mode/i);
});

test("shaped writer candidate requires exact embedded-font identity", () => {
  const result = inspectShapedGlyphWriterEligibility({
    shaped: shaped(),
    resolvedFont: resolved,
    resourceIdentity: identityH,
    embeddedProgramSha256: null,
  });
  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /fingerprint/i);
});
