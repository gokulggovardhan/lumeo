import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
  PDFName,
  type PDFDict,
} from "pdf-lib";
import {
  applyShapedGlyphEditPlanToBytes,
  applyShapedGlyphEditPlanToDocument,
  EditPlanRejectedError,
} from "../lib/pdf/edit/applyEditPlan.ts";
import {
  collectPageTextOperators,
} from "../lib/pdf/edit/formXObjects.ts";
import {
  decodeTextShowOperator,
} from "../lib/pdf/edit/editPlan.ts";
import {
  PdfFontRegistry,
  type PdfFontShapingInspection,
} from "../lib/pdf/edit/fontRegistry.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import {
  buildShapedGlyphEditPlan,
  isValidatedShapedGlyphEditPlan,
} from "../lib/pdf/edit/shapedGlyphEditPlan.ts";

function utf16BeHex(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes.push((unit >> 8) & 0xff, unit & 0xff);
  }
  return bytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function toUnicodeCMap(entries: ReadonlyArray<readonly [number, string]>): string {
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${entries.length} beginbfchar`,
    ...entries.map(([cid, text]) =>
      `<${cid.toString(16).padStart(4, "0").toUpperCase()}> <${utf16BeHex(text)}>`,
    ),
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");
}

type Fixture = {
  doc: PDFDocument;
  resources: PDFDict;
  resourceName: string;
};

async function fixture({
  show = "<00010002> Tj",
  renderMode = 0,
}: {
  show?: string;
  renderMode?: number;
} = {}): Promise<Fixture> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;

  // The addressability proof only consumes exact embedded-program identity;
  // shaping evidence is supplied independently below. The program bytes stay
  // deliberately tiny/privacy-safe for this native stream-writer unit fixture.
  const fakeTtf = Uint8Array.from([
    0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
  ]);
  const fontFileRef = context.register(context.flateStream(fakeTtf));
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "ABCDEF+ShapedWriterProof",
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
  const descendantRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "ABCDEF+ShapedWriterProof",
      CIDSystemInfo: {
        Registry: "Adobe",
        Ordering: "Identity",
        Supplement: 0,
      },
      FontDescriptor: descriptorRef,
      DW: 1000,
      W: [1, [600, 600, 700]],
      CIDToGIDMap: "Identity",
    }),
  );
  const toUnicodeRef = context.register(
    context.stream(
      toUnicodeCMap([
        [1, "A"],
        [2, "B"],
        [3, "fi"],
      ]),
    ),
  );
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "ABCDEF+ShapedWriterProof",
      Encoding: "Identity-H",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );
  const resources = context.obj({
    Font: context.obj({ FShape: fontRef }),
  });
  page.node.set(PDFName.of("Resources"), resources);

  const content = [
    "BT",
    "/FShape 12 Tf",
    renderMode === 0 ? "" : `${renderMode} Tr`,
    "1 0 0 1 72 700 Tm",
    show,
    "ET",
  ]
    .filter(Boolean)
    .join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(
      context.flateStream(new TextEncoder().encode(content)),
    ),
  );

  return { doc, resources, resourceName: "FShape" };
}

function shapedFi(overrides: Partial<ShapedRun> = {}): ShapedRun {
  return {
    text: "fi",
    glyphs: [
      {
        glyphId: 3,
        clusterUtf16: 0,
        flags: 0,
        xAdvance: 650,
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        xAdvanceEm: 0.65,
        yAdvanceEm: 0,
        xOffsetEm: 0,
        yOffsetEm: 0,
      },
    ],
    clusterMap: [
      {
        startUtf16: 0,
        endUtf16: 2,
        text: "fi",
        glyphIndices: [0],
      },
    ],
    unitsPerEm: 1000,
    totalAdvance: 650,
    totalAdvanceEm: 0.65,
    totalXAdvance: 650,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
    ...overrides,
  };
}

function shapedInspection(
  shaped: ShapedRun = shapedFi(),
  overrides: Partial<
    Extract<PdfFontShapingInspection, { kind: "reconciled" }>["reconciliation"]
  > = {},
): Extract<PdfFontShapingInspection, { kind: "reconciled" }> {
  return {
    kind: "reconciled",
    shaped,
    reconciliation: {
      kind: "requires-shaped-glyph-write",
      advisoryOnly: true,
      reason:
        "HarfBuzz selected a ligature/per-glyph advance that the character-code writer does not emit.",
      advanceAgreement: "unavailable",
      harfBuzzAdvanceEm: null,
      pdfAdvanceEm: null,
      advanceDeltaEm: null,
      requiresPerGlyphPositioning: true,
      requiresGlyphSubstitution: true,
      ...overrides,
    },
  };
}

async function planFor(
  fx: Fixture,
  inspection: PdfFontShapingInspection = shapedInspection(),
) {
  const located = collectPageTextOperators(fx.doc, 0)[0];
  assert.ok(located);
  const registry = new PdfFontRegistry(fx.doc);
  const profile = registry.resolve(
    located.resources,
    fx.resourceName,
  );
  assert.ok(profile);

  const shaped =
    inspection.kind === "reconciled"
      ? inspection.shaped
      : shapedFi();
  const addressability =
    registry.inspectShapedGlyphAddressability(
      located.resources,
      fx.resourceName,
      shaped,
    );

  return buildShapedGlyphEditPlan({
    pageIndex: 0,
    contentStreamIndex:
      located.locator.kind === "page"
        ? located.locator.contentStreamIndex
        : 0,
    formPath:
      located.locator.kind === "xobject"
        ? located.locator.formPath
        : null,
    operatorIndex: located.operatorIndex,
    operator: located.operator,
    replacementText: "fi",
    resolvedFont: profile.resolvedFont,
    fontMetrics: profile.metrics,
    resourceIdentity: profile.resourceIdentity,
    embeddedProgramSha256: profile.embeddedProgramSha256,
    shapingInspection: inspection,
    addressability,
  });
}

test("shaped-glyph planner issues a nominal ligature plan with native TJ endpoint preservation", async () => {
  const fx = await fixture();
  const plan = await planFor(fx);

  assert.equal(plan.editable, true);
  assert.equal(isValidatedShapedGlyphEditPlan(plan), true);
  if (!isValidatedShapedGlyphEditPlan(plan)) return;

  assert.equal(plan.originalText, "AB");
  assert.equal(plan.replacementText, "fi");
  assert.equal(plan.originalEffectiveAdvancePt, 14.4);
  assert.equal(plan.shapedAdvancePt, 7.8);
  assert.equal(plan.endpointTjAdjustment, -550);
  assert.equal(plan.glyphs.length, 1);
  assert.equal(plan.glyphs[0]?.pdfCode, 3);
  // Natural PDF width 700 -> HarfBuzz 650 = +50 TJ, then -550 TJ
  // endpoint compensation => final -500.
  assert.equal(plan.glyphs[0]?.tjAdjustment, -500);
});

test("shaped-glyph byte writer emits addressed CIDs and per-glyph/end-point TJ positioning only inside the target range", async () => {
  const fx = await fixture();
  const located = collectPageTextOperators(fx.doc, 0)[0];
  assert.ok(located);
  const plan = await planFor(fx);
  if (!isValidatedShapedGlyphEditPlan(plan)) assert.fail(plan.reason);

  const before = located.streamBytes.slice();
  const rewritten = applyShapedGlyphEditPlanToBytes(
    before,
    plan,
  );
  const text = new TextDecoder().decode(rewritten);

  assert.match(text, /\[<0003> -500\] TJ/);
  assert.equal(
    new TextDecoder().decode(
      rewritten.subarray(0, plan.byteOffset),
    ),
    new TextDecoder().decode(before.subarray(0, plan.byteOffset)),
  );
});

test("shaped-glyph document writer saves and reopens as searchable ligature text", async () => {
  const fx = await fixture();
  const plan = await planFor(fx);
  if (!isValidatedShapedGlyphEditPlan(plan)) assert.fail(plan.reason);

  await applyShapedGlyphEditPlanToDocument(fx.doc, plan);
  const saved = await fx.doc.save();
  const reopened = await PDFDocument.load(saved);
  const located = collectPageTextOperators(reopened, 0);
  assert.equal(located.length, 1);
  assert.equal(located[0]?.operator.kind, "TJ");
  assert.deepEqual(located[0]?.operator.tjAdjustments, [-500]);

  const registry = new PdfFontRegistry(reopened);
  const profile = registry.resolve(
    located[0]!.resources,
    fx.resourceName,
  );
  assert.ok(profile);
  const decoded = decodeTextShowOperator(
    located[0]!.operator,
    profile.resolvedFont,
  );
  assert.equal(decoded.allDecoded, true);
  assert.equal(decoded.text, "fi");
});

test("shaped-glyph planner preserves an original TJ operator's effective endpoint rather than its raw glyph width", async () => {
  const fx = await fixture({
    show: "[<0001> -100 <0002>] TJ",
  });
  const plan = await planFor(fx);
  if (!isValidatedShapedGlyphEditPlan(plan)) assert.fail(plan.reason);

  assert.equal(plan.originalTjAdjustmentTotal, -100);
  assert.equal(plan.originalEffectiveAdvancePt, 15.6);
  assert.equal(plan.shapedAdvancePt, 7.8);
  assert.equal(plan.endpointTjAdjustment, -650);
  assert.equal(plan.glyphs[0]?.tjAdjustment, -600);
});

test("document writer rejects a stale shaped plan when the native operator changes during asynchronous shaping", async () => {
  const fx = await fixture();
  const plan = await planFor(fx);
  if (!isValidatedShapedGlyphEditPlan(plan)) assert.fail(plan.reason);

  const page = fx.doc.getPage(0);
  const replacement = [
    "BT",
    "/FShape 12 Tf",
    "1 0 0 1 72 700 Tm",
    "<00010001> Tj",
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    fx.doc.context.register(
      fx.doc.context.flateStream(
        new TextEncoder().encode(replacement),
      ),
    ),
  );

  await assert.rejects(
    () => applyShapedGlyphEditPlanToDocument(fx.doc, plan),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /changed after shaped-glyph validation|no longer resolves/i.test(
        error.message,
      ),
  );
});

test("plain-object copies cannot cross the shaped-glyph writer authority boundary", async () => {
  const fx = await fixture();
  const plan = await planFor(fx);
  if (!isValidatedShapedGlyphEditPlan(plan)) assert.fail(plan.reason);

  const forged = { ...plan };
  assert.equal(isValidatedShapedGlyphEditPlan(forged), false);
  assert.throws(
    () =>
      applyShapedGlyphEditPlanToBytes(
        collectPageTextOperators(fx.doc, 0)[0]!.streamBytes,
        forged as never,
      ),
    /not issued by the validated shaped-glyph planner/i,
  );
});

test("first shaped-glyph writer keeps RTL, glyph-offset and invisible-text cases read-only", async () => {
  const rtlFx = await fixture();
  const rtl = await planFor(
    rtlFx,
    shapedInspection(
      shapedFi({
        requestedDirection: "rtl",
      }),
    ),
  );
  assert.equal(rtl.editable, false);
  if (!rtl.editable) assert.match(rtl.reason, /left-to-right/i);

  const offsetFx = await fixture();
  const offset = await planFor(
    offsetFx,
    shapedInspection(
      shapedFi({
        glyphs: [
          {
            ...shapedFi().glyphs[0]!,
            xOffset: 20,
            xOffsetEm: 0.02,
          },
        ],
      }),
    ),
  );
  assert.equal(offset.editable, false);
  if (!offset.editable) assert.match(offset.reason, /glyph offsets/i);

  const invisibleFx = await fixture({ renderMode: 3 });
  const invisible = await planFor(invisibleFx);
  assert.equal(invisible.editable, false);
  if (!invisible.editable) {
    assert.match(invisible.reason, /invisible searchable text/i);
  }
});

test("shaped-glyph writer refuses compatible character-code evidence so ordinary edits retain their existing writer", async () => {
  const fx = await fixture();
  const compatible = shapedInspection(shapedFi(), {
    kind: "compatible-character-codes",
    requiresGlyphSubstitution: false,
    requiresPerGlyphPositioning: false,
    reason: "Character-code writer is sufficient.",
    advanceAgreement: "matched",
    harfBuzzAdvanceEm: 0.65,
    pdfAdvanceEm: 0.65,
    advanceDeltaEm: 0,
  });
  const plan = await planFor(fx, compatible);

  assert.equal(plan.editable, false);
  if (!plan.editable) {
    assert.match(plan.reason, /does not require.*shaped-glyph writer/i);
  }
});
