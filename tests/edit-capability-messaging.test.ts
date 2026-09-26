import assert from "node:assert/strict";
import test from "node:test";
import {
  userMessageForCapabilityCategory,
  userMessageForPageCapability,
  userMessageForTextRun,
} from "../lib/pdf/edit/capabilityMessaging.ts";
import type {
  DocumentTextCapabilityCategory,
  PageTextCapabilityClassification,
  SpanTextCapabilityClassification,
} from "../lib/pdf/edit/textCapabilityClassifier.ts";
import type { TextEditArbitration } from "../lib/pdf/edit/textReconciliation.ts";

const categories: DocumentTextCapabilityCategory[] = [
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

test("every Edit PDF capability category has stable plain-language product copy", () => {
  for (const category of categories) {
    const message = userMessageForCapabilityCategory(category);
    assert.ok(message.title.trim().length > 0, category);
    assert.ok(message.detail.trim().length > 0, category);
    assert.doesNotMatch(
      `${message.title} ${message.detail}`,
      /PDF\.js|CMap|\bTj\b|\bTJ\b|content-stream operator|nativeSpanKey/i,
      category,
    );
  }
});

test("page copy explains native-text disagreement without exposing engine jargon", () => {
  const page: PageTextCapabilityClassification = {
    category: "NATIVE_TEXT",
    spanClassifications: [],
    nativeSpanCount: 2,
    pdfJsRunCount: 2,
    reconciledHighConfidenceCount: 1,
    nativeOnlySpanCount: 0,
    pdfJsOnlyRunCount: 1,
    rasterImageEvidence: false,
    reasons: ["Internal diagnostic evidence is deliberately not UI copy."],
  };

  const message = userMessageForPageCapability(page);
  assert.match(message.title, /source matches/i);
  assert.match(message.detail, /read-only/i);
  assert.doesNotMatch(message.detail, /PDF\.js|nativeSpan/i);
});

test("run copy prefers the concrete unsafe native category over a generic arbitration conflict", () => {
  const arbitration: TextEditArbitration = {
    pdfJsRunIndex: 0,
    decision: "view-only",
    nativeSpanKey: "native-0",
    source: "conflict",
    reason: "Internal conflict reason.",
  };
  const nativeClassification: SpanTextCapabilityClassification = {
    nativeSpanKey: "native-0",
    category: "CLIPPED_TEXT",
    safelyRewritable: false,
    reason: "Internal clipping diagnostic.",
  };

  const message = userMessageForTextRun({
    arbitration,
    nativeClassification,
  });
  assert.ok(message);
  assert.match(message.title, /clipping/i);
  assert.match(message.detail, /read-only/i);
});

test("PDF-visible-only text receives a specific read-only explanation", () => {
  const arbitration: TextEditArbitration = {
    pdfJsRunIndex: 0,
    decision: "view-only",
    nativeSpanKey: null,
    source: "pdfjs-only",
    reason: "Internal PDF.js-only reason.",
  };

  const message = userMessageForTextRun({
    arbitration,
    nativeClassification: null,
  });
  assert.ok(message);
  assert.match(message.title, /no proven PDF source/i);
  assert.match(message.detail, /read-only/i);
  assert.doesNotMatch(message.detail, /PDF\.js/i);
});

test("editable text does not get a limitation message", () => {
  const arbitration: TextEditArbitration = {
    pdfJsRunIndex: 0,
    decision: "editable",
    nativeSpanKey: "native-0",
    source: "reconciled",
    reason: "Internal success evidence.",
  };

  assert.equal(
    userMessageForTextRun({
      arbitration,
      nativeClassification: null,
    }),
    null,
  );
});
