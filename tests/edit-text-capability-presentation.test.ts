import assert from "node:assert/strict";
import test from "node:test";
import {
  userFacingTextArbitrationReason,
  userFacingTextCapabilityReason,
  type DocumentTextCapabilityCategory,
} from "../lib/pdf/edit/textCapabilityClassifier.ts";

const categories: readonly DocumentTextCapabilityCategory[] = [
  "NATIVE_TEXT",
  "SCANNED_IMAGE",
  "HYBRID_TEXT_AND_IMAGE",
  "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
  "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
  "COMPLEX_VECTOR_TEXT",
  "TYPE3_TEXT",
  "FORM_XOBJECT_TEXT",
  "CLIPPED_TEXT",
  "VERTICAL_TEXT",
  "UNKNOWN_OR_UNSAFE",
];

const diagnosticExamples: Readonly<
  Record<DocumentTextCapabilityCategory, string>
> = {
  NATIVE_TEXT:
    "Native text has decodable source bytes, a resolved font and deterministic metrics.",
  SCANNED_IMAGE:
    "No native text operators were found and raster image evidence is present.",
  HYBRID_TEXT_AND_IMAGE:
    "The page contains native text plus raster image content.",
  NATIVE_TEXT_WITH_ENCODING_LIMITATIONS:
    "The source character encoding cannot be proven completely.",
  NATIVE_TEXT_WITH_FONT_LIMITATIONS:
    "The source font exists, but deterministic glyph metrics are unavailable.",
  COMPLEX_VECTOR_TEXT:
    "The text transform is materially skewed and is kept read-only.",
  TYPE3_TEXT:
    "Type3 glyph programs are not yet proven safe for native rewrite.",
  FORM_XOBJECT_TEXT:
    "The text is inside a Form XObject and retains form-local resource scope.",
  CLIPPED_TEXT:
    "The text participates in a clipping rendering mode.",
  VERTICAL_TEXT:
    "The Type0 font uses a vertical CMap; vertical native rewrite is not yet proven safe.",
  UNKNOWN_OR_UNSAFE:
    "Neither native text nor PDF.js text extraction produced usable text evidence.",
};

for (const category of categories) {
  test(`user-facing capability reason is plain-language and distinct for ${category}`, () => {
    const userFacing = userFacingTextCapabilityReason(category);
    assert.ok(userFacing.length >= 45);
    assert.notEqual(userFacing, diagnosticExamples[category]);
    assert.doesNotMatch(
      userFacing,
      /\b(?:CMap|CTM|FontDescriptor|Tj|TJ|PDF\.js|content-stream)\b/u,
    );
  });
}

test("PDF.js-only arbitration becomes a product explanation without exposing the implementation signal name", () => {
  const reason = userFacingTextArbitrationReason("pdfjs-only");
  assert.match(reason, /could not prove a matching native PDF text operator/i);
  assert.doesNotMatch(reason, /PDF\.js/u);
});

test("conflicting text signals are explained as a safety limitation rather than an engine error", () => {
  const reason = userFacingTextArbitrationReason("conflict");
  assert.match(reason, /do not agree closely enough/i);
  assert.match(reason, /read-only/i);
});

test("unmatched visible text is explained without pretending the source was found", () => {
  const reason = userFacingTextArbitrationReason("unmatched");
  assert.match(reason, /could not prove which native PDF text source/i);
  assert.match(reason, /read-only/i);
});
