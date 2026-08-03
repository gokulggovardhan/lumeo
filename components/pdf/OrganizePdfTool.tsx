"use client";

import { memo, useEffect, useRef, useState } from "react";
import { degrees, PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2PanelLabel,
  L2PrivacyNote,
  L2ResultState,
  L2ToolbarButton,
  L2UploadStage,
  L2WorkspaceGrid,
  L2WorkspaceHeader,
  L2WorkspaceInspector,
  L2WorkspacePanel,
  L2WorkspaceToolbar,
  ToolActionBar,
} from "@/components/pdf/workspace/ToolWorkspace";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { copyArrayBuffer, toArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { formatBytes } from "@/lib/pdf/formatBytes";
import {
  createInitialItems,
  duplicateItem,
  moveItem,
  removeItem,
  removeItems,
  rotateItem,
  rotateItems,
  validateOrganizeItems,
  type OrganizerItem,
} from "@/lib/pdf/pageOrganizer";
import { openPdfJsDocument, renderPageWithTimeout } from "@/lib/pdf/pdfjs";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { recordRecentFile } from "@/lib/recent-files";
import { checkPdfFileSize, hasPdfMagicBytes, isPdfNamedFile } from "@/lib/pdf/uploadValidation";

const THUMBNAIL_CONCURRENCY = 3;
const THUMBNAIL_SCALE = 0.32;

type LoadedDocument = {
  name: string;
  size: number;
  bytes: ArrayBuffer;
  pageCount: number;
};

type OrganizeResult = {
  url: string;
  fileName: string;
  size: number;
  pageCount: number;
};

type OrganizePageCellProps = {
  item: OrganizerItem;
  index: number;
  selected: boolean;
  thumbnailUrl?: string;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (index: number) => void;
  onToggleSelected: (index: number) => void;
  onRotateOne: (index: number, direction: "left" | "right") => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
};

// Every completed thumbnail render calls setThumbnails once (see
// renderThumbnails below), which -- without this memo -- re-renders every
// page cell in the grid on every single page's completion, not just the one
// that finished. Callback props are intentionally excluded from the
// comparison (their identity churns every parent render since selection/
// rotation state isn't memoized); a cell's own visual output only depends on
// the props actually compared here. Same fix as SplitPdfTool's
// SplitPageThumbnail -- see that file for the fuller rationale.
const OrganizePageCell = memo(function OrganizePageCell({
  item,
  index,
  selected,
  thumbnailUrl,
  onDragStart,
  onDragOver,
  onDrop,
  onToggleSelected,
  onRotateOne,
  onDuplicate,
  onDelete,
}: OrganizePageCellProps) {
  return (
    <div
      role="listitem"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(index)}
      className={`group relative rounded-xl border p-2 transition ${
        selected
          ? "border-[var(--border-selected)] bg-[var(--surface-selected)]"
          : "border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.035]"
      }`}
    >
      <label className="absolute left-2 top-2 z-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(index)}
          aria-label={`Select page ${index + 1}`}
        />
      </label>
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-[var(--text-primary)]/[0.045]">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-contain"
            style={{ transform: `rotate(${item.rotation}deg)` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-[var(--text-primary)]/8" />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
        <span>Page {index + 1}</span>
        <span className="flex gap-1">
          <button type="button" aria-label="Rotate left" onClick={() => onRotateOne(index, "left")}>⟲</button>
          <button type="button" aria-label="Rotate right" onClick={() => onRotateOne(index, "right")}>⟳</button>
          <button type="button" aria-label="Duplicate page" onClick={() => onDuplicate(index)}>⧉</button>
          <button type="button" aria-label="Delete page" onClick={() => onDelete(index)}>✕</button>
        </span>
      </div>
    </div>
  );
},
(prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.rotation === next.item.rotation &&
  prev.index === next.index &&
  prev.selected === next.selected &&
  prev.thumbnailUrl === next.thumbnailUrl,
);

function OrganizeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <rect x="5" y="6" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="18" y="14" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 20v3a2 2 0 0 0 2 2h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

async function buildOrganizedPdf(sourceBytes: ArrayBuffer, items: OrganizerItem[]) {
  const source = await PDFDocument.load(copyArrayBuffer(sourceBytes));
  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    items.map((item) => item.sourcePage - 1),
  );

  copied.forEach((page, index) => {
    const item = items[index];
    const existing = page.getRotation().angle;
    page.setRotation(degrees((existing + item.rotation) % 360));
    output.addPage(page);
  });

  return output.save();
}

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function OrganizePdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const thumbnailUrlsRef = useRef<Map<string, string>>(new Map());
  const sessionRef = useRef(0);

  const [document_, setDocument] = useState<LoadedDocument | null>(null);
  const [items, setItems] = useState<OrganizerItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<OrganizeResult | null>(null);

  async function destroyPdfJsDocument() {
    const doc = pdfJsDocRef.current;
    pdfJsDocRef.current = null;
    if (doc) {
      try {
        await (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
      } catch {
        // PDF.js may already be cleaning itself up.
      }
    }
  }

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "organize" });
    if (result.accepted) {
      openedTrackedRef.current = true;
    }
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result?.url]);

  useEffect(() => {
    return () => {
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current.clear();
      void destroyPdfJsDocument();
    };
  }, []);

  // Same cleanup an unmount already does, plus a full reset of the loaded
  // document, its items/selection/thumbnails, and any pending result --
  // returns to the upload screen ready for a different file immediately.
  function resetTool() {
    sessionRef.current += 1;
    if (result?.url) URL.revokeObjectURL(result.url);
    thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current.clear();
    void destroyPdfJsDocument();
    setDocument(null);
    setItems([]);
    setThumbnails({});
    setSelected(new Set());
    setDragIndex(null);
    setError("");
    setResult(null);
  }

  async function renderThumbnails(doc: PDFDocumentProxy, pageCount: number, session: number) {
    const pending = Array.from({ length: pageCount }, (_, index) => index + 1);

    async function renderOne(pageNumber: number) {
      try {
        const page = await doc.getPage(pageNumber);
        if (session !== sessionRef.current) return;
        const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const task = page.render({ canvas, canvasContext: context, viewport });
        await renderPageWithTimeout(task, pageNumber);
        if (session !== sessionRef.current) return;

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.75));
        canvas.width = 0;
        canvas.height = 0;
        if (!blob || session !== sessionRef.current) return;

        const url = URL.createObjectURL(blob);
        thumbnailUrlsRef.current.set(`page-${pageNumber}`, url);
        setThumbnails((current) => ({ ...current, [pageNumber]: url }));
      } catch {
        // Best-effort preview; the page stays selectable without a thumbnail.
      }
    }

    async function worker() {
      while (pending.length && session === sessionRef.current) {
        const pageNumber = pending.shift();
        if (pageNumber === undefined) return;
        await renderOne(pageNumber);
      }
    }

    await Promise.all(Array.from({ length: THUMBNAIL_CONCURRENCY }, worker));
  }

  async function handleFiles(files: FileList) {
    const file = Array.from(files)[0];
    if (!file) return;

    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setError("");
    setResult(null);
    setThumbnails({});
    thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current.clear();
    await destroyPdfJsDocument();

    if (!isPdfNamedFile(file)) {
      setError("Please add one PDF file.");
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

      const pdf = await PDFDocument.load(copyArrayBuffer(bytes));
      const pageCount = pdf.getPageCount();
      const pdfJsDoc = await openPdfJsDocument(copyArrayBuffer(bytes));
      if (nextSession !== sessionRef.current) {
        await (pdfJsDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
        return;
      }
      pdfJsDocRef.current = pdfJsDoc;

      setDocument({ name: file.name, size: file.size, bytes, pageCount });
      setItems(createInitialItems(pageCount));
      setSelected(new Set());
      void renderThumbnails(pdfJsDoc, pageCount, nextSession);
    } catch (readError) {
      const message =
        readError instanceof Error && /password|encrypt/i.test(readError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
    }
  }

  function toggleSelected(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function reindexSelection(next: OrganizerItem[], previousSelectedIds: Set<string>) {
    setSelected(new Set(next.flatMap((item, index) => (previousSelectedIds.has(item.id) ? [index] : []))));
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null) return;
    const selectedIds = new Set(Array.from(selected).map((index) => items[index]?.id).filter(Boolean) as string[]);
    const next = moveItem(items, dragIndex, targetIndex);
    setItems(next);
    reindexSelection(next, selectedIds);
    setDragIndex(null);
    setResult(null);
  }

  function handleRotate(direction: "left" | "right") {
    const selectedIds = new Set(Array.from(selected).map((index) => items[index]?.id).filter(Boolean) as string[]);
    const next = selected.size ? rotateItems(items, selected, direction) : items;
    setItems(next);
    reindexSelection(next, selectedIds);
    setResult(null);
  }

  function handleRotateOne(index: number, direction: "left" | "right") {
    setItems(rotateItem(items, index, direction));
    setResult(null);
  }

  function handleDuplicate(index: number) {
    const item = items[index];
    if (!item) return;
    const next = duplicateItem(items, index, `${item.id}-dup-${Date.now()}`);
    setItems(next);
    setSelected(new Set());
    setResult(null);
  }

  function handleDelete(index: number) {
    const next = selected.has(index) ? removeItems(items, selected) : removeItem(items, index);
    setItems(next);
    setSelected(new Set());
    setResult(null);
  }

  async function handleExport() {
    if (!document_ || isExporting) return;
    const validationError = validateOrganizeItems(items);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "organize" });

    try {
      const bytes = await buildOrganizedPdf(document_.bytes, items);
      const blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const fileName = `${sanitizeFileStem(document_.name, "lumeo-organize")}.pdf`;
      setResult({ url, fileName, size: blob.size, pageCount: items.length });
      track({
        eventName: "processing_succeeded",
        toolSlug: "organize",
        durationMs: performance.now() - startedAt,
        success: true,
      });
      recordRecentFile({ tool: "organize", filename: fileName, fileSize: blob.size, pageCount: items.length });
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Could not build the organized PDF. Try a smaller document.",
      );
      track({
        eventName: "processing_failed",
        toolSlug: "organize",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsExporting(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    track({ eventName: "download_started", toolSlug: "organize" });
    downloadUrl(result.url, result.fileName);
  }

  if (!document_) {
    return (
      <section className="l2-workspace grid gap-5 pb-4 lg:pb-0">
        <div className="aura-glass-regular mx-auto w-full max-w-[720px] rounded-[var(--radius-2xl)] p-2 shadow-[var(--v2-elevation-3)]">
          <L2UploadStage
            inputId="organize-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<OrganizeIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={handleFiles}
          />
        </div>

        <L2PrivacyNote />

        {error ? (
          <div role="alert" className="mx-auto w-full max-w-[720px] rounded-[var(--radius-lg)] border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  const summaryLine = `${items.length} page${items.length === 1 ? "" : "s"} · ${formatBytes(document_.size)}`;

  return (
    <section className="l2-workspace-deep grid gap-4 pb-28 lg:pb-6">
      <L2WorkspaceHeader title="Organize PDF" description={summaryLine} />

      <L2WorkspaceToolbar>
        {selected.size > 0 ? (
          <>
            <L2ToolbarButton onClick={() => handleRotate("left")}>Rotate selected left</L2ToolbarButton>
            <L2ToolbarButton onClick={() => handleRotate("right")}>Rotate selected right</L2ToolbarButton>
          </>
        ) : null}
        <L2ToolbarButton onClick={resetTool}>Start new</L2ToolbarButton>
        <span className="ml-auto text-xs font-bold text-[var(--text-subtle)]">{summaryLine}</span>
      </L2WorkspaceToolbar>

      <L2WorkspaceGrid
        main={
          <L2WorkspacePanel>
            <L2PanelLabel title="Pages" description="Drag to reorder. Select multiple to rotate or delete together." />
            <div
              role="list"
              className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
            {items.map((item, index) => (
              <OrganizePageCell
                key={item.id}
                item={item}
                index={index}
                selected={selected.has(index)}
                thumbnailUrl={thumbnails[item.sourcePage]}
                onDragStart={setDragIndex}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                onToggleSelected={toggleSelected}
                onRotateOne={handleRotateOne}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            ))}
            </div>
          </L2WorkspacePanel>
        }
        inspector={
          <L2WorkspaceInspector title="Organize" description="Save applies the page order, rotations, duplicates, and deletions shown here.">
            {error ? (
              <div role="alert" className="mt-4 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-3 text-sm font-medium text-[var(--text-danger)]">
                {error}
              </div>
            ) : null}
          </L2WorkspaceInspector>
        }
      />

      <ToolActionBar>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={isExporting || items.length === 0}
          className="lumeo-primary-action lumeo-press inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-[var(--v2-interactive-disabled-opacity)] sm:w-auto"
        >
          {isExporting ? "Building PDF…" : "Save organized PDF"}
        </button>
      </ToolActionBar>

      {result ? (
        <L2ResultState
          title="Organized PDF ready"
          details={[
            { label: "Pages", value: String(result.pageCount) },
            { label: "Size", value: formatBytes(result.size) },
          ]}
          primaryAction={
            <button
              type="button"
              onClick={handleDownload}
              className="lumeo-primary-action lumeo-press inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)]"
            >
              Download
            </button>
          }
        />
      ) : null}

      <L2PrivacyNote />
    </section>
  );
}
