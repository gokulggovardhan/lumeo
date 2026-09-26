"use client";

// components/pdf/EditPdfTool.tsx
//
// Edit PDF workspace -- generalizes SignPdfTool's architecture (pdfjs page
// render -> percent-based HTML overlay for placed elements -> pdf-lib
// flatten on export) to four element types: text, freehand ink, shapes
// (rect/ellipse/line/highlight), and whiteout/redaction boxes.
//
// Explicitly out of scope, per the approved design spec: signatures (use
// Sign PDF), page management -- rotate/reorder/delete/duplicate/merge/split
// (use Page Re-Order / Merge / Split), watermarking (its own future tool),
// multi-select, true content-stripping redaction, vector-path ink.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
// pdf-lib itself is NOT imported as a value here -- see loadEditEngine
// below, which loads it (and every lib/pdf/edit/*.ts module that touches
// it internally) lazily, on first actual need, instead of bundling a
// substantial library into the page's initial JS on every visit to
// /pdf/edit regardless of whether the user ever uploads a file. Only
// TYPES are imported statically -- these are erased at compile time and
// have zero runtime/bundle cost, same treatment PDFDocumentProxy (from
// pdfjs-dist, also lazy-loaded) already gets above.
import type { PDFDocument, PDFDict } from "pdf-lib";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2PrivacyNote,
  L2ToolbarButton,
  L2UploadStage,
  L2WorkspaceHeader,
  ToolActionBar,
} from "@/components/pdf/workspace/ToolWorkspace";
import { EditElementView } from "@/components/pdf/edit/EditElementView";
import { FloatingIsland } from "@/components/pdf/edit/FloatingIsland";
import { InkCanvas } from "@/components/pdf/edit/InkCanvas";
import { MicroDock } from "@/components/pdf/edit/MicroDock";
import { TextRunOverlay } from "@/components/pdf/edit/TextRunOverlay";
import { NativeTextFormatPanel, type NativeTextStyleDraft } from "@/components/pdf/edit/NativeTextFormatPanel";
import { NativeTextMixedFormatPanel } from "@/components/pdf/edit/NativeTextMixedFormatPanel";
import { useNativeTextSelectionState } from "@/components/pdf/edit/useNativeTextSelectionState";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  createInkElement,
  createShapeElement,
  createTextElement,
  createWhiteoutElement,
  deleteElement,
  elementsForPage,
  patchElement,
  type EditElement,
  type ShapeKind,
} from "@/lib/pdf/edit/elements";
// exportEditedPdf, collectPageTextOperators, resolveFont,
// resolveFontMetrics, applyEditPlanToDocument, and
// applyMultiRunEditPlanToDocument are all loaded lazily too -- see
// loadEditEngine below -- because their own home modules
// (lib/pdf/edit/export.ts, formXObjects.ts, fontEncoding.ts,
// fontMetrics.ts, applyEditPlan.ts) each import pdf-lib at their own top
// level. Statically importing any of THEM here would pull pdf-lib back
// in transitively regardless of the type-only import above. Their TYPE
// exports are unaffected (same erased-at-compile-time reasoning).
import { overlayFontSizePx, textRunsFromContent, type DetectedTextRun } from "@/lib/pdf/edit/textRuns";
import {
  buildNativeContentStreamSpans,
  nativeDetectedRuns,
  type NativeContentStreamSpan,
} from "@/lib/pdf/edit/nativeTextDetection";
import {
  buildTextEditArbitrations,
  finalizeTextEditArbitration,
  reconcileTextSignals,
  type TextEditArbitration,
  type TextSignalReconciliation,
} from "@/lib/pdf/edit/textReconciliation";
import {
  DocumentTextCapabilityClassifier,
  type PageTextCapabilityClassification,
} from "@/lib/pdf/edit/textCapabilityClassifier";
import { PdfCoordinateMapper } from "@/lib/pdf/edit/coordinateMapper";
import { buildPdfPageTextModel } from "@/lib/pdf/edit/documentModel";
import { summarizeNativeTextSelectionStyles } from "@/lib/pdf/edit/mixedStyleSelection";
import {
  logicalRangeCoversWholeSpans,
  orderedSingleSpanOffsets,
} from "@/lib/pdf/edit/logicalTextRange";
import { PercentSpatialIndex } from "@/lib/pdf/edit/spatialIndex";
import {
  buildPdfTextSearchPageIndex,
  nextSearchMatchIndex,
  replacementTextForSearchMatch,
  searchPdfDocumentIndex,
  searchPdfPageText,
  type PdfTextSearchMatch,
  type PdfTextSearchPageIndex,
  type PdfTextSearchScope,
} from "@/lib/pdf/edit/textSearch";
import { scanForSensitiveInfo, type PrivacyShieldMatch } from "@/lib/pdf/edit/privacyShield";
import { planRunRestyle } from "@/lib/pdf/edit/restyleRun";
import { pickHorizontalAlign, pickVerticalPlacement } from "@/lib/pdf/edit/floatingControlPlacement";
import type { LocatedTextOperator } from "@/lib/pdf/edit/formXObjects";
import { buildOperatorSpatialIndex, matchDetectedRunToOperatorIndexed, runSpansMultipleOperators } from "@/lib/pdf/edit/matchTextRun";
import type { EmbeddedGlyphEvidence, ResolvedFont } from "@/lib/pdf/edit/fontEncoding";
import type { FontMetrics } from "@/lib/pdf/edit/fontMetrics";
import { buildEditPlan, type EditPlan } from "@/lib/pdf/edit/editPlan";
import {
  buildCaretRetypePlan,
  captureCaretTextStyleSnapshot,
} from "@/lib/pdf/edit/caretTextStyleSnapshot";
import { buildMultiRunEditPlan, type MultiRunEditPlan } from "@/lib/pdf/edit/multiRunEditPlan";
import {
  buildNativeTextStyleBatchPlan,
  type NativeTextStyleBatchPatch,
} from "@/lib/pdf/edit/multiStylePlan";
import { reconstructFragmentedRun, type FragmentedRunReconstruction } from "@/lib/pdf/edit/fragmentedRun";
import {
  buildNativePaintPlan,
  describeNativeFillColorCapability,
  paintColorFromCssHex,
  type NativePaintPlan,
} from "@/lib/pdf/edit/nativePaint";
import {
  appendPdfEditOperations,
  createPdfEditSession,
  deriveElementOperations,
  nativeTextOperation,
  nativeTextStyleOperation,
  pageOperation as createPageEditOperation,
  type NativeTextTarget,
  type PdfEditOperationDraft,
  type PdfEditSessionState,
  type PdfEditTextStyle,
} from "@/lib/pdf/edit/editSession";
import { decideReplacementLayout } from "@/lib/pdf/edit/replacementLayout";
import {
  countElementsOnRemovedPages,
  deletePages,
  mergePdf,
  remapElements,
  remapPageIndex,
  reorderPages,
  splitPdf,
  type PageMap,
} from "@/lib/pdf/edit/pageOps";
import PageThumbnailSidebar from "@/components/pdf/edit/PageThumbnailSidebar";
import RedactionLayer from "@/components/pdf/edit/RedactionLayer";
import { applyRedaction, type RedactionOutcome } from "@/lib/pdf/edit/applyRedaction";
import {
  describeCoverageWarning,
  findSensitiveMatches,
  maskBoxFor,
  removeSpans,
  runsIntersectingBoxes,
  type RedactionBox,
} from "@/lib/pdf/edit/redaction";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument, renderPageWithTimeout, withPageTimeout, PAGE_RENDER_TIMEOUT_MS, clampRenderScaleToMaxDimension, clampRenderScaleToPixelBudget, computeAdaptiveRenderScale, quantizeRenderScale } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize, checkPdfPageCount } from "@/lib/pdf/uploadValidation";

// A detected run matched to the content-stream operator that produced it
// (lib/pdf/edit/matchTextRun.ts), paired with the LocatedTextOperator that
// operator came from (lib/pdf/edit/formXObjects.ts) -- carries everything
// applyTextRunEdit needs (locator, resources, operatorIndex) to build and
// apply a real EditPlan. null means this run has no matching operator
// (Type3 font, or a page/text shape this engine doesn't cover yet) -- in-
// place editing genuinely isn't available for it, not an error.
type RunMatch = { locatedOperator: LocatedTextOperator; operator: LocatedTextOperator["operator"] } | null;

// Phase 9.2: the combined undo/redo snapshot -- reusing lib/sign/
// useHistoryState.ts exactly as-is (no changes to that hook), just widening
// what it holds, so a SINGLE linear undo stack covers both the existing
// overlay-element edits AND true text-run edits in the order they actually
// happened, without touching any existing overlay-element call site's own
// signature (see the setElements adapter below). pdfBytes
// only changes reference identity on a REAL text edit or undo/redo across
// one -- an elements-only action's snapshot reuses the SAME ArrayBuffer
// reference, so the undo stack never duplicates multi-MB PDF bytes for
// actions that didn't touch them.
type EditHistorySnapshot = {
  elements: EditElement[];
  /**
   * Materialized result of the semantic session operations for compatibility
   * with the proven pdf-lib/content-stream writer. This is a cache, not the
   * only record of what the user did.
   */
  pdfBytes: ArrayBuffer;
  session: PdfEditSessionState;
};

// Phase 9.2: a live, dry-run preview of what "Apply edit" would do for the
// CURRENT selection + draft text -- computed synchronously (buildEditPlan/
// buildMultiRunEditPlan never touch PDF bytes, so this is cheap enough to
// recompute on every keystroke) so the UI can disable Apply and explain
// exactly why BEFORE the user ever clicks it, per lib/pdf/edit/editPlan.ts's
// own "editable: false, reason: string" contract. The one exception,
// documented on applyTextRunEdit itself, is a shared Form XObject that
// can't be safely isolated (AmbiguousSharedFormError) -- detecting that
// would require actually calling resolveIsolatedStreamTarget, which
// (unlike buildEditPlan) has real side effects on the pdf-lib document
// graph when it decides to clone, so it is deliberately NOT called
// speculatively here; that one case is still surfaced honestly, just at
// Apply time via the catch block instead of live.
//
// `substituteFont` (single-run only) names the standard font a
// lib/pdf/edit/fallbackFont.ts substitution WOULD use, and is set only
// when the run's own font was rejected but a substitute would work. It's
// deliberately an offer rather than something applied automatically:
// silently changing the typeface of someone's document is not a decision
// this tool gets to make on their behalf, so the UI names the substitute
// and waits to be asked.
type EditPreview =
  | { kind: "empty" }
  | {
      kind: "single";
      editable: boolean;
      reason: string | null;
      plan: EditPlan;
      resolvedFont: ResolvedFont;
      locatedOperator: LocatedTextOperator;
      substituteFont: string | null;
    }
  | { kind: "multi"; editable: boolean; reason: string | null; plan: MultiRunEditPlan; resolvedFont: ResolvedFont };

// Phase 11 UX audit -- Shape tool's place in Edit PDF, decided: KEEP.
// Rect/ellipse/line are genuine freeform annotation shapes with no other
// path to create them in this tool, so they're clearly justified. The one
// shape kind that looked like it might duplicate another workflow --
// "highlight" -- was checked against true text highlighting (marking
// EXISTING text, independent of editing it): that feature doesn't exist
// anywhere else in this tool (Select only supports replacing text in place,
// via Phase 11's inline editor; there's no persisted "mark this text"
// action). So Shape's highlight kind is currently the ONLY way to highlight
// existing content -- not a duplicate, the sole implementation. Revisit if
// a dedicated text-highlight action is ever added to the Select tool.
// A standard PDF font name as a person would say it: "Times-BoldItalic"
// reads as "Times Bold Italic", "Helvetica-BoldOblique" as "Helvetica Bold
// Italic". "Oblique" is the PDF-internal word for a slanted sans face and
// means nothing outside typography, so it's said as "Italic"; "Times-Roman"
// is just "Times", since "Roman" here only means "not italic".
function readableFontName(standardFontName: string): string {
  const [family, style = ""] = standardFontName.split("-");
  const words = style
    .replace(/Bold/g, " Bold")
    .replace(/(Oblique|Italic)/g, " Italic")
    .replace(/Roman/g, "")
    .trim();
  return words ? `${family} ${words}` : family;
}

export type ActiveTool = "select" | "text" | "draw" | "shape" | "whiteout";

// Phase 13: unmodified 1-5 tool shortcuts, shown as native tooltips on each
// tool button (see the tool grid's title attribute below) -- a discrete
// object (not derived from ActiveTool's own array) so the mapping is a
// single, greppable source of truth for both the keydown handler and the
// tooltip text.
const TOOL_SHORTCUT_KEYS: Record<string, ActiveTool> = {
  "1": "select",
  "2": "text",
  "3": "draw",
  "4": "shape",
  "5": "whiteout",
};
type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

// Lazy-loads pdf-lib itself plus every lib/pdf/edit/*.ts module whose OWN
// top-level imports touch it (export.ts, formXObjects.ts, fontEncoding.ts,
// fontMetrics.ts, applyEditPlan.ts) -- all six only actually needed once a
// user has a PDF loaded into Edit PDF, never on initial page load. Those
// five files' own internals are completely unchanged; this only moves the
// import EDGE from EditPdfTool.tsx into them from static to dynamic, so
// webpack code-splits the whole cluster (pdf-lib included) into a separate
// chunk instead of bundling it into every visit to /pdf/edit regardless of
// whether the user ever uploads a file.
//
// A single module-level cached promise (not a ref) so it survives
// component remounts, mirroring lib/pdf/pdfjs.ts's loadPdfJsModule exactly
// -- same singleton-lazy-import pattern already established in this
// codebase for pdfjs-dist, just applied to pdf-lib's own equally-eager
// static import.
let editEngineModulePromise: Promise<{
  exportEditedPdf: (typeof import("@/lib/pdf/edit/export"))["exportEditedPdf"];
  collectPageTextOperators: (typeof import("@/lib/pdf/edit/formXObjects"))["collectPageTextOperators"];
  resolveFont: (typeof import("@/lib/pdf/edit/fontEncoding"))["resolveFont"];
  resolveFontMetrics: (typeof import("@/lib/pdf/edit/fontMetrics"))["resolveFontMetrics"];
  readFallbackStyleHints: (typeof import("@/lib/pdf/edit/fallbackFont"))["readFallbackStyleHints"];
  applyEditPlanToDocument: (typeof import("@/lib/pdf/edit/applyEditPlan"))["applyEditPlanToDocument"];
  applyMultiRunEditPlanToDocument: (typeof import("@/lib/pdf/edit/applyEditPlan"))["applyMultiRunEditPlanToDocument"];
  applyNativeTextStyleBatchToDocument: (typeof import("@/lib/pdf/edit/applyEditPlan"))["applyNativeTextStyleBatchToDocument"];
  PDFDocument: (typeof import("pdf-lib"))["PDFDocument"];
  PDFName: (typeof import("pdf-lib"))["PDFName"];
  PDFDict: (typeof import("pdf-lib"))["PDFDict"];
  PdfFontRegistry: (typeof import("@/lib/pdf/edit/fontRegistry"))["PdfFontRegistry"];
}> | null = null;

function loadEditEngine() {
  if (!editEngineModulePromise) {
    editEngineModulePromise = Promise.all([
      import("@/lib/pdf/edit/export"),
      import("@/lib/pdf/edit/formXObjects"),
      import("@/lib/pdf/edit/fontEncoding"),
      import("@/lib/pdf/edit/fontMetrics"),
      import("@/lib/pdf/edit/applyEditPlan"),
      import("pdf-lib"),
      import("@/lib/pdf/edit/fallbackFont"),
      import("@/lib/pdf/edit/fontRegistry"),
    ]).then(([exportMod, formXObjectsMod, fontEncodingMod, fontMetricsMod, applyEditPlanMod, pdfLibMod, fallbackFontMod, fontRegistryMod]) => ({
      exportEditedPdf: exportMod.exportEditedPdf,
      collectPageTextOperators: formXObjectsMod.collectPageTextOperators,
      resolveFont: fontEncodingMod.resolveFont,
      resolveFontMetrics: fontMetricsMod.resolveFontMetrics,
      readFallbackStyleHints: fallbackFontMod.readFallbackStyleHints,
      applyEditPlanToDocument: applyEditPlanMod.applyEditPlanToDocument,
      applyMultiRunEditPlanToDocument: applyEditPlanMod.applyMultiRunEditPlanToDocument,
      applyNativeTextStyleBatchToDocument: applyEditPlanMod.applyNativeTextStyleBatchToDocument,
      PDFDocument: pdfLibMod.PDFDocument,
      PDFName: pdfLibMod.PDFName,
      PDFDict: pdfLibMod.PDFDict,
      PdfFontRegistry: fontRegistryMod.PdfFontRegistry,
    }));
  }
  return editEngineModulePromise;
}

type EditEngine = Awaited<ReturnType<typeof loadEditEngine>>;

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const DEFAULT_SHAPE_KIND: ShapeKind = "rect";
// Phase 9.3 memory hardening: every TEXT edit (not overlay-element edit)
// pushes a full re-saved copy of the whole document's bytes onto the shared
// undo history (see applyTextRunEdit below) -- unlike overlay-element edits,
// which reuse the same ArrayBuffer reference and cost nothing extra per
// history entry. Uploads are capped at 150MB (lib/pdf/uploadValidation.ts's
// MAX_PDF_FILE_SIZE_BYTES); this budget is double that, so ordinary editing
// sessions on ordinary-sized files never notice it (the entry-count cap,
// MAX_HISTORY in lib/sign/useHistoryState.ts, is still what limits them),
// while a long session of repeated text edits on a large file can no longer
// grow undo memory unboundedly -- the oldest pdfBytes-bearing entries are
// dropped first once this total is exceeded.
const EDIT_HISTORY_MAX_BYTES = 300 * 1024 * 1024;
// Phase 9.3 large-page-render hardening: mirrors CompressPdfTool.tsx's own
// dimensionScale safety cap exactly (same 5200px ceiling on the longer
// side) -- an oversized MediaBox (rare, but not excluded by the file-size/
// page-count upload limits) would otherwise render at PAGE_RENDER_SCALE
// unconditionally, producing an arbitrarily large canvas and risking a slow
// render, a failed canvas allocation, or browser instability on
// constrained devices.
const MAX_CANVAS_DIMENSION_PX = 5200;
// Phase 26: MAX_CANVAS_DIMENSION_PX alone only bounds the canvas's LONGER
// side -- a page large on BOTH axes (e.g. near-square, close to the
// dimension cap on each side) can still pass that check while producing a
// canvas up to 5200x5200 = ~27 million pixels (a ~108MB RGBA backing
// buffer for one canvas). See clampRenderScaleToPixelBudget's own doc
// comment in lib/pdf/pdfjs.ts -- this budget is set well above any
// realistic document (Letter/A4 and even large-format pages like ANSI E
// at 34x44in stay under 15M px at PAGE_RENDER_SCALE) so it's a no-op for
// every normal page, and only reduces scale further for the rare
// pathological one.
const MAX_CANVAS_TOTAL_PIXELS = 20_000_000;

// The discrete raster scales the page is ever rendered at. Ascending, and
// starting at PAGE_RENDER_SCALE so the unzoomed default is unchanged. The
// top rung is what a Letter page can afford at MAX_CANVAS_TOTAL_PIXELS
// (612x792pt at 6x is ~17.4M px, just inside the budget); anything asking
// for more is clamped down by clampRenderScaleToPixelBudget rather than
// being allowed to allocate it.
const RASTER_SCALE_STEPS = [PAGE_RENDER_SCALE, 2, 3, 4, 6] as const;

// Long enough that a zoom drag or a run of +/- taps settles into a single
// re-render, short enough that a deliberate zoom sharpens up without the
// user noticing a wait.
const RASTER_SCALE_DEBOUNCE_MS = 180;

// Maximum zoom. Raised from 2 once zooming actually re-rasterizes: at the
// old cap the page was a 1.3x bitmap stretched to 2.6x, and raising the cap
// without re-rendering would only have made it blurrier. 4 rather than 5
// deliberately -- past roughly 4x a Letter page runs into
// MAX_CANVAS_TOTAL_PIXELS, so a "500%" would be delivered as a soft,
// budget-clamped raster and would be advertising sharpness the engine can't
// actually produce.
const MAX_ZOOM = 4;
const MIN_ZOOM = 0.5;

function clampPct(value: number) {
  return Math.min(100, Math.max(0, value));
}

function cssTextPaint(
  hex: string | null | undefined,
  opacity: number | null | undefined,
): string | undefined {
  if (!hex) return undefined;
  if (opacity === null || opacity === undefined || opacity >= 0.999) return hex;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return hex;
  const alpha = Math.min(1, Math.max(0, opacity));
  return `rgba(${Number.parseInt(match[1], 16)}, ${Number.parseInt(match[2], 16)}, ${Number.parseInt(match[3], 16)}, ${alpha})`;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

async function runWithTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), EXPORT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function sanitizePdfFileName(value: string, fallback = "lumeo-edited") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 22.5 20 10.5l3 3L11 25.5H8v-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18.5 12 21 14.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M7 7 4 10l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 10h9a6 6 0 1 1 0 12h-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M17 7 20 10l-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 10h-9a6 6 0 1 0 0 12h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function EditPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  // Phase 9.2: split from a single `pdf` state so its `.bytes` can be a pure
  // DERIVED value (see the `pdf` useMemo below, after historyState) instead
  // of a separately-`setState`-synced copy of historyState.pdfBytes -- the
  // prior design needed an effect that called setPdf(...) purely to mirror
  // another piece of state, which both duplicated data and tripped this
  // project's react-hooks/set-state-in-effect lint rule (a real, not
  // stylistic, footgun: that pattern can cascade an extra render on every
  // state change it mirrors). `pdfMeta` only ever changes on upload/reset,
  // never on a text edit.
  const [pdfMeta, setPdfMeta] = useState<{ file: File; pageCount: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  // The current page's real size in PDF points (from pdfjs's scale-1
  // viewport, which matches pdf-lib's page.getSize() used at export time).
  // Combined with pageDisplaySize (the same page's rendered pixel size),
  // this gives the px-per-point factor needed to make on-screen text size
  // match the exported PDF's point size -- see EditElementView's
  // `pixelsPerPoint` prop.
  const [pagePointSize, setPagePointSize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  // Declared up here, ahead of the history hook, because the wrappers just
  // below close over setDownloadUrl -- the rest of the export state
  // (isExporting/downloadName/outputName) stays grouped further down.
  const [downloadUrl, setDownloadUrl] = useState("");

  const {
    state: historyState,
    set: setHistoryStateRaw,
    undo: undoRaw,
    redo: redoRaw,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistoryState<EditHistorySnapshot>(
    { elements: [], pdfBytes: new ArrayBuffer(0), session: createPdfEditSession(0) },
    { maxTotalSize: EDIT_HISTORY_MAX_BYTES, sizeOf: (snapshot) => snapshot.pdfBytes.byteLength },
  );
  // Every document mutation -- placing, moving, restyling or deleting an
  // element, applying a text edit, or undoing/redoing any of those -- makes
  // an already-exported PDF stale. These three wrappers are the single choke
  // point all of them pass through (setElements below delegates to
  // setHistoryState), so clearing the download URL here swaps the Download
  // button back to Export instead of leaving a blob that predates the change
  // downloadable. Doing it at the choke point rather than per call site is
  // what makes it hold for call sites added later.
  //
  // resetHistory is deliberately NOT wrapped: its only callers, resetTool and
  // addFile, revoke the URL and clear it themselves as part of a wider reset.
  const setHistoryState = useCallback((updater: EditHistorySnapshot | ((current: EditHistorySnapshot) => EditHistorySnapshot)) => {
    setHistoryStateRaw(updater);
    setDownloadUrl("");
  }, [setHistoryStateRaw]);
  const undo = useCallback(() => {
    undoRaw();
    setDownloadUrl("");
  }, [undoRaw]);
  const redo = useCallback(() => {
    redoRaw();
    setDownloadUrl("");
  }, [redoRaw]);
  const elements = historyState.elements;
  // Adapter preserving setElements' EXACT prior call signature (a bare
  // EditElement[] array or updater over one) -- every existing overlay-
  // element call site (drag/resize/delete/patch/create) keeps working
  // completely unchanged; only what gets PUSHED onto the shared undo stack
  // widened to also carry pdfBytes alongside elements. (Full-snapshot
  // resets go through resetHistory directly -- see resetTool/addFile.)
  const setElements = useCallback((updater: EditElement[] | ((current: EditElement[]) => EditElement[])) => {
    setHistoryState((current) => {
      const nextElements =
        typeof updater === "function"
          ? (updater as (c: EditElement[]) => EditElement[])(current.elements)
          : updater;
      const operations = deriveElementOperations(current.elements, nextElements);
      return {
        ...current,
        elements: nextElements,
        session: appendPdfEditOperations(current.session, operations),
      };
    });
  }, [setHistoryState]);
  // Tracks the ORIGINAL uploaded bytes (set once per upload in addFile) so
  // "has this document had a true text edit applied" can be derived by
  // reference comparison against historyState.pdfBytes, rather than a
  // separate boolean that could drift out of sync with undo/redo -- see the
  // Export button's disabled condition (hasTextEdits) below. STATE, not a
  // ref: hasTextEdits reads this during render, and React forbids reading
  // a ref's value there.
  const [originalBytes, setOriginalBytes] = useState<ArrayBuffer | null>(null);
  // The single source of truth every other effect/handler reads as `pdf` --
  // combines pdfMeta (file/pageCount, upload-only) with historyState.pdfBytes
  // (the live, undo/redo-aware document bytes). A NEW object every time
  // either input changes, exactly like state would produce, so every
  // existing `[pdf]`-keyed effect (the pdfjs preview load, the pdf-lib edit
  // doc load) keeps re-running at exactly the same moments it always did --
  // including right after a text edit or an undo/redo across one, since
  // that's precisely when historyState.pdfBytes's reference changes.
  const pdf = useMemo<LoadedPdf | null>(
    () => (pdfMeta ? { file: pdfMeta.file, pageCount: pdfMeta.pageCount, bytes: historyState.pdfBytes } : null),
    [pdfMeta, historyState.pdfBytes],
  );
  const elementIdCounterRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Phase 1 of true PDF text editing: read-only detection of the current
  // page's existing text runs (see lib/pdf/edit/textRuns.ts), so the select
  // tool can highlight real text instead of only ever placing new overlay
  // elements. Nothing here writes back to the PDF yet -- that's a separate,
  // much harder follow-up (matching a run back to the specific content-
  // stream operator that produced it so it can be rewritten in place).
  const [detectedTextRuns, setDetectedTextRuns] = useState<DetectedTextRun[]>([]);
  // True once text-run detection has genuinely finished for the current
  // page (successfully or with zero results) -- detectedTextRuns itself
  // (empty or populated) is the source of truth for the RESULT, this is
  // only about whether that result is final yet, so Select can tell "still
  // detecting" apart from "genuinely has no text."
  const [textDetectionReady, setTextDetectionReady] = useState(false);
  // Detection results are valid only for the exact PDF-byte snapshot and page
  // that produced them. History Undo/Redo and native edits swap pdf.bytes
  // synchronously, while the next pdf.js detection pass is asynchronous.
  // Keeping this provenance prevents a one-render stale overlay window where
  // old text can still accept a click and then have that selection erased by
  // the incoming refresh (observed reliably in WebKit after Undo).
  const [textDetectionRevision, setTextDetectionRevision] = useState<{
    bytes: ArrayBuffer;
    pageIndex: number;
  } | null>(null);
  const textDetectionCurrent =
    textDetectionReady &&
    textDetectionRevision?.bytes === pdf?.bytes &&
    textDetectionRevision?.pageIndex === pageIndex;
  // Phase 9.1: the index-parallel matched-operator for each entry in
  // detectedTextRuns (lib/pdf/edit/matchTextRun.ts), computed once per page
  // load alongside detection itself -- cheap position-only matching, no
  // font resolution yet (that's deferred to the moment a specific edit is
  // actually attempted, in applyTextRunEdit). selectedRunIndex/
  // hoveredRunIndex/focusedRunIndex index into this SAME array as
  // detectedTextRuns, so a run's editability, selection, hover, and focus
  // state are all looked up by one shared index rather than juggling
  // separate DetectedTextRun object identities.
  // runMatches is WRITE AUTHORITY only. Lower-confidence positional/source
  // provenance is retained separately so fragmented-run reconstruction and
  // diagnostics can still prove/reject a source without accidentally making
  // that same provenance editable.
  const [runMatches, setRunMatches] = useState<RunMatch[]>([]);
  const [runProvenanceMatches, setRunProvenanceMatches] = useState<RunMatch[]>([]);
  const [nativeTextSpans, setNativeTextSpans] = useState<NativeContentStreamSpan[]>([]);
  const [textReconciliations, setTextReconciliations] = useState<TextSignalReconciliation[]>([]);
  const [textArbitrations, setTextArbitrations] = useState<TextEditArbitration[]>([]);
  const [pdfJsDetectedRunCount, setPdfJsDetectedRunCount] = useState(0);
  // Phase 9.2: the raw per-page LocatedTextOperator list (the same one
  // runMatches was derived from), kept around so a multi-run selection can
  // reconstruct the FULL, in-order operator list one specific content
  // stream needs for lib/pdf/edit/multiRunEditPlan.ts's buildMultiRunEditPlan
  // (its `allOperators` param) without re-walking the page from scratch on
  // every keystroke.
  const [pageOperators, setPageOperators] = useState<LocatedTextOperator[]>([]);
  // Phase 2.2 decomposition seam: native text selection/caret/draft state is
  // owned by a focused controller rather than this 4k+ line workspace
  // component. PDF evidence, planning and writing authority remain here and
  // in lib/pdf/edit; Phase 2.3 can now replace the run-index selection model
  // behind one boundary instead of another monolithic component rewrite.
  const {
    selectionAnchorIndex,
    selectedRunIndices,
    hoveredRunIndex,
    setHoveredRunIndex,
    focusedRunIndex,
    setFocusedRunIndex,
    editDraftText,
    setEditDraftText,
    caretTextStyleSnapshot,
    setCaretTextStyleSnapshot,
    useSubstituteFont,
    setUseSubstituteFont,
    editApplyError,
    setEditApplyError,
    nativeFormatOpen,
    setNativeFormatOpen,
    logicalSelection,
    clearSelection: clearNativeTextSelection,
    resetInteraction: resetNativeTextInteraction,
    selectDetectedRun,
    selectRunIndices,
    updateSingleSpanLogicalSelection,
  } = useNativeTextSelectionState();
  // Browser FontFace previews are keyed to a model span id so an async font
  // load can never leak the previous selection's face into a newly-selected
  // run. Export safety remains governed by fontEncoding/editPlan, not by
  // whether a browser happens to accept the embedded font bytes.
  const [browserFontPreview, setBrowserFontPreview] = useState<{ spanId: string; family: string } | null>(null);
  const [nativeStyleDraft, setNativeStyleDraft] = useState<NativeTextStyleDraft | null>(null);
  const [textSearchOpen, setTextSearchOpen] = useState(false);
  const [textSearchQuery, setTextSearchQuery] = useState("");
  const [textSearchReplacement, setTextSearchReplacement] = useState("");
  const [textSearchScope, setTextSearchScope] = useState<PdfTextSearchScope>("document");
  const [textSearchCaseSensitive, setTextSearchCaseSensitive] = useState(false);
  const [textSearchWholeWord, setTextSearchWholeWord] = useState(false);
  const [textSearchActiveIndex, setTextSearchActiveIndex] = useState(-1);
  const [textSearchPageIndexes, setTextSearchPageIndexes] = useState<ReadonlyMap<number, PdfTextSearchPageIndex>>(
    () => new Map(),
  );
  const [textSearchIndexBusy, setTextSearchIndexBusy] = useState(false);
  // True when the last Restyle could not blank the original glyphs from the
  // content stream, so the covered text is still in the exported file. Drives
  // the disclosure notice -- see restyleSelectedRun for when that happens.
  const [restyleKeptOriginalText, setRestyleKeptOriginalText] = useState(false);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const runOverlayNodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // Phase 11: the inline caret-over-the-PDF input for a single selected,
  // editable text run -- see the JSX below (rendered next to the run's
  // TextRunOverlay) and the autofocus effect just below this.
  const inlineEditInputRef = useRef<HTMLInputElement | null>(null);
  const textSearchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadClientReadyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // SSR can render the file input before React has attached its change
    // handler. Mark the upload surface only after hydration so automated
    // browsers—and assistive automation using the raw file input—never race
    // a visually-present but not-yet-interactive control.
    uploadClientReadyRef.current?.setAttribute("data-edit-client-ready", "true");
  }, []);

  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  // Phase 11: live drag-to-create preview for the Whiteout tool -- see
  // handleWhiteoutPointerDown/Move/Up. `snapped` distinguishes "locked to a
  // detected text run's exact bounds" from "a manually dragged rect," purely
  // to drive a slightly different preview border color as feedback.
  const [whiteoutDraft, setWhiteoutDraft] = useState<{ xPct: number; yPct: number; widthPct: number; heightPct: number; snapped: boolean } | null>(null);
  const whiteoutGestureRef = useRef<{ startXPct: number; startYPct: number; rect: DOMRect } | null>(null);
  const [shapeKind, setShapeKind] = useState<ShapeKind>(DEFAULT_SHAPE_KIND);
  // Privacy Shield: matches from the last scan of the CURRENT page's
  // detectedTextRuns, shown as dismissable highlight overlays until applied
  // (converted to real whiteout elements) or individually dismissed.
  const [privacyShieldMatches, setPrivacyShieldMatches] = useState<Array<PrivacyShieldMatch<DetectedTextRun>>>([]);
  const [inkColor, setInkColor] = useState("#12141a");
  const [inkStrokeWidth, setInkStrokeWidth] = useState(3);
  const [zoom, setZoom] = useState(1);

  const [isExporting, setIsExporting] = useState(false);
  const [downloadName, setDownloadName] = useState("lumeo-edited.pdf");
  const [outputName, setOutputName] = useState("lumeo-edited.pdf");

  const stageRef = useRef<HTMLDivElement | null>(null);
  // The stage's live CSS width. Needed because a px `font-size` does not
  // scale with a percent-positioned ancestor: the inline text editor sits
  // inside a percent-sized box over the page, so its font has to be
  // computed in DISPLAYED pixels, not the raster bitmap's own (see
  // lib/pdf/edit/textRuns.ts's overlayFontSizePx). Measured rather than
  // derived because the stage's width follows zoom, the window, and the
  // surrounding layout all at once -- there is no single state value that
  // already implies it. null until first measurement, which overlayFontSizePx
  // treats as "fall back to the raster size."
  const [stageWidthPx, setStageWidthPx] = useState<number | null>(null);
  // The scale the page bitmap is currently rasterized at. Starts at the
  // fixed default so the very first render is byte-for-byte what it always
  // was, then follows the stage's real displayed size (see
  // targetRasterScale below). Debounced, so a zoom drag re-rasterizes once
  // it settles rather than on every intermediate value.
  const [rasterScale, setRasterScale] = useState(PAGE_RENDER_SCALE);
  // Which page the CURRENT page image actually belongs to, so a re-raster
  // can tell "I am sharpening a page already on screen" from "I am drawing
  // a page for the first time." Only the second case may surface a render
  // failure as an error -- see the raster effect's catch.
  const renderedPageRef = useRef<number | null>(null);
  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const textSearchPageIndexesRef = useRef<Map<number, PdfTextSearchPageIndex>>(new Map());
  const textSearchBuildGenerationRef = useRef(0);
  // Phase 22: the render effect below already fetches this exact page and
  // computes its scaled viewport once per pageIndex -- the operator-matching
  // effect used to independently re-fetch and re-derive both from scratch
  // (a second doc.getPage() + two more getViewport() calls per page view,
  // pure duplicated pdf.js/main-thread work) purely so it could read the
  // same numbers a moment later. Cached here, keyed by pageIndex, so it can
  // reuse them instead. Only ever read by the operator effect right after
  // the render effect that populated it, for the SAME pageIndex.
  const pageAndViewportRef = useRef<{ pageIndex: number; page: PDFPageProxy; viewport: PageViewport } | null>(null);
  const [docReady, setDocReady] = useState(0);
  // Page-structure state. selectedPages is the rail's tick boxes (delete /
  // extract act on it); pageOpBusy serialises operations, because two
  // rebuilds racing on the same bytes would have one silently overwrite the
  // other's result.
  const [selectedPages, setSelectedPages] = useState<ReadonlySet<number>>(() => new Set());
  const [pageOpBusy, setPageOpBusy] = useState(false);
  const [pageOpNotice, setPageOpNotice] = useState("");
  const lastSelectedPageRef = useRef<number | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  // The rail needs the live pdfjs document, which lives in a ref so page
  // turns do not re-render this component. A stable getter hands it over
  // without making the ref itself part of the child's props (a ref object
  // never changes identity, so the child could not tell a swap had
  // happened) -- docReady is what signals that.
  const getPdfJsDocument = useCallback(() => pdfJsDocRef.current, []);
  // Redaction state. `redactMode` gates the drag surface; boxes are the
  // user's drawn rectangles in percent space; outcome is what the last run
  // could and could not remove, kept on screen until dismissed because its
  // warnings are the whole safety story.
  const [redactMode, setRedactMode] = useState(false);
  const [redactionBoxes, setRedactionBoxes] = useState<RedactionBox[]>([]);
  const [redactionConfirmOpen, setRedactionConfirmOpen] = useState(false);
  const [redactionOutcome, setRedactionOutcome] = useState<RedactionOutcome | null>(null);
  const [redactionBusy, setRedactionBusy] = useState(false);
  // addFile() must open the file via pdfjs once up front to read its page
  // count (for the page-count limit check) before pdf state is even set --
  // the [pdf]-keyed effect below would otherwise open the SAME bytes a
  // second time moments later. Stashing that already-open doc here (keyed by
  // the exact ArrayBuffer reference it was opened from) lets that effect
  // reuse it instead of re-parsing; only ever set right before pdf.bytes is
  // about to become that same reference.
  const pendingInitialDocRef = useRef<{ bytes: ArrayBuffer; doc: PDFDocumentProxy } | null>(null);
  // Phase 9.1: a SEPARATE pdf-lib PDFDocument, loaded from the exact same
  // `pdf.bytes` source of truth the pdfjs preview doc above uses -- the
  // in-place text-editing backend (lib/pdf/edit/*.ts) operates on pdf-lib's
  // object model, not pdfjs's, so it needs its own instance. Mirrors the
  // pdfJsDocRef effect immediately below exactly (load once per `pdf`
  // change, tear down the previous instance, best-effort). Applying an
  // edit (applyTextRunEdit) re-saves this doc and writes the result back
  // into `pdf.bytes` itself, which naturally cascades a fresh reload of
  // BOTH this doc and the pdfjs preview -- there is only ever one baseline,
  // never two documents that could drift out of sync with each other.
  const pdfLibDocRef = useRef<PDFDocument | null>(null);
  // Populated once loadEditEngine() resolves (see the pdfLibDoc-loading
  // effect below) -- used for imperative access from effects/handlers.
  const editEngineRef = useRef<EditEngine | null>(null);
  // A REACTIVE twin of editEngineRef, same reasoning as pdfLibDoc's own
  // twin just below: resolvedEditContext's useMemo needs synchronous
  // access to resolveFont/resolveFontMetrics/PDFName/PDFDict during
  // render, and React forbids reading a ref's value there (even inside
  // useMemo) -- this project's React Compiler enforces that rule.
  const [editEngine, setEditEngine] = useState<EditEngine | null>(null);
  // Phase 9.2: a REACTIVE twin of pdfLibDocRef, set together with it
  // everywhere the ref is -- editPreview (below) needs to read "is the
  // pdf-lib doc ready, and which one" from within a useMemo, and React
  // forbids reading a ref's value during render/useMemo (only effects and
  // event handlers may). Every OTHER read of the doc in this component
  // (inside effects or the applyTextRunEdit handler) keeps using the ref
  // directly, exactly as before -- that's the correct, unflagged pattern
  // for imperative, non-render-path access.
  const [pdfLibDoc, setPdfLibDoc] = useState<PDFDocument | null>(null);

  // Premium engine foundation: one registry per live pdf-lib document.
  // Expensive font dictionaries/metrics are resolved once and reused by
  // selection, capability reporting and the inline editor.
  const fontRegistry = useMemo(
    () => (pdfLibDoc && editEngine ? new editEngine.PdfFontRegistry(pdfLibDoc) : null),
    [pdfLibDoc, editEngine],
  );

  const pageCoordinateMapper = useMemo(
    () =>
      pagePointSize && pagePointSize.width > 0 && pagePointSize.height > 0
        ? new PdfCoordinateMapper(pagePointSize.width, pagePointSize.height)
        : null,
    [pagePointSize],
  );

  const pageFontProfiles = useMemo(
    () =>
      detectedTextRuns.map((_run, index) => {
        const match = runProvenanceMatches[index];
        const resourceName = match?.operator.fontResourceName;
        if (!fontRegistry || !match || !resourceName) return null;
        try {
          return fontRegistry.resolve(match.locatedOperator.resources, resourceName);
        } catch {
          return null;
        }
      }),
    [detectedTextRuns, runProvenanceMatches, fontRegistry],
  );

  const fragmentedRunReconstructions = useMemo(() => {
    const reconstructed = new Map<number, FragmentedRunReconstruction>();
    for (let index = 0; index < detectedTextRuns.length; index += 1) {
      const run = detectedTextRuns[index];
      const match = runProvenanceMatches[index];
      const profile = pageFontProfiles[index];
      if (!match || !profile) continue;
      const fragment = reconstructFragmentedRun({
        fullDetectedText: run.str,
        matched: match.locatedOperator,
        pageOperators,
        resolvedFont: profile.resolvedFont,
      });
      if (fragment) reconstructed.set(index, fragment);
    }
    return reconstructed;
  }, [detectedTextRuns, runProvenanceMatches, pageFontProfiles, pageOperators]);


  // Final write authority is the single-signal arbitration plus one narrowly
  // defined second proof: exact fragmented-run reconstruction. The latter is
  // what preserves the established consecutive Tj/TJ editing path without
  // turning a generic PDF.js/native conflict into an editable run.
  const effectiveTextArbitrations = useMemo(
    () =>
      detectedTextRuns.map((_run, index) => {
        const arbitration =
          textArbitrations[index] ??
          ({
            pdfJsRunIndex: index,
            decision: "view-only",
            nativeSpanKey: null,
            source: "unmatched",
            reason: "Edit authorization evidence has not been established for this run.",
          } satisfies TextEditArbitration);
        return finalizeTextEditArbitration({
          arbitration,
          run: detectedTextRuns[index],
          reconciliation: textReconciliations[index] ?? null,
          fragmentedReconstructionProven: fragmentedRunReconstructions.has(index),
        });
      }),
    [
      detectedTextRuns,
      textArbitrations,
      textReconciliations,
      fragmentedRunReconstructions,
    ],
  );

  const editableRunMatches = useMemo(
    () =>
      detectedTextRuns.map((_run, index): RunMatch => {
        if (effectiveTextArbitrations[index]?.decision !== "editable") return null;
        return runMatches[index] ?? runProvenanceMatches[index] ?? null;
      }),
    [
      detectedTextRuns,
      effectiveTextArbitrations,
      runMatches,
      runProvenanceMatches,
    ],
  );


  // Document → Page → Block → Line → Span model. This is a read-only view
  // over the current page's already-proven low-level detection/matching
  // pipeline; it does not mutate the source PDF or replace the existing
  // content-stream editor.
  const pageTextModel = useMemo(
    () =>
      pagePointSize
        ? buildPdfPageTextModel({
            pageIndex,
            widthPt: pagePointSize.width,
            heightPt: pagePointSize.height,
            runs: detectedTextRuns,
            matches: editableRunMatches,
            fontProfiles: pageFontProfiles,
            fragmentedRunIndices: new Set(fragmentedRunReconstructions.keys()),
          })
        : null,
    [pageIndex, pagePointSize, detectedTextRuns, editableRunMatches, pageFontProfiles, fragmentedRunReconstructions],
  );

  const pageTextCapability = useMemo<PageTextCapabilityClassification>(() => {
    const classifier = new DocumentTextCapabilityClassifier();
    return classifier.classifyPage({
      nativeSpans: nativeTextSpans,
      pdfJsRunCount: pdfJsDetectedRunCount,
      reconciliations: textReconciliations,
    });
  }, [nativeTextSpans, pdfJsDetectedRunCount, textReconciliations]);

  // Development-only fidelity diagnostics. This deliberately never renders
  // debug noise in the normal product and is compiled behind NODE_ENV.
  // In a local development build, the current page report can be inspected
  // or downloaded from DevTools via window.__LUMEO_EDIT_PDF_DIAGNOSTICS__.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !pageTextModel) return;

    const host = window as typeof window & {
      __LUMEO_EDIT_PDF_DIAGNOSTICS__?: {
        currentPage: () => Promise<unknown>;
        downloadCurrentPage: () => Promise<void>;
      };
    };
    let active = true;

    const currentPage = async () => {
      const diagnostics = await import("@/lib/pdf/edit/diagnostics");
      if (!active) throw new Error("Edit PDF diagnostics are no longer active for this page.");
      return diagnostics.buildEditPdfPageDiagnosticReport({
        pageModel: pageTextModel,
        runs: detectedTextRuns,
        matches: runProvenanceMatches,
        fontProfiles: pageFontProfiles,
        nativeSpans: nativeTextSpans,
        reconciliations: textReconciliations,
        arbitrations: effectiveTextArbitrations,
        pageClassification: pageTextCapability,
        pdfJsRunCount: pdfJsDetectedRunCount,
        generatedAtIso: new Date().toISOString(),
      });
    };

    host.__LUMEO_EDIT_PDF_DIAGNOSTICS__ = {
      currentPage,
      downloadCurrentPage: async () => {
        const diagnostics = await import("@/lib/pdf/edit/diagnostics");
        const report = await currentPage();
        diagnostics.downloadEditPdfDiagnosticReport(
          report as import("@/lib/pdf/edit/diagnostics").EditPdfPageDiagnosticReport,
        );
      },
    };

    return () => {
      active = false;
      delete host.__LUMEO_EDIT_PDF_DIAGNOSTICS__;
    };
  }, [
    pageTextModel,
    detectedTextRuns,
    runProvenanceMatches,
    pageFontProfiles,
    nativeTextSpans,
    textReconciliations,
    effectiveTextArbitrations,
    pageTextCapability,
    pdfJsDetectedRunCount,
  ]);

  const textRunSpatialIndex = useMemo(() => {
    if (!pageTextModel) return null;
    return new PercentSpatialIndex(
      pageTextModel.spans.map((span) => ({
        box: span.boundsPct,
        sourceRunIndex: span.sourceRunIndex,
      })),
    );
  }, [pageTextModel]);

  const findDetectedRunIndexAtPoint = useCallback(
    (xPct: number, yPct: number) =>
      textRunSpatialIndex?.topmostAt(xPct, yPct)?.sourceRunIndex ?? -1,
    [textRunSpatialIndex],
  );

  const searchablePageIndexes = useMemo(() => {
    const indexes = new Map(textSearchPageIndexes);
    if (pageTextModel) indexes.set(pageIndex, buildPdfTextSearchPageIndex(pageTextModel));
    return [...indexes.values()].sort((a, b) => a.pageIndex - b.pageIndex);
  }, [textSearchPageIndexes, pageTextModel, pageIndex]);

  const textSearchMatches = useMemo(() => {
    const options = {
      caseSensitive: textSearchCaseSensitive,
      wholeWord: textSearchWholeWord,
    };
    if (!textSearchQuery.trim()) return [];
    if (textSearchScope === "page") {
      return pageTextModel
        ? searchPdfPageText(pageTextModel, textSearchQuery, options)
        : [];
    }
    return searchPdfDocumentIndex(searchablePageIndexes, textSearchQuery, options);
  }, [
    textSearchQuery,
    textSearchScope,
    textSearchCaseSensitive,
    textSearchWholeWord,
    pageTextModel,
    searchablePageIndexes,
  ]);

  const normalizedTextSearchIndex =
    textSearchMatches.length === 0
      ? -1
      : Math.min(
          textSearchActiveIndex < 0 ? 0 : textSearchActiveIndex,
          textSearchMatches.length - 1,
        );
  const activeTextSearchMatch: PdfTextSearchMatch | null =
    normalizedTextSearchIndex >= 0
      ? textSearchMatches[normalizedTextSearchIndex] ?? null
      : null;
  const activeTextSearchReplacementPlan = useMemo(
    () =>
      pageTextModel && activeTextSearchMatch?.pageIndex === pageIndex
        ? replacementTextForSearchMatch(
            pageTextModel,
            activeTextSearchMatch,
            textSearchReplacement,
          )
        : null,
    [pageTextModel, activeTextSearchMatch, pageIndex, textSearchReplacement],
  );
  const currentPageTextSearchMatches = useMemo(
    () => textSearchMatches.filter((match) => match.pageIndex === pageIndex),
    [textSearchMatches, pageIndex],
  );

  useEffect(() => {
    if (
      !pdf ||
      !textSearchOpen ||
      textSearchScope !== "document" ||
      !textSearchQuery.trim() ||
      !pdfJsDocRef.current
    ) {
      return;
    }

    const doc = pdfJsDocRef.current;
    const generation = textSearchBuildGenerationRef.current;
    const missingPages = Array.from({ length: pdf.pageCount }, (_, index) => index).filter(
      (index) => index !== pageIndex && !textSearchPageIndexesRef.current.has(index),
    );
    if (missingPages.length === 0) return;

    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled || generation !== textSearchBuildGenerationRef.current) return;
      setTextSearchIndexBusy(true);

      let cursor = 0;
      let completedSincePublish = 0;
      const worker = async () => {
        while (!cancelled && generation === textSearchBuildGenerationRef.current) {
          const current = cursor;
          cursor += 1;
          if (current >= missingPages.length) return;
          const targetPageIndex = missingPages[current];

          let backgroundPage: PDFPageProxy | null = null;
          try {
            backgroundPage = await doc.getPage(targetPageIndex + 1);
            const viewport = backgroundPage.getViewport({ scale: 1 });
            const content = await withPageTimeout(
              backgroundPage.getTextContent(),
              targetPageIndex + 1,
              PAGE_RENDER_TIMEOUT_MS,
              "extract text from",
            );
            if (cancelled || generation !== textSearchBuildGenerationRef.current) return;
            const runs = textRunsFromContent(
              content.items as never,
              viewport.transform,
              viewport.width,
              viewport.height,
              content.styles as never,
            );
            const model = buildPdfPageTextModel({
              pageIndex: targetPageIndex,
              widthPt: viewport.width,
              heightPt: viewport.height,
              runs,
              matches: runs.map(() => null),
            });
            textSearchPageIndexesRef.current.set(
              targetPageIndex,
              buildPdfTextSearchPageIndex(model),
            );
            completedSincePublish += 1;
            if (completedSincePublish >= 4) {
              completedSincePublish = 0;
              setTextSearchPageIndexes(new Map(textSearchPageIndexesRef.current));
            }
          } catch {
            // Search is best-effort per page. One pathological page should
            // not block searching every other page or the core editor.
          } finally {
            // Background indexing needs text geometry only. Release pdf.js
            // page-level font/image/operator caches immediately instead of
            // retaining resources for up to the full 500-page upload limit.
            if (targetPageIndex !== pageIndex) backgroundPage?.cleanup();
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(2, missingPages.length) },
          () => worker(),
        ),
      );
      if (cancelled || generation !== textSearchBuildGenerationRef.current) return;
      setTextSearchPageIndexes(new Map(textSearchPageIndexesRef.current));
      setTextSearchIndexBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pdf,
    pageIndex,
    docReady,
    textSearchOpen,
    textSearchScope,
    textSearchQuery,
  ]);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "edit" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
      void (pendingInitialDocRef.current?.doc as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | undefined)?.destroy?.();
    };
  }, []);

  // Same cleanup an unmount already does, plus a full reset of every piece
  // of state a new upload doesn't already reinitialize -- returns to the
  // upload screen ready for a different file immediately.
  function resetTool() {
    if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    pageImageUrlRef.current = "";
    downloadUrlRef.current = "";
    void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    pdfJsDocRef.current = null;
    setDocReady(0);
    if (pendingInitialDocRef.current) {
      void (pendingInitialDocRef.current.doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
      pendingInitialDocRef.current = null;
    }
    pdfLibDocRef.current = null;
    setPdfLibDoc(null);
    setPdfMeta(null);
    setPageIndex(0);
    setPageImageUrl("");
    setPageDisplaySize(null);
    setPagePointSize(null);
    setError("");
    setOriginalBytes(null);
    resetHistory({ elements: [], pdfBytes: new ArrayBuffer(0), session: createPdfEditSession(0) });
    setSelectedId(null);
    setDetectedTextRuns([]);
    setRunMatches([]);
    setRunProvenanceMatches([]);
    setNativeTextSpans([]);
    setTextReconciliations([]);
    setTextArbitrations([]);
    setPdfJsDetectedRunCount(0);
    setPageOperators([]);
    resetNativeTextInteraction();
    setPrivacyShieldMatches([]);
    setTextDetectionReady(false);
    setTextDetectionRevision(null);
    setRestyleKeptOriginalText(false);
    setTextSearchOpen(false);
    setTextSearchQuery("");
    setTextSearchReplacement("");
    setTextSearchScope("document");
    setTextSearchCaseSensitive(false);
    setTextSearchWholeWord(false);
    setTextSearchActiveIndex(-1);
    setTextSearchIndexBusy(false);
    textSearchPageIndexesRef.current.clear();
    setTextSearchPageIndexes(new Map());
    textSearchBuildGenerationRef.current += 1;
    runOverlayNodesRef.current.clear();
    setActiveTool("select");
    setZoom(1);
    setDownloadUrl("");
    setOutputName("lumeo-edited.pdf");
  }

  // Opens the source PDF via pdfjs once per uploaded file, kept open for the
  // per-page preview effect below to reuse (no re-parsing on page turns).
  useEffect(() => {
    let cancelled = false;
    const searchGeneration = ++textSearchBuildGenerationRef.current;
    textSearchPageIndexesRef.current.clear();
    void Promise.resolve().then(() => {
      if (cancelled || searchGeneration !== textSearchBuildGenerationRef.current) return;
      setTextSearchPageIndexes(new Map());
      setTextSearchIndexBusy(false);
      setTextSearchActiveIndex(-1);
    });
    void (async () => {
      const previousDoc = pdfJsDocRef.current;
      pdfJsDocRef.current = null;
      setDocReady(0);
      if (previousDoc) void (previousDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      if (!pdf) return;

      // Reuse the doc addFile() already opened (to read the page count
      // before pdf state existed) instead of parsing the same bytes again --
      // only valid when it was opened from this exact ArrayBuffer instance.
      // Page-structure operations (reorder/delete/merge) change how many
      // pages the live document has, and so does undoing one. pdfMeta's
      // count is set once at upload, so it is re-synced from the document
      // that was actually opened -- deriving it here rather than at each
      // call site means undo/redo cannot leave it stale, since this effect
      // re-runs on every pdfBytes change.
      const adopt = (doc: PDFDocumentProxy) => {
        pdfJsDocRef.current = doc;
        setDocReady((current) => current + 1);
        setPdfMeta((current) => (current && current.pageCount !== doc.numPages ? { ...current, pageCount: doc.numPages } : current));
      };

      const pending = pendingInitialDocRef.current;
      if (pending && pending.bytes === pdf.bytes) {
        pendingInitialDocRef.current = null;
        adopt(pending.doc);
        return;
      }
      if (pending) {
        pendingInitialDocRef.current = null;
        void (pending.doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
      }

      try {
        const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(pdf.bytes)));
        if (cancelled) {
          void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
          return;
        }
        adopt(doc);
      } catch {
        setError("This file could not be read for preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Phase 9.1: mirrors the pdfjs load effect immediately above, for the
  // separate pdf-lib PDFDocument the edit backend needs -- see pdfLibDocRef's
  // own doc comment. Best-effort: a failure here only disables in-place
  // text editing (runMatches stays empty), it must never block the
  // existing pdfjs-based preview/overlay-element workflow from working.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      pdfLibDocRef.current = null;
      setPdfLibDoc(null);
      editEngineRef.current = null;
      setEditEngine(null);
      if (!pdf) return;
      try {
        const engine = await loadEditEngine();
        if (cancelled) return;
        editEngineRef.current = engine;
        setEditEngine(engine);
        const doc = await engine.PDFDocument.load(copyArrayBuffer(pdf.bytes));
        if (cancelled) return;
        pdfLibDocRef.current = doc;
        setPdfLibDoc(doc);
      } catch (engineError) {
        // Keep preview/overlay editing available, but do not make a browser-
        // runtime compatibility failure invisible. This contains no document
        // bytes or secrets; it records only the exception type/message.
        console.error(
          "[Edit PDF] in-place edit engine failed to load",
          engineError instanceof Error
            ? { name: engineError.name, message: engineError.message }
            : { message: String(engineError) },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // EFFECT A -- page identity. Everything that must be forgotten when the
  // user is looking at a DIFFERENT page (or a newly-edited copy of this
  // one), and nothing else.
  //
  // Split out of the render effect for high zoom: rasterizing now re-runs
  // whenever the raster scale changes, and a zoom step must never discard
  // the user's selection or the replacement text they are halfway through
  // typing. Keying this on page identity alone is what guarantees that.
  //
  // Owns pageLoading deliberately. If the raster effect below raised the
  // loading flag on every re-render, a zoom step would unmount the whole
  // stage (the loading-vs-stage ternary swaps them), destroying the inline
  // editor and the stage's own ResizeObserver mid-interaction. Raising it
  // only on a page change, and lowering it when the raster lands, means a
  // re-raster swaps the image underneath a stage that never goes away.
  //
  // The setState calls below trip react-hooks/set-state-in-effect, which
  // can't distinguish this ("reset state when identity changes") from an
  // accidental render loop. React's two sanctioned alternatives don't fit:
  // a `key` prop would mean restructuring this component around a remount,
  // throwing away the loaded pdfjs/pdf-lib documents (the expensive part),
  // and setting during render would put a dozen setState calls in the
  // render path. The dependency array is page identity alone, so this runs
  // once per page change and cannot loop. The previous version passed lint
  // only because the identical calls sat inside an async IIFE -- deferring
  // them by a microtask, which risks a frame rendering the new page against
  // the old page's selection.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!pdf) return;
    setPageLoading(true);
    // Phase 30: a page-render failure/timeout sets `error`, but nothing
    // in this reset block ever cleared it -- so navigating to (or
    // undoing/redoing into) a DIFFERENT page while a stale error from a
    // previous one was showing left that stale message on screen for the
    // entire duration of the new page's own render attempt, since the
    // loading-vs-error ternary (Phase 28) deliberately gives error
    // priority over the loading skeleton. Confirmed live: Next Page
    // after a failed page 1 showed page 1's error immediately, before
    // page 2's own render had even had a chance to succeed or fail.
    setError("");
    resetNativeTextInteraction();
    // Deliberately NOT cleared by selectTextRun: restyleSelectedRun sets this
    // and then immediately deselects, so clearing on deselect would hide the
    // notice the instant it appeared. Page identity is the right lifetime.
    setRestyleKeptOriginalText(false);
    runOverlayNodesRef.current.clear();
    // Cleared here (rather than left stale) so the operator-matching
    // effect never briefly pairs a new page's detected runs with the
    // previous page's matches while it's catching up.
    setRunMatches([]);
    setRunProvenanceMatches([]);
    setTextArbitrations([]);
    setPageOperators([]);
    setPrivacyShieldMatches([]);
    setTextDetectionReady(false);
    setTextDetectionRevision(null);
    // Cleared so the raster effect's "is this just a re-sharpen?" check is
    // exact. This effect runs whenever the PAGE or the DOCUMENT BYTES
    // change, so afterwards any render failure is a genuine failure to draw
    // content the user hasn't seen yet, and must be surfaced. Without this,
    // a failed re-raster right after a text edit would silently leave the
    // PRE-edit image on screen -- strictly worse than an error, because it
    // looks like the edit didn't apply.
    renderedPageRef.current = null;
  }, [pdf, pageIndex, resetNativeTextInteraction]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // EFFECT B -- rasterize. The only expensive step, and the only one keyed
  // on rasterScale. Deliberately NOT keyed on pdfLibDoc -- that doc loads
  // independently and often arrives after this one has already rasterized
  // the page; re-running the canvas render/toBlob work just because
  // pdfLibDoc changed would be pure waste. Operator-matching, which does
  // need pdfLibDoc, is its own effect further below.
  useEffect(() => {
    if (!pdf || !pdfJsDocRef.current) return;
    const doc = pdfJsDocRef.current;
    let cancelled = false;
    // Phase 9.2 hardening: pdfjs's RenderTask is never awaited to
    // completion if this effect is cleaned up mid-render (e.g. rapid
    // Undo/Redo or page changes) -- explicitly cancelling it on cleanup
    // (rather than only setting `cancelled`) avoids leaving an orphaned
    // render task racing a new one on the next effect run.
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        const pointViewport = page.getViewport({ scale: 1 });
        // The raster scale is now an input (see rasterScale's own comment),
        // not a constant derived here -- it rises with zoom so high-zoom
        // text stays sharp instead of being a stretched low-res bitmap.
        // Both clamps still apply on top of it, so an oversized MediaBox or
        // a scale the pixel budget can't afford is reduced exactly as
        // before.
        const dimensionScale = clampRenderScaleToPixelBudget(
          clampRenderScaleToMaxDimension(rasterScale, pointViewport.width, pointViewport.height, MAX_CANVAS_DIMENSION_PX),
          pointViewport.width,
          pointViewport.height,
          MAX_CANVAS_TOTAL_PIXELS,
        );
        const viewport = page.getViewport({ scale: dimensionScale });
        pageAndViewportRef.current = { pageIndex, page, viewport };
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          if (!cancelled) setError("This page is too large to preview in this browser. Try a different page or a smaller file.");
          return;
        }
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderPageWithTimeout(renderTask, pageIndex + 1);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (cancelled || !blob) return;
        // Revoke the PREVIOUS url only after the new one is in state.
        // Revoking first (as this used to) blanks the <img> for a frame,
        // which was invisible when a re-render only ever happened on a page
        // change -- but is a visible flash now that a zoom step re-renders
        // the same page in place.
        const previousUrl = pageImageUrlRef.current;
        const url = URL.createObjectURL(blob);
        pageImageUrlRef.current = url;
        setPageImageUrl(url);
        setPageDisplaySize({ width: canvas.width, height: canvas.height });
        setPagePointSize({ width: pointViewport.width, height: pointViewport.height });
        renderedPageRef.current = pageIndex;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        // Phase 16: the rendered page image is fully usable right here --
        // flip pageLoading off NOW instead of waiting for the finally block
        // below, which previously only ran after getTextContent() below it
        // ALSO finished. That meant the loading skeleton kept showing (and
        // the page stayed non-interactive) for the full duration of text
        // detection even though the image had been ready for a while --
        // on a text-heavy/complex-font page, getTextContent can itself take
        // real time, so this was pure added perceived latency for a
        // secondary, best-effort feature (the select tool's text
        // highlighting) that has no bearing on whether the page can be
        // viewed, zoomed, or have Text/Draw/Shape/Whiteout elements placed
        // on it. Detected runs still populate a moment later and the select
        // tool's highlighting appears as soon as they do -- nothing about
        // detection itself changed, only when the page stops being "loading".
        if (!cancelled) setPageLoading(false);
      } catch {
        // A cancelled render's promise rejects (RenderingCancelledException)
        // -- that's expected teardown, not a real preview failure.
        //
        // A failed RE-raster must not destroy a page that is already on
        // screen and working. Since zoom now re-rasterizes, this branch can
        // be reached while the user is looking at a perfectly good image;
        // surfacing the error would swap the whole stage out for an error
        // message (the render branch gives error priority) and throw away
        // their view, their selection, and their in-progress edit -- over a
        // failed attempt to draw the SAME page slightly sharper. Keeping the
        // existing raster degrades to "stayed at the previous sharpness,"
        // which is invisible and harmless. Proven live, not theorised: the
        // first re-raster to fail did exactly this, replacing a working page
        // with "This page could not be previewed."
        //
        // No retry loop: rasterScale is unchanged by the failure, so this
        // effect will not re-run until something else actually changes.
        const isRefreshOfVisiblePage = renderedPageRef.current === pageIndex && pageImageUrlRef.current !== "";
        if (!cancelled && !isRefreshOfVisiblePage) {
          setError("This page could not be previewed. Try a different page.");
        }
      } finally {
        // Safety net for every path that returns/throws BEFORE the image is
        // ready (context allocation failure, render failure/timeout, a
        // cancelled render) -- the early setPageLoading(false) above only
        // covers the success path past that point. Calling it again here on
        // that same success path is a harmless no-op (state already false).
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageIndex, docReady, rasterScale]);

  // EFFECT C -- detect this page's text runs. Best-effort: a page's
  // existing text is a bonus (it lets the select tool highlight and edit
  // it), never a requirement -- a failure here must not block the preview
  // or the export.
  //
  // Deliberately NOT keyed on rasterScale. getTextContent()'s output is a
  // property of the document, and textRunsFromContent is fed the page's own
  // scale-1 viewport, so every run this produces is identical at every
  // raster scale (locked in by test). Re-running it per zoom step would
  // burn a real amount of time on a text-heavy page and, worse, churn
  // detectedTextRuns -- which the operator-matching effect depends on, so
  // every RunMatch the UI needs would be discarded and rebuilt for a result
  // that cannot differ.
  useEffect(() => {
    if (!pdf || !pdfJsDocRef.current) return;
    const doc = pdfJsDocRef.current;
    let cancelled = false;

    void (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        const pointViewport = page.getViewport({ scale: 1 });
        const content = await withPageTimeout(page.getTextContent(), pageIndex + 1, PAGE_RENDER_TIMEOUT_MS, "extract text from");
        if (cancelled) return;
        // Point space, never the raster viewport -- see
        // lib/pdf/edit/textRuns.ts's DetectedTextRun.fontSizePt.
        const runs = textRunsFromContent(
          content.items as never,
          pointViewport.transform,
          pointViewport.width,
          pointViewport.height,
          content.styles as never,
        );
        setPdfJsDetectedRunCount(runs.length);
        setDetectedTextRuns(runs);
      } catch {
        if (!cancelled) {
          setPdfJsDetectedRunCount(0);
          setDetectedTextRuns([]);
        }
      } finally {
        // "Ready" is meaningful only together with the exact document/page
        // revision that produced the result. This stamp makes stale results
        // fail closed during history/document transitions.
        if (!cancelled) {
          setTextDetectionRevision({ bytes: pdf.bytes, pageIndex });
          setTextDetectionReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, docReady]);

  // What the raster scale SHOULD be for how large the page is currently
  // being shown. stageWidthPx already includes zoom (the zoom wrapper sets
  // the stage's width), so this needs no separate zoom term.
  //
  // computeAdaptiveRenderScale is existing, already-tested infrastructure
  // that was written for exactly this and left unwired because verifying it
  // needed a real device and a compositing browser (see its own doc
  // comment). It caps devicePixelRatio at 2, never returns below baseScale,
  // and falls back to precisely today's fixed scale when the stage hasn't
  // been measured -- so an unmeasured stage renders exactly as before.
  //
  // Quantised so a zoom drag lands on a handful of distinct rasters instead
  // of a new one per wheel tick, and rounded UP so quantisation can only
  // sharpen. The pixel budget is applied last, inside the raster effect,
  // and always wins.
  const targetRasterScale = useMemo(() => {
    if (!pagePointSize || pagePointSize.width <= 0) return PAGE_RENDER_SCALE;
    const adaptive = computeAdaptiveRenderScale({
      pageWidthPt: pagePointSize.width,
      pageHeightPt: pagePointSize.height,
      cssDisplayWidthPx: stageWidthPx,
      devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio,
      baseScale: PAGE_RENDER_SCALE,
      maxDimensionPx: MAX_CANVAS_DIMENSION_PX,
      maxTotalPixels: MAX_CANVAS_TOTAL_PIXELS,
    });
    return quantizeRenderScale(adaptive, RASTER_SCALE_STEPS);
  }, [pagePointSize, stageWidthPx]);

  // Debounce: a zoom gesture walks targetRasterScale through several values
  // in quick succession, and each committed change re-rasterizes the whole
  // page. Waiting for it to settle turns a drag into one render.
  useEffect(() => {
    if (targetRasterScale === rasterScale) return;
    const id = window.setTimeout(() => setRasterScale(targetRasterScale), RASTER_SCALE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [targetRasterScale, rasterScale]);

  // Tracks the stage's displayed CSS width (see stageWidthPx's own comment
  // for why it can't be derived). Keyed on pageImageUrl, not on zoom: the
  // stage element is only mounted once a page image exists, so this has to
  // re-attach whenever that element is created or replaced -- and once
  // attached, ResizeObserver already reports every later width change
  // (zoom, window resize, layout shifts) without this effect re-running.
  //
  // Skips redundant state writes: ResizeObserver fires on sub-pixel changes,
  // and re-rendering the whole workspace for a 0.2px difference would be
  // pure churn while someone drags a zoom slider.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;

    const measure = (width: number) => {
      setStageWidthPx((current) => (current !== null && Math.abs(current - width) < 0.5 ? current : width));
    };
    measure(stage.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [pageImageUrl]);

  // Phase 9.1: matches each run the effect above detected to its
  // content-stream operator (lib/pdf/edit/matchTextRun.ts), so the select
  // tool can show which runs are actually editable. Split into its own
  // effect (not keyed on docReady/canvas render) because pdfLibDoc loads
  // independently and often arrives after the canvas above has already
  // rasterized -- this only needs a cheap, already-cached page/viewport
  // lookup, not another render pass. Best-effort throughout: a failure here
  // only disables in-place editing, never the read-only preview/highlight
  // this depends on.
  useEffect(() => {
    if (!pdf || !pdfJsDocRef.current || !pdfLibDoc || !pagePointSize || !fontRegistry) return;
    const doc = pdfJsDocRef.current;
    const runs = detectedTextRuns;
    let cancelled = false;

    void (async () => {
      try {
        // Matching happens in the SAME point space detection used (see the
        // render effect's own comment). matchTextRun.ts is scale-relative
        // by construction -- it converts a run's percentages through
        // whatever page dimensions it's handed and computes operator
        // origins through whatever viewport transform it's handed -- so it
        // is correct at any scale provided both sides agree. Point space is
        // the one choice that never changes, which is what keeps this
        // effect (and every match it produces) independent of the raster
        // scale zoom is about to start varying.
        //
        // Reuses the render effect's already-fetched page for this same
        // pageIndex rather than re-fetching -- see pageAndViewportRef's own
        // doc comment. getViewport({ scale: 1 }) on an already-loaded page
        // is pure arithmetic, no I/O and no rasterization.
        const cached = pageAndViewportRef.current;
        const page =
          cached && cached.pageIndex === pageIndex ? cached.page : await doc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 1 });
        if (cancelled || !pdfLibDocRef.current || !editEngineRef.current) return;
        const located = editEngineRef.current.collectPageTextOperators(pdfLibDocRef.current, pageIndex);
        if (cancelled) return;
        setPageOperators(located);

        const nativeSpans = buildNativeContentStreamSpans({
          operators: located,
          viewportTransform: viewport.transform,
          pageWidthPt: pagePointSize.width,
          pageHeightPt: pagePointSize.height,
          resolveFontProfile: (locatedOperator) => {
            const resourceName = locatedOperator.operator.fontResourceName;
            if (!resourceName) return null;
            try {
              return fontRegistry.resolve(locatedOperator.resources, resourceName);
            } catch {
              return null;
            }
          },
        });
        setNativeTextSpans(nativeSpans);

        // If PDF.js exposes no text at all, retain the native parser as an
        // independent detector. Only simple runs with complete decoding,
        // deterministic metrics, descriptor ascent/descent and safe geometry
        // are synthesized into clickable runs; every other native span stays
        // diagnostic/capability evidence rather than being faked as editable.
        if (runs.length === 0) {
          const nativeRuns = nativeDetectedRuns(nativeSpans);
          setTextReconciliations([]);
          setTextArbitrations([]);
          setRunMatches([]);
          setRunProvenanceMatches([]);
          if (nativeRuns.length > 0) setDetectedTextRuns(nativeRuns);
          return;
        }

        const flatOperators = located.map((item) => item.operator);
        const operatorIndex = buildOperatorSpatialIndex(flatOperators, viewport.transform);
        const locatedByOperator = new Map(located.map((item) => [item.operator, item] as const));
        const nativeByKey = new Map(nativeSpans.map((span) => [span.key, span] as const));

        const legacyMatches = runs.map((run): RunMatch => {
          if (run.nativeSourceKey) {
            const native = nativeByKey.get(run.nativeSourceKey);
            return native
              ? { locatedOperator: native.locatedOperator, operator: native.locatedOperator.operator }
              : null;
          }
          const matchedOperator = matchDetectedRunToOperatorIndexed(
            run,
            pagePointSize.width,
            pagePointSize.height,
            operatorIndex,
          );
          if (!matchedOperator) return null;
          const locatedOperator = locatedByOperator.get(matchedOperator);
          return locatedOperator ? { locatedOperator, operator: matchedOperator } : null;
        });

        const reconciliations = reconcileTextSignals({
          runs,
          legacyMatches,
          nativeSpans,
          viewportTransform: viewport.transform,
        });
        setTextReconciliations(reconciliations);

        // Keep source provenance and write authority as two separate layers.
        // A stronger evidence match may replace a bad positional legacy match
        // for provenance. Otherwise the legacy source remains available for
        // fragmented-run reconstruction/diagnostics only.
        const provenanceMatches = runs.map((run, index): RunMatch => {
          if (run.nativeSourceKey) {
            const native = nativeByKey.get(run.nativeSourceKey);
            return native
              ? { locatedOperator: native.locatedOperator, operator: native.locatedOperator.operator }
              : null;
          }

          const legacy = legacyMatches[index];
          const reconciliation = reconciliations[index];
          if (
            reconciliation?.confidence === "high" &&
            reconciliation.nativeSpanKey &&
            reconciliation.source === "evidence-match"
          ) {
            const evidence = nativeByKey.get(reconciliation.nativeSpanKey);
            if (evidence) {
              return {
                locatedOperator: evidence.locatedOperator,
                operator: evidence.locatedOperator.operator,
              };
            }
          }
          return legacy;
        });

        const arbitrations = buildTextEditArbitrations({
          runs,
          reconciliations,
          nativeSpans,
        });
        const authorizedMatches = arbitrations.map((arbitration): RunMatch => {
          if (arbitration.decision !== "editable" || !arbitration.nativeSpanKey) {
            return null;
          }
          const native = nativeByKey.get(arbitration.nativeSpanKey);
          return native
            ? { locatedOperator: native.locatedOperator, operator: native.locatedOperator.operator }
            : null;
        });

        setRunProvenanceMatches(provenanceMatches);
        setTextArbitrations(arbitrations);
        setRunMatches(authorizedMatches);
      } catch (matchError) {
        if (!cancelled) {
          console.error(
            "[Edit PDF] content-stream matching failed",
            matchError instanceof Error
              ? { name: matchError.name, message: matchError.message }
              : { message: String(matchError) },
          );
          setRunMatches([]);
          setRunProvenanceMatches([]);
          setNativeTextSpans([]);
          setTextReconciliations([]);
          setTextArbitrations([]);
          setPageOperators([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Keyed on pagePointSize, NOT pageDisplaySize: the page's point size is
    // a property of the document and changes only when the page does, while
    // the raster size changes whenever the page is re-rasterized. Depending
    // on the raster size would re-run this whole match (and reset every
    // RunMatch the UI relies on) on every future zoom-driven re-render, for
    // a result that is by construction identical.
  }, [pdf, pdfLibDoc, pageIndex, detectedTextRuns, pagePointSize, fontRegistry]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setTextSearchOpen(true);
        requestAnimationFrame(() => textSearchInputRef.current?.focus());
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        setElements((current) => deleteElement(current, selectedId));
        setSelectedId(null);
      } else if (command && (event.key === "=" || event.key === "+")) {
        // Phase 11: desktop zoom shortcuts (Ctrl/Cmd +/-/0), matching the
        // Acrobat/Chrome-PDF-viewer convention -- same clamp bounds and step
        // the on-screen -/+/Fit buttons already use.
        event.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, z + 0.1));
      } else if (command && event.key === "-") {
        event.preventDefault();
        setZoom((z) => Math.max(MIN_ZOOM, z - 0.1));
      } else if (command && event.key === "0") {
        event.preventDefault();
        setZoom(1);
      } else if (!command && pdfMeta && (event.key === "PageDown" || event.key === "PageUp")) {
        // Phase 11: PageUp/PageDown page navigation -- the Acrobat
        // convention. Reads pdfMeta.pageCount (not the `pdf` useMemo, which
        // is a NEW object on every text edit/undo/redo -- putting it in this
        // effect's deps would re-bind the listener constantly); pdfMeta only
        // changes on upload/reset, so it's a stable, correct dependency.
        event.preventDefault();
        if (event.key === "PageDown") setPageIndex((c) => Math.min(pdfMeta.pageCount - 1, c + 1));
        else setPageIndex((c) => Math.max(0, c - 1));
      } else if (!command && !event.shiftKey && !event.altKey && event.key in TOOL_SHORTCUT_KEYS) {
        // Phase 13: unmodified number-key tool switching (1-5), the
        // Figma/Illustrator convention for single-key tool shortcuts --
        // matching TOOL_SHORTCUT_KEYS' own doc comment near the tool array
        // below. Safe from colliding with typing: isTypingTarget above
        // already excludes any focused input/textarea/contentEditable,
        // including both the sidebar and Phase 11's inline edit fields.
        event.preventDefault();
        setActiveTool(TOOL_SHORTCUT_KEYS[event.key as keyof typeof TOOL_SHORTCUT_KEYS]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo, selectedId, setElements, pdfMeta]);

  // Phase 11: "click existing text, caret appears, user types immediately."
  // Focuses (and selects the full contents of) the inline on-page edit
  // input as soon as it appears for a newly-selected single run, so the
  // user's next keystroke replaces the text with no extra click into a
  // sidebar field first.
  useEffect(() => {
    if (activeTool === "select" && selectedRunIndices.length === 1 && editableRunMatches[selectedRunIndices[0]]) {
      inlineEditInputRef.current?.focus();
      inlineEditInputRef.current?.select();
    }
  }, [activeTool, selectedRunIndices, editableRunMatches]);

  // Phase 20 (D): scrollIntoView (Phase 15, above/selectTextRunAndFocus)
  // only runs ONCE, synchronously at the moment of tap -- it can't account
  // for the keyboard's own opening ANIMATION, which on iOS Safari resizes
  // the visual viewport gradually over the following few hundred ms, not
  // instantly. If the keyboard finishes opening after that one scroll
  // already ran, it can still end up covering the input/toolbar. This
  // effect supplements (does not replace) that fix: while the inline
  // editor is open, it listens for visualViewport's own resize event
  // (fires as the keyboard animates) and re-checks whether the input is
  // still within the now-current visible bounds, nudging it back into view
  // if not. Feature-detected -- browsers without visualViewport support
  // simply don't get this extra correction and fall back to the Phase 15
  // scrollIntoView-at-focus-time behavior alone, unchanged.
  useEffect(() => {
    const isEditorOpen = activeTool === "select" && selectedRunIndices.length === 1 && Boolean(editableRunMatches[selectedRunIndices[0]]);
    if (!isEditorOpen || typeof window === "undefined" || !window.visualViewport) return;

    const viewport = window.visualViewport;
    function handleViewportResize() {
      const input = inlineEditInputRef.current;
      if (!input || !viewport) return;
      const rect = input.getBoundingClientRect();
      const visibleBottom = viewport.offsetTop + viewport.height;
      const visibleTop = viewport.offsetTop;
      if (rect.bottom > visibleBottom || rect.top < visibleTop) {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        input.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
    viewport.addEventListener("resize", handleViewportResize);
    return () => viewport.removeEventListener("resize", handleViewportResize);
  }, [activeTool, selectedRunIndices, editableRunMatches]);


  async function addFile(files: FileList | File[]) {
    setError("");
    const file = Array.from(files)[0];
    if (!file) return;

    if (!isPdfNamedFile(file)) {
      setError("Please choose a PDF file.");
      return;
    }
    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        setError("This doesn't look like a valid PDF file.");
        return;
      }
      // Open via pdfjs once, up front, to read the page count for the
      // page-count limit check below (pdf state doesn't exist yet to drive
      // the preview-load effect). Stashed in pendingInitialDocRef so that
      // effect reuses this exact doc instead of re-parsing the same bytes.
      if (pendingInitialDocRef.current) {
        void (pendingInitialDocRef.current.doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        pendingInitialDocRef.current = null;
      }
      const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(bytes)));
      const pageCount = doc.numPages;

      const pageCountError = checkPdfPageCount(pageCount);
      if (pageCountError) {
        void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        setError(pageCountError);
        return;
      }

      pendingInitialDocRef.current = { bytes, doc };
      setPdfMeta({ file, pageCount });
      setPageIndex(0);
      setOriginalBytes(bytes);
      resetHistory({ elements: [], pdfBytes: bytes, session: createPdfEditSession(bytes.byteLength) });
      setSelectedId(null);
      setDownloadUrl("");
    } catch (uploadError) {
      const message =
        uploadError instanceof Error && /password|encrypt/i.test(uploadError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
    }
  }

  function nextElementId() {
    elementIdCounterRef.current += 1;
    return `el-${elementIdCounterRef.current}`;
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (activeTool === "draw") return;
    // Phase 11: Whiteout is fully handled by the drag-to-create pointer
    // gesture below (handleWhiteoutPointerDown/Move/Up), including the
    // simple-tap-with-no-drag fallback -- handling it here too would create
    // a SECOND element, since a plain tap fires both a pointerup and a click.
    if (activeTool === "whiteout") return;
    // Inline editor controls live inside the stage. Native <button>/<input>
    // elements do not necessarily carry an explicit role attribute, and
    // desktop WebKit can deliver the stage click after scrolling a floating
    // control into view. Treat every native interactive descendant as UI,
    // never as a click on the PDF canvas that should clear selection.
    if (
      (event.target as HTMLElement).closest(
        'button, input, textarea, select, [contenteditable="true"], [role="button"]',
      )
    ) {
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const point =
      pageCoordinateMapper?.screenPointToPercentPoint(event.clientX, event.clientY, rect) ?? {
        xPct: ((event.clientX - rect.left) / rect.width) * 100,
        yPct: ((event.clientY - rect.top) / rect.height) * 100,
      };

    if (activeTool === "select") {
      const runIndex = findDetectedRunIndexAtPoint(point.xPct, point.yPct);
      selectTextRunAndFocus(runIndex >= 0 ? runIndex : null, event.shiftKey);
      return;
    }

    const xPct = point.xPct;
    const yPct = point.yPct;
    const id = nextElementId();

    let element: EditElement;
    if (activeTool === "text") element = createTextElement(id, pageIndex, xPct, yPct);
    else element = createShapeElement(id, pageIndex, xPct, yPct, shapeKind);

    setElements((current) => [...current, element]);
    setSelectedId(id);
    setActiveTool("select");
  }

  // Phase 11: Whiteout redesign -- drag directly over the text/content you
  // want to hide, instead of click-to-place-a-default-box-then-resize.
  // Mirrors EditElementView's own drag pattern (Phase 10.3): the stage rect
  // is measured ONCE at gesture start and reused for every pointermove, not
  // re-queried per event, to avoid the write-then-forced-layout-read
  // thrashing that fix addressed. WHITEOUT_DRAG_THRESHOLD_PCT distinguishes
  // an intentional drag from a simple tap (mobile-friendly: a tap still
  // places a sensible default-sized box, exactly like every other tool).
  const WHITEOUT_DRAG_THRESHOLD_PCT = 1.5;

  function handleWhiteoutPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (activeTool !== "whiteout") return;
    if ((event.target as HTMLElement).closest('[role="button"]')) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point =
      pageCoordinateMapper?.screenPointToPercentPoint(event.clientX, event.clientY, rect) ?? {
        xPct: ((event.clientX - rect.left) / rect.width) * 100,
        yPct: ((event.clientY - rect.top) / rect.height) * 100,
      };
    const startXPct = clampPct(point.xPct);
    const startYPct = clampPct(point.yPct);
    whiteoutGestureRef.current = { startXPct, startYPct, rect };
    setWhiteoutDraft({ xPct: startXPct, yPct: startYPct, widthPct: 0, heightPct: 0, snapped: false });
  }

  function handleWhiteoutPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = whiteoutGestureRef.current;
    if (!gesture) return;
    const point =
      pageCoordinateMapper?.screenPointToPercentPoint(event.clientX, event.clientY, gesture.rect) ?? {
        xPct: ((event.clientX - gesture.rect.left) / gesture.rect.width) * 100,
        yPct: ((event.clientY - gesture.rect.top) / gesture.rect.height) * 100,
      };
    const xPct = clampPct(point.xPct);
    const yPct = clampPct(point.yPct);

    // Snap-to-text-span through the page spatial index. The resulting source
    // run index still feeds the established whiteout geometry, so this is a
    // performance/architecture improvement rather than a behavior rewrite.
    const hoveredRunIndex = findDetectedRunIndexAtPoint(xPct, yPct);
    const hoveredRun = hoveredRunIndex >= 0 ? detectedTextRuns[hoveredRunIndex] : null;
    if (hoveredRun) {
      setWhiteoutDraft({ xPct: hoveredRun.xPct, yPct: hoveredRun.yPct, widthPct: hoveredRun.widthPct, heightPct: hoveredRun.heightPct, snapped: true });
      return;
    }

    const left = Math.min(gesture.startXPct, xPct);
    const top = Math.min(gesture.startYPct, yPct);
    const width = Math.abs(xPct - gesture.startXPct);
    const height = Math.abs(yPct - gesture.startYPct);
    setWhiteoutDraft({ xPct: left, yPct: top, widthPct: width, heightPct: height, snapped: false });
  }

  function buildDraggedWhiteoutElement(id: string, box: { xPct: number; yPct: number; widthPct: number; heightPct: number }): EditElement {
    return { id, type: "whiteout", pageIndex, xPct: box.xPct, yPct: box.yPct, widthPct: box.widthPct, heightPct: box.heightPct, color: "white" };
  }

  function handleWhiteoutPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    // whiteoutGestureRef only exists to avoid re-querying getBoundingClientRect
    // during pointermove (see its own doc comment) -- pointerup does no rect
    // math, so whiteoutDraft (state, already tracking the current box, set to
    // a zero-size box at the start point on pointerdown) is the only signal
    // needed here for both "was a gesture in progress" and its final geometry.
    whiteoutGestureRef.current = null;
    const draft = whiteoutDraft;
    setWhiteoutDraft(null);
    if (!draft) return;

    const id = nextElementId();
    const element: EditElement =
      draft.widthPct >= WHITEOUT_DRAG_THRESHOLD_PCT || draft.heightPct >= WHITEOUT_DRAG_THRESHOLD_PCT
        ? buildDraggedWhiteoutElement(id, draft)
        : createWhiteoutElement(id, pageIndex, draft.xPct, draft.yPct);

    setElements((current) => [...current, element]);
    setSelectedId(id);
    setActiveTool("select");
  }

  // Privacy Shield: deterministic regex scan (lib/pdf/edit/privacyShield.ts)
  // over the CURRENT page's detectedTextRuns, triggered only by an explicit
  // click -- results are cleared (not re-scanned) on page change or reset,
  // so a stale scan never survives past the page it was taken on.
  // Converts the selected existing text run into a whiteout + editable text
  // box pair (geometry from lib/pdf/edit/restyleRun.ts), then selects the new
  // box so FloatingIsland's inspector opens on it straight away -- the user's
  // next click is already on the formatting controls they came for.
  //
  // Both halves go in through the ordinary element path, so from here on this
  // is indistinguishable from a manually drawn whiteout with a text box on
  // top: same undo (one step, since both are added in a single setElements
  // call), same delete, same export.

  function handlePrivacyShieldScan() {
    setPrivacyShieldMatches(scanForSensitiveInfo(detectedTextRuns));
  }

  function dismissPrivacyShieldMatch(index: number) {
    setPrivacyShieldMatches((current) => current.filter((_, i) => i !== index));
  }

  function applyPrivacyShieldRedactions() {
    setElements((current) => {
      let next = current;
      for (const match of privacyShieldMatches) {
        const id = nextElementId();
        // Black, not white. A white box over text on a white page is
        // indistinguishable from a field that was simply left blank -- a
        // reader cannot tell whether anything was removed, which is the
        // opposite of what a redaction is for. Black is the universal
        // convention precisely because it is unmistakably deliberate.
        //
        // Deliberately NOT a colour/weight match to the surrounding text:
        // a redaction that blends into the document reads as genuine
        // content, so a doctored value could be taken at face value
        // downstream. The manual Whiteout tool keeps its white default --
        // that one exists to cover and correct, a different intent.
        const element = createWhiteoutElement(id, pageIndex, match.run.xPct, match.run.yPct, "black");
        next = [...next, { ...element, widthPct: match.run.widthPct, heightPct: match.run.heightPct }];
      }
      return next;
    });
    setPrivacyShieldMatches([]);
  }

  // Phase 9.2: selects (or deselects, for index null) a detected text run
  // by its index into detectedTextRuns/runMatches -- shared by the stage's
  // click handler, TextRunOverlay's own click/Enter/Space handling, and
  // keyboard navigation, so there is exactly one place that decides what
  // "selecting a run" resets (the in-progress edit draft and any leftover
  // apply error from a previously selected run). `extend` (Shift+click, or
  // Shift+Arrow -- see handleStageKeyDown) grows a CONTIGUOUS range from
  // the last plain-click anchor to `index`, for multi-run editing; a plain
  // click/select always starts a fresh single-run selection and a new
  // anchor. The range is just detectedTextRuns INDICES -- whether it's
  // actually a valid multi-run EDIT (consecutive operators, one font, same
  // content stream) is a separate question, answered by editPreview below,
  // never assumed here.
  function selectTextRun(index: number | null, extend = false) {
    // Closing the editor on mode entry is not enough on its own: a run
    // overlay is still keyboard-focusable, so Enter could reopen the editor
    // underneath the redaction surface and restore exactly the reachable-by-
    // keyboard-only state that was just removed. Deselection still works.
    if (redactMode && index !== null) return;
    // Phase 31: text-run selection and placed-element selection (selectedId)
    // are two independent pieces of state that were never made mutually
    // exclusive -- selecting a run while a placed element was already
    // selected (or vice versa, see the onSelect wiring below) left BOTH
    // "selected" at once, with both floating-control sets (the run's inline
    // Apply/Cancel toolbar and the element's delete pill/resize handles)
    // rendering simultaneously. Only one thing should ever read as
    // "selected" in this editor.
    setSelectedId(null);
    if (index === null) {
      clearNativeTextSelection();
      return;
    }
    selectDetectedRun(index, extend, detectedTextRuns, pageTextModel);
  }

  // Bug fix (reported from iPhone 15 Plus / Safari): tapping editable text
  // opened the inline caret box, but the on-screen keyboard never appeared.
  // Root cause -- the autofocus effect below calls inlineEditInputRef.focus()
  // from a useEffect, which runs on a LATER task/microtask than the tap
  // event itself. iOS Safari only opens the virtual keyboard for a
  // programmatic .focus() call made SYNCHRONOUSLY inside a trusted
  // user-gesture handler; by the time the effect runs, that window has
  // already closed, so Safari silently focuses the input without ever
  // showing the keyboard (desktop browsers have no such restriction, which
  // is why this never reproduced outside a real iOS device).
  //
  // Fix: for the two paths that represent an actual tap/click selecting a
  // single run (TextRunOverlay's own click/Enter/Space, and the stage's
  // click-to-select fallback below), force the resulting state update AND
  // its render to complete synchronously via flushSync, then focus the now-
  // mounted input immediately after -- still inside the same call stack as
  // the original tap. The plain selectTextRun above is untouched and still
  // used for paths where there's no input to focus (deselection, keyboard
  // Arrow-key focus-follow), and the effect below stays as a safety net for
  // any other path that lands on a single-run selection.
  function selectTextRunAndFocus(index: number | null, extend = false) {
    flushSync(() => {
      selectTextRun(index, extend);
    });
    const input = inlineEditInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    // Phase 15: iOS Safari shrinks the VISUAL viewport (not the layout
    // viewport) when the on-screen keyboard opens, and does not itself
    // guarantee the just-focused element ends up above it -- for a run near
    // the bottom of the page preview, the keyboard can cover the input and
    // its floating Apply/Cancel toolbar right after they appear. A single
    // explicit scrollIntoView resolves it the same way native form inputs
    // are auto-scrolled into view. matchMedia check (not a CSS class) since
    // this is imperative, not stylable.
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    input.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  function activateTextSearchMatch(index: number) {
    if (textSearchMatches.length === 0) return;
    const bounded = Math.max(0, Math.min(index, textSearchMatches.length - 1));
    const match = textSearchMatches[bounded];
    setTextSearchActiveIndex(bounded);
    if (!match) return;
    if (match.pageIndex !== pageIndex) {
      setPageIndex(match.pageIndex);
      return;
    }
    const firstRun = match.sourceRunIndices[0];
    if (firstRun !== undefined) {
      setFocusedRunIndex(firstRun);
      requestAnimationFrame(() => {
        runOverlayNodesRef.current.get(firstRun)?.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      });
    }
  }

  function stepTextSearch(direction: 1 | -1) {
    const next = nextSearchMatchIndex(
      textSearchMatches,
      normalizedTextSearchIndex,
      direction,
    );
    if (next >= 0) activateTextSearchMatch(next);
  }

  function prepareActiveTextSearchReplacement() {
    const plan = activeTextSearchReplacementPlan;
    if (!plan || !activeTextSearchMatch || activeTextSearchMatch.pageIndex !== pageIndex) return;
    const indices = [...new Set(plan.sourceRunIndices)].sort((a, b) => a - b);
    if (indices.length === 0) return;

    setActiveTool("select");
    setSelectedId(null);
    selectRunIndices({
      indices,
      runs: detectedTextRuns,
      pageTextModel,
      draftText: plan.replacementText,
    });

    if (indices.length === 1) {
      requestAnimationFrame(() => {
        inlineEditInputRef.current?.focus();
        inlineEditInputRef.current?.select();
      });
    }
  }

  // Hover highlighting for the select tool -- a discrete "did the hit-test
  // result change" comparison before setState, not a per-pixel update, so a
  // mousemove sweeping across one run's box (or the empty page background)
  // doesn't re-render on every event, only on an actual run-boundary
  // crossing. No DOM-direct-write is needed here (unlike a drag gesture)
  // since this is a single discrete index change, not a continuous one.
  function handleStageMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (activeTool !== "select") return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point =
      pageCoordinateMapper?.screenPointToPercentPoint(event.clientX, event.clientY, rect) ?? {
        xPct: ((event.clientX - rect.left) / rect.width) * 100,
        yPct: ((event.clientY - rect.top) / rect.height) * 100,
      };
    const index = findDetectedRunIndexAtPoint(point.xPct, point.yPct);
    setHoveredRunIndex((current) => (current === index ? current : index));
  }

  function handleStageMouseLeave() {
    setHoveredRunIndex((current) => (current === -1 ? current : -1));
  }

  // Arrow-key navigation between detected runs, in the same reading order
  // textRunsFromContent already produced them in -- native Tab already
  // moves focus between the overlays (each is a real, tabbable element);
  // this adds a faster, position-aware way to step through them without
  // needing Shift+Tab for "previous". Only intercepts arrow keys while a
  // run overlay currently has focus, so it never steals arrow keys meant
  // for, say, the file-name input in the inspector panel. Plain Arrow just
  // MOVES focus (browsers' usual list-navigation convention); Shift+Arrow
  // additionally EXTENDS the selection to the newly-focused run, mirroring
  // Shift+click -- the keyboard-accessible equivalent of a multi-run drag
  // selection, matching this project's own established Shift+Arrow
  // precedent (components/pdf/crop/CropRectView.tsx's keyboard resize).
  function handleStageKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (activeTool !== "select" || focusedRunIndex === null || detectedTextRuns.length === 0) return;
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const delta = forward ? 1 : -1;
    const nextIndex = (focusedRunIndex + delta + detectedTextRuns.length) % detectedTextRuns.length;
    if (event.shiftKey) selectTextRun(nextIndex, true);
    runOverlayNodesRef.current.get(nextIndex)?.focus();
  }

  // Phase 9.2: pre-flight validation for a MULTI-run selection (2+ detected
  // runs), checked BEFORE lib/pdf/edit/multiRunEditPlan.ts's own
  // buildMultiRunEditPlan is even called, since that function's own
  // invariants (consecutive operator indices, one shared font) need
  // reconstructing "the full operator list for this one content stream" --
  // buildMultiRunEditPlan has no formPath param at all, so a selection
  // touching a Form XObject is rejected here honestly rather than passed
  // through and mishandled.
  type MultiRunValidation =
    | { kind: "invalid"; reason: string }
    | {
        kind: "valid";
        contentStreamIndex: number;
        operatorIndices: number[];
        allOperators: import("@/lib/pdf/edit/contentStream").TextShowOperator[];
        resources: PDFDict;
        fontResourceName: string;
      };

  function validateMultiRunSelection(indices: number[]): MultiRunValidation {
    if (
      !pageTextModel ||
      !logicalRangeCoversWholeSpans(logicalSelection, pageTextModel) ||
      logicalSelection?.sourceRunIndices.length !== indices.length ||
      logicalSelection.sourceRunIndices.some((value, position) => value !== indices[position])
    ) {
      return {
        kind: "invalid",
        reason:
          "Cross-span edits must select whole compatible PDF text spans. Partial cross-span editing is not supported yet.",
      };
    }

    const matches = indices.map((i) => runMatches[i]);
    if (matches.some((m) => !m)) {
      return { kind: "invalid", reason: "One or more selected lines couldn't be matched to editable text -- try selecting fewer lines." };
    }
    const nonNull = matches as NonNullable<RunMatch>[];
    const firstLocator = nonNull[0].locatedOperator.locator;
    if (firstLocator.kind !== "page") {
      return { kind: "invalid", reason: "Multi-line editing inside a Form XObject (e.g. a stamp or logo) isn't supported yet -- edit one line at a time." };
    }
    const sameStream = nonNull.every(
      (m) => m.locatedOperator.locator.kind === "page" && m.locatedOperator.locator.contentStreamIndex === firstLocator.contentStreamIndex,
    );
    if (!sameStream) {
      // Phase 20 (M): was "Selected lines must be part of the same content
      // stream." -- accurate but meaningless to a non-technical user (the
      // phase's own explicit example of the kind of message to avoid).
      return { kind: "invalid", reason: "This text is split internally by the PDF and can't be edited as one piece here -- try editing one part at a time." };
    }
    const operatorIndices = [...nonNull.map((m) => m.locatedOperator.operatorIndex)].sort((a, b) => a - b);
    for (let i = 1; i < operatorIndices.length; i += 1) {
      if (operatorIndices[i] !== operatorIndices[i - 1] + 1) {
        return { kind: "invalid", reason: "Selected lines must be consecutive, with nothing unselected in between." };
      }
    }
    const fontResourceName = nonNull[0].operator.fontResourceName;
    if (!fontResourceName) {
      return { kind: "invalid", reason: "This text's font couldn't be identified, so it can't be edited here." };
    }
    if (nonNull.some((m) => m.operator.fontResourceName !== fontResourceName)) {
      return { kind: "invalid", reason: "Selected lines use different fonts -- multi-line edits must share one font." };
    }

    const allOperators = pageOperators
      .filter((lo) => lo.locator.kind === "page" && lo.locator.contentStreamIndex === firstLocator.contentStreamIndex)
      .sort((a, b) => a.operatorIndex - b.operatorIndex)
      .map((lo) => lo.operator);

    return { kind: "valid", contentStreamIndex: firstLocator.contentStreamIndex, operatorIndices, allOperators, resources: nonNull[0].locatedOperator.resources, fontResourceName };
  }

  const selectedNativeSpans = useMemo(
    () =>
      pageTextModel
        ? selectedRunIndices
            .map((index) => pageTextModel.spans[index] ?? null)
            .filter((span): span is NonNullable<typeof span> => span !== null)
        : [],
    [pageTextModel, selectedRunIndices],
  );
  const mixedNativeStyleSummary = useMemo(
    () =>
      selectedNativeSpans.length > 1
        ? summarizeNativeTextSelectionStyles(selectedNativeSpans)
        : null,
    [selectedNativeSpans],
  );
  const selectedNativeSpan =
    selectedNativeSpans.length === 1
      ? selectedNativeSpans[0]
      : null;
  const selectedNativeRunMatch =
    selectedRunIndices.length === 1
      ? editableRunMatches[selectedRunIndices[0]] ?? null
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
    if (!selectedNativeSpan || nativeStyleDraft?.spanId !== selectedNativeSpan.id) return null;
    const before = selectedNativeSpan.style;
    const changed =
      nativeStyleDraft.fontSizePt !== before.fontSizePt ||
      nativeStyleDraft.charSpacing !== before.charSpacingPt ||
      nativeStyleDraft.wordSpacing !== before.wordSpacingPt ||
      nativeStyleDraft.horizontalScalingPct !== before.horizontalScalingPct;
    if (!changed) return null;
    return {
      fontSizePt: nativeStyleDraft.fontSizePt,
      charSpacing: nativeStyleDraft.charSpacing,
      wordSpacing: nativeStyleDraft.wordSpacing,
      horizontalScalingPct: nativeStyleDraft.horizontalScalingPct,
    };
  }, [selectedNativeSpan, nativeStyleDraft]);

  const activeCaretTextStyleSnapshot =
    selectedNativeSpan &&
    caretTextStyleSnapshot?.spanId === selectedNativeSpan.id
      ? caretTextStyleSnapshot
      : null;

  const handleEditDraftTextChange = useCallback(
    (nextText: string) => {
      const selectedIndex =
        selectedRunIndices.length === 1 ? selectedRunIndices[0] : null;
      const canCaptureSingleNativeSpan =
        selectedIndex !== null &&
        selectedNativeSpan !== null &&
        selectedNativeRunMatch !== null &&
        !fragmentedRunReconstructions.has(selectedIndex);

      if (
        nextText.length === 0 &&
        editDraftText.length > 0 &&
        canCaptureSingleNativeSpan
      ) {
        setCaretTextStyleSnapshot(
          captureCaretTextStyleSnapshot({
            span: selectedNativeSpan,
            locatedOperator: selectedNativeRunMatch.locatedOperator,
          }),
        );
      } else if (
        nextText.length > 0 &&
        caretTextStyleSnapshot &&
        caretTextStyleSnapshot.spanId !== selectedNativeSpan?.id
      ) {
        setCaretTextStyleSnapshot(null);
      }

      setEditDraftText(nextText);
      setEditApplyError("");
    },
    [
      selectedRunIndices,
      selectedNativeSpan,
      selectedNativeRunMatch,
      fragmentedRunReconstructions,
      editDraftText,
      caretTextStyleSnapshot,
    ],
  );

  // Phase 10: font resolution (resolveFont/resolveFontMetrics -- both parse
  // the font dictionary, the expensive part of building editPreview below)
  // depends only on WHICH run(s) are selected, never on the draft replacement
  // text itself. Splitting it out means typing in the "Replace with" field
  // (which changes editDraftText on every keystroke) only re-runs the cheap,
  // pure plan-building below, not a font-dict re-parse. Reads `pdfLibDoc`
  // STATE (not pdfLibDocRef) -- React forbids reading a ref's value during
  // render, even inside useMemo; pdfLibDoc is pdfLibDocRef's reactive twin
  // kept for exactly this purpose (see its own doc comment).
  type ResolvedEditContext =
    | { kind: "empty" }
    | { kind: "error"; reason: string; multi: boolean }
    | {
        kind: "single";
        resolvedFont: ResolvedFont;
        fontMetrics: FontMetrics;
        locatedOperator: LocatedTextOperator;
        operator: LocatedTextOperator["operator"];
        fallbackStyleHints: import("@/lib/pdf/edit/fallbackFont").FallbackStyleHints;
        embeddedGlyphEvidence: EmbeddedGlyphEvidence | null;
      }
    | {
        kind: "multi";
        resolvedFont: ResolvedFont;
        fontMetrics: FontMetrics;
        embeddedGlyphEvidence: EmbeddedGlyphEvidence | null;
        validation: Extract<MultiRunValidation, { kind: "valid" }>;
      };

  const resolvedEditContext = useMemo((): ResolvedEditContext => {
    if (!fontRegistry || selectedRunIndices.length === 0) return { kind: "empty" };

    try {
      if (selectedRunIndices.length === 1) {
        const match = editableRunMatches[selectedRunIndices[0]];
        if (!match) return { kind: "empty" };
        const { locatedOperator, operator } = match;
        if (!operator.fontResourceName) throw new Error("This text's font couldn't be identified, so it can't be edited here.");
        const profile = fontRegistry.resolve(
          locatedOperator.resources,
          operator.fontResourceName,
        );
        if (!profile) throw new Error("Could not resolve this text's font.");
        const resolvedFont = profile.resolvedFont;
        const fontMetrics = profile.metrics;
        const fallbackStyleHints = profile.styleHints;
        const embeddedGlyphEvidence = profile.embeddedGlyphEvidence;
        const fragmented = fragmentedRunReconstructions.get(selectedRunIndices[0]);
        if (fragmented) {
          const validation: Extract<MultiRunValidation, { kind: "valid" }> = {
            kind: "valid",
            contentStreamIndex: fragmented.contentStreamIndex,
            operatorIndices: fragmented.operatorIndices,
            allOperators: fragmented.allOperators,
            resources: fragmented.resources,
            fontResourceName: fragmented.fontResourceName,
          };
          return {
            kind: "multi",
            resolvedFont,
            fontMetrics,
            embeddedGlyphEvidence,
            validation,
          };
        }
        return {
          kind: "single",
          resolvedFont,
          fontMetrics,
          locatedOperator,
          operator,
          fallbackStyleHints,
          embeddedGlyphEvidence,
        };
      }

      const validation = validateMultiRunSelection(selectedRunIndices);
      if (validation.kind === "invalid") return { kind: "error", reason: validation.reason, multi: true };
      const profile = fontRegistry.resolve(
        validation.resources,
        validation.fontResourceName,
      );
      if (!profile) throw new Error("Could not resolve this text's font.");
      return {
        kind: "multi",
        resolvedFont: profile.resolvedFont,
        fontMetrics: profile.metrics,
        embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
        validation,
      };
    } catch (resolveError) {
      const reason = resolveError instanceof Error ? resolveError.message : "Could not validate this edit.";
      return { kind: "error", reason, multi: selectedRunIndices.length > 1 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validateMultiRunSelection closes over the explicitly listed page/write evidence below.
  }, [fontRegistry, selectedRunIndices, editableRunMatches, runMatches, pageOperators, pageIndex, fragmentedRunReconstructions, pageTextModel, logicalSelection]);

  // Phase 9.2: the live dry-run preview driving both the Apply button's
  // disabled state and the specific reason shown next to it -- see
  // EditPreview's own doc comment for why the one Form-XObject-reuse case
  // (AmbiguousSharedFormError) can't be included here and is instead
  // surfaced at Apply time. Pure/synchronous (buildEditPlan and
  // buildMultiRunEditPlan never touch PDF bytes), so recomputing this on
  // every keystroke is cheap -- font resolution itself (the expensive part)
  // already happened in resolvedEditContext above and isn't repeated here.
  const editPreview = useMemo((): EditPreview => {
    if (resolvedEditContext.kind === "empty") return { kind: "empty" };

    if (resolvedEditContext.kind === "error") {
      return resolvedEditContext.multi
        ? { kind: "multi", editable: false, reason: resolvedEditContext.reason, plan: null as never, resolvedFont: null as never }
        : { kind: "empty" };
    }

    if (resolvedEditContext.kind === "single") {
      const {
        resolvedFont,
        fontMetrics,
        locatedOperator,
        operator,
        fallbackStyleHints,
        embeddedGlyphEvidence,
      } = resolvedEditContext;
      const planInputs = {
        pageIndex,
        contentStreamIndex: locatedOperator.locator.kind === "page" ? locatedOperator.locator.contentStreamIndex : 0,
        formPath: locatedOperator.locator.kind === "xobject" ? locatedOperator.locator.formPath : null,
        operatorIndex: locatedOperator.operatorIndex,
        operator,
        replacementText: editDraftText,
        resolvedFont,
        fontMetrics,
        embeddedGlyphEvidence,
        replacementTextState: nativeStyleOverride,
      };

      // Once a single native span has transitioned through an empty draft,
      // retyping is validated against its persistent style/resource snapshot
      // before returning to the normal EditPlan glyph/width authority. The
      // snapshot never authorizes a character or writer path on its own.
      let strictPlan: EditPlan;
      if (activeCaretTextStyleSnapshot && editDraftText.length > 0) {
        const snapshotPlan = buildCaretRetypePlan({
          snapshot: activeCaretTextStyleSnapshot,
          locatedOperator,
          replacementText: editDraftText,
          resolvedFont,
          fontMetrics,
          embeddedGlyphEvidence,
          replacementTextState: nativeStyleOverride,
        });
        if (snapshotPlan.kind === "blocked") {
          const diagnosticPlan = buildEditPlan(planInputs);
          return {
            kind: "single",
            editable: false,
            reason: snapshotPlan.reason,
            plan: diagnosticPlan,
            resolvedFont,
            locatedOperator,
            substituteFont: null,
          };
        }
        strictPlan = snapshotPlan.plan;
      } else {
        strictPlan = buildEditPlan(planInputs);
      }

      // Always planned strictly first, in the run's OWN font. A substitute
      // is only ever considered when the real font genuinely can't do the
      // job -- so text that fits the original font keeps it, every time,
      // and the substitution path can never quietly pre-empt a perfect
      // same-font edit.
      let substitutePlan: EditPlan | null = null;
      if (!strictPlan.editable && !nativeStyleOverride) {
        if (activeCaretTextStyleSnapshot && editDraftText.length > 0) {
          const snapshotFallback = buildCaretRetypePlan({
            snapshot: activeCaretTextStyleSnapshot,
            locatedOperator,
            replacementText: editDraftText,
            resolvedFont,
            fontMetrics,
            embeddedGlyphEvidence,
            fallbackStyleHints,
          });
          substitutePlan =
            snapshotFallback.kind === "planned" ? snapshotFallback.plan : null;
        } else {
          substitutePlan = buildEditPlan({
            ...planInputs,
            fallbackStyleHints,
            replacementTextState: null,
          });
        }
      }
      const substituteAvailable = substitutePlan?.editable ? substitutePlan : null;
      const plan = useSubstituteFont && substituteAvailable ? substituteAvailable : strictPlan;

      // Real bug, found via live browser testing: see
      // lib/pdf/edit/matchTextRun.ts's runSpansMultipleOperators for the
      // full root cause (pdfjs merging several operators into one visual
      // run, silently corrupting an edit that only rewrites the first).
      // Rejected honestly here rather than papering over it.
      const fullRunText = detectedTextRuns[selectedRunIndices[0]]?.str ?? "";
      if (runSpansMultipleOperators(plan.originalText, fullRunText)) {
        return {
          kind: "single",
          editable: false,
          reason:
            "This text is rendered internally as several separate pieces, and only part of it could be matched for editing -- in-place editing isn't available for this run yet.",
          plan,
          resolvedFont,
          locatedOperator,
          substituteFont: null,
        };
      }
      return {
        kind: "single",
        editable: plan.editable,
        reason: plan.reason,
        plan,
        resolvedFont,
        locatedOperator,
        substituteFont: substituteAvailable?.fallbackFont?.family ?? null,
      };
    }

    const {
      resolvedFont,
      fontMetrics,
      embeddedGlyphEvidence,
      validation,
    } = resolvedEditContext;
    try {
      const plan = buildMultiRunEditPlan({
        pageIndex,
        contentStreamIndex: validation.contentStreamIndex,
        allOperators: validation.allOperators,
        operatorIndices: validation.operatorIndices,
        replacementText: editDraftText,
        resolvedFont,
        fontMetrics,
        embeddedGlyphEvidence,
      });
      return { kind: "multi", editable: plan.editable, reason: plan.reason, plan, resolvedFont };
    } catch (previewError) {
      const reason = previewError instanceof Error ? previewError.message : "Could not validate this edit.";
      return { kind: "multi", editable: false, reason, plan: null as never, resolvedFont: null as never };
    }
  }, [resolvedEditContext, editDraftText, detectedTextRuns, selectedRunIndices, pageIndex, useSubstituteFont, nativeStyleOverride, activeCaretTextStyleSnapshot]);

  const replacementLayoutDecision = useMemo(() => {
    if (editPreview.kind === "empty" || !editPreview.editable) return null;
    const plan =
      editPreview.kind === "single"
        ? editPreview.plan
        : editPreview.plan.subPlans[0];
    if (!plan) return null;

    // Layout warnings are about a requested change in text advance. Merely
    // selecting/inspecting a run (or changing paint only) must not surface a
    // "replacement is wider" warning from font-metric round-tripping when no
    // layout-affecting edit has actually been requested.
    const layoutAffectingChange =
      plan.originalText !== plan.replacementText ||
      plan.replacementTextState !== null;
    return layoutAffectingChange ? decideReplacementLayout(plan) : null;
  }, [editPreview]);

  // Phase 9.2: the actual write-back for whatever editPreview currently
  // says is ready (single-operator via lib/pdf/edit/applyEditPlan.ts's
  // applyEditPlanToDocument, or a multi-run span via its
  // applyMultiRunEditPlanToDocument) -- the Apply button is disabled
  // whenever editPreview isn't editable, so reaching here with an
  // unsupported plan should be impossible; the checks below are a second,
  // independent guard rather than trusting the button's disabled state
  // alone. Single-operator edits inside a Form XObject always isolate
  // (isolate: true) rather than defaulting to "edit every invocation of
  // this shared stamp" -- the safer default for a UI where the user has no
  // way to know or control whether the text they clicked is reused
  // elsewhere; an edit that can't be safely isolated (AmbiguousSharedFormError)
  // is the one case editPreview can't predict (see its own doc comment) and
  // is surfaced honestly here instead, in the catch block below.
  //
  // On success, pushes the re-saved pdf-lib bytes onto the SAME shared undo
  // history overlay-element edits use (setHistoryState, not a separate
  // setPdf) -- see EditHistorySnapshot's doc comment for how that makes
  // Undo/Redo cover text edits for free. Since `pdf` is DERIVED from
  // historyState.pdfBytes (see the `pdf` useMemo near the top of this
  // component), this alone cascades a fresh reload of both the pdfjs
  // preview and the pdf-lib edit doc, so the on-screen preview, future
  // edits, and the final exported PDF (generateEditedPdf, via the existing
  // overlay-element
  // export pipeline) all see this edit without any separate wiring.
  const applyTextRunEdit = useCallback(async () => {
    const doc = pdfLibDocRef.current;
    const engine = editEngineRef.current;
    if (!doc || !engine || editPreview.kind === "empty" || !editPreview.editable) return;

    setIsApplyingEdit(true);
    setEditApplyError("");
    try {
      if (editPreview.kind === "single") {
        const { plan, resolvedFont, locatedOperator } = editPreview;
        await engine.applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, {
          isolate: locatedOperator.locator.kind === "xobject",
          nativePaintPlan: nativePaintPlan?.editable ? nativePaintPlan : undefined,
        });
      } else {
        const { plan, resolvedFont } = editPreview;
        await engine.applyMultiRunEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode);
      }

      const newBytes = await doc.save();
      const buffer = newBytes.buffer.slice(newBytes.byteOffset, newBytes.byteOffset + newBytes.byteLength) as ArrayBuffer;
      const spanIds = selectedRunIndices.map(
        (index) => pageTextModel?.spans[index]?.id ?? `p${pageIndex}-span-${index}`,
      );
      const semanticOperations: PdfEditOperationDraft[] = [];
      if (editPreview.kind === "single") {
        const plan = editPreview.plan;
        const target: NativeTextTarget = {
          kind: "native-text",
          pageIndex,
          spanIds,
          contentStreamIndex: plan.formPath ? null : plan.contentStreamIndex,
          formPath: plan.formPath,
          operatorIndices: [plan.operatorIndex],
          fontResourceName: plan.fontResourceName,
        };

        if (plan.originalText !== plan.replacementText) {
          semanticOperations.push(
            nativeTextOperation({
              pageIndex,
              spanIds,
              contentStreamIndex: target.contentStreamIndex,
              formPath: target.formPath,
              operatorIndices: target.operatorIndices,
              fontResourceName: target.fontResourceName,
              originalText: plan.originalText,
              replacementText: plan.replacementText,
            }),
          );
        }

        if (plan.replacementTextState || nativePaintPlan?.editable) {
          const beforeStyle: PdfEditTextStyle = {
            fontFamily: selectedNativeSpan?.style.fontFamily,
            fontSizePt: plan.fontSizePt,
            bold: (selectedNativeSpan?.style.weight ?? 400) >= 600,
            italic: selectedNativeSpan?.style.italic ?? false,
            charSpacingPt: plan.charSpacing,
            wordSpacingPt: plan.wordSpacing,
            horizontalScalingPct: plan.horizontalScalingPct,
            color: selectedNativeSpan?.style.fillColor?.cssHex ?? undefined,
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
          };
          semanticOperations.push(nativeTextStyleOperation({ target, before: beforeStyle, after: afterStyle }));
        }
      } else {
        semanticOperations.push(
          nativeTextOperation({
            pageIndex,
            spanIds,
            contentStreamIndex: editPreview.plan.contentStreamIndex,
            formPath: null,
            operatorIndices: editPreview.plan.operatorIndices,
            fontResourceName: editPreview.plan.subPlans[0]?.fontResourceName ?? null,
            originalText: editPreview.plan.originalText,
            replacementText: editPreview.plan.replacementText,
          }),
        );
      }

      setHistoryState((current) => ({
        ...current,
        pdfBytes: buffer,
        session: appendPdfEditOperations(current.session, semanticOperations),
      }));
      // The page-render effect (triggered by pdf.bytes changing, via the
      // sync effect above) will reset selection/hover/focus/draft state
      // itself once the refreshed preview and re-matched runs are ready --
      // no need to duplicate that reset here.
    } catch (applyError) {
      // AmbiguousSharedFormError (thrown when a Form XObject edit can't be
      // safely isolated -- see EditPreview's own doc comment) surfaces here
      // via its own real Error subclass; no special-casing needed beyond
      // reading .message, same as any other applyError.
      setEditApplyError(applyError instanceof Error ? applyError.message : "Could not apply this edit.");
    } finally {
      setIsApplyingEdit(false);
    }
  }, [editPreview, setHistoryState, selectedRunIndices, pageTextModel, pageIndex, selectedNativeSpan, nativePaintPlan]);

  // Phase 2.4B: formatting a logical multi-span selection is a DIFFERENT
  // transaction from multi-run text replacement. Each selected span keeps its
  // own font resource/encoding/metrics and is independently preflighted by
  // multiStylePlan.ts. Only after EVERY changed span proves safe does the
  // batch writer rewrite the shared page stream back-to-front and save one
  // history snapshot, so one Undo/Redo covers the complete formatting action.
  const applyMixedNativeFormatting = useCallback(async (patch: NativeTextStyleBatchPatch) => {
    const doc = pdfLibDocRef.current;
    const engine = editEngineRef.current;
    if (!doc || !engine || !fontRegistry || !pageTextModel || selectedRunIndices.length < 2) {
      setEditApplyError("Select at least two editable native text spans before applying uniform formatting.");
      return;
    }
    if (!logicalRangeCoversWholeSpans(logicalSelection, pageTextModel)) {
      setEditApplyError("Uniform formatting currently requires whole PDF text spans.");
      return;
    }

    setIsApplyingEdit(true);
    setEditApplyError("");
    try {
      const inputs = selectedRunIndices.map((index) => {
        const span = pageTextModel.spans[index];
        const match = editableRunMatches[index];
        const profile = pageFontProfiles[index];
        if (!span || !match || !profile) {
          throw new Error(
            "One selected span no longer has complete native PDF font/write evidence. Reselect the text and try again.",
          );
        }
        return {
          spanId: span.id,
          locatedOperator: match.locatedOperator,
          resolvedFont: profile.resolvedFont,
          fontMetrics: profile.metrics,
          embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
          fragmented: fragmentedRunReconstructions.has(index),
        };
      });

      const batch = buildNativeTextStyleBatchPlan({
        pageIndex,
        inputs,
        patch,
      });
      if (!batch.editable) {
        throw new Error(batch.reason);
      }

      await engine.applyNativeTextStyleBatchToDocument(doc, batch);

      const newBytes = await doc.save();
      const buffer = newBytes.buffer.slice(
        newBytes.byteOffset,
        newBytes.byteOffset + newBytes.byteLength,
      ) as ArrayBuffer;
      const spanById = new Map(
        selectedNativeSpans.map((span) => [span.id, span] as const),
      );

      const semanticOperations: PdfEditOperationDraft[] = batch.entries.map((entry) => {
        const plan = entry.plan;
        const span = spanById.get(entry.spanId);
        const target: NativeTextTarget = {
          kind: "native-text",
          pageIndex,
          spanIds: [entry.spanId],
          contentStreamIndex: plan.contentStreamIndex,
          formPath: null,
          operatorIndices: [plan.operatorIndex],
          fontResourceName: plan.fontResourceName,
        };
        const beforeStyle: PdfEditTextStyle = {
          fontFamily: span?.style.fontFamily,
          fontSizePt: plan.fontSizePt,
          bold: (span?.style.weight ?? 400) >= 600,
          italic: span?.style.italic ?? false,
          charSpacingPt: plan.charSpacing,
          wordSpacingPt: plan.wordSpacing,
          horizontalScalingPct: plan.horizontalScalingPct,
          color: span?.style.fillColor?.cssHex ?? undefined,
        };
        const afterStyle: PdfEditTextStyle = {
          ...beforeStyle,
          fontSizePt:
            plan.replacementTextState?.fontSizePt ?? beforeStyle.fontSizePt,
          charSpacingPt:
            plan.replacementTextState?.charSpacing ?? beforeStyle.charSpacingPt,
          wordSpacingPt:
            plan.replacementTextState?.wordSpacing ?? beforeStyle.wordSpacingPt,
          horizontalScalingPct:
            plan.replacementTextState?.horizontalScalingPct ??
            beforeStyle.horizontalScalingPct,
          color:
            entry.nativePaintPlan?.override.fillColor?.cssHex ??
            beforeStyle.color,
        };
        return nativeTextStyleOperation({
          target,
          before: beforeStyle,
          after: afterStyle,
        });
      });

      setHistoryState((current) => ({
        ...current,
        pdfBytes: buffer,
        session: appendPdfEditOperations(
          current.session,
          semanticOperations,
        ),
      }));
    } catch (applyError) {
      setEditApplyError(
        applyError instanceof Error
          ? applyError.message
          : "Could not apply uniform native formatting.",
      );
    } finally {
      setIsApplyingEdit(false);
    }
  }, [
    fontRegistry,
    pageTextModel,
    selectedRunIndices,
    logicalSelection,
    editableRunMatches,
    pageFontProfiles,
    fragmentedRunReconstructions,
    pageIndex,
    selectedNativeSpans,
    setHistoryState,
  ]);

  // Restyle covers a run with a whiteout and drops an editable text box in
  // its place. The whiteout hides the original glyphs, but hiding is not
  // removing: the original text stays in the content stream, so the exported
  // file carries BOTH strings in its text layer. Measured directly -- an
  // amount restyled from 1350.00 to 9999.99 extracted as
  // ["Total Amount 1350.00", "Total Amount 9999.99"], meaning copy-paste,
  // Ctrl+F, and any downstream parser see the value the user believed they
  // had replaced, sitting next to its replacement.
  //
  // So a restyle now also BLANKS the original operator through the same
  // in-place engine the inline editor uses (replacementText: ""), turning
  // the whiteout into a second line of defence rather than the only one.
  // Both changes go into a single history entry, so one Undo reverses the
  // whole restyle rather than leaving blanked text behind.
  //
  // Blanking is best-effort by design, and its failure cases are exactly the
  // ones the inline editor already refuses: a run pdfjs merged from several
  // operators (rewriting one would leave the rest), a font whose encoding
  // can't be resolved, or an operator that can't be located. When it can't
  // run, the restyle still happens -- the user gets what they asked for --
  // and restyleKeptOriginalText drives an honest notice instead, matching
  // the caveat Privacy Shield already shows for the same property.
  async function restyleSelectedRun() {
    const run = selectedRunIndices.length === 1 ? detectedTextRuns[selectedRunIndices[0]] : null;
    if (!run) return;

    const plan = planRunRestyle(run);
    const whiteoutId = nextElementId();
    const textId = nextElementId();
    const added: EditElement[] = [
      { ...createWhiteoutElement(whiteoutId, pageIndex, plan.whiteout.xPct, plan.whiteout.yPct, "white"), widthPct: plan.whiteout.widthPct, heightPct: plan.whiteout.heightPct },
      {
        ...createTextElement(textId, pageIndex, plan.text.xPct, plan.text.yPct),
        text: plan.text.text,
        fontSizePt: plan.text.fontSizePt,
        widthPct: plan.text.widthPct,
        heightPct: plan.text.heightPct,
      },
    ];

    let blankedBytes: ArrayBuffer | null = null;
    let blankSemanticOperation: ReturnType<typeof nativeTextOperation> | null = null;
    const doc = pdfLibDocRef.current;
    const engine = editEngineRef.current;
    if (doc && engine && resolvedEditContext.kind === "single") {
      const {
        resolvedFont,
        fontMetrics,
        locatedOperator,
        operator,
        embeddedGlyphEvidence,
      } = resolvedEditContext;
      const blankPlan = buildEditPlan({
        pageIndex,
        contentStreamIndex: locatedOperator.locator.kind === "page" ? locatedOperator.locator.contentStreamIndex : 0,
        formPath: locatedOperator.locator.kind === "xobject" ? locatedOperator.locator.formPath : null,
        operatorIndex: locatedOperator.operatorIndex,
        operator,
        replacementText: "",
        resolvedFont,
        fontMetrics,
        embeddedGlyphEvidence,
      });
      // Same guard the inline editor applies: if pdfjs merged this visual run
      // from several operators, emptying the one we matched would delete part
      // of the line and leave the rest sitting under the whiteout.
      if (blankPlan.editable && !runSpansMultipleOperators(blankPlan.originalText, run.str)) {
        try {
          await engine.applyEditPlanToDocument(doc, blankPlan, resolvedFont.bytesPerCode, {
            isolate: locatedOperator.locator.kind === "xobject",
          });
          const saved = await doc.save();
          blankedBytes = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
          const selectedIndex = selectedRunIndices[0];
          blankSemanticOperation = nativeTextOperation({
            pageIndex,
            spanIds: [pageTextModel?.spans[selectedIndex]?.id ?? `p${pageIndex}-span-${selectedIndex}`],
            contentStreamIndex: blankPlan.formPath ? null : blankPlan.contentStreamIndex,
            formPath: blankPlan.formPath,
            operatorIndices: [blankPlan.operatorIndex],
            fontResourceName: blankPlan.fontResourceName,
            originalText: blankPlan.originalText,
            replacementText: "",
          });
        } catch {
          // Leave the original text in place rather than half-applying an
          // edit; the notice below tells the user what actually happened.
          blankedBytes = null;
        }
      }
    }

    setHistoryState((current) => {
      const nextElements = [...current.elements, ...added];
      const elementOperations = deriveElementOperations(current.elements, nextElements);
      const operations = blankSemanticOperation
        ? [blankSemanticOperation, ...elementOperations]
        : elementOperations;
      return {
        ...current,
        elements: nextElements,
        pdfBytes: blankedBytes ?? current.pdfBytes,
        session: appendPdfEditOperations(current.session, operations),
      };
    });
    setRestyleKeptOriginalText(blankedBytes === null);
    // The download URL is cleared by setHistoryState itself -- see its
    // wrapper near the top of this component.

    selectTextRun(null);
    setSelectedId(textId);
  }

  function handleInkStroke(result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) {
    const id = nextElementId();
    const element = createInkElement(id, pageIndex, result.xPct, result.yPct, result.widthPct, result.heightPct, result.pngDataUrl);
    setElements((current) => [...current, element]);
  }

  // --- Page structure ------------------------------------------------------
  //
  // Every operation here commits BOTH halves of the snapshot in a single
  // setHistoryState call: the rebuilt bytes and the elements remapped onto
  // their new page indices. Splitting them across two updates would create
  // a frame -- and an undo entry -- where annotations point at pages that
  // no longer hold them. One call, one undo step, always consistent.
  //
  // The download URL needs no handling here: setHistoryState is the choke
  // point that clears it (see its wrapper near the top of this component),
  // so a restructured document can never stay downloadable at its old
  // shape. That is the whole reason the invalidation was centralised.
  async function runPageOperation(
    execute: () => Promise<{ bytes: ArrayBuffer; pageMap: PageMap; pageCount: number }>,
    describe: (droppedElements: number) => string,
    semantic: {
      operation: "reorder" | "delete" | "merge";
      affectedPageIndices: number[];
    },
  ) {
    if (pageOpBusy) return;
    setPageOpBusy(true);
    setPageOpNotice("");
    setError("");
    try {
      const { bytes, pageMap, pageCount } = await execute();
      const dropped = countElementsOnRemovedPages(elements, pageMap);
      const description = describe(dropped);
      const beforePageCount = pdfMeta?.pageCount ?? pageCount;

      setHistoryState((current) => {
        const nextElements = remapElements(current.elements, pageMap);
        const elementOperations = deriveElementOperations(current.elements, nextElements);
        const pageEdit = createPageEditOperation({
          operation: semantic.operation,
          beforePageCount,
          afterPageCount: pageCount,
          affectedPageIndices: semantic.affectedPageIndices,
          description,
        });
        return {
          ...current,
          elements: nextElements,
          pdfBytes: bytes,
          session: appendPdfEditOperations(current.session, [pageEdit, ...elementOperations]),
        };
      });
      setPageIndex((current) => remapPageIndex(current, pageMap, pageCount));
      setSelectedPages(new Set());
      setSelectedId(null);
      selectTextRun(null);
      setPageOpNotice(description);
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "That page operation could not be completed.");
    } finally {
      setPageOpBusy(false);
    }
  }

  function handleReorderPages(fromIndex: number, toIndex: number) {
    const order = Array.from({ length: pdfMeta?.pageCount ?? 0 }, (_, i) => i);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    void runPageOperation(
      () => reorderPages(historyState.pdfBytes, order),
      () => `Moved page ${fromIndex + 1} to position ${toIndex + 1}.`,
      { operation: "reorder", affectedPageIndices: [fromIndex, toIndex] },
    );
  }

  function handleDeleteSelectedPages() {
    const targets = [...selectedPages];
    if (targets.length === 0) return;
    void runPageOperation(
      () => deletePages(historyState.pdfBytes, targets),
      (dropped) =>
        `Removed ${targets.length} page${targets.length === 1 ? "" : "s"}` +
        // Named explicitly rather than left to be discovered: the elements
        // are gone from the document and only Undo brings them back.
        (dropped > 0 ? `, along with ${dropped} placed item${dropped === 1 ? "" : "s"} on them.` : "."),
      { operation: "delete", affectedPageIndices: targets },
    );
  }

  async function handleMergeFile(file: File) {
    const incoming = await file.arrayBuffer();
    // Insert after the page being viewed, which is what "add pages here"
    // means to someone looking at it. Appending to the end would be simpler
    // and would ignore where they are.
    const insertAt = pageIndex + 1;
    void runPageOperation(
      () => mergePdf(historyState.pdfBytes, incoming, insertAt),
      () => `Added ${sanitizePdfFileName(file.name)} after page ${pageIndex + 1}.`,
      { operation: "merge", affectedPageIndices: [insertAt] },
    );
  }

  // Extract does NOT modify the document being edited -- it hands the user a
  // new file. Routed through the same download plumbing as Export so the
  // blob URL is owned and revoked in one place rather than leaked here.
  async function handleExtractSelectedPages() {
    const targets = [...selectedPages].sort((a, b) => a - b);
    if (targets.length === 0 || pageOpBusy) return;
    setPageOpBusy(true);
    setPageOpNotice("");
    setError("");
    try {
      const { bytes } = await splitPdf(historyState.pdfBytes, targets);
      const blob = new Blob([bytes], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(`${outputName.replace(/\.pdf$/i, "")}-pages-${targets.map((i) => i + 1).join("-")}.pdf`));
      setPageOpNotice(`Extracted ${targets.length} page${targets.length === 1 ? "" : "s"} — ready to download.`);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Those pages could not be extracted.");
    } finally {
      setPageOpBusy(false);
    }
  }

  function togglePageSelected(target: number, additive: boolean) {
    setSelectedPages((current) => {
      const next = new Set(current);
      if (additive && lastSelectedPageRef.current !== null) {
        // Shift-click extends from the last tick, the behaviour every file
        // list has trained people to expect.
        const [from, to] = [lastSelectedPageRef.current, target].sort((a, b) => a - b);
        for (let i = from; i <= to; i += 1) next.add(i);
      } else if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      lastSelectedPageRef.current = target;
      return next;
    });
  }

  // Phase 9.2: a real, previously-existing UX gap fixed as part of wiring up
  // true text edits -- the Export button below used to be gated purely on
  // `elements.length > 0` (overlay annotations), since that was the only
  // kind of edit this tool could produce. A user who ONLY applied a true
  // text-run edit (no overlay elements at all) had their change already
  // baked into `pdf.bytes`, but no way to actually download it -- the
  // button stayed disabled. Derived by reference comparison against the
  // ORIGINAL uploaded bytes (captured once in addFile) rather than a
  // separate boolean flag, so it also correctly flips back to false if the
  // user undoes every text edit back to the original.
  const hasTextEdits = historyState.pdfBytes !== originalBytes;
  const currentPageElements = useMemo(() => elementsForPage(elements, pageIndex), [elements, pageIndex]);

  // What the drawn boxes actually cover. Recomputed on every box change so
  // the review list is never a frame behind what is on screen -- a stale
  // count here would understate what is about to be removed.
  const redactionTargets = useMemo(
    () => (redactionBoxes.length === 0 ? [] : runsIntersectingBoxes(detectedTextRuns, redactionBoxes)),
    [detectedTextRuns, redactionBoxes],
  );

  // Detection is an AID, offered as boxes the user reviews -- never applied
  // on its own say-so. A regex that misses one SSN in a document someone
  // believed was scrubbed is the exact harm this feature must not cause.
  function handleDetectSensitive() {
    const found: RedactionBox[] = [];
    for (const run of detectedTextRuns) {
      if (findSensitiveMatches(run.str).length > 0) found.push(maskBoxFor(run, []));
    }
    if (found.length === 0) {
      setPageOpNotice("No SSNs, emails, card numbers or IBANs found on this page. Draw boxes manually for anything else.");
      return;
    }
    setRedactionBoxes((current) => [...current, ...found]);
    setPageOpNotice(`Found ${found.length} likely sensitive value${found.length === 1 ? "" : "s"} — review before redacting.`);
  }

  async function handleApplyRedaction() {
    const cached = pageAndViewportRef.current;
    if (!cached || cached.pageIndex !== pageIndex || redactionTargets.length === 0) return;
    setRedactionConfirmOpen(false);
    setRedactionBusy(true);
    setError("");
    try {
      // Each targeted run keeps everything except its detected sensitive
      // spans. A run the box merely clips has no such spans, so it is
      // removed whole -- over-redaction, the safe direction, per
      // redaction.ts.
      const targets = redactionTargets.map((run) => {
        const matches = findSensitiveMatches(run.str);
        return { ...run, replacementText: matches.length > 0 ? removeSpans(run.str, matches) : "" };
      });

      const outcome = await applyRedaction(historyState.pdfBytes, pageIndex, targets, {
        width: cached.viewport.width,
        height: cached.viewport.height,
        transform: cached.viewport.transform,
      });

      // The black masks go on as real drawn elements, in the SAME history
      // entry as the stripped bytes, so one Undo reverses the whole
      // redaction rather than leaving masks over already-removed text.
      const masks = redactionTargets.map((run) => {
        const box = maskBoxFor(run, redactionBoxes);
        const mask = createWhiteoutElement(nextElementId(), pageIndex, box.xPct, box.yPct, "black");
        return { ...mask, widthPct: box.widthPct, heightPct: box.heightPct };
      });

      setHistoryState((current) => {
        const nextElements = [...current.elements, ...masks];
        const elementOperations = deriveElementOperations(current.elements, nextElements);
        const redactionEdit = createPageEditOperation({
          operation: "redact",
          beforePageCount: pdfMeta?.pageCount ?? 0,
          afterPageCount: pdfMeta?.pageCount ?? 0,
          affectedPageIndices: [pageIndex],
          description: `Redacted ${redactionTargets.length} detected text region${redactionTargets.length === 1 ? "" : "s"} on page ${pageIndex + 1}.`,
        });
        return {
          ...current,
          elements: nextElements,
          pdfBytes: outcome.bytes,
          session: appendPdfEditOperations(current.session, [redactionEdit, ...elementOperations]),
        };
      });
      setRedactionOutcome(outcome);
      setRedactionBoxes([]);
      setSelectedId(null);
      selectTextRun(null);
    } catch (redactionError) {
      setError(redactionError instanceof Error ? redactionError.message : "The redaction could not be applied.");
    } finally {
      setRedactionBusy(false);
    }
  }
  const selectedElement = useMemo(() => elements.find((item) => item.id === selectedId) ?? null, [elements, selectedId]);
  // DISPLAYED CSS pixels per PDF point -- what EditElementView needs to size
  // a placed text element's glyphs to match the page under them
  // (`element.fontSizePt * pixelsPerPoint`).
  //
  // Was derived from the RASTER size (pageDisplaySize.width /
  // pagePointSize.width), which is the same defect the inline editor's own
  // font size had: the raster scale describes how sharply the page was
  // rendered, not how large it is being shown. Placed and restyled text
  // therefore stayed one fixed size while the page zoomed underneath it,
  // and would have been wrong at every zoom level once the raster scale
  // itself becomes dynamic. Measuring against the stage's live CSS width
  // fixes both at once, and keeps placed text consistent with the inline
  // editor (lib/pdf/edit/textRuns.ts's overlayFontSizePx, same ratio).
  //
  // Falls back to PAGE_RENDER_SCALE until the stage has been measured, so
  // text is never briefly unsized on first paint.
  const pixelsPerPoint = stageWidthPx && pagePointSize && pagePointSize.width > 0
    ? stageWidthPx / pagePointSize.width
    : PAGE_RENDER_SCALE;
  // Phase 11: single source of truth for "is there an edit ready to apply,"
  // shared by both the inline on-page toolbar and the sidebar panel -- was
  // previously computed inline in one place only; extracted so the two
  // Apply buttons can never disagree about when they're enabled.
  const nativeStyleChanged =
    editPreview.kind === "single" && Boolean(editPreview.plan.replacementTextState);
  const nativePaintChanged = Boolean(nativePaintPlan?.editable);
  const textDraftChanged =
    editDraftText !== selectedRunIndices.map((i) => detectedTextRuns[i]?.str ?? "").join("");
  const canApplyEdit =
    !isApplyingEdit &&
    editPreview.kind !== "empty" &&
    editPreview.editable &&
    (replacementLayoutDecision?.safeToApplyWithCurrentWriter ?? true) &&
    (textDraftChanged || nativeStyleChanged || nativePaintChanged);
  // Phase 11: looked up once and reused throughout the inline on-page editor
  // JSX below, instead of repeatedly indexing detectedTextRuns/runMatches by
  // selectedRunIndices[0] at each use site.
  const singleSelectedRun = selectedRunIndices.length === 1 ? detectedTextRuns[selectedRunIndices[0]] : null;
  const singleSelectedRunMatch = selectedRunIndices.length === 1 ? editableRunMatches[selectedRunIndices[0]] : null;
  const singleSelectedSpan = selectedNativeSpan;
  const singleSpanLogicalOffsets = singleSelectedSpan
    ? orderedSingleSpanOffsets(logicalSelection, singleSelectedSpan.id)
    : null;
  const logicalSelectionStart = singleSpanLogicalOffsets?.start ?? null;
  const logicalSelectionEnd = singleSpanLogicalOffsets?.end ?? null;
  const logicalSelectionDirection = singleSpanLogicalOffsets?.direction ?? "forward";

  const syncSingleSpanLogicalSelection = useCallback(
    (input: HTMLInputElement) => {
      if (!singleSelectedSpan) return;
      const fallbackOffset = input.value.length;
      updateSingleSpanLogicalSelection({
        span: singleSelectedSpan,
        text: input.value,
        selectionStart: input.selectionStart ?? fallbackOffset,
        selectionEnd: input.selectionEnd ?? fallbackOffset,
        direction: input.selectionDirection === "backward" ? "backward" : "forward",
      });
    },
    [singleSelectedSpan, updateSingleSpanLogicalSelection],
  );

  // The browser input is a presentation/control surface only. Selection
  // changes are normalized into Lumeo's own grapheme-aware logical range,
  // then mirrored back here. DOM selection never participates in PDF export
  // geometry or writer authorization.
  useEffect(() => {
    const input = inlineEditInputRef.current;
    if (
      !input ||
      logicalSelectionStart === null ||
      logicalSelectionEnd === null
    ) {
      return;
    }
    if (
      input.selectionStart === logicalSelectionStart &&
      input.selectionEnd === logicalSelectionEnd &&
      input.selectionDirection === logicalSelectionDirection
    ) {
      return;
    }
    input.setSelectionRange(
      logicalSelectionStart,
      logicalSelectionEnd,
      logicalSelectionDirection,
    );
  }, [
    logicalSelectionStart,
    logicalSelectionEnd,
    logicalSelectionDirection,
    editDraftText,
  ]);

  const activeNativeStyleDraft =
    nativeStyleDraft?.spanId === singleSelectedSpan?.id ? nativeStyleDraft : null;
  const inlineEditorFontFamily =
    singleSelectedSpan && browserFontPreview?.spanId === singleSelectedSpan.id
      ? browserFontPreview.family
      : singleSelectedSpan?.fontProfile?.cssFallbackFamily;
  const pageCapabilityLabel = pageTextModel
    ? pageTextModel.capability === "native-editable"
      ? `${pageTextModel.editableSpanCount} text span${pageTextModel.editableSpanCount === 1 ? "" : "s"} editable`
      : pageTextModel.capability === "mixed"
        ? `${pageTextModel.editableSpanCount} editable · ${pageTextModel.viewOnlySpanCount + pageTextModel.unsupportedSpanCount} limited`
        : pageTextModel.capability === "no-detected-text"
          ? "No native text detected"
          : "Text detected · direct editing limited"
    : "";

  // Best-effort embedded-font preview. A failed FontFace registration is
  // expected for many PDF subsets (especially ones without browser cmap
  // metadata), so the deterministic metric-compatible CSS fallback remains
  // visible and the edit itself is never blocked.
  useEffect(() => {
    if (!fontRegistry || !singleSelectedSpan || !singleSelectedRunMatch) return;
    const resourceName = singleSelectedRunMatch.operator.fontResourceName;
    if (!resourceName || !singleSelectedSpan.fontProfile?.browserPreviewPossible) return;

    let cancelled = false;
    void fontRegistry
      .ensureBrowserFont(singleSelectedRunMatch.locatedOperator.resources, resourceName)
      .then((family) => {
        if (cancelled || !family) return;
        const fallback = singleSelectedSpan.fontProfile?.cssFallbackFamily ?? "sans-serif";
        setBrowserFontPreview({
          spanId: singleSelectedSpan.id,
          family: `"${family}", ${fallback}`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [fontRegistry, singleSelectedSpan, singleSelectedRunMatch]);

  // Phase 29: the inline editor's Apply/Cancel toolbar (and its error
  // tooltip further below) render below the run by default -- for a run
  // near the bottom edge of the page, that can land outside the stage's
  // own clipped bounds. A larger margin than the default (real room is
  // needed for buttons + gap + tooltip, not just the buttons alone) flips
  // the whole stack above the run instead when there isn't room below.
  // Computed unconditionally (cheap; singleSelectedRun null-safe via ?.)
  // rather than inside the JSX below, so it stays plain render-time
  // derivation, not a nested closure the React Compiler's static analysis
  // has to reason about.
  const inlineEditorVerticalPlacement = singleSelectedRun
    ? pickVerticalPlacement(singleSelectedRun.yPct, singleSelectedRun.yPct + singleSelectedRun.heightPct, 24, true)
    : "below";
  const inlineEditorHorizontalAlign = singleSelectedRun
    ? pickHorizontalAlign(singleSelectedRun.xPct, singleSelectedRun.xPct + singleSelectedRun.widthPct)
    : "start";
  const inlineEditorToolbarPositionClass = inlineEditorVerticalPlacement === "below" ? "top-full mt-1" : "bottom-full mb-1";
  const nativeFormatPanelPositionClass = inlineEditorVerticalPlacement === "below" ? "top-full mt-12" : "bottom-full mb-12";
  const inlineEditorTooltipPositionClass = nativeFormatOpen
    ? inlineEditorVerticalPlacement === "below"
      ? "top-full mt-[12rem]"
      : "bottom-full mb-[12rem]"
    : inlineEditorVerticalPlacement === "below"
      ? "top-full mt-11"
      : "bottom-full mb-11";
  const inlineEditorHorizontalClass = inlineEditorHorizontalAlign === "end" ? "right-0" : "left-0";

  const generateEditedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "edit" });

    try {
      // Not read from editEngineRef here -- export can be reached even if
      // the user only ever placed overlay elements and never touched
      // existing text, so the pdfLibDoc-loading effect that normally
      // populates the ref isn't guaranteed to have run first. loadEditEngine
      // is cached/idempotent (see its own doc comment), so calling it again
      // here is a cheap no-op if already loaded, and otherwise loads it now.
      const engine = await loadEditEngine();
      const { bytes, skippedPages } = await runWithTimeout(
        engine.exportEditedPdf(copyArrayBuffer(pdf.bytes), elements),
        "Generating the PDF took too long. Try fewer elements or a smaller file.",
      );
      if (skippedPages.length > 0) {
        setError(`Page${skippedPages.length === 1 ? "" : "s"} ${skippedPages.map((p) => p + 1).join(", ")} could not be updated and were left unchanged.`);
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "edit", durationMs: performance.now() - startedAt, success: true });
      recordRecentFile({ tool: "edit", filename: sanitizePdfFileName(outputName), fileSize: blob.size, pageCount: pdf.pageCount });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the PDF. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "edit", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, elements, outputName, track]);

  function downloadEditedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "edit" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  if (!pdf) {
    return (
      <section ref={uploadClientReadyRef} className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          <L2UploadStage
            inputId="edit-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<EditIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={(files) => void addFile(files)}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div role="alert" className="mx-auto w-full max-w-[720px] rounded-[var(--radius-lg)] border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="relative l2-workspace-deep grid gap-4 pb-40 lg:pb-28"
      data-edit-operation-count={historyState.session.operations.length}
      data-edit-session-next-sequence={historyState.session.nextSequence}
    >
      <L2WorkspaceHeader
        title="Edit PDF"
        description={`${pdf.file.name} · ${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
      />

      {/* Phase 27: a coherent document toolbar -- undo/redo, page navigation,
          and zoom each get their own visually grouped cluster (divider rules
          between them) instead of one flat row of same-weight pill buttons,
          so the toolbar reads as organized document controls, not a random
          list. Icon buttons for the frequent actions; Fit/Start new stay as
          labeled pills since they're occasional, not repeated, actions. */}
      <div className="aura-glass-thin sticky top-[5.75rem] z-10 flex flex-wrap items-center gap-1.5 rounded-[var(--radius-xl)] px-2.5 py-2 shadow-[var(--v2-elevation-1)]">
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className="grid h-9 !w-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-30">
            <UndoIcon />
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="grid h-9 !w-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-30">
            <RedoIcon />
          </button>
        </div>

        <div className="mx-1 h-6 w-px shrink-0 bg-[var(--text-primary)]/10" />

        <L2ToolbarButton
          onClick={() => {
            setTextSearchOpen((open) => {
              const next = !open;
              if (!next) setTextSearchIndexBusy(false);
              return next;
            });
            requestAnimationFrame(() => textSearchInputRef.current?.focus());
          }}
        >
          Find
        </L2ToolbarButton>

        <label className="ml-auto flex items-center gap-1.5">
          <span className="sr-only">File name</span>
          <input
            value={outputName}
            onChange={(e) => {
              setOutputName(e.target.value);
              setDownloadUrl("");
            }}
            className="w-36 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45 sm:w-48"
            placeholder="lumeo-edited.pdf"
          />
        </label>

        <L2ToolbarButton
          onClick={() => {
            // Phase 28: resetTool() wipes every placed element, every text
            // edit, and the entire undo stack with no way back -- fine on a
            // freshly uploaded, untouched file (no confirmation needed, per
            // the same "don't add ceremony where nothing is at risk"
            // reasoning the rest of this tool follows), but a real risk of
            // silent data loss on a misclick once the user has actually done
            // something. hasTextEdits/elements.length is the exact same
            // "has this document changed" signal the Export button already
            // uses -- no new state, just gating an existing destructive
            // action on it.
            if ((elements.length > 0 || hasTextEdits) && !window.confirm("Start a new PDF? Your current edits will be discarded.")) return;
            resetTool();
          }}
        >
          Start new
        </L2ToolbarButton>
      </div>

      {textSearchOpen ? (
        <div
          data-edit-search-panel
          className="aura-glass-thin grid gap-3 rounded-[var(--radius-xl)] border border-[var(--text-primary)]/10 p-3 shadow-[var(--v2-elevation-1)]"
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[min(100%,18rem)] flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Find
              </span>
              <input
                ref={textSearchInputRef}
                role="searchbox"
                aria-label="Find text in PDF"
                value={textSearchQuery}
                onChange={(event) => {
                  setTextSearchQuery(event.target.value);
                  if (!event.target.value.trim()) setTextSearchIndexBusy(false);
                  setTextSearchActiveIndex(-1);
                }}
                placeholder="Search PDF text"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)] focus:ring-2 focus:ring-[var(--lumeo-gold)]/20"
              />
            </label>

            <label className="min-w-32">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Scope
              </span>
              <select
                aria-label="Search scope"
                value={textSearchScope}
                onChange={(event) => {
                  const nextScope = event.target.value as PdfTextSearchScope;
                  setTextSearchScope(nextScope);
                  if (nextScope === "page") setTextSearchIndexBusy(false);
                  setTextSearchActiveIndex(-1);
                }}
                className="h-10 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-input)] px-2 text-xs font-semibold text-[var(--text-primary)]"
              >
                <option value="document">Document</option>
                <option value="page">This page</option>
              </select>
            </label>

            <label className="flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-2 text-xs font-semibold text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={textSearchCaseSensitive}
                onChange={(event) => {
                  setTextSearchCaseSensitive(event.target.checked);
                  setTextSearchActiveIndex(-1);
                }}
              />
              Aa
            </label>
            <label className="flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-2 text-xs font-semibold text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={textSearchWholeWord}
                onChange={(event) => {
                  setTextSearchWholeWord(event.target.checked);
                  setTextSearchActiveIndex(-1);
                }}
              />
              Whole word
            </label>

            <div className="ml-auto flex h-10 items-center gap-1">
              <span
                data-edit-search-match-count={textSearchMatches.length}
                className="min-w-20 px-2 text-center text-xs font-semibold text-[var(--text-secondary)]"
              >
                {textSearchIndexBusy && textSearchScope === "document"
                  ? `Indexing… ${textSearchMatches.length} found`
                  : textSearchMatches.length > 0
                    ? `${normalizedTextSearchIndex + 1} / ${textSearchMatches.length}`
                    : textSearchQuery.trim()
                      ? "No matches"
                      : "Type to find"}
              </span>
              <button
                type="button"
                aria-label="Previous search match"
                disabled={textSearchMatches.length === 0}
                onClick={() => stepTextSearch(-1)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-xs font-bold text-[var(--text-primary)] disabled:opacity-35"
              >
                Prev
              </button>
              <button
                type="button"
                aria-label="Next search match"
                disabled={textSearchMatches.length === 0}
                onClick={() => stepTextSearch(1)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-xs font-bold text-[var(--text-primary)] disabled:opacity-35"
              >
                Next
              </button>
              <button
                type="button"
                aria-label="Close find"
                onClick={() => {
                  setTextSearchOpen(false);
                  setTextSearchIndexBusy(false);
                }}
                className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/[0.06]"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--text-primary)]/8 pt-2">
            <label className="min-w-[min(100%,18rem)] flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Replace with
              </span>
              <input
                aria-label="Replace search match with"
                value={textSearchReplacement}
                onChange={(event) => setTextSearchReplacement(event.target.value)}
                placeholder="Leave empty to delete the match"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)] focus:ring-2 focus:ring-[var(--lumeo-gold)]/20"
              />
            </label>
            <button
              type="button"
              onClick={prepareActiveTextSearchReplacement}
              disabled={!activeTextSearchReplacementPlan}
              className="h-10 rounded-[var(--radius-md)] bg-[var(--lumeo-gold)] px-4 text-xs font-bold text-[var(--atelier-surface-0)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Replace this match
            </button>
            <span className="pb-2 text-[10px] leading-4 text-[var(--text-secondary)]">
              {activeTextSearchMatch?.pageIndex !== pageIndex
                ? "Navigate to the match first."
                : activeTextSearchMatch?.capability === "editable"
                  ? "Prepared replacements still pass the normal layout/fidelity check before Apply."
                  : activeTextSearchMatch?.capabilityReason ?? "Only safely editable native text can be replaced."}
            </span>
          </div>
        </div>
      ) : null}

      <div className="relative min-w-0">
        {/* Phase 27: the canvas panel is now the unambiguous hero -- no file
            card, no secondary page-nav bar duplicating the toolbar's own
            (that duplication was the single largest source of "sidebar
            clutter" in the old layout). A darker inset backdrop behind the
            white page gives it real presence instead of sitting flush
            against the same glass tone as every other panel. */}
        <div className="aura-glass-thin min-w-0 rounded-[var(--radius-2xl)] p-3 shadow-[var(--v2-elevation-1)] sm:p-5">
            {/* The page rail is desktop-only (`hidden lg:flex` on its
                wrapper): a 124px column plus the stage does not fit a phone
                without shrinking the page to the point of uselessness, and
                page reordering by drag is a pointer interaction anyway. */}
            <div className="flex gap-3 sm:pl-[68px]">
              {pdfMeta && pdfMeta.pageCount > 1 ? (
                <div className="hidden max-h-[70vh] lg:flex">
                  <PageThumbnailSidebar
                    pageCount={pdfMeta.pageCount}
                    activePageIndex={pageIndex}
                    docReady={docReady}
                    getDocument={getPdfJsDocument}
                    selected={selectedPages}
                    busy={pageOpBusy}
                    onSelectPage={setPageIndex}
                    onToggleSelected={togglePageSelected}
                    onReorder={handleReorderPages}
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
            {error ? (
              // Phase 28: previously the loading skeleton (below) had no
              // `error` check of its own, so a render failure/timeout left
              // BOTH the "Loading page preview…" skeleton and this error
              // message on screen at once (pageImageUrl/pageDisplaySize
              // never populate on a failed render, so the skeleton's own
              // condition stayed true forever) -- a visibly contradictory
              // state, not just a slow one. Error now takes priority over
              // the skeleton outright: loading, error, and the actual page
              // are mutually exclusive states, matching how a real user
              // reads this panel.
              <div role="alert" className="flex h-64 flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-center sm:h-96">
                <span className="text-sm font-medium text-[var(--text-danger)]">{error}</span>
              </div>
            ) : pageLoading || !pageImageUrl || !pageDisplaySize ? (
              // Phase 12: an animated skeleton in place of a flat "Loading..."
              // box -- signals real, ongoing progress (a still, static
              // placeholder reads as stuck/broken on a slow connection or
              // large file) without needing a spinner asset. animate-pulse is
              // Tailwind's built-in opacity-breathing keyframe.
              <div className="flex h-64 flex-col items-center justify-center gap-3 overflow-hidden rounded-[var(--radius-xl)] bg-[var(--atelier-surface-0)]/[0.35] sm:h-96">
                <div className="h-40 w-32 animate-pulse rounded-md bg-[var(--text-primary)]/10" />
                <span className="text-sm font-medium text-[var(--text-primary)]/40">Loading page preview…</span>
              </div>
            ) : (
              // The page's own scroll viewport. The stage below is sized
              // purely by its aspect ratio, so a portrait page on a wide
              // screen is taller than the window -- this scrolls it instead
              // of clipping it, and is also what makes zooming past 100%
              // pannable rather than cropping the page's right/bottom edge.
              // Capped against the viewport (not a fixed pixel height) so the
              // page uses whatever vertical room the window actually has; the
              // subtracted space is the app header + document toolbar stacked
              // above it.
              <div
                className="lumeo-canvas-scroll overflow-auto overscroll-contain rounded-[var(--radius-xl)] bg-[var(--atelier-surface-0)]/[0.35] p-3 sm:p-6"
                style={{ maxHeight: "calc(100vh - 15rem)" }}
              >
              <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
                {/* Deliberately has no max-height: combined with aspectRatio
                    and w-full, a height cap squashes the page out of its true
                    proportions (the img inside is h-full w-full, so it
                    stretches to fill whatever the capped box becomes) instead
                    of scaling it down. The scroll viewport above bounds the
                    visible area instead, keeping the real aspect ratio intact
                    at every zoom level. overflow-hidden stays -- that's the
                    page's own content boundary, the one floating controls are
                    placed against (lib/pdf/edit/floatingControlPlacement.ts). */}
                <div
                  ref={stageRef}
                  onClick={handleStageClick}
                  onMouseMove={handleStageMouseMove}
                  onMouseLeave={handleStageMouseLeave}
                  onKeyDown={handleStageKeyDown}
                  onPointerDown={handleWhiteoutPointerDown}
                  onPointerMove={handleWhiteoutPointerMove}
                  onPointerUp={handleWhiteoutPointerUp}
                  onWheel={(event) => {
                    // Phase 13: Ctrl/Cmd+scroll zoom -- the Figma/Photoshop/
                    // Google-Maps convention, and the same trackpad gesture
                    // Chrome/Safari themselves already turn into a synthetic
                    // ctrlKey wheel event for pinch-zoom. Only intercepts
                    // when the modifier is held, so ordinary scrolling (to
                    // reach the sidebar below the stage on mobile/narrow
                    // viewports) is completely unaffected.
                    if (!event.ctrlKey && !event.metaKey) return;
                    event.preventDefault();
                    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - event.deltaY * 0.001)));
                  }}
                  className={`relative mx-auto w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white ${activeTool !== "select" && activeTool !== "draw" ? "cursor-crosshair" : ""} ${activeTool === "whiteout" ? "touch-none" : ""}`}
                  style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}` }}
                >
                  {textDetectionCurrent && pageTextModel ? (
                    <div
                      data-edit-page-capability={pageTextModel.capability}
                      role="status"
                      className="pointer-events-none absolute right-2 top-2 z-20 rounded-full border border-black/10 bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#343842] shadow-sm backdrop-blur-sm"
                    >
                      {pageCapabilityLabel}
                    </div>
                  ) : null}

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageImageUrl} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none block h-full w-full select-none" />

                  {whiteoutDraft ? (
                    // Phase 11: live drag-to-create preview -- semi-transparent
                    // so the text/content underneath stays visible while
                    // positioning ("show exactly what will be hidden"), with a
                    // gold border when snapped to a detected text run's exact
                    // bounds vs. a neutral border for a freehand drag.
                    <div
                      className={`pointer-events-none absolute z-20 rounded-[2px] border-2 border-dashed bg-white/55 ${whiteoutDraft.snapped ? "border-[var(--lumeo-gold)]" : "border-[var(--text-primary)]/40"}`}
                      style={{
                        left: `${whiteoutDraft.xPct}%`,
                        top: `${whiteoutDraft.yPct}%`,
                        width: `${whiteoutDraft.widthPct}%`,
                        height: `${whiteoutDraft.heightPct}%`,
                      }}
                    />
                  ) : null}

                  {/* Placed elements are INERT while redact mode owns the
                      page. Unlike the inline editor -- which is closed
                      outright because a dead-looking editor is its own
                      confusion -- a redaction mask must stay VISIBLE; it is
                      the redaction. What it must not be is interactive.
                      Without this the mask kept role="button" and tabindex
                      0 behind the drag surface, so it was focusable AND
                      activatable from the keyboard while unreachable by
                      mouse -- the same split that let Tab fire Restyle. */}
                  <div inert={redactMode} className="contents">
                  {currentPageElements.map((element) => (
                    <EditElementView
                      key={element.id}
                      element={element}
                      selected={selectedId === element.id}
                      stageRef={stageRef}
                      onSelect={() => {
                        // Phase 31: mirrors selectTextRun's own mutual-
                        // exclusivity fix -- selecting a placed element must
                        // clear any active text-run selection too, or both
                        // could show their own floating controls at once.
                        selectTextRun(null);
                        setSelectedId(element.id);
                      }}
                      onChange={(patch) => setElements((current) => patchElement(current, element.id, patch))}
                      onDelete={() => {
                        setElements((current) => deleteElement(current, element.id));
                        setSelectedId(null);
                      }}
                      onTextChange={(text) => setElements((current) => patchElement(current, element.id, { text } as Partial<EditElement>))}
                      pixelsPerPoint={pixelsPerPoint}
                    />
                  ))}
                  </div>

                  {activeTool === "draw" && pageDisplaySize ? (
                    <InkCanvas
                      stageWidthPx={pageDisplaySize.width}
                      stageHeightPx={pageDisplaySize.height}
                      color={inkColor}
                      strokeWidthPx={inkStrokeWidth}
                      onStrokeComplete={handleInkStroke}
                    />
                  ) : null}

                  {textSearchOpen && currentPageTextSearchMatches.length > 0 ? (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[12]">
                      {currentPageTextSearchMatches.map((match) => {
                        const active = activeTextSearchMatch?.id === match.id;
                        return (
                          <div
                            key={match.id}
                            data-edit-search-highlight={active ? "active" : "match"}
                            className={
                              active
                                ? "absolute rounded-[2px] border-2 border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/28 shadow-[0_0_0_1px_rgba(255,255,255,0.6)]"
                                : "absolute rounded-[2px] border border-[var(--lumeo-gold)]/60 bg-[var(--lumeo-gold)]/14"
                            }
                            style={{
                              left: `${match.boundsPct.xPct}%`,
                              top: `${match.boundsPct.yPct}%`,
                              width: `${match.boundsPct.widthPct}%`,
                              height: `${match.boundsPct.heightPct}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : null}

                  {textDetectionCurrent && detectedTextRuns.length > 0 ? (
                    // Phase 10.2: kept mounted regardless of activeTool (a CSS
                    // display toggle, not a conditional unmount) -- measured
                    // root cause of "tool switching feels slow on a text-heavy
                    // page": the old `activeTool === "select" ? runs.map(...) :
                    // null` fully unmounted every TextRunOverlay on leaving
                    // Select and remounted (not just re-rendered) all of them
                    // on returning, defeating the React.memo wrapping added in
                    // Phase 10 and paying full DOM node creation cost on every
                    // switch back. display:none also removes this subtree from
                    // hit-testing and the focus/tab order for free, so hidden
                    // runs can't intercept clicks meant for another tool.
                    <div style={activeTool === "select" ? undefined : { display: "none" }}>
                      {detectedTextRuns.map((run, index) => (
                        <TextRunOverlay
                          // detectedTextRuns is fully replaced (not reordered/spliced) on every
                          // page load or edit apply, so an index key is safe here.
                          key={index}
                          run={run}
                          editable={Boolean(editableRunMatches[index])}
                          selected={selectedRunIndices.includes(index)}
                          hovered={hoveredRunIndex === index}
                          onSelect={(shiftKey) => selectTextRunAndFocus(index, shiftKey)}
                          onHoverStart={() => setHoveredRunIndex((current) => (current === index ? current : index))}
                          onHoverEnd={() => setHoveredRunIndex((current) => (current === -1 ? current : -1))}
                          onFocusRun={() => setFocusedRunIndex(index)}
                          registerNode={(node) => {
                            if (node) runOverlayNodesRef.current.set(index, node);
                            else runOverlayNodesRef.current.delete(index);
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  {privacyShieldMatches.length > 0 ? (
                    <>
                      {privacyShieldMatches.map((match, index) => (
                        <button
                          key={`${match.run.xPct}-${match.run.yPct}-${index}`}
                          type="button"
                          onClick={() => dismissPrivacyShieldMatch(index)}
                          title={`${match.category} match -- click to exclude from redaction`}
                          className="absolute z-20 rounded-[2px] border-2 border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10"
                          style={{
                            left: `${match.run.xPct}%`,
                            top: `${match.run.yPct}%`,
                            width: `${match.run.widthPct}%`,
                            height: `${match.run.heightPct}%`,
                          }}
                        />
                      ))}
                      {/* The compliance caveat belongs here more than
                          anywhere else in this tool: the Whiteout tool
                          already carries it, and this feature applies the
                          very same visual-only cover while calling the
                          result a redaction. Saying so at the moment of
                          the action, not buried in a tool description. */}
                      <div className="absolute z-30 bottom-24 left-1/2 flex max-w-[min(92vw,30rem)] -translate-x-1/2 flex-col items-center gap-1.5 rounded-[var(--radius-xl)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 px-3 py-2 shadow-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]/70">{privacyShieldMatches.length} match{privacyShieldMatches.length === 1 ? "" : "es"} found</span>
                          <button
                            type="button"
                            onClick={applyPrivacyShieldRedactions}
                            className="min-h-11 rounded-full bg-[var(--lumeo-gold)]/90 px-3 text-xs font-bold text-[var(--atelier-surface-0)] transition hover:bg-[var(--lumeo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                          >
                            Apply redactions
                          </button>
                        </div>
                        <p className="text-center text-[10px] leading-4 text-[var(--text-primary)]/50">
                          Pattern matching, not a guarantee — check the page yourself. Redactions cover content visually; the original text remains in the file.
                        </p>
                      </div>
                    </>
                  ) : null}

                  {activeTool === "select" && textDetectionCurrent && singleSelectedRun && singleSelectedRunMatch ? (
                    // Phase 11: true inline editing -- a caret appears
                    // directly over the clicked text (positioned with the
                    // exact same percent box TextRunOverlay uses for this
                    // run) instead of requiring a trip to the sidebar. The
                    // floating Apply/Cancel pair below it is the ONLY
                    // required UI for finishing the edit; the sidebar's
                    // "Replace with" field (same editDraftText state) still
                    // works too, but is now optional, not the primary path.
                    //
                    // Phase 29: the Apply/Cancel pair (and its error tooltip
                    // further below) render BELOW the run by default -- for
                    // a run near the bottom edge of the page, that can land
                    // outside the stage's own clipped bounds.
                    // inlineEditorToolbarPositionClass/inlineEditorTooltipPositionClass/
                    // inlineEditorHorizontalClass (computed above, outside
                    // this JSX) flip the whole stack above/aside the run
                    // instead when there isn't room -- see their own
                    // comment for why they're derived up there and not
                    // inline here.
                    <div
                      data-edit-inline-panel
                      className="absolute z-30"
                      style={{
                        left: `${singleSelectedRun.xPct}%`,
                        top: `${singleSelectedRun.yPct}%`,
                        width: `${singleSelectedRun.widthPct}%`,
                        height: `${singleSelectedRun.heightPct}%`,
                      }}
                    >
                      <input
                        ref={inlineEditInputRef}
                        value={editDraftText}
                        onChange={(event) => {
                          handleEditDraftTextChange(event.currentTarget.value);
                          syncSingleSpanLogicalSelection(event.currentTarget);
                        }}
                        onSelect={(event) => {
                          event.stopPropagation();
                          syncSingleSpanLogicalSelection(event.currentTarget);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (canApplyEdit) void applyTextRunEdit();
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            selectTextRun(null);
                          }
                        }}
                        aria-label="Edit text"
                        data-logical-selection-start={logicalSelectionStart ?? undefined}
                        data-logical-selection-end={logicalSelectionEnd ?? undefined}
                        data-logical-selection-direction={logicalSelectionDirection}
                        data-logical-selection-collapsed={logicalSelection?.collapsed ? "true" : "false"}
                        data-caret-style-snapshot={activeCaretTextStyleSnapshot ? "true" : "false"}
                        data-native-fill-color={activeNativeStyleDraft?.fillColorHex ?? singleSelectedSpan?.style.fillColor?.cssHex ?? undefined}
                        data-native-fill-opacity={singleSelectedSpan?.style.fillOpacity ?? undefined}
                        // lumeo-page-overlay-input opts out of the app-chrome
                        // input styling in globals.css, whose themed
                        // --surface-input was beating this bg-white on
                        // specificity and rendering a dark pill on the page.
                        //
                        // Ink is an explicit dark value, NOT --text-primary:
                        // that token is ivory (this app has one palette, no
                        // light variant), which was only readable before
                        // because the same rule that forced it also forced a
                        // dark background. Against the white page this editor
                        // actually sits on it would be invisible. #12141a is
                        // the same ink lib/pdf/edit/elements.ts gives a newly
                        // placed text element, so a run being edited in place
                        // and a text box dropped next to it read identically.
                        className="lumeo-page-overlay-input h-full w-full rounded-[3px] border border-[var(--lumeo-gold)] bg-white px-0.5 font-semibold text-[#12141a] shadow-[0_0_0_3px_rgba(var(--lumeo-gold-rgb),0.16)] outline-none"
                        style={{
                          fontSize: `${overlayFontSizePx(
                            activeNativeStyleDraft?.fontSizePt ?? singleSelectedRun.fontSizePt,
                            pagePointSize?.width ?? 0,
                            stageWidthPx,
                          )}px`,
                          fontFamily: inlineEditorFontFamily,
                          fontWeight: singleSelectedSpan?.style.weight ?? 600,
                          fontStyle: singleSelectedSpan?.style.italic ? "italic" : "normal",
                          color: cssTextPaint(
                            activeNativeStyleDraft?.fillColorHex ?? singleSelectedSpan?.style.fillColor?.cssHex,
                            singleSelectedSpan?.style.fillOpacity,
                          ),
                          letterSpacing:
                            activeNativeStyleDraft && activeNativeStyleDraft.charSpacing !== 0
                              ? `${(activeNativeStyleDraft.charSpacing / Math.max(1, activeNativeStyleDraft.fontSizePt)).toFixed(4)}em`
                              : undefined,
                          wordSpacing:
                            activeNativeStyleDraft && activeNativeStyleDraft.wordSpacing !== 0
                              ? `${(activeNativeStyleDraft.wordSpacing / Math.max(1, activeNativeStyleDraft.fontSizePt)).toFixed(4)}em`
                              : undefined,
                        }}
                      />
                      {/* Phase 12: icon-only pair (checkmark/X), matching the
                          compact inline-toolbar convention professional PDF/doc
                          editors use for a single-run edit, instead of text
                          labels that read heavier next to one line of text.
                          Compact by design (36px circles, not the app's usual
                          44px minimum) -- this is a secondary/optional floating
                          toolbar, not a primary navigation control; 36px still
                          comfortably clears WCAG's minimum (24px) target-size
                          guidance. */}
                      <div className={`absolute z-30 flex gap-1.5 whitespace-nowrap ${inlineEditorToolbarPositionClass} ${inlineEditorHorizontalClass}`}>
                        <button
                          type="button"
                          data-edit-inline-apply
                          onClick={(event) => {
                            event.stopPropagation();
                            void applyTextRunEdit();
                          }}
                          disabled={!canApplyEdit}
                          aria-label={isApplyingEdit ? "Applying edit" : "Apply edit"}
                          title="Apply (Enter)"
                          className="grid h-9 !w-9 shrink-0 place-items-center rounded-full border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/90 text-[var(--atelier-surface-0)] shadow-lg transition hover:bg-[var(--lumeo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isApplyingEdit ? (
                            <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--atelier-surface-0)]/30 border-t-[var(--atelier-surface-0)]" />
                          ) : (
                            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                              <path d="M4 10.5 8 14.5 16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectTextRun(null);
                          }}
                          aria-label="Cancel edit"
                          title="Cancel (Esc)"
                          className="grid h-9 !w-9 shrink-0 place-items-center rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 text-[var(--text-primary)]/70 shadow-lg transition hover:border-[var(--text-primary)]/24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                            <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (nativeFormatOpen) {
                              setNativeFormatOpen(false);
                              return;
                            }
                            if (singleSelectedSpan) {
                              setNativeStyleDraft({
                                spanId: singleSelectedSpan.id,
                                fontSizePt: singleSelectedSpan.style.fontSizePt,
                                charSpacing: singleSelectedSpan.style.charSpacingPt,
                                wordSpacing: singleSelectedSpan.style.wordSpacingPt,
                                horizontalScalingPct: singleSelectedSpan.style.horizontalScalingPct,
                                fillColorHex: nativeFillCapability?.editable
                                  ? nativeFillCapability.sourceColor?.cssHex ?? null
                                  : null,
                              });
                              setNativeFormatOpen(true);
                            }
                          }}
                          aria-expanded={nativeFormatOpen}
                          aria-controls="native-text-format-panel"
                          className={`grid h-9 shrink-0 place-items-center rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.1em] shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${
                            nativeFormatOpen
                              ? "border-[var(--lumeo-gold)]/60 bg-[var(--lumeo-gold)]/15 text-[var(--text-primary)]"
                              : "border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 text-[var(--text-primary)]/70 hover:border-[var(--text-primary)]/24"
                          }`}
                        >
                          Format
                        </button>
                        {/* Restyle remains the fallback for appearance changes
                            the native writer cannot prove safe (font-face,
                            unsupported paint states and alignment), not the normal
                            path for supported native formatting. */}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void restyleSelectedRun();
                          }}
                          aria-label="Restyle this text"
                          title="Restyle -- use a replacement text box for font-face or other appearance changes that cannot be applied safely in place"
                          className="grid h-9 shrink-0 place-items-center rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)]/70 shadow-lg transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                        >
                          Restyle
                        </button>
                      </div>

                      {nativeFormatOpen && nativeStyleDraft && singleSelectedSpan ? (
                        <NativeTextFormatPanel
                          span={singleSelectedSpan}
                          draft={nativeStyleDraft}
                          fillCapability={nativeFillCapability}
                          panelPositionClass={nativeFormatPanelPositionClass}
                          horizontalClass={inlineEditorHorizontalClass}
                          onPatchDraft={(patch) => {
                            setNativeStyleDraft((current) => current ? { ...current, ...patch } : current);
                          }}
                          onResetDraft={() => {
                            setNativeStyleDraft({
                              spanId: singleSelectedSpan.id,
                              fontSizePt: singleSelectedSpan.style.fontSizePt,
                              charSpacing: singleSelectedSpan.style.charSpacingPt,
                              wordSpacing: singleSelectedSpan.style.wordSpacingPt,
                              horizontalScalingPct: singleSelectedSpan.style.horizontalScalingPct,
                              fillColorHex: nativeFillCapability?.editable
                                ? nativeFillCapability.sourceColor?.cssHex ?? null
                                : null,
                            });
                          }}
                          onClearApplyError={() => setEditApplyError("")}
                        />
                      ) : null}

                      {/* Three mutually exclusive states, in priority order:
                          an error from the last Apply; the substitute-font
                          offer (a rejection the user CAN act on); and a plain
                          rejection they can't. The offer is styled as a
                          neutral notice rather than an error because it isn't
                          a dead end -- there's a button right there. */}
                      {editApplyError ? (
                        <div role="alert" className={`absolute z-30 max-w-[220px] rounded-md border border-[var(--border-danger)]/25 bg-[var(--surface-danger)] px-2 py-1 text-[10px] font-semibold leading-4 text-[var(--text-danger)] shadow-lg ${inlineEditorTooltipPositionClass} ${inlineEditorHorizontalClass}`}>
                          {editApplyError}
                        </div>
                      ) : editPreview.kind === "single" && editPreview.substituteFont ? (
                        <div className={`absolute z-30 max-w-[240px] rounded-md border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 px-2 py-1.5 text-[10px] leading-4 text-[var(--text-primary)]/75 shadow-lg ${inlineEditorTooltipPositionClass} ${inlineEditorHorizontalClass}`}>
                          {useSubstituteFont ? (
                            <span>
                              This line will be set in{" "}
                              <strong className="font-semibold text-[var(--text-primary)]">{readableFontName(editPreview.substituteFont)}</strong>, a
                              close match. The rest of the page is unchanged.
                            </span>
                          ) : (
                            <>
                              <span className="block">
                                This font doesn&apos;t include every character you typed. Lumeo can set just this line in{" "}
                                <strong className="font-semibold text-[var(--text-primary)]">{readableFontName(editPreview.substituteFont)}</strong>, a
                                close match.
                              </span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setUseSubstituteFont(true);
                                }}
                                className="mt-1.5 inline-flex min-h-8 items-center rounded-full border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/90 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--atelier-surface-0)] transition hover:bg-[var(--lumeo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                              >
                                Use {readableFontName(editPreview.substituteFont)}
                              </button>
                            </>
                          )}
                        </div>
                      ) : replacementLayoutDecision && !replacementLayoutDecision.safeToApplyWithCurrentWriter && replacementLayoutDecision.reason ? (
                        <div role="alert" data-edit-layout-strategy={replacementLayoutDecision.strategy} className={`pointer-events-none absolute z-30 max-w-[260px] rounded-md border border-[var(--lumeo-gold)]/30 bg-[var(--atelier-surface-1)]/95 px-2 py-1.5 text-[10px] font-semibold leading-4 text-[var(--text-primary)] shadow-lg ${inlineEditorTooltipPositionClass} ${inlineEditorHorizontalClass}`}>
                          {replacementLayoutDecision.reason}
                        </div>
                      ) : editPreview.kind !== "empty" && !editPreview.editable && editPreview.reason ? (
                        <div role="alert" className={`absolute z-30 max-w-[220px] rounded-md border border-[var(--border-danger)]/25 bg-[var(--surface-danger)] px-2 py-1 text-[10px] font-semibold leading-4 text-[var(--text-danger)] shadow-lg ${inlineEditorTooltipPositionClass} ${inlineEditorHorizontalClass}`}>
                          {editPreview.reason}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Shown only when a Restyle could NOT blank the original
                      glyphs (see restyleSelectedRun). In the common case the
                      text really is gone from the file and there is nothing
                      to disclose, so this stays hidden -- it is not blanket
                      boilerplate on every restyle. Wording deliberately
                      mirrors Privacy Shield's own caveat, since this is the
                      same property: covered visually, still present in the
                      file. */}
                  {restyleKeptOriginalText ? (
                    <div
                      role="status"
                      className="absolute left-1/2 top-3 z-30 flex max-w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-lg border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 px-3 py-2 text-[11px] leading-4 text-[var(--text-primary)]/80 shadow-lg"
                    >
                      <span>
                        This line was covered, but its original text couldn&apos;t be removed from the file — it can still be
                        found by search or copy-paste. Use Whiteout plus a new text box if that matters.
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRestyleKeptOriginalText(false);
                        }}
                        aria-label="Dismiss notice"
                        className="grid h-5 !w-5 shrink-0 place-items-center rounded-full text-[var(--text-primary)]/50 transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3" fill="none">
                          <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ) : null}

                  {activeTool === "select" && textDetectionCurrent && selectedRunIndices.length > 1 && editPreview.kind === "multi" ? (
                    // Multi-run selection has no per-run inline editor (that's
                    // scoped to a single run) -- this compact floating panel,
                    // anchored to the first selected run, is the only UI path
                    // to apply a multi-run edit. Kept fully separate from
                    // FloatingIsland/MicroDock: the spec requires FloatingIsland
                    // to never activate for existing-PDF-text-run selections.
                    <div
                      data-edit-multi-run-panel
                      className="absolute z-30"
                      style={{
                        left: `${detectedTextRuns[selectedRunIndices[0]].xPct}%`,
                        top: `${detectedTextRuns[selectedRunIndices[0]].yPct}%`,
                      }}
                      data-logical-selection-span-count={logicalSelection?.spanIds.length ?? 0}
                      data-logical-selection-whole-spans={
                        pageTextModel && logicalRangeCoversWholeSpans(logicalSelection, pageTextModel)
                          ? "true"
                          : "false"
                      }
                    >
                      <div className="w-72 rounded-[var(--radius-lg)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 p-3 shadow-lg">
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">Replace with ({selectedRunIndices.length} runs selected)</span>
                        <input
                          data-edit-multi-run-input
                          aria-label="Edit selected text runs"
                          value={editDraftText}
                          onChange={(event) => {
                            handleEditDraftTextChange(event.target.value);
                          }}
                          className="mt-1 w-full rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            data-edit-multi-run-apply
                            disabled={!canApplyEdit}
                            onClick={() => void applyTextRunEdit()}
                            className="min-h-11 flex-1 rounded-lg border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/10 px-2.5 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--lumeo-gold)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isApplyingEdit ? "Applying..." : "Apply edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditApplyError("");
                              setNativeFormatOpen((current) => !current);
                            }}
                            aria-expanded={nativeFormatOpen}
                            aria-controls="native-text-mixed-format-panel"
                            className={`min-h-11 rounded-lg border px-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${
                              nativeFormatOpen
                                ? "border-[var(--lumeo-gold)]/55 bg-[var(--lumeo-gold)]/12 text-[var(--text-primary)]"
                                : "border-[var(--text-primary)]/14 text-[var(--text-primary)]/70 hover:border-[var(--text-primary)]/24"
                            }`}
                          >
                            Format
                          </button>
                          <button
                            type="button"
                            onClick={() => selectTextRun(null)}
                            className="min-h-11 rounded-lg border border-[var(--text-primary)]/14 px-2.5 text-xs font-bold text-[var(--text-primary)]/70 transition hover:border-[var(--text-primary)]/24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                          >
                            Cancel
                          </button>
                        </div>
                        {nativeFormatOpen && mixedNativeStyleSummary ? (
                          <div id="native-text-mixed-format-panel">
                            <NativeTextMixedFormatPanel
                              key={selectedNativeSpans.map((span) => span.id).join("|")}
                              summary={mixedNativeStyleSummary}
                              applying={isApplyingEdit}
                              onApply={applyMixedNativeFormatting}
                            />
                          </div>
                        ) : null}
                        {editApplyError ? (
                          <span role="alert" className="mt-1.5 block text-[10px] text-[var(--text-danger)]">{editApplyError}</span>
                        ) : !editPreview.editable && editPreview.reason ? (
                          <span role="alert" className="mt-1.5 block text-[10px] text-[var(--text-danger)]">{editPreview.reason}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {activeTool === "select" && !textDetectionCurrent && selectedRunIndices.length === 0 && pageImageUrl ? (
                    <p role="status" className="absolute left-3 top-3 z-20 rounded-[var(--radius-lg)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/90 px-3 py-1.5 text-[11px] leading-5 text-[var(--text-primary)]/50 shadow-lg">
                      Preparing editable text…
                    </p>
                  ) : null}

                  {activeTool === "select" && textDetectionCurrent && detectedTextRuns.length === 0 && selectedRunIndices.length === 0 ? (
                    <div className="absolute left-3 top-3 z-20 max-w-[260px] rounded-[var(--radius-lg)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/90 p-3 shadow-lg">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">
                        {pageTextCapability.nativeSpanCount > 0 ? "Text detected — editing limited" : "No editable text found"}
                      </span>
                      <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-primary)]/60">
                        {pageTextCapability.nativeSpanCount > 0
                          ? "This page contains native PDF text, but Lumeo cannot safely reconstruct its editable geometry or encoding yet."
                          : "Lumeo could not prove editable native text on this page. Use Text to add new text."}
                      </p>
                    </div>
                  ) : null}
                  {redactMode ? (
                    <RedactionLayer
                      boxes={redactionBoxes}
                      targetedRuns={redactionTargets}
                      disabled={redactionBusy}
                      onAddBox={(box) => setRedactionBoxes((current) => [...current, box])}
                      onRemoveBox={(index) => setRedactionBoxes((current) => current.filter((_, i) => i !== index))}
                    />
                  ) : null}
                </div>
              </div>
              </div>
            )}
              </div>
            </div>

            {pdfMeta && pdfMeta.pageCount > 0 ? (
              <div className="mt-3 hidden max-w-full flex-wrap items-center gap-2 overflow-x-auto lg:flex">
                <input
                  ref={mergeInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Reset first: picking the same file twice in a row
                    // fires no change event otherwise, and "nothing
                    // happened" is indistinguishable from a bug.
                    event.target.value = "";
                    if (file) void handleMergeFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => mergeInputRef.current?.click()}
                  disabled={pageOpBusy}
                  className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Add pages
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedPages}
                  disabled={pageOpBusy || selectedPages.size === 0}
                  className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Delete selected
                </button>
                <button
                  type="button"
                  onClick={() => void handleExtractSelectedPages()}
                  disabled={pageOpBusy || selectedPages.size === 0}
                  className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Extract selected
                </button>
                {selectedPages.size > 0 ? (
                  <span className="text-[11px] text-[var(--text-secondary)]">{selectedPages.size} selected</span>
                ) : null}
                {pageOpNotice ? (
                  <span role="status" className="text-[11px] text-[var(--text-secondary)]">{pageOpNotice}</span>
                ) : null}

                <span className="mx-1 h-5 w-px bg-[var(--text-primary)]/10" />
                <button
                  type="button"
                  onClick={() => {
                    if (!redactMode) {
                      // The inline text editor is CLOSED on entering redact
                      // mode rather than left inert behind the drag surface.
                      //
                      // Inert would have worked mechanically, but it leaves an
                      // editor that looks live and does nothing -- and it is
                      // an attribute the next overlay can forget. Closing
                      // removes the ambiguity structurally. It matters here
                      // because those controls were reachable by keyboard
                      // while unreachable by mouse: Tab could still fire
                      // Restyle, a document-mutating action, inside the mode
                      // whose entire purpose is a confirmed destructive one.
                      //
                      // An unsaved draft is never silently discarded -- entry
                      // is refused instead, and the user decides whether to
                      // apply or cancel.
                      const originalText = detectedTextRuns[selectedRunIndices[0]]?.str ?? "";
                      const hasUnsavedDraft = selectedRunIndices.length === 1 && editDraftText !== "" && editDraftText !== originalText;
                      if (hasUnsavedDraft) {
                        setPageOpNotice("Apply or cancel your text edit before redacting.");
                        return;
                      }
                      selectTextRun(null);
                    }
                    setRedactMode((current) => !current);
                    setRedactionBoxes([]);
                    setRedactionOutcome(null);
                  }}
                  aria-pressed={redactMode}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
                    redactMode
                      ? "border-[#ff4d4d]/60 bg-[#ff4d4d]/10 text-[#ff8080]"
                      : "border-[var(--text-primary)]/14 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {redactMode ? "Exit redact" : "Redact"}
                </button>
                {redactMode ? (
                  <>
                    <button
                      type="button"
                      onClick={handleDetectSensitive}
                      disabled={redactionBusy || !textDetectionCurrent}
                      className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
                    >
                      Find sensitive data
                    </button>
                    <button
                      type="button"
                      onClick={() => setRedactionConfirmOpen(true)}
                      disabled={redactionBusy || redactionTargets.length === 0}
                      className="rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition enabled:border-[#ff4d4d]/60 enabled:bg-[#ff4d4d]/10 enabled:text-[#ff8080] disabled:border-[var(--text-primary)]/12 disabled:text-[var(--text-secondary)]/50"
                    >
                      {redactionBusy ? "Redacting…" : `Redact ${redactionTargets.length} run${redactionTargets.length === 1 ? "" : "s"}`}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* The outcome panel is the safety story, so it is NOT a toast:
                it stays until dismissed, and it leads with what was not
                removed rather than burying it under a success message. */}
            {redactionOutcome ? (
              <div
                role="alert"
                data-testid="redaction-outcome"
                // Machine-readable coverage, driven by the SAME condition
                // that colours the panel. Tests assert on this rather than
                // on hex values, so a theme pass can never silently flip a
                // security assertion to green -- or break it for a reason
                // that has nothing to do with redaction.
                data-coverage={redactionOutcome.complete ? "complete" : "incomplete"}
                className={`mt-3 rounded-[var(--radius-lg)] border p-3 ${
                  redactionOutcome.complete
                    ? "border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/70"
                    : "border-[#ff4d4d]/50 bg-[#ff4d4d]/[0.07]"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]/70">
                  {redactionOutcome.complete
                    ? `Removed ${redactionOutcome.strippedRuns.length} text run${redactionOutcome.strippedRuns.length === 1 ? "" : "s"} from the file`
                    : "Redaction incomplete — read this before sharing the file"}
                </p>
                {redactionOutcome.unremovedRuns.length > 0 ? (
                  <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-primary)]/75">
                    {redactionOutcome.unremovedRuns.length} run
                    {redactionOutcome.unremovedRuns.length === 1 ? " was" : "s were"} masked but <strong>not removed</strong>:{" "}
                    {redactionOutcome.unremovedRuns.slice(0, 3).map((run, index) => (
                      <span key={index} data-testid="redaction-unremoved-run">
                        {index > 0 ? ", " : ""}
                        &ldquo;{run}&rdquo;
                      </span>
                    ))}
                    {redactionOutcome.unremovedRuns.length > 3 ? ", …" : ""}
                  </p>
                ) : null}
                {redactionOutcome.warnings.map((warning, index) => (
                  <p key={index} className="mt-1.5 text-[11px] leading-5 text-[var(--text-primary)]/75">
                    {describeCoverageWarning(warning)}
                  </p>
                ))}
                {redactionOutcome.metadataScrubbed ? (
                  <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-primary)]/55">
                    Document metadata (title, author, subject, keywords, producer, creator and the XMP packet) was cleared.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setRedactionOutcome(null)}
                  className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] underline"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
        </div>

        {/* Confirmation states the boundaries BEFORE the irreversible-feeling
            action, not after. Redaction is undoable here, but the file a
            user downloads is not, and the limits are what they need in
            order to decide whether this output is safe to share. */}
        {redactionConfirmOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="redact-confirm-title" className="max-w-md rounded-[var(--radius-xl)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)] p-5 shadow-2xl">
              <h2 id="redact-confirm-title" className="text-sm font-bold text-[var(--text-primary)]">
                Redact {redactionTargets.length} text run{redactionTargets.length === 1 ? "" : "s"}?
              </h2>
              <p className="mt-2 text-[12px] leading-5 text-[var(--text-primary)]/75">
                The characters will be removed from the file&rsquo;s text, not just covered. A black box is drawn over each one.
              </p>
              <p className="mt-2 text-[12px] font-semibold leading-5 text-[var(--text-primary)]/85">This does not remove:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] leading-5 text-[var(--text-primary)]/70">
                <li>Text inside images. On a scanned page a black box covers a picture; the pixels stay in the file.</li>
                <li>Vector artwork, such as a signature drawn as a path.</li>
                <li>Annotations, form field values, or embedded attachments.</li>
              </ul>
              <p className="mt-2 text-[12px] leading-5 text-[var(--text-primary)]/70">
                Anything that could not be removed is listed afterwards. Check that list before sharing the file.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRedactionConfirmOpen(false)}
                  className="rounded-full border border-[var(--text-primary)]/14 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleApplyRedaction()}
                  className="rounded-full border border-[#ff4d4d]/60 bg-[#ff4d4d]/15 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#ff8080]"
                >
                  Redact
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <MicroDock
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
          inkColor={inkColor}
          onInkColorChange={setInkColor}
          inkStrokeWidth={inkStrokeWidth}
          onInkStrokeWidthChange={setInkStrokeWidth}
          onPrivacyShieldClick={handlePrivacyShieldScan}
          privacyShieldMatchCount={privacyShieldMatches.length}
        />

        {selectedElement && selectedElement.type === "text" ? (
          <FloatingIsland
            mode="text-inspector"
            element={selectedElement}
            onPatch={(patch) => setElements((current) => patchElement(current, selectedElement.id, patch as Partial<EditElement>))}
          />
        ) : (
          <FloatingIsland
            mode="default"
            pageIndex={pageIndex}
            pageCount={pdf.pageCount}
            onPrevPage={() => setPageIndex((c) => Math.max(0, c - 1))}
            onNextPage={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))}
            zoom={zoom}
            onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
            onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
            onFit={() => setZoom(1)}
          />
        )}
      </div>

      <ToolActionBar>
        {downloadUrl ? (
          <button
            type="button"
            onClick={downloadEditedPdf}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--lumeo-gold)] px-5 text-sm font-bold text-[var(--atelier-surface-0)] transition hover:-translate-y-0.5 hover:bg-[var(--lumeo-gold)]/85 active:scale-[0.98] sm:w-auto"
          >
            Download edited PDF
          </button>
        ) : (
          <button
            type="button"
            disabled={(elements.length === 0 && !hasTextEdits) || isExporting}
            onClick={() => void generateEditedPdf()}
            // Phase 28: the only reason this button is ever disabled OTHER
            // than mid-export is "nothing has been edited yet" (same
            // elements.length/hasTextEdits check the disabled condition
            // itself uses) -- previously a new user just saw a greyed-out
            // button with no explanation. isExporting already has its own
            // visible spinner/label, so it doesn't need a redundant tooltip
            // repeating that.
            title={!isExporting && elements.length === 0 && !hasTextEdits ? "No edits to export yet." : undefined}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--lumeo-gold)] px-5 text-sm font-bold text-[var(--atelier-surface-0)] transition hover:-translate-y-0.5 hover:bg-[var(--lumeo-gold)]/85 disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] active:scale-[0.98] sm:w-auto"
          >
            {isExporting ? (
              <>
                <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--text-on-accent)]/30 border-t-[var(--text-on-accent)]" />
                Exporting...
              </>
            ) : (
              "Export PDF"
            )}
          </button>
        )}
      </ToolActionBar>

      <L2PrivacyNote />
    </section>
  );
}
