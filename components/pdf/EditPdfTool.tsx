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
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2FileCard,
  L2PanelLabel,
  L2PrivacyNote,
  L2ToolbarButton,
  L2UploadStage,
  L2WorkspaceGrid,
  L2WorkspaceHeader,
  L2WorkspaceInspector,
  L2WorkspacePanel,
  L2WorkspaceToolbar,
  ToolActionBar,
} from "@/components/pdf/workspace/ToolWorkspace";
import { EditElementView } from "@/components/pdf/edit/EditElementView";
import { InkCanvas } from "@/components/pdf/edit/InkCanvas";
import { TextRunOverlay } from "@/components/pdf/edit/TextRunOverlay";
import { FileIcon } from "@/components/ui/FileIcon";
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
import { exportEditedPdf } from "@/lib/pdf/edit/export";
import { findTextRunAtPoint, textRunsFromContent, type DetectedTextRun } from "@/lib/pdf/edit/textRuns";
import { collectPageTextOperators, type LocatedTextOperator } from "@/lib/pdf/edit/formXObjects";
import { matchDetectedRunToOperator, runSpansMultipleOperators } from "@/lib/pdf/edit/matchTextRun";
import { resolveFont, type ResolvedFont } from "@/lib/pdf/edit/fontEncoding";
import { resolveFontMetrics, type FontMetrics } from "@/lib/pdf/edit/fontMetrics";
import { buildEditPlan, type EditPlan } from "@/lib/pdf/edit/editPlan";
import { buildMultiRunEditPlan, type MultiRunEditPlan } from "@/lib/pdf/edit/multiRunEditPlan";
import { applyEditPlanToDocument, applyMultiRunEditPlanToDocument } from "@/lib/pdf/edit/applyEditPlan";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument, renderPageWithTimeout, withPageTimeout, PAGE_RENDER_TIMEOUT_MS, clampRenderScaleToMaxDimension } from "@/lib/pdf/pdfjs";
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

type ActiveTool = "select" | "text" | "draw" | "shape" | "whiteout";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

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

  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [shapeKind, setShapeKind] = useState<ShapeKind>(DEFAULT_SHAPE_KIND);
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
      if (!pdf) return;
      try {
        const doc = await PDFDocument.load(copyArrayBuffer(pdf.bytes));
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
      try {
        const page = await doc.getPage(pageIndex + 1);
        const pointViewport = page.getViewport({ scale: 1 });
        // See MAX_CANVAS_DIMENSION_PX's own doc comment -- mirrors
        // CompressPdfTool.tsx's dimensionScale exactly. A no-op for every
        // ordinary page (dimensionScale === PAGE_RENDER_SCALE, unchanged
        // behavior); only an oversized MediaBox has its render scale
        // reduced below the usual default.
        const dimensionScale = clampRenderScaleToMaxDimension(
          PAGE_RENDER_SCALE,
          pointViewport.width,
          pointViewport.height,
          MAX_CANVAS_DIMENSION_PX,
        );
        const viewport = page.getViewport({ scale: dimensionScale });
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
      } catch {
        // A cancelled render's promise rejects (RenderingCancelledException)
        // -- that's expected teardown, not a real preview failure.
        if (!cancelled) setError("This page could not be previewed. Try a different page.");
      } finally {
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
        const page = await doc.getPage(pageIndex + 1);
        const pointViewport = page.getViewport({ scale: 1 });
        const dimensionScale = clampRenderScaleToMaxDimension(
          PAGE_RENDER_SCALE,
          pointViewport.width,
          pointViewport.height,
          MAX_CANVAS_DIMENSION_PX,
        );
        const viewport = page.getViewport({ scale: dimensionScale });
        if (cancelled || !pdfLibDocRef.current) return;
        const located = collectPageTextOperators(pdfLibDocRef.current, pageIndex);
        if (cancelled) return;
        setPageOperators(located);
        const flatOperators = located.map((item) => item.operator);
        setRunMatches(
          runs.map((run): RunMatch => {
            const matchedOperator = matchDetectedRunToOperator(run, pageDisplaySize.width, pageDisplaySize.height, flatOperators, viewport.transform);
            if (!matchedOperator) return null;
            const locatedOperator = located.find((item) => item.operator === matchedOperator);
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
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo, selectedId, setElements]);

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
    if ((event.target as HTMLElement).closest('[role="button"]')) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (activeTool === "select") {
      const xPct = ((event.clientX - rect.left) / rect.width) * 100;
      const yPct = ((event.clientY - rect.top) / rect.height) * 100;
      const run = findTextRunAtPoint(detectedTextRuns, xPct, yPct);
      selectTextRun(run ? detectedTextRuns.indexOf(run) : null, event.shiftKey);
      return;
    }

    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    const id = nextElementId();

    let element: EditElement;
    if (activeTool === "text") element = createTextElement(id, pageIndex, xPct, yPct);
    else if (activeTool === "shape") element = createShapeElement(id, pageIndex, xPct, yPct, shapeKind);
    else element = createWhiteoutElement(id, pageIndex, xPct, yPct);

    setElements((current) => [...current, element]);
    setSelectedId(id);
    setActiveTool("select");
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
      return { kind: "invalid", reason: "Selected lines must be part of the same content stream." };
    }
    const operatorIndices = [...nonNull.map((m) => m.locatedOperator.operatorIndex)].sort((a, b) => a - b);
    for (let i = 1; i < operatorIndices.length; i += 1) {
      if (operatorIndices[i] !== operatorIndices[i - 1] + 1) {
        return { kind: "invalid", reason: "Selected lines must be consecutive, with nothing unselected in between." };
      }
    }
    const fontResourceName = nonNull[0].operator.fontResourceName;
    if (!fontResourceName) {
      return { kind: "invalid", reason: "This text has no associated font resource." };
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
    if (!pdfLibDoc || selectedRunIndices.length === 0) return { kind: "empty" };

    try {
      if (selectedRunIndices.length === 1) {
        const match = runMatches[selectedRunIndices[0]];
        if (!match) return { kind: "empty" };
        const { locatedOperator, operator } = match;
        if (!operator.fontResourceName) throw new Error("This text has no associated font resource.");
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
  }, [pdfLibDoc, selectedRunIndices, runMatches, pageOperators, pageIndex]);

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
    if (!doc || editPreview.kind === "empty" || !editPreview.editable) return;

    setIsApplyingEdit(true);
    setEditApplyError("");
    try {
      if (editPreview.kind === "single") {
        const { plan, resolvedFont, locatedOperator } = editPreview;
        await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, { isolate: locatedOperator.locator.kind === "xobject" });
      } else {
        const { plan, resolvedFont } = editPreview;
        await applyMultiRunEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode);
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

  const generateEditedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "edit" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportEditedPdf(copyArrayBuffer(pdf.bytes), elements),
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
    <section className="l2-workspace-deep grid gap-4 pb-28 lg:pb-6">
      <L2WorkspaceHeader
        title="Edit PDF"
        description={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`}
      />

      <L2WorkspaceToolbar>
        <L2ToolbarButton onClick={undo} disabled={!canUndo}>
          Undo
        </L2ToolbarButton>
        <L2ToolbarButton onClick={redo} disabled={!canRedo}>
          Redo
        </L2ToolbarButton>
        <L2ToolbarButton onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>−</L2ToolbarButton>
        <span className="text-xs font-bold text-[var(--text-subtle)]">{Math.round(zoom * 100)}%</span>
        <L2ToolbarButton onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</L2ToolbarButton>
        <L2ToolbarButton onClick={() => setZoom(1)}>Fit</L2ToolbarButton>
        <L2ToolbarButton onClick={resetTool}>Start new</L2ToolbarButton>
        <span className="ml-auto text-xs font-bold text-[var(--text-subtle)]">{pdf.file.name}</span>
      </L2WorkspaceToolbar>

      <L2WorkspaceGrid
        main={
          <L2WorkspacePanel>
            <L2FileCard icon={<FileIcon />} name={pdf.file.name} meta={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`} />

            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/60 px-3 py-2">
              <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((c) => Math.max(0, c - 1))} className="min-h-11 rounded-full border border-[var(--text-primary)]/14 px-4 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:opacity-35">
                ← Prev
              </button>
              <span className="text-xs font-semibold text-[var(--text-primary)]/60">Page {pageIndex + 1} of {pdf.pageCount}</span>
              <button type="button" disabled={pageIndex === pdf.pageCount - 1} onClick={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))} className="min-h-11 rounded-full border border-[var(--text-primary)]/14 px-4 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:opacity-35">
                Next →
              </button>
            </div>

            <div className="mt-3">
              <L2PanelLabel title="Preview" />
            </div>
            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="mt-3 flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <div className="mx-auto mt-3" style={{ width: `${zoom * 100}%` }}>
                <div
                  ref={stageRef}
                  onClick={handleStageClick}
                  onMouseMove={handleStageMouseMove}
                  onMouseLeave={handleStageMouseLeave}
                  onKeyDown={handleStageKeyDown}
                  className={`relative mx-auto max-h-[32rem] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white ${activeTool !== "select" && activeTool !== "draw" ? "cursor-crosshair" : ""}`}
                  style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageImageUrl} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none block h-full w-full select-none" />

                  {currentPageElements.map((element) => (
                    <EditElementView
                      key={element.id}
                      element={element}
                      selected={selectedId === element.id}
                      stageRef={stageRef}
                      onSelect={() => setSelectedId(element.id)}
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
                          onSelect={(shiftKey) => selectTextRun(index, shiftKey)}
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
                </div>
              </div>
            )}

            {error ? (
              <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
                {error}
              </div>
            ) : null}
          </L2WorkspacePanel>
        }
        inspector={
          <L2WorkspaceInspector title="Tools" description="Pick a tool, then click the page to place it.">
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {(["select", "text", "draw", "shape", "whiteout"] as ActiveTool[]).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={activeTool === tool}
                  onClick={() => setActiveTool(tool)}
                  className={`min-h-11 rounded-lg border px-1.5 py-2 text-[11px] font-bold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${activeTool === tool ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60 hover:border-[var(--text-primary)]/24"}`}
                >
                  {tool}
                </button>
              ))}
            </div>

            {activeTool === "shape" ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {(["rect", "ellipse", "line", "highlight"] as ShapeKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={shapeKind === kind}
                    onClick={() => setShapeKind(kind)}
                    className={`min-h-11 rounded-lg border px-1.5 py-1.5 text-[10px] font-bold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${shapeKind === kind ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            ) : null}

            {activeTool === "draw" ? (
              <div className="mt-3 grid gap-2">
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="h-7 w-10 rounded border border-[var(--text-primary)]/14" />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Thickness
                  <input type="range" min={1} max={10} value={inkStrokeWidth} onChange={(e) => setInkStrokeWidth(Number(e.target.value))} className="w-24" />
                </label>
              </div>
            ) : null}

            {activeTool === "whiteout" ? (
              <p className="mt-3 rounded-lg border border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.04] p-2.5 text-[11px] leading-5 text-[var(--text-primary)]/60">
                Whiteout hides content visually in the exported PDF. For documents with legal or compliance requirements, verify the underlying content is also removed before sharing.
              </p>
            ) : null}

            {activeTool === "select" && selectedRunIndices.length > 0 ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.04] p-2.5 text-[11px] leading-5 text-[var(--text-primary)]/60">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">
                  {selectedRunIndices.length === 1 ? "Existing text" : `${selectedRunIndices.length} lines selected`}
                </span>
                {selectedRunIndices.length === 1 && detectedTextRuns[selectedRunIndices[0]] ? (
                  <span>
                    Font: {detectedTextRuns[selectedRunIndices[0]].fontName} · ~{Math.round(detectedTextRuns[selectedRunIndices[0]].fontSizePx / PAGE_RENDER_SCALE)}pt
                  </span>
                ) : null}

                {editPreview.kind !== "empty" ? (
                  <>
                    <label className="mt-1 grid gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]/40">Replace with</span>
                      <input
                        value={editDraftText}
                        onChange={(e) => {
                          setEditDraftText(e.target.value);
                          setEditApplyError("");
                        }}
                        className="w-full rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 py-1.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        isApplyingEdit ||
                        !editPreview.editable ||
                        editDraftText === selectedRunIndices.map((i) => detectedTextRuns[i]?.str ?? "").join("")
                      }
                      onClick={() => void applyTextRunEdit()}
                      className="min-h-11 rounded-lg border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/10 px-2.5 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--lumeo-gold)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isApplyingEdit ? "Applying..." : "Apply edit"}
                    </button>
                    {!editPreview.editable && editPreview.reason ? (
                      <span role="alert" className="text-[var(--text-danger)]">{editPreview.reason}</span>
                    ) : editApplyError ? (
                      <span role="alert" className="text-[var(--text-danger)]">{editApplyError}</span>
                    ) : null}
                  </>
                ) : (
                  <span>This text couldn&rsquo;t be matched to an editable location on the page (an unsupported font or text layout) -- add a new text box to annotate over it instead.</span>
                )}
              </div>
            ) : null}

            {selectedElement && selectedElement.type === "text" ? (
              <div className="mt-3 grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Font size
                  <input
                    type="number"
                    min={8}
                    max={72}
                    value={selectedElement.fontSizePt}
                    onChange={(e) => setElements((current) => patchElement(current, selectedElement.id, { fontSizePt: Number(e.target.value) } as Partial<EditElement>))}
                    className="w-16 rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1 text-right"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input
                    type="color"
                    value={selectedElement.color}
                    onChange={(e) => setElements((current) => patchElement(current, selectedElement.id, { color: e.target.value } as Partial<EditElement>))}
                    className="h-7 w-10 rounded border border-[var(--text-primary)]/14"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={selectedElement.bold}
                    onClick={() => setElements((current) => patchElement(current, selectedElement.id, { bold: !selectedElement.bold } as Partial<EditElement>))}
                    className={`min-h-11 flex-1 rounded-lg border px-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${selectedElement.bold ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectedElement.italic}
                    onClick={() => setElements((current) => patchElement(current, selectedElement.id, { italic: !selectedElement.italic } as Partial<EditElement>))}
                    className={`min-h-11 flex-1 rounded-lg border px-2 text-xs italic transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${selectedElement.italic ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Italic
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-3 border-t border-[var(--text-primary)]/10 pt-3">
              <label className="block rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 p-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">File name</span>
                <input
                  value={outputName}
                  onChange={(e) => {
                    setOutputName(e.target.value);
                    setDownloadUrl("");
                  }}
                  className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45"
                  placeholder="lumeo-edited.pdf"
                />
              </label>
            </div>
          </L2WorkspaceInspector>
        }
      />

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
            className="lumeo-primary-action inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] active:scale-[0.98] sm:w-auto"
          >
            {isExporting ? "Exporting..." : "Export PDF"}
          </button>
        )}
      </ToolActionBar>

      <L2PrivacyNote />
    </section>
  );
}
