import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { reconstructFragmentedRun } from "../lib/pdf/edit/fragmentedRun.ts";
import type { LocatedTextOperator } from "../lib/pdf/edit/formXObjects.ts";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";

function asciiFont(): ResolvedFont {
  const glyphCodeToUnicode = new Map<number, string>();
  const unicodeToGlyphCode = new Map<string, number>();
  for (let code = 32; code < 127; code += 1) {
    const char = String.fromCharCode(code);
    glyphCodeToUnicode.set(code, char);
    unicodeToGlyphCode.set(char, code);
  }
  return {
    kind: "Type1",
    baseFont: "Helvetica",
    isEmbedded: false,
    isSubset: false,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode,
    unicodeToGlyphCode,
  };
}

async function locatedFrom(source: string): Promise<LocatedTextOperator[]> {
  const doc = await PDFDocument.create();
  const resources = doc.context.obj({});
  const bytes = new TextEncoder().encode(source);
  return walkTextShowOperators(bytes).map((operator, operatorIndex) => ({
    locator: { kind: "page" as const, contentStreamIndex: 0 },
    operatorIndex,
    operator,
    streamBytes: bytes,
    resources,
  }));
}

test("reconstructFragmentedRun proves an exact byte-adjacent merged Tj run", async () => {
  const located = await locatedFrom(
    "BT /F1 16 Tf 1 0 0 1 60 680 Tm (SSN 123-45-) Tj (6789) Tj ET",
  );
  assert.equal(located.length, 2);

  const reconstruction = reconstructFragmentedRun({
    fullDetectedText: "SSN 123-45-6789",
    matched: located[0],
    pageOperators: located,
    resolvedFont: asciiFont(),
  });

  assert.ok(reconstruction);
  assert.deepEqual(reconstruction.operatorIndices, [0, 1]);
  assert.equal(reconstruction.originalText, "SSN 123-45-6789");
  assert.equal(reconstruction.fontResourceName, "F1");
});

test("reconstructFragmentedRun refuses a positioning operator between visible fragments", async () => {
  const located = await locatedFrom(
    "BT /F1 16 Tf 1 0 0 1 60 680 Tm (SSN 123-45-) Tj 12 0 Td (6789) Tj ET",
  );
  const reconstruction = reconstructFragmentedRun({
    fullDetectedText: "SSN 123-45-6789",
    matched: located[0],
    pageOperators: located,
    resolvedFont: asciiFont(),
  });
  assert.equal(reconstruction, null);
});

test("reconstructFragmentedRun refuses mixed text state instead of merging heuristically", async () => {
  const located = await locatedFrom(
    "BT /F1 16 Tf 1 0 0 1 60 680 Tm (SSN 123-45-) Tj /F2 16 Tf (6789) Tj ET",
  );
  const reconstruction = reconstructFragmentedRun({
    fullDetectedText: "SSN 123-45-6789",
    matched: located[0],
    pageOperators: located,
    resolvedFont: asciiFont(),
  });
  assert.equal(reconstruction, null);
});

test("reconstructFragmentedRun refuses partial text equality", async () => {
  const located = await locatedFrom(
    "BT /F1 16 Tf 1 0 0 1 60 680 Tm (SSN 123-45-) Tj (6789) Tj ET",
  );
  const reconstruction = reconstructFragmentedRun({
    fullDetectedText: "SSN 123-45-6780",
    matched: located[0],
    pageOperators: located,
    resolvedFont: asciiFont(),
  });
  assert.equal(reconstruction, null);
});
