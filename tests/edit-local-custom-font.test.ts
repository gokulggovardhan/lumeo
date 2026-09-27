import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LOCAL_CUSTOM_FONT_BYTES,
  createLocalCustomFontAsset,
  firstUnsupportedLocalCustomFontCharacter,
  localCustomFontTextIssue,
} from "../lib/pdf/edit/localCustomFont.ts";
import type {
  PdfFontProgramInspection,
  PdfFontProgramIntelligence,
} from "../lib/pdf/edit/fontProgramIntelligence.ts";

function intelligence(
  supported = new Set<number>([32, 65, 66]),
): PdfFontProgramIntelligence {
  return {
    metadata: {
      engine: "@cantoo/fontkit@2.0.12",
      fontType: "TTF",
      postScriptName: "DemoSans-Regular",
      fullName: "Demo Sans Regular",
      familyName: "Demo Sans",
      subfamilyName: "Regular",
      version: "Version 1.0",
      unitsPerEm: 1000,
      ascent: 800,
      descent: -200,
      lineGap: 0,
      capHeight: 700,
      xHeight: 500,
      italicAngle: 0,
      bbox: { minX: 0, minY: -200, maxX: 1000, maxY: 800 },
      numGlyphs: 10,
      characterSetCount: supported.size,
      availableFeatures: [],
    },
    hasGlyphForCodePoint(codePoint) {
      return supported.has(codePoint);
    },
    glyphIdForCodePoint(codePoint) {
      return supported.has(codePoint) ? codePoint : null;
    },
    advanceWidthForGlyphId(glyphId) {
      return supported.has(glyphId) ? 600 : null;
    },
  };
}

function okInspection(value = intelligence()): PdfFontProgramInspection {
  return { kind: "ok", intelligence: value };
}

test("local custom font assets are fingerprinted, copied and named from inspected metadata", async () => {
  const source = new Uint8Array([1, 2, 3, 4]);
  const result = await createLocalCustomFontAsset(source, "demo.ttf", {
    inspectFont: async () => okInspection(),
  });

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.asset.descriptor.familyName, "Demo Sans");
  assert.equal(result.asset.descriptor.postScriptName, "DemoSans-Regular");
  assert.equal(result.asset.descriptor.byteLength, 4);
  assert.match(result.asset.descriptor.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    result.asset.descriptor.id,
    `local-font-${result.asset.descriptor.sha256}`,
  );
  assert.equal(
    result.asset.descriptor.browserFamilyName,
    `LumeoLocal_${result.asset.descriptor.sha256.slice(0, 16)}`,
  );

  source[0] = 99;
  assert.equal(result.asset.bytes[0], 1, "asset must own a copy of local font bytes");
});

test("local custom font assets reject non-TTF/OTF files before inspection", async () => {
  let calls = 0;
  const result = await createLocalCustomFontAsset(
    new Uint8Array([1, 2, 3]),
    "demo.woff2",
    {
      inspectFont: async () => {
        calls += 1;
        return okInspection();
      },
    },
  );

  assert.deepEqual(result, {
    kind: "blocked",
    reason: "Choose a .ttf or .otf font file.",
  });
  assert.equal(calls, 0);
});

test("local custom font assets fail closed before inspection when empty or oversized", async () => {
  let calls = 0;
  const inspectFont = async (): Promise<PdfFontProgramInspection> => {
    calls += 1;
    return okInspection();
  };

  const empty = await createLocalCustomFontAsset(new Uint8Array(), "empty.ttf", {
    inspectFont,
  });
  assert.equal(empty.kind, "blocked");

  const oversized = await createLocalCustomFontAsset(
    new Uint8Array(MAX_LOCAL_CUSTOM_FONT_BYTES + 1),
    "huge.ttf",
    { inspectFont },
  );
  assert.equal(oversized.kind, "blocked");
  assert.equal(calls, 0);
});

test("local custom font assets surface parser rejection instead of accepting an unknown font", async () => {
  const result = await createLocalCustomFontAsset(
    new Uint8Array([9, 8, 7]),
    "broken.otf",
    {
      inspectFont: async () => ({
        kind: "parse-error",
        reason: "Synthetic parser rejection.",
      }),
    },
  );

  assert.deepEqual(result, {
    kind: "blocked",
    reason: "Synthetic parser rejection.",
  });
});

test("local custom font glyph validation fails closed on the first unsupported visible character", async () => {
  const result = await createLocalCustomFontAsset(
    new Uint8Array([1, 2, 3]),
    "demo.ttf",
    { inspectFont: async () => okInspection() },
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;

  assert.equal(
    firstUnsupportedLocalCustomFontCharacter(result.asset, "AB A"),
    null,
  );
  assert.equal(
    firstUnsupportedLocalCustomFontCharacter(result.asset, "ABZ"),
    "Z",
  );
  assert.equal(
    localCustomFontTextIssue(result.asset, "ABZ"),
    "Demo Sans does not contain “Z” (U+005A). Choose another font or change the text before exporting.",
  );
});

test("line breaks do not require a font glyph but tabs still do", async () => {
  const result = await createLocalCustomFontAsset(
    new Uint8Array([1]),
    "demo.ttf",
    { inspectFont: async () => okInspection() },
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;

  assert.equal(
    firstUnsupportedLocalCustomFontCharacter(result.asset, "A\nB"),
    null,
  );
  assert.equal(
    firstUnsupportedLocalCustomFontCharacter(result.asset, "A\tB"),
    "\t",
  );
});
