import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  beginText,
  endText,
  moveText,
  setFontAndSize,
  showText,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  applyLocalFontSubstitutionToBytes,
  buildLocalFontSubstitutionPlan,
  isValidatedLocalFontSubstitutionPlan,
} from "../lib/pdf/edit/localFontSubstitution.ts";
import { createLocalCustomFontAsset } from "../lib/pdf/edit/localCustomFont.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { decodeTextShowOperator } from "../lib/pdf/edit/editPlan.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import { readCiTrueTypeFontBytes } from "./fixtures/shapedGlyphFixture.ts";

function matrixClose(
  left: readonly number[] | null | undefined,
  right: readonly number[] | null | undefined,
  tolerance = 0.001,
): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return left.every(
    (value, index) => Math.abs(value - right[index]) <= tolerance,
  );
}

async function sourcePdf(
  firstText = "WWWW",
  secondText = "TAIL",
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 20),
    moveText(72, 700),
    showText(font.encodeText(firstText)),
    showText(font.encodeText(secondText)),
    endText(),
  );
  return doc.save();
}

async function readyAsset() {
  const bytes = await readCiTrueTypeFontBytes();
  const result = await createLocalCustomFontAsset(
    bytes,
    "native-local-font.ttf",
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") assert.fail(result.reason);
  return result.asset;
}

async function planFixture(
  replacementText = "iiii",
  bytes?: Uint8Array,
) {
  const sourceBytes = bytes ?? (await sourcePdf());
  const doc = await PDFDocument.load(sourceBytes.slice());
  const entries = collectPageTextOperators(doc, 0);
  assert.equal(entries.length, 2);
  const first = entries[0];
  assert.equal(first.locator.kind, "page");
  const resourceName = first.operator.fontResourceName;
  assert.ok(resourceName);
  const registry = new PdfFontRegistry(doc);
  const profile = registry.resolve(first.resources, resourceName!);
  assert.ok(profile);
  const asset = await readyAsset();
  const plan = await buildLocalFontSubstitutionPlan({
    pageIndex: 0,
    contentStreamIndex:
      first.locator.kind === "page"
        ? first.locator.contentStreamIndex
        : 0,
    operatorIndex: first.operatorIndex,
    operator: first.operator,
    replacementText,
    resolvedFont: profile!.resolvedFont,
    fontMetrics: profile!.metrics,
    sourceResourceIdentity: profile!.resourceIdentity,
    embeddedGlyphEvidence: profile!.embeddedGlyphEvidence,
    asset,
  });
  return { bytes: sourceBytes, doc, entries, profile: profile!, asset, plan };
}

async function pdfJsText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("");
  } finally {
    const destroy = (doc as { destroy?: () => Promise<void> | void }).destroy;
    if (typeof destroy === "function") {
      await destroy.call(doc);
    }
  }
}

test("native local-font planner validates a simple horizontal LTR substitution", async () => {
  const fx = await planFixture();
  assert.ok(isValidatedLocalFontSubstitutionPlan(fx.plan));
  if (!isValidatedLocalFontSubstitutionPlan(fx.plan)) return;
  assert.equal(fx.plan.originalText, "WWWW");
  assert.equal(fx.plan.replacementText, "iiii");
  assert.equal(fx.plan.operatorSnapshot.kind, "Tj");
  assert.notEqual(
    fx.plan.sourceBinding.writingMode,
    "vertical",
    "simple PDF fonts are horizontal even when no Type0 CMap reports an explicit writing mode",
  );
  assert.equal(fx.plan.localFontSha256, fx.asset.descriptor.sha256);
  assert.equal(fx.plan.shapingProof.glyphIds.length, 4);
});

test("native local-font writer embeds a subset, preserves searchable text, restores the original font and endpoint", async () => {
  const fx = await planFixture();
  assert.ok(isValidatedLocalFontSubstitutionPlan(fx.plan));
  if (!isValidatedLocalFontSubstitutionPlan(fx.plan)) return;

  const originalSecondMatrix = fx.entries[1].operator.textRenderingMatrix;
  const originalSecondResource = fx.entries[1].operator.fontResourceName;
  const result = await applyLocalFontSubstitutionToBytes({
    sourceBytes: fx.bytes,
    plan: fx.plan,
    asset: fx.asset,
  });

  assert.equal(result.verifiedText, "iiii");
  assert.match(result.resourceName, /^LumeoNativeLocal\d+$/);
  assert.match(result.embeddedProgramSha256, /^[a-f0-9]{64}$/i);
  assert.notEqual(
    result.embeddedProgramSha256,
    fx.asset.descriptor.sha256,
    "a subset font program should have its own embedded fingerprint",
  );

  const reopened = await PDFDocument.load(result.bytes.slice());
  const entries = collectPageTextOperators(reopened, 0);
  assert.equal(entries.length, 2);

  const registry = new PdfFontRegistry(reopened);
  const firstResource = entries[0].operator.fontResourceName;
  assert.equal(firstResource, result.resourceName);
  const localProfile = registry.resolve(
    entries[0].resources,
    firstResource!,
  );
  assert.ok(localProfile);
  assert.equal(localProfile!.isEmbedded, true);
  assert.ok(localProfile!.resourceIdentity.fontProgramObjectRef);
  const firstText = decodeTextShowOperator(
    entries[0].operator,
    localProfile!.resolvedFont,
  );
  assert.equal(firstText.allDecoded, true);
  assert.equal(firstText.text, "iiii");

  assert.equal(
    entries[1].operator.fontResourceName,
    originalSecondResource,
    "the original Tf must be restored before downstream text",
  );
  assert.ok(
    matrixClose(
      entries[1].operator.textRenderingMatrix,
      originalSecondMatrix,
    ),
    "endpoint compensation must keep following text at its original PDF-space position",
  );

  const visibleText = await pdfJsText(result.bytes);
  assert.ok(visibleText.includes("iiii"));
  assert.ok(visibleText.includes("TAIL"));
  assert.ok(!visibleText.includes("WWWW"));
});

test("native local-font writer rejects a plain-object plan copy", async () => {
  const fx = await planFixture();
  assert.ok(isValidatedLocalFontSubstitutionPlan(fx.plan));
  if (!isValidatedLocalFontSubstitutionPlan(fx.plan)) return;

  const forged = { ...fx.plan };
  await assert.rejects(
    () =>
      applyLocalFontSubstitutionToBytes({
        sourceBytes: fx.bytes,
        plan: forged as typeof fx.plan,
        asset: fx.asset,
      }),
    /planner-issued validated local-font substitution/i,
  );
});

test("native local-font writer rejects mutated font bytes after planning", async () => {
  const fx = await planFixture();
  assert.ok(isValidatedLocalFontSubstitutionPlan(fx.plan));
  if (!isValidatedLocalFontSubstitutionPlan(fx.plan)) return;

  const tamperedBytes = fx.asset.bytes.slice();
  tamperedBytes[0] ^= 0xff;
  const tampered = { ...fx.asset, bytes: tamperedBytes };
  await assert.rejects(
    () =>
      applyLocalFontSubstitutionToBytes({
        sourceBytes: fx.bytes,
        plan: fx.plan,
        asset: tampered,
      }),
    /fingerprint/i,
  );
});

test("native local-font writer rejects stale source text instead of applying to a same-shaped operator", async () => {
  const fx = await planFixture();
  assert.ok(isValidatedLocalFontSubstitutionPlan(fx.plan));
  if (!isValidatedLocalFontSubstitutionPlan(fx.plan)) return;

  const stale = await sourcePdf("XXXX", "TAIL");
  await assert.rejects(
    () =>
      applyLocalFontSubstitutionToBytes({
        sourceBytes: stale,
        plan: fx.plan,
        asset: fx.asset,
      }),
    /changed after local-font validation/i,
  );
});

test("native local-font writer rejects a same-named source font resource swapped after planning", async () => {
  const fx = await planFixture();
  assert.ok(isValidatedLocalFontSubstitutionPlan(fx.plan));
  if (!isValidatedLocalFontSubstitutionPlan(fx.plan)) return;

  const staleDoc = await PDFDocument.load(fx.bytes.slice());
  const page = staleDoc.getPages()[0];
  const resources = page.node.Resources()!;
  const fonts = resources.lookup(PDFName.of("Font"), PDFDict);
  const sourceKey = PDFName.of(fx.plan.originalFontResourceName);
  const currentFont = staleDoc.context.lookup(fonts.get(sourceKey), PDFDict);
  const replacementFont = staleDoc.context.obj({}) as PDFDict;
  for (const [key, value] of currentFont.entries()) {
    replacementFont.set(key, value);
  }
  const replacementRef = staleDoc.context.register(replacementFont);
  fonts.set(sourceKey, replacementRef);
  const staleBytes = await staleDoc.save();

  await assert.rejects(
    () =>
      applyLocalFontSubstitutionToBytes({
        sourceBytes: staleBytes,
        plan: fx.plan,
        asset: fx.asset,
      }),
    /font resource changed|changed after local-font validation/i,
  );
});

test("native local-font planner blocks word-spaced source text because embedded composite fonts interpret Tw differently", async () => {
  const fx = await planFixture();
  const operator = {
    ...fx.entries[0].operator,
    wordSpacing: 4,
  };
  const plan = await buildLocalFontSubstitutionPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: fx.entries[0].operatorIndex,
    operator,
    replacementText: "iiii",
    resolvedFont: fx.profile.resolvedFont,
    fontMetrics: fx.profile.metrics,
    sourceResourceIdentity: fx.profile.resourceIdentity,
    embeddedGlyphEvidence: fx.profile.embeddedGlyphEvidence,
    asset: fx.asset,
  });
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /word spacing/i);
});

test("native local-font planner blocks complex-script shaping in this first substitution slice", async () => {
  const fx = await planFixture();
  const plan = await buildLocalFontSubstitutionPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: fx.entries[0].operatorIndex,
    operator: fx.entries[0].operator,
    replacementText: "e\u0301",
    resolvedFont: fx.profile.resolvedFont,
    fontMetrics: fx.profile.metrics,
    sourceResourceIdentity: fx.profile.resourceIdentity,
    embeddedGlyphEvidence: fx.profile.embeddedGlyphEvidence,
    asset: fx.asset,
  });
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /simple LTR shaping/i);
});

test("native local-font planner blocks kerning or GPOS evidence even when every Unicode character exists", async () => {
  const fx = await planFixture("iiii");
  const asset = fx.asset;
  const chars = Array.from("AB");
  const gidA = asset.intelligence.glyphIdForCodePoint(
    chars[0].codePointAt(0)!,
  )!;
  const gidB = asset.intelligence.glyphIdForCodePoint(
    chars[1].codePointAt(0)!,
  )!;
  const widthA = asset.intelligence.advanceWidthForGlyphId(gidA)!;
  const widthB = asset.intelligence.advanceWidthForGlyphId(gidB)!;
  const unitsPerEm = asset.intelligence.metadata.unitsPerEm!;

  const fakeShape = async (): Promise<ShapedRun> => ({
    text: "AB",
    glyphs: [
      {
        glyphId: gidA,
        clusterUtf16: 0,
        flags: 0,
        xAdvance: widthA - 20,
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        xAdvanceEm: (widthA - 20) / unitsPerEm,
        yAdvanceEm: 0,
        xOffsetEm: 0,
        yOffsetEm: 0,
      },
      {
        glyphId: gidB,
        clusterUtf16: 1,
        flags: 0,
        xAdvance: widthB,
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        xAdvanceEm: widthB / unitsPerEm,
        yAdvanceEm: 0,
        xOffsetEm: 0,
        yOffsetEm: 0,
      },
    ],
    clusterMap: [
      {
        startUtf16: 0,
        endUtf16: 1,
        text: "A",
        glyphIndices: [0],
      },
      {
        startUtf16: 1,
        endUtf16: 2,
        text: "B",
        glyphIndices: [1],
      },
    ],
    unitsPerEm,
    totalAdvance: widthA + widthB - 20,
    totalAdvanceEm: (widthA + widthB - 20) / unitsPerEm,
    totalXAdvance: widthA + widthB - 20,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "test",
  });

  const plan = await buildLocalFontSubstitutionPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: fx.entries[0].operatorIndex,
    operator: fx.entries[0].operator,
    replacementText: "AB",
    resolvedFont: fx.profile.resolvedFont,
    fontMetrics: fx.profile.metrics,
    sourceResourceIdentity: fx.profile.resourceIdentity,
    embeddedGlyphEvidence: fx.profile.embeddedGlyphEvidence,
    asset,
    shapeFont: fakeShape,
  });
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /kerning\/GPOS|per-glyph positioning/i);
});
