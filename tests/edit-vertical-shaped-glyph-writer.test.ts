import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFName,
} from "pdf-lib";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry, type PdfFontShapingInspection } from "../lib/pdf/edit/fontRegistry.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import {
  applyVerticalShapedGlyphEditPlanToBytes,
  applyVerticalShapedGlyphEditPlanToDocument,
  EditPlanRejectedError,
} from "../lib/pdf/edit/applyEditPlan.ts";
import { decodeTextShowOperator } from "../lib/pdf/edit/editPlan.ts";
import {
  buildVerticalShapedGlyphEditPlan,
  isValidatedVerticalShapedGlyphEditPlan,
} from "../lib/pdf/edit/verticalShapedGlyphEditPlan.ts";

function utf16Hex(text: string): string {
  return [...text]
    .map((char) => {
      const codePoint = char.codePointAt(0)!;
      return codePoint.toString(16).padStart(4, "0");
    })
    .join("")
    .toUpperCase();
}

async function fixture() {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const page = doc.addPage([612, 792]);

  const fakeTtf = Uint8Array.from([
    0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
  ]);
  const fontFileRef = context.register(context.flateStream(fakeTtf));
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "ABCDEF+VerticalWriter",
      Flags: 32,
      ItalicAngle: 0,
      Ascent: 800,
      Descent: -200,
      CapHeight: 700,
      FontBBox: [0, -200, 1000, 900],
      StemV: 80,
      FontFile2: fontFileRef,
    }),
  );

  const descendant = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "ABCDEF+VerticalWriter",
    CIDSystemInfo: {
      Registry: "Adobe",
      Ordering: "Identity",
      Supplement: 0,
    },
    FontDescriptor: descriptorRef,
    DW: 1000,
    W: [3, [600, 700]],
    DW2: [880, -1000],
    W2: [3, [-1200, 320, 930, -1250, 360, 940]],
    CIDToGIDMap: "Identity",
  }) as PDFDict;
  const descendantRef = context.register(descendant);

  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "2 beginbfchar",
    `<0003> <${utf16Hex("A")}>`,
    `<0004> <${utf16Hex("B")}>`,
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");
  const toUnicodeRef = context.register(
    context.stream(new TextEncoder().encode(cmap)),
  );
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "ABCDEF+VerticalWriter",
      Encoding: "Identity-V",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );

  const resources = context.obj({
    Font: context.obj({ FVertical: fontRef }),
  });
  page.node.set(PDFName.of("Resources"), resources);
  const content = [
    "BT",
    "/FVertical 20 Tf",
    "1 0 0 1 300 700 Tm",
    "<00030004> Tj",
    "ET",
  ].join("\n");
  const contentBytes = new TextEncoder().encode(content);
  page.node.set(
    PDFName.of("Contents"),
    context.register(
      context.flateStream(contentBytes),
    ),
  );

  return { doc, page, resources, descendant, contentBytes };
}

function verticalReplacement(): ShapedRun {
  return {
    text: "BA",
    glyphs: [
      {
        glyphId: 4,
        clusterUtf16: 0,
        flags: 0,
        xAdvance: 0,
        yAdvance: -1000,
        xOffset: -360,
        yOffset: -940,
        xAdvanceEm: 0,
        yAdvanceEm: -1,
        xOffsetEm: -0.36,
        yOffsetEm: -0.94,
      },
      {
        glyphId: 3,
        clusterUtf16: 1,
        flags: 0,
        xAdvance: 0,
        yAdvance: -1000,
        xOffset: -320,
        yOffset: -930,
        xAdvanceEm: 0,
        yAdvanceEm: -1,
        xOffsetEm: -0.32,
        yOffsetEm: -0.93,
      },
    ],
    clusterMap: [
      { startUtf16: 0, endUtf16: 1, text: "B", glyphIndices: [0] },
      { startUtf16: 1, endUtf16: 2, text: "A", glyphIndices: [1] },
    ],
    unitsPerEm: 1000,
    totalAdvance: -2000,
    totalAdvanceEm: -2,
    totalXAdvance: 0,
    totalYAdvance: -2000,
    requestedDirection: "ttb",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "test-vertical-1",
  };
}

function shapingInspection(shaped: ShapedRun): PdfFontShapingInspection {
  return {
    kind: "reconciled",
    shaped,
    reconciliation: {
      kind: "requires-shaped-glyph-write",
      advisoryOnly: true,
      reason: "Explicit vertical ordering requires the vertical shaped writer.",
      advanceAgreement: "unavailable",
      harfBuzzAdvanceEm: null,
      pdfAdvanceEm: null,
      advanceDeltaEm: null,
      requiresPerGlyphPositioning: true,
      requiresGlyphSubstitution: false,
    },
  };
}

async function planned() {
  const fx = await fixture();
  const registry = new PdfFontRegistry(fx.doc);
  const located = collectPageTextOperators(fx.doc, 0);
  assert.equal(located.length, 1);
  const target = located[0];
  const profile = registry.resolve(target.resources, "FVertical");
  assert.ok(profile);
  const verticalMetrics = registry.inspectVerticalFontMetrics(
    target.resources,
    "FVertical",
  );
  assert.equal(verticalMetrics.kind, "resolved");
  const shaped = verticalReplacement();
  const evidence = registry.inspectVerticalShapedGlyphEvidence(
    target.resources,
    "FVertical",
    shaped,
  );
  assert.equal(evidence.kind, "resolved");

  const plan = buildVerticalShapedGlyphEditPlan({
    pageIndex: 0,
    contentStreamIndex:
      target.locator.kind === "page"
        ? target.locator.contentStreamIndex
        : 0,
    formPath:
      target.locator.kind === "xobject"
        ? [...target.locator.formPath]
        : null,
    operatorIndex: target.operatorIndex,
    operator: target.operator,
    replacementText: shaped.text,
    resolvedFont: profile!.resolvedFont,
    fontMetrics: profile!.metrics,
    verticalMetrics,
    resourceIdentity: profile!.resourceIdentity,
    embeddedProgramSha256: profile!.embeddedProgramSha256,
    shapingInspection: shapingInspection(shaped),
    verticalEvidence: evidence,
  });
  return { ...fx, registry, target, profile: profile!, verticalMetrics, shaped, evidence, plan };
}

test("vertical shaped planner reconciles PDF vertical origins and bounded y advances", async () => {
  const fx = await planned();
  assert.ok(isValidatedVerticalShapedGlyphEditPlan(fx.plan));
  if (!isValidatedVerticalShapedGlyphEditPlan(fx.plan)) return;

  assert.equal(fx.plan.originalText, "AB");
  assert.equal(fx.plan.replacementText, "BA");
  assert.equal(fx.plan.originalEffectiveAdvancePt, -49);
  assert.equal(fx.plan.shapedAdvancePt, -40);
  assert.equal(fx.plan.endpointTjAdjustment, 450);
  assert.deepEqual(
    fx.plan.glyphs.map((glyph) => ({
      pdfCode: glyph.pdfCode,
      xOffset: glyph.xOffsetFontUnits,
      yOffset: glyph.yOffsetFontUnits,
      tj: glyph.tjAdjustment,
    })),
    [
      { pdfCode: 4, xOffset: -360, yOffset: -940, tj: -250 },
      { pdfCode: 3, xOffset: -320, yOffset: -930, tj: 250 },
    ],
  );
});

test("vertical shaped byte writer emits proven CIDs and preserves the original endpoint", async () => {
  const fx = await planned();
  assert.ok(isValidatedVerticalShapedGlyphEditPlan(fx.plan));
  if (!isValidatedVerticalShapedGlyphEditPlan(fx.plan)) return;

  const rewritten = applyVerticalShapedGlyphEditPlanToBytes(
    fx.contentBytes,
    fx.plan,
  );
  const source = new TextDecoder().decode(rewritten);
  assert.match(source, /\[<0004> -250 <0003> 250\] TJ/);

  const effective1000 =
    (-1250 - -250) +
    (-1200 - 250);
  assert.equal(effective1000, -2450);
  assert.equal(
    (effective1000 / 1000) * fx.plan.fontSizePt,
    fx.plan.originalEffectiveAdvancePt,
  );
});

test("vertical shaped document writer reopens with exact searchable ToUnicode text", async () => {
  const fx = await planned();
  assert.ok(isValidatedVerticalShapedGlyphEditPlan(fx.plan));
  if (!isValidatedVerticalShapedGlyphEditPlan(fx.plan)) return;

  await applyVerticalShapedGlyphEditPlanToDocument(fx.doc, fx.plan);
  const saved = await fx.doc.save();
  const reopened = await PDFDocument.load(saved.slice());
  const located = collectPageTextOperators(reopened, 0);
  assert.equal(located.length, 1);
  assert.equal(located[0].operator.kind, "TJ");

  const profile = new PdfFontRegistry(reopened).resolve(
    located[0].resources,
    "FVertical",
  );
  assert.ok(profile);
  const decoded = decodeTextShowOperator(
    located[0].operator,
    profile!.resolvedFont,
  );
  assert.equal(decoded.allDecoded, true);
  assert.equal(decoded.text, "BA");
});

test("vertical shaped document writer rejects stale W2 metrics atomically", async () => {
  const fx = await planned();
  assert.ok(isValidatedVerticalShapedGlyphEditPlan(fx.plan));
  if (!isValidatedVerticalShapedGlyphEditPlan(fx.plan)) return;

  fx.descendant.set(
    PDFName.of("W2"),
    fx.doc.context.obj([3, [-1300, 320, 930, -1250, 360, 940]]),
  );

  await assert.rejects(
    () => applyVerticalShapedGlyphEditPlanToDocument(fx.doc, fx.plan),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /W2|DW2|metrics changed/i.test(error.message),
  );
});

test("vertical shaped document writer rejects stale text geometry", async () => {
  const fx = await planned();
  assert.ok(isValidatedVerticalShapedGlyphEditPlan(fx.plan));
  if (!isValidatedVerticalShapedGlyphEditPlan(fx.plan)) return;

  const page = fx.doc.getPages()[0];
  const replacement = [
    "BT",
    "/FVertical 20 Tf",
    "1 0 0 1 301 700 Tm",
    "<00030004> Tj",
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    fx.doc.context.register(
      fx.doc.context.flateStream(new TextEncoder().encode(replacement)),
    ),
  );

  await assert.rejects(
    () => applyVerticalShapedGlyphEditPlanToDocument(fx.doc, fx.plan),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /text operator|geometry changed/i.test(error.message),
  );
});

test("plain-object vertical shaped plan copies cannot cross writer authority", async () => {
  const fx = await planned();
  assert.ok(isValidatedVerticalShapedGlyphEditPlan(fx.plan));
  if (!isValidatedVerticalShapedGlyphEditPlan(fx.plan)) return;

  const forged = { ...fx.plan };
  assert.throws(
    () =>
      applyVerticalShapedGlyphEditPlanToBytes(
        fx.contentBytes,
        forged as typeof fx.plan,
      ),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /not issued by the validated vertical planner/i.test(error.message),
  );
});
