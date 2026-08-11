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
import { findTextRunAtPoint, textRunsFromContent, type DetectedTextRun } from "@/lib/pdf/edit/textRuns";
import { scanForSensitiveInfo, type PrivacyShieldMatch } from "@/lib/pdf/edit/privacyShield";
import { planRunRestyle } from "@/lib/pdf/edit/restyleRun";
import { pickHorizontalAlign, pickVerticalPlacement } from "@/lib/pdf/edit/floatingControlPlacement";
import type { LocatedTextOperator } from "@/lib/pdf/edit/formXObjects";
import { buildOperatorSpatialIndex, matchDetectedRunToOperatorIndexed, runSpansMultipleOperators } from "@/lib/pdf/edit/matchTextRun";
import type { ResolvedFont } from "@/lib/pdf/edit/fontEncoding";
import type { FontMetrics } from "@/lib/pdf/edit/fontMetrics";
import { buildEditPlan, type EditPlan } from "@/lib/pdf/edit/editPlan";
import { buildMultiRunEditPlan, type MultiRunEditPlan } from "@/lib/pdf/edit/multiRunEditPlan";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument, renderPageWithTimeout, withPageTimeout, PAGE_RENDER_TIMEOUT_MS, clampRenderScaleToMaxDimension, clampRenderScaleToPixelBudget } from "@/lib/pdf/pdfjs";
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
type EditHistorySnapshot = { elements: EditElement[]; pdfBytes: ArrayBuffer };

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
type EditPreview =
  | { kind: "empty" }
  | { kind: "single"; editable: boolean; reason: string | null; plan: EditPlan; resolvedFont: ResolvedFont; locatedOperator: LocatedTextOperator }
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
  applyEditPlanToDocument: (typeof import("@/lib/pdf/edit/applyEditPlan"))["applyEditPlanToDocument"];
  applyMultiRunEditPlanToDocument: (typeof import("@/lib/pdf/edit/applyEditPlan"))["applyMultiRunEditPlanToDocument"];
  PDFDocument: (typeof import("pdf-lib"))["PDFDocument"];
  PDFName: (typeof import("pdf-lib"))["PDFName"];
  PDFDict: (typeof import("pdf-lib"))["PDFDict"];
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
    ]).then(([exportMod, formXObjectsMod, fontEncodingMod, fontMetricsMod, applyEditPlanMod, pdfLibMod]) => ({
      exportEditedPdf: exportMod.exportEditedPdf,
      collectPageTextOperators: formXObjectsMod.collectPageTextOperators,
      resolveFont: fontEncodingMod.resolveFont,
      resolveFontMetrics: fontMetricsMod.resolveFontMetrics,
      applyEditPlanToDocument: applyEditPlanMod.applyEditPlanToDocument,
      applyMultiRunEditPlanToDocument: applyEditPlanMod.applyMultiRunEditPlanToDocument,
      PDFDocument: pdfLibMod.PDFDocument,
      PDFName: pdfLibMod.PDFName,
      PDFDict: pdfLibMod.PDFDict,
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

function clampPct(value: number) {
  return Math.min(100, Math.max(0, value));
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

  const {
    state: historyState,
    set: setHistoryState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistoryState<EditHistorySnapshot>(
    { elements: [], pdfBytes: new ArrayBuffer(0) },
    { maxTotalSize: EDIT_HISTORY_MAX_BYTES, sizeOf: (snapshot) => snapshot.pdfBytes.byteLength },
  );
  const elements = historyState.elements;
  // Adapter preserving setElements' EXACT prior call signature (a bare
  // EditElement[] array or updater over one) -- every existing overlay-
  // element call site (drag/resize/delete/patch/create) keeps working
  // completely unchanged; only what gets PUSHED onto the shared undo stack
  // widened to also carry pdfBytes alongside elements. (Full-snapshot
  // resets go through resetHistory directly -- see resetTool/addFile.)
  const setElements = useCallback((updater: EditElement[] | ((current: EditElement[]) => EditElement[])) => {
    setHistoryState((current) => ({
      ...current,
      elements: typeof updater === "function" ? (updater as (c: EditElement[]) => EditElement[])(current.elements) : updater,
    }));
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
  // Phase 9.1: the index-parallel matched-operator for each entry in
  // detectedTextRuns (lib/pdf/edit/matchTextRun.ts), computed once per page
  // load alongside detection itself -- cheap position-only matching, no
  // font resolution yet (that's deferred to the moment a specific edit is
  // actually attempted, in applyTextRunEdit). selectedRunIndex/
  // hoveredRunIndex/focusedRunIndex index into this SAME array as
  // detectedTextRuns, so a run's editability, selection, hover, and focus
  // state are all looked up by one shared index rather than juggling
  // separate DetectedTextRun object identities.
  const [runMatches, setRunMatches] = useState<RunMatch[]>([]);
  // Phase 9.2: the raw per-page LocatedTextOperator list (the same one
  // runMatches was derived from), kept around so a multi-run selection can
  // reconstruct the FULL, in-order operator list one specific content
  // stream needs for lib/pdf/edit/multiRunEditPlan.ts's buildMultiRunEditPlan
  // (its `allOperators` param) without re-walking the page from scratch on
  // every keystroke.
  const [pageOperators, setPageOperators] = useState<LocatedTextOperator[]>([]);
  // A contiguous RANGE of detectedTextRuns indices -- selectionAnchorIndex
  // is where the selection started (a plain click, or the first click of a
  // Shift+click range); selectedRunIndices is the full (possibly
  // single-element) range currently selected. Multi-run editing only ever
  // operates on a CONTIGUOUS run of detected boxes, matching
  // buildMultiRunEditPlan's own "operators must be consecutive" invariant --
  // see validateMultiRunSelection below for what else must line up.
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
  const [selectedRunIndices, setSelectedRunIndices] = useState<number[]>([]);
  const [hoveredRunIndex, setHoveredRunIndex] = useState<number>(-1);
  const [focusedRunIndex, setFocusedRunIndex] = useState<number | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const [editApplyError, setEditApplyError] = useState("");
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const runOverlayNodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // Phase 11: the inline caret-over-the-PDF input for a single selected,
  // editable text run -- see the JSX below (rendered next to the run's
  // TextRunOverlay) and the autofocus effect just below this.
  const inlineEditInputRef = useRef<HTMLInputElement | null>(null);

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
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-edited.pdf");
  const [outputName, setOutputName] = useState("lumeo-edited.pdf");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
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
    resetHistory({ elements: [], pdfBytes: new ArrayBuffer(0) });
    setSelectedId(null);
    setDetectedTextRuns([]);
    setRunMatches([]);
    setPageOperators([]);
    setSelectionAnchorIndex(null);
    setSelectedRunIndices([]);
    setPrivacyShieldMatches([]);
    setTextDetectionReady(false);
    setHoveredRunIndex(-1);
    setFocusedRunIndex(null);
    setEditDraftText("");
    setEditApplyError("");
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
    void (async () => {
      const previousDoc = pdfJsDocRef.current;
      pdfJsDocRef.current = null;
      setDocReady(0);
      if (previousDoc) void (previousDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      if (!pdf) return;

      // Reuse the doc addFile() already opened (to read the page count
      // before pdf state existed) instead of parsing the same bytes again --
      // only valid when it was opened from this exact ArrayBuffer instance.
      const pending = pendingInitialDocRef.current;
      if (pending && pending.bytes === pdf.bytes) {
        pendingInitialDocRef.current = null;
        pdfJsDocRef.current = pending.doc;
        setDocReady((current) => current + 1);
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
        pdfJsDocRef.current = doc;
        setDocReady((current) => current + 1);
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
      } catch {
        // In-place text editing simply won't be available for this file;
        // the existing overlay-annotation workflow is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Renders the current page to a background image for the placement stage,
  // and detects its text runs. Deliberately NOT keyed on pdfLibDoc -- that
  // doc loads independently (effect above) and often arrives after this one
  // has already rasterized the page; re-running the canvas render/toBlob
  // work (the expensive part) just because pdfLibDoc changed would be pure
  // waste. Operator-matching, which does need pdfLibDoc, is a separate
  // effect below.
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
      setPageLoading(true);
      // Phase 30: a page-render failure/timeout sets `error`, but nothing
      // in this reset block ever cleared it -- so navigating to (or
      // undoing/redoing into) a DIFFERENT page while a stale error from a
      // previous one was showing left that stale message on screen for the
      // entire duration of the new page's own render attempt, since the
      // loading-vs-error ternary below (Phase 28) deliberately gives error
      // priority over the loading skeleton. Confirmed live: Next Page
      // after a failed page 1 showed page 1's error immediately, before
      // page 2's own render had even had a chance to succeed or fail.
      setError("");
      setSelectionAnchorIndex(null);
      setSelectedRunIndices([]);
      setHoveredRunIndex(-1);
      setFocusedRunIndex(null);
      setEditDraftText("");
      setEditApplyError("");
      runOverlayNodesRef.current.clear();
      // Cleared here (rather than left stale) so the operator-matching
      // effect below never briefly pairs a new page's detected runs with
      // the previous page's matches while it's catching up.
      setRunMatches([]);
      setPageOperators([]);
      setPrivacyShieldMatches([]);
      setTextDetectionReady(false);
      try {
        const page = await doc.getPage(pageIndex + 1);
        const pointViewport = page.getViewport({ scale: 1 });
        // See MAX_CANVAS_DIMENSION_PX's own doc comment -- mirrors
        // CompressPdfTool.tsx's dimensionScale exactly. A no-op for every
        // ordinary page (dimensionScale === PAGE_RENDER_SCALE, unchanged
        // behavior); only an oversized MediaBox has its render scale
        // reduced below the usual default.
        const dimensionScale = clampRenderScaleToPixelBudget(
          clampRenderScaleToMaxDimension(PAGE_RENDER_SCALE, pointViewport.width, pointViewport.height, MAX_CANVAS_DIMENSION_PX),
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
        if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
        const url = URL.createObjectURL(blob);
        pageImageUrlRef.current = url;
        setPageImageUrl(url);
        setPageDisplaySize({ width: canvas.width, height: canvas.height });
        setPagePointSize({ width: pointViewport.width, height: pointViewport.height });
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

        // Best-effort: a page's existing text is a bonus (lets the select
        // tool highlight it), never a requirement -- a failure here must
        // not block the preview or export from working.
        try {
          const content = await withPageTimeout(page.getTextContent(), pageIndex + 1, PAGE_RENDER_TIMEOUT_MS, "extract text from");
          const runs = textRunsFromContent(content.items as never, viewport.transform, canvas.width, canvas.height);
          setDetectedTextRuns(runs);
        } catch {
          setDetectedTextRuns([]);
        }
        // true means detection finished, successfully or not
        setTextDetectionReady(true);
      } catch {
        // A cancelled render's promise rejects (RenderingCancelledException)
        // -- that's expected teardown, not a real preview failure.
        if (!cancelled) setError("This page could not be previewed. Try a different page.");
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
  }, [pdf, pageIndex, docReady]);

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
    if (!pdf || !pdfJsDocRef.current || !pdfLibDoc || detectedTextRuns.length === 0 || !pageDisplaySize) return;
    const doc = pdfJsDocRef.current;
    const runs = detectedTextRuns;
    let cancelled = false;

    void (async () => {
      try {
        // Reuse the render effect's already-fetched page/viewport for this
        // same pageIndex instead of re-deriving them -- see
        // pageAndViewportRef's own doc comment. The cached entry is
        // guaranteed present by the time this effect can run: it depends on
        // pageDisplaySize, which the render effect only sets AFTER
        // populating this ref for the current pageIndex. The direct fetch
        // stays as a defensive fallback in case that invariant ever changes.
        const cached = pageAndViewportRef.current;
        const { viewport } =
          cached && cached.pageIndex === pageIndex
            ? cached
            : await (async () => {
                const fetchedPage = await doc.getPage(pageIndex + 1);
                const pointViewport = fetchedPage.getViewport({ scale: 1 });
                const dimensionScale = clampRenderScaleToPixelBudget(
                  clampRenderScaleToMaxDimension(PAGE_RENDER_SCALE, pointViewport.width, pointViewport.height, MAX_CANVAS_DIMENSION_PX),
                  pointViewport.width,
                  pointViewport.height,
                  MAX_CANVAS_TOTAL_PIXELS,
                );
                return { viewport: fetchedPage.getViewport({ scale: dimensionScale }) };
              })();
        if (cancelled || !pdfLibDocRef.current || !editEngineRef.current) return;
        const located = editEngineRef.current.collectPageTextOperators(pdfLibDocRef.current, pageIndex);
        if (cancelled) return;
        setPageOperators(located);
        // Built once per page, not once per run -- see
        // buildOperatorSpatialIndex's own doc comment. Paired with a
        // Map for O(1) operator -> LocatedTextOperator lookup below,
        // replacing what was previously an O(operators) `.find()` call
        // repeated for every run (a second, separate O(runs x operators)
        // cost stacked on top of the matching itself).
        const flatOperators = located.map((item) => item.operator);
        const operatorIndex = buildOperatorSpatialIndex(flatOperators, viewport.transform);
        const locatedByOperator = new Map(located.map((item) => [item.operator, item] as const));
        setRunMatches(
          runs.map((run): RunMatch => {
            const matchedOperator = matchDetectedRunToOperatorIndexed(run, pageDisplaySize.width, pageDisplaySize.height, operatorIndex);
            if (!matchedOperator) return null;
            const locatedOperator = locatedByOperator.get(matchedOperator);
            return locatedOperator ? { locatedOperator, operator: matchedOperator } : null;
          }),
        );
      } catch {
        if (!cancelled) {
          setRunMatches([]);
          setPageOperators([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pdfLibDoc, pageIndex, detectedTextRuns, pageDisplaySize]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
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
        setZoom((z) => Math.min(2, z + 0.1));
      } else if (command && event.key === "-") {
        event.preventDefault();
        setZoom((z) => Math.max(0.5, z - 0.1));
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
    if (activeTool === "select" && selectedRunIndices.length === 1 && runMatches[selectedRunIndices[0]]) {
      inlineEditInputRef.current?.focus();
      inlineEditInputRef.current?.select();
    }
  }, [activeTool, selectedRunIndices, runMatches]);

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
    const isEditorOpen = activeTool === "select" && selectedRunIndices.length === 1 && Boolean(runMatches[selectedRunIndices[0]]);
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
  }, [activeTool, selectedRunIndices, runMatches]);


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
      resetHistory({ elements: [], pdfBytes: bytes });
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
    if ((event.target as HTMLElement).closest('[role="button"]')) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (activeTool === "select") {
      const xPct = ((event.clientX - rect.left) / rect.width) * 100;
      const yPct = ((event.clientY - rect.top) / rect.height) * 100;
      const run = findTextRunAtPoint(detectedTextRuns, xPct, yPct);
      selectTextRunAndFocus(run ? detectedTextRuns.indexOf(run) : null, event.shiftKey);
      return;
    }

    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
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
    const startXPct = clampPct(((event.clientX - rect.left) / rect.width) * 100);
    const startYPct = clampPct(((event.clientY - rect.top) / rect.height) * 100);
    whiteoutGestureRef.current = { startXPct, startYPct, rect };
    setWhiteoutDraft({ xPct: startXPct, yPct: startYPct, widthPct: 0, heightPct: 0, snapped: false });
  }

  function handleWhiteoutPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = whiteoutGestureRef.current;
    if (!gesture) return;
    const xPct = clampPct(((event.clientX - gesture.rect.left) / gesture.rect.width) * 100);
    const yPct = clampPct(((event.clientY - gesture.rect.top) / gesture.rect.height) * 100);

    // Snap-to-text-run: if the pointer is currently over a detected text
    // run, the preview locks to that run's exact bounds instead of the raw
    // drag rect -- the "cover this line in one drag" affordance the
    // redesign asked for. Falls back to the manual rect the instant the
    // pointer leaves every run's bounds, so the user can still draw an
    // arbitrary box over non-text content.
    const hoveredRun = findTextRunAtPoint(detectedTextRuns, xPct, yPct);
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
  function restyleSelectedRun() {
    const run = selectedRunIndices.length === 1 ? detectedTextRuns[selectedRunIndices[0]] : null;
    if (!run) return;

    const plan = planRunRestyle(run, pixelsPerPoint);
    const whiteoutId = nextElementId();
    const textId = nextElementId();

    setElements((current) => [
      ...current,
      { ...createWhiteoutElement(whiteoutId, pageIndex, plan.whiteout.xPct, plan.whiteout.yPct, "white"), widthPct: plan.whiteout.widthPct, heightPct: plan.whiteout.heightPct },
      {
        ...createTextElement(textId, pageIndex, plan.text.xPct, plan.text.yPct),
        text: plan.text.text,
        fontSizePt: plan.text.fontSizePt,
        widthPct: plan.text.widthPct,
        heightPct: plan.text.heightPct,
      },
    ]);

    selectTextRun(null);
    setSelectedId(textId);
  }

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
        const element = createWhiteoutElement(id, pageIndex, match.run.xPct, match.run.yPct, "white");
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
      setSelectionAnchorIndex(null);
      setSelectedRunIndices([]);
      setEditDraftText("");
      setEditApplyError("");
      return;
    }
    const range =
      extend && selectionAnchorIndex !== null
        ? Array.from(
            { length: Math.abs(index - selectionAnchorIndex) + 1 },
            (_, i) => Math.min(selectionAnchorIndex, index) + i,
          )
        : [index];
    if (!extend) setSelectionAnchorIndex(index);
    setSelectedRunIndices(range);
    setEditDraftText(range.map((i) => detectedTextRuns[i]?.str ?? "").join(""));
    setEditApplyError("");
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
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    const run = findTextRunAtPoint(detectedTextRuns, xPct, yPct);
    const index = run ? detectedTextRuns.indexOf(run) : -1;
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
    | { kind: "single"; resolvedFont: ResolvedFont; fontMetrics: FontMetrics; locatedOperator: LocatedTextOperator; operator: LocatedTextOperator["operator"] }
    | { kind: "multi"; resolvedFont: ResolvedFont; fontMetrics: FontMetrics; validation: Extract<MultiRunValidation, { kind: "valid" }> };

  const resolvedEditContext = useMemo((): ResolvedEditContext => {
    if (!pdfLibDoc || !editEngine || selectedRunIndices.length === 0) return { kind: "empty" };
    const { PDFName, PDFDict, resolveFont, resolveFontMetrics } = editEngine;

    try {
      if (selectedRunIndices.length === 1) {
        const match = runMatches[selectedRunIndices[0]];
        if (!match) return { kind: "empty" };
        const { locatedOperator, operator } = match;
        if (!operator.fontResourceName) throw new Error("This text's font couldn't be identified, so it can't be edited here.");
        const fontDict = locatedOperator.resources.lookup(PDFName.of("Font"), PDFDict)?.lookup(PDFName.of(operator.fontResourceName), PDFDict);
        if (!fontDict) throw new Error("Could not resolve this text's font.");
        const resolvedFont = resolveFont(fontDict, pdfLibDoc.context);
        const fontMetrics = resolveFontMetrics(fontDict, pdfLibDoc.context, resolvedFont);
        return { kind: "single", resolvedFont, fontMetrics, locatedOperator, operator };
      }

      const validation = validateMultiRunSelection(selectedRunIndices);
      if (validation.kind === "invalid") return { kind: "error", reason: validation.reason, multi: true };
      const fontDict = validation.resources.lookup(PDFName.of("Font"), PDFDict)?.lookup(PDFName.of(validation.fontResourceName), PDFDict);
      if (!fontDict) throw new Error("Could not resolve this text's font.");
      const resolvedFont = resolveFont(fontDict, pdfLibDoc.context);
      const fontMetrics = resolveFontMetrics(fontDict, pdfLibDoc.context, resolvedFont);
      return { kind: "multi", resolvedFont, fontMetrics, validation };
    } catch (resolveError) {
      const reason = resolveError instanceof Error ? resolveError.message : "Could not validate this edit.";
      return { kind: "error", reason, multi: selectedRunIndices.length > 1 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validateMultiRunSelection closes over runMatches/pageOperators, already listed below.
  }, [pdfLibDoc, editEngine, selectedRunIndices, runMatches, pageOperators, pageIndex]);

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
      const { resolvedFont, fontMetrics, locatedOperator, operator } = resolvedEditContext;
      const plan = buildEditPlan({
        pageIndex,
        contentStreamIndex: locatedOperator.locator.kind === "page" ? locatedOperator.locator.contentStreamIndex : 0,
        formPath: locatedOperator.locator.kind === "xobject" ? locatedOperator.locator.formPath : null,
        operatorIndex: locatedOperator.operatorIndex,
        operator,
        replacementText: editDraftText,
        resolvedFont,
        fontMetrics,
      });
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
        };
      }
      return { kind: "single", editable: plan.editable, reason: plan.reason, plan, resolvedFont, locatedOperator };
    }

    const { resolvedFont, fontMetrics, validation } = resolvedEditContext;
    try {
      const plan = buildMultiRunEditPlan({
        pageIndex,
        contentStreamIndex: validation.contentStreamIndex,
        allOperators: validation.allOperators,
        operatorIndices: validation.operatorIndices,
        replacementText: editDraftText,
        resolvedFont,
        fontMetrics,
      });
      return { kind: "multi", editable: plan.editable, reason: plan.reason, plan, resolvedFont };
    } catch (previewError) {
      const reason = previewError instanceof Error ? previewError.message : "Could not validate this edit.";
      return { kind: "multi", editable: false, reason, plan: null as never, resolvedFont: null as never };
    }
  }, [resolvedEditContext, editDraftText, detectedTextRuns, selectedRunIndices, pageIndex]);

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
        await engine.applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, { isolate: locatedOperator.locator.kind === "xobject" });
      } else {
        const { plan, resolvedFont } = editPreview;
        await engine.applyMultiRunEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode);
      }

      const newBytes = await doc.save();
      const buffer = newBytes.buffer.slice(newBytes.byteOffset, newBytes.byteOffset + newBytes.byteLength) as ArrayBuffer;
      setHistoryState((current) => ({ ...current, pdfBytes: buffer }));
      setDownloadUrl("");
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
  }, [editPreview, setHistoryState]);

  function handleInkStroke(result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) {
    const id = nextElementId();
    const element = createInkElement(id, pageIndex, result.xPct, result.yPct, result.widthPct, result.heightPct, result.pngDataUrl);
    setElements((current) => [...current, element]);
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
  const selectedElement = useMemo(() => elements.find((item) => item.id === selectedId) ?? null, [elements, selectedId]);
  // Falls back to PAGE_RENDER_SCALE (the ratio the canvas was rendered at
  // before pagePointSize is known) so text isn't briefly unsized on first
  // paint; once pagePointSize loads for the current page, this becomes the
  // exact px-per-point ratio for that page.
  const pixelsPerPoint = pageDisplaySize && pagePointSize && pagePointSize.width > 0
    ? pageDisplaySize.width / pagePointSize.width
    : PAGE_RENDER_SCALE;
  // Phase 11: single source of truth for "is there an edit ready to apply,"
  // shared by both the inline on-page toolbar and the sidebar panel -- was
  // previously computed inline in one place only; extracted so the two
  // Apply buttons can never disagree about when they're enabled.
  const canApplyEdit =
    !isApplyingEdit &&
    editPreview.kind !== "empty" &&
    editPreview.editable &&
    editDraftText !== selectedRunIndices.map((i) => detectedTextRuns[i]?.str ?? "").join("");
  // Phase 11: looked up once and reused throughout the inline on-page editor
  // JSX below, instead of repeatedly indexing detectedTextRuns/runMatches by
  // selectedRunIndices[0] at each use site.
  const singleSelectedRun = selectedRunIndices.length === 1 ? detectedTextRuns[selectedRunIndices[0]] : null;
  const singleSelectedRunMatch = selectedRunIndices.length === 1 ? runMatches[selectedRunIndices[0]] : null;
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
  const inlineEditorTooltipPositionClass = inlineEditorVerticalPlacement === "below" ? "top-full mt-11" : "bottom-full mb-11";
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
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
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
    <section className="l2-workspace-deep grid gap-4 pb-40 lg:pb-6">
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

      <div className="relative min-w-0">
        {/* Phase 27: the canvas panel is now the unambiguous hero -- no file
            card, no secondary page-nav bar duplicating the toolbar's own
            (that duplication was the single largest source of "sidebar
            clutter" in the old layout). A darker inset backdrop behind the
            white page gives it real presence instead of sitting flush
            against the same glass tone as every other panel. */}
        <div className="aura-glass-thin min-w-0 rounded-[var(--radius-2xl)] p-3 shadow-[var(--v2-elevation-1)] sm:p-5">
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
                className="overflow-auto overscroll-contain rounded-[var(--radius-xl)] bg-[var(--atelier-surface-0)]/[0.35] p-3 sm:p-6"
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
                    setZoom((z) => Math.min(2, Math.max(0.5, z - event.deltaY * 0.001)));
                  }}
                  className={`relative mx-auto w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white ${activeTool !== "select" && activeTool !== "draw" ? "cursor-crosshair" : ""} ${activeTool === "whiteout" ? "touch-none" : ""}`}
                  style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}` }}
                >
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

                  {activeTool === "draw" && pageDisplaySize ? (
                    <InkCanvas
                      stageWidthPx={pageDisplaySize.width}
                      stageHeightPx={pageDisplaySize.height}
                      color={inkColor}
                      strokeWidthPx={inkStrokeWidth}
                      onStrokeComplete={handleInkStroke}
                    />
                  ) : null}

                  {detectedTextRuns.length > 0 ? (
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
                          editable={Boolean(runMatches[index])}
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
                      <div className="absolute z-30 bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 px-3 py-2 shadow-lg">
                        <span className="text-xs font-semibold text-[var(--text-primary)]/70">{privacyShieldMatches.length} match{privacyShieldMatches.length === 1 ? "" : "es"} found</span>
                        <button
                          type="button"
                          onClick={applyPrivacyShieldRedactions}
                          className="min-h-11 rounded-full bg-[var(--lumeo-gold)]/90 px-3 text-xs font-bold text-[var(--atelier-surface-0)] transition hover:bg-[var(--lumeo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                        >
                          Apply redactions
                        </button>
                      </div>
                    </>
                  ) : null}

                  {activeTool === "select" && singleSelectedRun && singleSelectedRunMatch ? (
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
                          setEditDraftText(event.target.value);
                          setEditApplyError("");
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
                        className="h-full w-full rounded-[3px] border border-[var(--lumeo-gold)] bg-white px-0.5 font-semibold text-[var(--text-primary)] shadow-[0_0_0_3px_rgba(var(--lumeo-gold-rgb),0.16)] outline-none"
                        style={{ fontSize: `${Math.max(10, (singleSelectedRun.fontSizePx / PAGE_RENDER_SCALE) * pixelsPerPoint)}px` }}
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
                        {/* The in-place editor above can only swap the words:
                            it rewrites glyph codes inside the original
                            content-stream operator, which is exactly why font,
                            size and colour survive untouched -- and exactly why
                            it can't change them. Restyle is the deliberate
                            trade: cover the original and drop an editable text
                            box in its place, giving full formatting freedom at
                            the cost of the original glyphs remaining hidden
                            underneath rather than replaced. */}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            restyleSelectedRun();
                          }}
                          aria-label="Restyle this text"
                          title="Restyle -- convert to an editable text box you can restyle (font size, colour, bold, italic)"
                          className="grid h-9 shrink-0 place-items-center rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)]/70 shadow-lg transition hover:border-[var(--text-primary)]/24 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                        >
                          Restyle
                        </button>
                      </div>
                      {editApplyError || (editPreview.kind !== "empty" && !editPreview.editable && editPreview.reason) ? (
                        <div role="alert" className={`absolute z-30 max-w-[220px] rounded-md border border-[var(--border-danger)]/25 bg-[var(--surface-danger)] px-2 py-1 text-[10px] font-semibold leading-4 text-[var(--text-danger)] shadow-lg ${inlineEditorTooltipPositionClass} ${inlineEditorHorizontalClass}`}>
                          {editApplyError || (editPreview.kind !== "empty" ? editPreview.reason : "")}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeTool === "select" && editPreview.kind === "multi" ? (
                    // Multi-run selection has no per-run inline editor (that's
                    // scoped to a single run) -- this compact floating panel,
                    // anchored to the first selected run, is the only UI path
                    // to apply a multi-run edit. Kept fully separate from
                    // FloatingIsland/MicroDock: the spec requires FloatingIsland
                    // to never activate for existing-PDF-text-run selections.
                    <div
                      className="absolute z-30"
                      style={{
                        left: `${detectedTextRuns[selectedRunIndices[0]].xPct}%`,
                        top: `${detectedTextRuns[selectedRunIndices[0]].yPct}%`,
                      }}
                    >
                      <div className="w-64 rounded-[var(--radius-lg)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 p-3 shadow-lg">
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">Replace with ({selectedRunIndices.length} runs selected)</span>
                        <input
                          value={editDraftText}
                          onChange={(event) => {
                            setEditDraftText(event.target.value);
                            setEditApplyError("");
                          }}
                          className="mt-1 w-full rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={!canApplyEdit}
                            onClick={() => void applyTextRunEdit()}
                            className="min-h-11 flex-1 rounded-lg border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/10 px-2.5 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--lumeo-gold)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isApplyingEdit ? "Applying..." : "Apply edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => selectTextRun(null)}
                            className="min-h-11 rounded-lg border border-[var(--text-primary)]/14 px-2.5 text-xs font-bold text-[var(--text-primary)]/70 transition hover:border-[var(--text-primary)]/24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
                          >
                            Cancel
                          </button>
                        </div>
                        {!editPreview.editable && editPreview.reason ? (
                          <span role="alert" className="mt-1.5 block text-[10px] text-[var(--text-danger)]">{editPreview.reason}</span>
                        ) : editApplyError ? (
                          <span role="alert" className="mt-1.5 block text-[10px] text-[var(--text-danger)]">{editApplyError}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {activeTool === "select" && !textDetectionReady && selectedRunIndices.length === 0 && pageImageUrl ? (
                    <p role="status" className="absolute left-3 top-3 z-20 rounded-[var(--radius-lg)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/90 px-3 py-1.5 text-[11px] leading-5 text-[var(--text-primary)]/50 shadow-lg">
                      Preparing editable text…
                    </p>
                  ) : null}

                  {activeTool === "select" && textDetectionReady && detectedTextRuns.length === 0 && selectedRunIndices.length === 0 ? (
                    <div className="absolute left-3 top-3 z-20 max-w-[240px] rounded-[var(--radius-lg)] border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/90 p-3 shadow-lg">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">No editable text found</span>
                      <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-primary)]/60">This page doesn&rsquo;t contain selectable text. Use Text to add new text.</p>
                    </div>
                  ) : null}
                </div>
              </div>
              </div>
            )}
        </div>

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
            onZoomOut={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            onZoomIn={() => setZoom((z) => Math.min(2, z + 0.1))}
            onFit={() => setZoom(1)}
          />
        )}
      </div>

      <ToolActionBar>
        {downloadUrl ? (
          <button
            type="button"
            onClick={downloadEditedPdf}
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] active:scale-[0.98] sm:w-auto"
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
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] active:scale-[0.98] sm:w-auto"
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
