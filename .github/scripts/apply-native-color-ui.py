from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one regex anchor, found {count}: {pattern[:120]!r}")
    write(path, updated)


# Native fill capability: keep source colour-space semantics explicit in the UI.
replace_once(
    "lib/pdf/edit/nativePaint.ts",
    "/**\n * Builds a local graphics-paint wrapper for exactly one native text-show\n",
    '''export type NativeFillColorCapability = {
  editable: boolean;
  sourceColor: PdfPaintColor | null;
  reason: string | null;
};

/**
 * Classifies whether a normal browser RGB colour picker can safely edit
 * this operator's native glyph fill. DeviceCMYK is preserved and reported
 * exactly, but deliberately stays read-only because converting it to RGB
 * would require an output-profile assumption the PDF does not provide.
 */
export function describeNativeFillColorCapability(
  operator: Pick<TextShowOperator, "renderMode" | "fillColor">,
): NativeFillColorCapability {
  const sourceColor = operator.fillColor ?? null;
  if (!Number.isInteger(operator.renderMode) || operator.renderMode < 0 || operator.renderMode > 7) {
    return {
      editable: false,
      sourceColor,
      reason: "This text has an invalid PDF rendering mode, so its fill colour cannot be changed safely.",
    };
  }
  if (operator.renderMode >= 4) {
    return {
      editable: false,
      sourceColor,
      reason: "This text contributes to a clipping path. Fill-colour editing is disabled for rendering modes 4–7.",
    };
  }
  if (operator.renderMode === 3) {
    return {
      editable: false,
      sourceColor,
      reason: "This text is invisible (rendering mode 3), so a visible fill-colour change is blocked.",
    };
  }
  if (!paintChannelsForRenderingMode(operator.renderMode).fill) {
    return {
      editable: false,
      sourceColor,
      reason: "This text uses a stroke-only rendering mode, so changing its fill colour would not affect the glyphs.",
    };
  }
  if (!sourceColor) {
    return {
      editable: false,
      sourceColor: null,
      reason: "The native fill colour is unknown, so Lumeo cannot restore the surrounding graphics state exactly.",
    };
  }
  const validation = validateNativePaintColor(sourceColor);
  if (validation) return { editable: false, sourceColor, reason: validation };
  if (sourceColor.colorSpace === "DeviceCMYK") {
    return {
      editable: false,
      sourceColor,
      reason: "DeviceCMYK fill was detected exactly. It stays read-only because Lumeo does not guess-convert CMYK to RGB.",
    };
  }
  if (!sourceColor.cssHex) {
    return {
      editable: false,
      sourceColor,
      reason: "This native fill cannot be represented exactly by the RGB colour picker.",
    };
  }
  return { editable: true, sourceColor, reason: null };
}

/**
 * Builds a local graphics-paint wrapper for exactly one native text-show
''',
)

# Reuse the one existing page/Form document writer. The dynamic import avoids
# making nativePaintApply.ts's existing applyEditPlan import into a static cycle.
replace_once(
    "lib/pdf/edit/applyEditPlan.ts",
    'import type { MultiRunEditPlan } from "./multiRunEditPlan.ts";\n',
    'import type { MultiRunEditPlan } from "./multiRunEditPlan.ts";\nimport type { NativePaintPlan } from "./nativePaint.ts";\n',
)
replace_once(
    "lib/pdf/edit/applyEditPlan.ts",
    "export async function applyEditPlanToDocument(\n",
    '''async function applyPlanToTargetBytes(
  bytes: Uint8Array,
  plan: EditPlan,
  bytesPerCode: 1 | 2,
  fallbackResourceName: string | undefined,
  nativePaintPlan: NativePaintPlan | undefined,
): Promise<Uint8Array> {
  if (!nativePaintPlan) {
    return applyEditPlanToBytes(bytes, plan, bytesPerCode, { fallbackResourceName });
  }
  const { applyEditPlanWithNativePaintToBytes } = await import("./nativePaintApply.ts");
  return applyEditPlanWithNativePaintToBytes(
    bytes,
    plan,
    bytesPerCode,
    nativePaintPlan,
    { fallbackResourceName },
  );
}

export async function applyEditPlanToDocument(
''',
)
replace_once(
    "lib/pdf/edit/applyEditPlan.ts",
    "  options: { isolate?: boolean } = {},\n",
    "  options: { isolate?: boolean; nativePaintPlan?: NativePaintPlan } = {},\n",
)
replace_once(
    "lib/pdf/edit/applyEditPlan.ts",
    "    const newBytes = applyEditPlanToBytes(target.decodedBytes, plan, bytesPerCode, { fallbackResourceName });\n",
    "    const newBytes = await applyPlanToTargetBytes(target.decodedBytes, plan, bytesPerCode, fallbackResourceName, options.nativePaintPlan);\n",
)
replace_once(
    "lib/pdf/edit/applyEditPlan.ts",
    "  const newBytes = applyEditPlanToBytes(located.decodedBytes, plan, bytesPerCode, { fallbackResourceName });\n",
    "  const newBytes = await applyPlanToTargetBytes(located.decodedBytes, plan, bytesPerCode, fallbackResourceName, options.nativePaintPlan);\n",
)

# Component imports and draft state.
replace_once(
    "components/pdf/EditPdfTool.tsx",
    'import { reconstructFragmentedRun, type FragmentedRunReconstruction } from "@/lib/pdf/edit/fragmentedRun";\n',
    '''import { reconstructFragmentedRun, type FragmentedRunReconstruction } from "@/lib/pdf/edit/fragmentedRun";
import {
  buildNativePaintPlan,
  describeNativeFillColorCapability,
  paintColorFromCssHex,
  type NativePaintPlan,
} from "@/lib/pdf/edit/nativePaint";
''',
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '''type NativeTextStyleDraft = {
  spanId: string;
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
};
''',
    '''type NativeTextStyleDraft = {
  spanId: string;
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
  fillColorHex: string | null;
};
''',
)

# Derive capability and the proven paint plan from the exact selected operator.
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '''  const selectedNativeSpan =
    selectedRunIndices.length === 1
      ? pageTextModel?.spans[selectedRunIndices[0]] ?? null
      : null;

  const nativeStyleOverride = useMemo(() => {
''',
    '''  const selectedNativeSpan =
    selectedRunIndices.length === 1
      ? pageTextModel?.spans[selectedRunIndices[0]] ?? null
      : null;
  const selectedNativeRunMatch =
    selectedRunIndices.length === 1
      ? runMatches[selectedRunIndices[0]] ?? null
      : null;
  const nativeFillCapability = useMemo(
    () =>
      selectedNativeRunMatch
        ? describeNativeFillColorCapability(selectedNativeRunMatch.operator)
        : null,
    [selectedNativeRunMatch],
  );
  const nativePaintPlan = useMemo<NativePaintPlan | null>(() => {
    if (
      !selectedNativeSpan ||
      !selectedNativeRunMatch ||
      !nativeFillCapability?.editable ||
      nativeStyleDraft?.spanId !== selectedNativeSpan.id ||
      !nativeStyleDraft.fillColorHex
    ) {
      return null;
    }
    const sourceHex = nativeFillCapability.sourceColor?.cssHex;
    if (sourceHex?.toLowerCase() === nativeStyleDraft.fillColorHex.toLowerCase()) return null;
    const requested = paintColorFromCssHex(nativeStyleDraft.fillColorHex);
    return requested
      ? buildNativePaintPlan(selectedNativeRunMatch.operator, { fillColor: requested })
      : null;
  }, [selectedNativeSpan, selectedNativeRunMatch, nativeFillCapability, nativeStyleDraft]);

  const nativeStyleOverride = useMemo(() => {
''',
)

# One coherent native edit: text/style writer first, paint wrapper around the
# same rewritten segment; Form isolation remains exactly where it was.
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '        await engine.applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, { isolate: locatedOperator.locator.kind === "xobject" });\n',
    '''        await engine.applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, {
          isolate: locatedOperator.locator.kind === "xobject",
          nativePaintPlan: nativePaintPlan?.editable ? nativePaintPlan : undefined,
        });
''',
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    "        if (plan.replacementTextState) {\n",
    "        if (plan.replacementTextState || nativePaintPlan?.editable) {\n",
)
regex_once(
    "components/pdf/EditPdfTool.tsx",
    r'''          const beforeStyle: PdfEditTextStyle = \{\n(?P<body>.*?)          \};\n          const afterStyle: PdfEditTextStyle = \{\n            \.\.\.beforeStyle,\n            fontSizePt: plan\.replacementTextState\.fontSizePt,\n            charSpacingPt: plan\.replacementTextState\.charSpacing,\n            wordSpacingPt: plan\.replacementTextState\.wordSpacing,\n            horizontalScalingPct: plan\.replacementTextState\.horizontalScalingPct,\n          \};''',
    '''          const beforeStyle: PdfEditTextStyle = {
\\g<body>            color: selectedNativeSpan?.style.fillColor?.cssHex ?? undefined,
          };
          const afterStyle: PdfEditTextStyle = {
            ...beforeStyle,
            fontSizePt: plan.replacementTextState?.fontSizePt ?? beforeStyle.fontSizePt,
            charSpacingPt: plan.replacementTextState?.charSpacing ?? beforeStyle.charSpacingPt,
            wordSpacingPt: plan.replacementTextState?.wordSpacing ?? beforeStyle.wordSpacingPt,
            horizontalScalingPct: plan.replacementTextState?.horizontalScalingPct ?? beforeStyle.horizontalScalingPct,
            color: nativePaintPlan?.editable
              ? nativePaintPlan.override.fillColor?.cssHex ?? beforeStyle.color
              : beforeStyle.color,
          };''',
    re.S,
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    "  }, [editPreview, setHistoryState, selectedRunIndices, pageTextModel, pageIndex, selectedNativeSpan]);\n",
    "  }, [editPreview, setHistoryState, selectedRunIndices, pageTextModel, pageIndex, selectedNativeSpan, nativePaintPlan]);\n",
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '''  const nativeStyleChanged =
    editPreview.kind === "single" && Boolean(editPreview.plan.replacementTextState);
  const textDraftChanged =
''',
    '''  const nativeStyleChanged =
    editPreview.kind === "single" && Boolean(editPreview.plan.replacementTextState);
  const nativePaintChanged = Boolean(nativePaintPlan?.editable);
  const textDraftChanged =
''',
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    "    (textDraftChanged || nativeStyleChanged);\n",
    "    (textDraftChanged || nativeStyleChanged || nativePaintChanged);\n",
)

# Live preview is draft-only until Apply; source bytes remain unchanged.
replace_once(
    "components/pdf/EditPdfTool.tsx",
    "                        data-native-fill-color={singleSelectedSpan?.style.fillColor?.cssHex ?? undefined}\n",
    "                        data-native-fill-color={activeNativeStyleDraft?.fillColorHex ?? singleSelectedSpan?.style.fillColor?.cssHex ?? undefined}\n",
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '''                          color: cssTextPaint(
                            singleSelectedSpan?.style.fillColor?.cssHex,
                            singleSelectedSpan?.style.fillOpacity,
                          ),
''',
    '''                          color: cssTextPaint(
                            activeNativeStyleDraft?.fillColorHex ?? singleSelectedSpan?.style.fillColor?.cssHex,
                            singleSelectedSpan?.style.fillOpacity,
                          ),
''',
)

# Both initial Format-open state and Reset use the freshly detected span/operator.
init_anchor = '''                                horizontalScalingPct: singleSelectedSpan.style.horizontalScalingPct,
                              });
'''
replace_once(
    "components/pdf/EditPdfTool.tsx",
    init_anchor,
    '''                                horizontalScalingPct: singleSelectedSpan.style.horizontalScalingPct,
                                fillColorHex: nativeFillCapability?.editable
                                  ? nativeFillCapability.sourceColor?.cssHex ?? null
                                  : null,
                              });
''',
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '''                                  horizontalScalingPct: singleSelectedSpan.style.horizontalScalingPct,
                                })
''',
    '''                                  horizontalScalingPct: singleSelectedSpan.style.horizontalScalingPct,
                                  fillColorHex: nativeFillCapability?.editable
                                    ? nativeFillCapability.sourceColor?.cssHex ?? null
                                    : null,
                                })
''',
)

# Format-panel colour control. CMYK/unknown/unsafe states are explicit and
# read-only; no unsupported state silently becomes black.
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '                          <div className="mt-3 grid grid-cols-2 gap-2">\n',
    '''                          <div className="mt-3 rounded-lg border border-[var(--text-primary)]/10 p-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">Fill colour</span>
                              {nativeFillCapability?.sourceColor ? (
                                <span className="rounded-full border border-[var(--text-primary)]/12 px-2 py-0.5 text-[9px] font-semibold text-[var(--text-primary)]/60">
                                  {nativeFillCapability.sourceColor.colorSpace === "DeviceGray"
                                    ? "Gray"
                                    : nativeFillCapability.sourceColor.colorSpace === "DeviceRGB"
                                      ? "RGB"
                                      : "CMYK"}
                                </span>
                              ) : null}
                            </div>
                            {nativeFillCapability?.editable && nativeStyleDraft.fillColorHex ? (
                              <label className="mt-2 flex items-center gap-2">
                                <input
                                  aria-label="Native fill colour"
                                  type="color"
                                  value={nativeStyleDraft.fillColorHex}
                                  onChange={(event) => {
                                    const value = event.currentTarget.value.toLowerCase();
                                    setNativeStyleDraft((current) => current ? { ...current, fillColorHex: value } : current);
                                    setEditApplyError("");
                                  }}
                                  className="h-9 w-12 cursor-pointer rounded-md border border-[var(--text-primary)]/14 bg-transparent p-1"
                                />
                                <code data-native-fill-value className="text-[10px] font-semibold text-[var(--text-primary)]/70">
                                  {nativeStyleDraft.fillColorHex}
                                </code>
                              </label>
                            ) : (
                              <div data-native-fill-limited className="mt-2 grid gap-1 text-[9px] leading-4 text-[var(--text-primary)]/58">
                                <div className="font-semibold text-[var(--text-primary)]/72">
                                  {nativeFillCapability?.sourceColor?.colorSpace === "DeviceCMYK"
                                    ? `CMYK ${nativeFillCapability.sourceColor.components.map((value) => Number(value.toFixed(4))).join(" ")}`
                                    : nativeFillCapability?.sourceColor
                                      ? `${nativeFillCapability.sourceColor.colorSpace} ${nativeFillCapability.sourceColor.cssHex ?? "native paint"}`
                                      : "Unknown native fill"}
                                </div>
                                <div>{nativeFillCapability?.reason ?? "This selection does not expose a proven editable native fill colour."}</div>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
''',
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    "                              Font face, weight, italic, colour and alignment stay inherited until Lumeo can restore those PDF graphics states exactly.\n",
    "                              Font face, weight, italic and alignment stay inherited. Fill colour is editable only when the native PDF paint state can be restored exactly.\n",
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '''                        {/* Restyle is now the fallback for appearance changes
                            the native writer cannot yet prove safe (font-face
                            substitution, colour and alignment), not the normal
                            path for size/spacing changes. */}
''',
    '''                        {/* Restyle remains the fallback for appearance changes
                            the native writer cannot prove safe (font-face,
                            unsupported paint states and alignment), not the normal
                            path for supported native formatting. */}
''',
)
replace_once(
    "components/pdf/EditPdfTool.tsx",
    '                          title="Restyle -- use a replacement text box for font-face, colour or other appearance changes that cannot be applied safely in place"\n',
    '                          title="Restyle -- use a replacement text box for font-face or other appearance changes that cannot be applied safely in place"\n',
)

# Existing #378 tests already cover planner/writer primitives. Add the missing
# UI capability classification cases and a saved/reloaded document-level proof.
replace_once(
    "tests/edit-native-paint.test.ts",
    '''  buildNativePaintPlan,
  paintColorFromCssHex,
''',
    '''  buildNativePaintPlan,
  describeNativeFillColorCapability,
  paintColorFromCssHex,
''',
)
paint_tests = Path("tests/edit-native-paint.test.ts")
paint_tests.write_text(
    paint_tests.read_text()
    + '''\n\ntest("native fill capability enables exact Gray and RGB picker states", () => {
  const gray = describeNativeFillColorCapability(operator({ fillColor: black }));
  assert.equal(gray.editable, true);
  assert.equal(gray.sourceColor?.colorSpace, "DeviceGray");
  assert.equal(gray.sourceColor?.cssHex, "#000000");

  const rgb = describeNativeFillColorCapability(operator({ fillColor: blue }));
  assert.equal(rgb.editable, true);
  assert.equal(rgb.sourceColor?.colorSpace, "DeviceRGB");
  assert.equal(rgb.sourceColor?.cssHex, "#0000ff");
});

test("native fill capability reports CMYK exactly without inventing RGB", () => {
  const capability = describeNativeFillColorCapability(operator({ fillColor: cmyk }));
  assert.equal(capability.editable, false);
  assert.deepEqual(capability.sourceColor, cmyk);
  assert.equal(capability.sourceColor?.cssHex, null);
  assert.match(capability.reason ?? "", /does not guess-convert CMYK to RGB/i);
});

test("native fill capability blocks unknown, stroke-only, invisible and clipping paint", () => {
  const unknown = describeNativeFillColorCapability(operator({ fillColor: null }));
  assert.equal(unknown.editable, false);
  assert.match(unknown.reason ?? "", /unknown/i);

  const strokeOnly = describeNativeFillColorCapability(operator({ renderMode: 1 }));
  assert.equal(strokeOnly.editable, false);
  assert.match(strokeOnly.reason ?? "", /stroke-only/i);

  const invisible = describeNativeFillColorCapability(operator({ renderMode: 3 }));
  assert.equal(invisible.editable, false);
  assert.match(invisible.reason ?? "", /invisible/i);

  for (const renderMode of [4, 5, 6, 7]) {
    const clipping = describeNativeFillColorCapability(operator({ renderMode }));
    assert.equal(clipping.editable, false);
    assert.match(clipping.reason ?? "", /clipping path/i);
  }
});
'''
)

Path("tests/edit-native-paint-document.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { buildNativePaintPlan, paintColorFromCssHex } from "../lib/pdf/edit/nativePaint.ts";

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.node.Resources()!.set(PDFName.of("Font"), doc.context.obj({ F1: font.ref }));
  page.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("BT /F1 12 Tf 0 g (Alpha) Tj (Beta) Tj ET")),
  );
  return doc.save();
}

test("document writer composes native colour with native text state and restores paint before following text", async () => {
  const original = await fixture();
  const doc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(doc, 0);
  assert.equal(located.length, 2);
  assert.equal(located[0].operator.fillColor?.colorSpace, "DeviceGray");
  assert.equal(located[0].operator.fillColor?.cssHex, "#000000");

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict)
    .lookup(PDFName.of("F1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, doc.context);
  const fontMetrics = resolveFontMetrics(fontDict, doc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Alpha",
    resolvedFont,
    fontMetrics,
    replacementTextState: {
      fontSizePt: 13,
      charSpacing: 0.2,
      wordSpacing: 0,
      horizontalScalingPct: 97,
    },
  });
  assert.equal(plan.editable, true, plan.reason ?? "");

  const red = paintColorFromCssHex("#ff0000");
  assert.ok(red);
  const paintPlan = buildNativePaintPlan(located[0].operator, { fillColor: red });
  assert.equal(paintPlan.editable, true);

  await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, {
    nativePaintPlan: paintPlan,
  });
  const saved = await doc.save();
  const reloaded = await PDFDocument.load(saved.slice());
  const redetected = collectPageTextOperators(reloaded, 0);
  assert.equal(redetected.length, 2);
  assert.equal(redetected[0].operator.fillColor?.colorSpace, "DeviceRGB");
  assert.equal(redetected[0].operator.fillColor?.cssHex, "#ff0000");
  assert.equal(redetected[0].operator.fontSizePt, 13);
  assert.equal(redetected[0].operator.charSpacing, 0.2);
  assert.equal(redetected[0].operator.horizontalScalingPct, 97);
  assert.equal(redetected[1].operator.fillColor?.colorSpace, "DeviceGray");
  assert.equal(redetected[1].operator.fillColor?.cssHex, "#000000");

  const contents = reloaded.getPages()[0].node.get(PDFName.of("Contents"));
  assert.ok(contents instanceof PDFRef);
  const raw = reloaded.context.lookup(contents, PDFRawStream);
  const decoded = new TextDecoder().decode(decodePDFRawStream(raw).decode());
  const redIndex = decoded.indexOf("1 0 0 rg");
  const restoreIndex = decoded.indexOf("0 g", redIndex + 1);
  const lastTextIndex = decoded.lastIndexOf("Tj");
  assert.ok(redIndex >= 0, decoded);
  assert.ok(restoreIndex > redIndex, decoded);
  assert.ok(lastTextIndex > restoreIndex, decoded);
});
''')

print("native colour implementation patch applied")
