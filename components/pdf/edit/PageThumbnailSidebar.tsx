"use client";

// components/pdf/edit/PageThumbnailSidebar.tsx
//
// The page rail for the Edit workspace: a thumbnail per page, drag to
// reorder, multi-select for delete/extract.
//
// Thumbnails are rendered here rather than in EditPdfTool because they have
// their own lifecycle -- a bounded worker pool, a session guard so a
// document swap cannot let stale renders land, and blob URLs that must be
// revoked. Folding that into a component already carrying three render
// effects would make both harder to follow. The pattern mirrors
// OrganizePdfTool's rail, which has the same job.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageWithTimeout } from "@/lib/pdf/pdfjs";
import {
  THUMBNAIL_ROW_HEIGHT_PX,
  computeThumbnailWindow,
  scrollTopForThumbnail,
} from "@/lib/pdf/edit/thumbnailVirtualization";
const THUMBNAIL_SCALE = 0.28;
const THUMBNAIL_CONCURRENCY = 3;

export type PageThumbnailSidebarProps = {
  pageCount: number;
  /** Page currently open in the main stage. */
  activePageIndex: number;
  /** Bumped by the owner whenever the underlying pdfjs document is replaced. */
  docReady: number;
  getDocument: () => PDFDocumentProxy | null;
  /** Pages the user has ticked, for delete / extract. */
  selected: ReadonlySet<number>;
  busy: boolean;
  onSelectPage: (pageIndex: number) => void;
  onToggleSelected: (pageIndex: number, additive: boolean) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onPerformanceSample?: (sample: {
    durationMs: number;
    pageCount: number;
    renderedCount: number;
    failedCount: number;
    mountedRowCount: number;
    virtualized: boolean;
  }) => void;
};

type ThumbProps = {
  pageIndex: number;
  url: string | undefined;
  active: boolean;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  disabled: boolean;
  virtualized: boolean;
  onOpen: (pageIndex: number) => void;
  onToggle: (pageIndex: number, additive: boolean) => void;
  onDragStart: (pageIndex: number) => void;
  onDragOver: (pageIndex: number) => void;
  onDrop: (pageIndex: number) => void;
  onDragEnd: () => void;
};

const Thumb = memo(function Thumb({
  pageIndex,
  url,
  active,
  selected,
  dragging,
  dropTarget,
  disabled,
  virtualized,
  onOpen,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ThumbProps) {
  const ring = active
    ? "border-[var(--lumeo-gold)] ring-2 ring-[var(--lumeo-gold)]/40"
    : selected
      ? "border-[var(--lumeo-gold)]/60"
      : "border-[var(--text-primary)]/12";

  return (
    <li
      // The drop indicator is a border on the neighbour rather than a
      // separate inserted node, so the list never reflows mid-drag -- a
      // shifting list makes the drop target move out from under the cursor.
      className={`relative ${dropTarget ? "before:absolute before:-top-1 before:left-2 before:right-2 before:h-0.5 before:rounded before:bg-[var(--lumeo-gold)]" : ""}`}
      style={virtualized ? { height: THUMBNAIL_ROW_HEIGHT_PX } : undefined}
    >
      <div
        draggable={!disabled}
        onDragStart={() => onDragStart(pageIndex)}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver(pageIndex);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(pageIndex);
        }}
        onDragEnd={onDragEnd}
        className={`flex items-start gap-2 rounded-[var(--radius-md)] p-1.5 transition ${dragging ? "opacity-40" : ""}`}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          aria-label={`Select page ${pageIndex + 1}`}
          onChange={(event) => onToggle(pageIndex, (event.nativeEvent as MouseEvent).shiftKey)}
          className="mt-1 shrink-0"
        />
        <button
          type="button"
          onClick={() => onOpen(pageIndex)}
          disabled={disabled}
          aria-label={`Open page ${pageIndex + 1}`}
          aria-current={active ? "page" : undefined}
          className={`group min-w-0 flex-1 overflow-hidden rounded-[var(--radius-md)] border ${ring} bg-[var(--atelier-surface-1)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed`}
        >
          <span className="block aspect-[1/1.35] w-full bg-white">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from a canvas render; next/image cannot optimise it and would only add a wrapper.
              <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />
            ) : (
              <span className="grid h-full w-full place-items-center text-[10px] text-[#8b8f98]">…</span>
            )}
          </span>
          <span className="block px-1 py-1 text-center text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
            {pageIndex + 1}
          </span>
        </button>
      </div>
    </li>
  );
});

export default function PageThumbnailSidebar({
  pageCount,
  activePageIndex,
  docReady,
  getDocument,
  selected,
  busy,
  onSelectPage,
  onToggleSelected,
  onReorder,
  onPerformanceSample,
}: PageThumbnailSidebarProps) {
  // Thumbnails carry the document generation they were rendered from, so a
  // stale set is discarded by COMPARISON at render time rather than by
  // clearing state in the effect body. Same visible result, no
  // setState-in-effect and no cascading render -- and the previous set stays
  // on screen until the first new thumbnail actually arrives.
  const [thumbnails, setThumbnails] = useState<{ generation: number; urls: Record<number, string> }>({
    generation: -1,
    urls: {},
  });
  const visibleThumbnails = thumbnails.generation === docReady ? thumbnails.urls : {};
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const urlsRef = useRef<Map<number, string>>(new Map());
  const thumbnailGenerationRef = useRef(-1);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({
    top: 0,
    height: THUMBNAIL_ROW_HEIGHT_PX * 8,
  });
  const thumbnailWindow = useMemo(
    () =>
      computeThumbnailWindow({
        pageCount,
        scrollTop: scrollMetrics.top,
        viewportHeight: scrollMetrics.height,
      }),
    [pageCount, scrollMetrics.height, scrollMetrics.top],
  );

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      setScrollMetrics((current) => {
        const next = {
          top: list.scrollTop,
          height: Math.max(1, list.clientHeight),
        };
        return current.top === next.top && current.height === next.height
          ? current
          : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!thumbnailWindow.virtualized) return;
    const list = listRef.current;
    if (!list) return;
    const targetTop = activePageIndex * THUMBNAIL_ROW_HEIGHT_PX;
    const targetBottom = targetTop + THUMBNAIL_ROW_HEIGHT_PX;
    const visibleTop = list.scrollTop;
    const visibleBottom = visibleTop + list.clientHeight;
    if (targetTop >= visibleTop && targetBottom <= visibleBottom) return;
    const nextTop = scrollTopForThumbnail({
      pageIndex: activePageIndex,
      viewportHeight: list.clientHeight,
    });
    list.scrollTop = nextTop;
    setScrollMetrics({
      top: nextTop,
      height: Math.max(1, list.clientHeight),
    });
  }, [activePageIndex, thumbnailWindow.virtualized]);

  // Keyed on docReady as well as pageCount: a reorder or a text edit
  // replaces the document without necessarily changing how many pages it
  // has, and every thumbnail is stale the moment it does. For large
  // documents only the current virtual window is retained; overlapping
  // pages are reused and URLs outside the window are revoked immediately.
  useEffect(() => {
    let cancelled = false;

    const thumbnailBatchStartedAt = window.performance.now();
    let renderedCount = 0;
    let failedCount = 0;

    void (async () => {
      const doc = getDocument();
      if (!doc || pageCount === 0) return;
      const activeDoc = doc;

      // Keep state writes out of the synchronous effect body while still
      // invalidating stale document generations deterministically.
      await Promise.resolve();
      if (cancelled) return;

      if (thumbnailGenerationRef.current !== docReady) {
        for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
        urlsRef.current.clear();
        thumbnailGenerationRef.current = docReady;
        setThumbnails({ generation: docReady, urls: {} });
      }

      const desiredIndices = new Set(thumbnailWindow.indices);
      for (const [pageIndex, url] of urlsRef.current) {
        if (desiredIndices.has(pageIndex)) continue;
        URL.revokeObjectURL(url);
        urlsRef.current.delete(pageIndex);
      }

      setThumbnails({
        generation: docReady,
        urls: Object.fromEntries(urlsRef.current),
      });

      const pending = thumbnailWindow.indices.filter(
        (pageIndex) => !urlsRef.current.has(pageIndex),
      );

      async function renderOne(pageIndex: number) {
        try {
          const page = await activeDoc.getPage(pageIndex + 1);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) return;
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, canvas.width, canvas.height);

          await renderPageWithTimeout(
            page.render({ canvas, canvasContext: context, viewport }),
            pageIndex + 1,
          );
          if (cancelled) {
            canvas.width = 0;
            canvas.height = 0;
            return;
          }

          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.7),
          );
          canvas.width = 0;
          canvas.height = 0;
          if (!blob || cancelled || !desiredIndices.has(pageIndex)) return;

          const previousUrl = urlsRef.current.get(pageIndex);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          const url = URL.createObjectURL(blob);
          urlsRef.current.set(pageIndex, url);
          renderedCount += 1;
          setThumbnails({
            generation: docReady,
            urls: Object.fromEntries(urlsRef.current),
          });
        } catch {
          failedCount += 1;
          // Best-effort: a page without a thumbnail is still selectable and
          // still reorderable, so one failed raster never takes down the rail.
        }
      }

      async function worker() {
        while (pending.length > 0 && !cancelled) {
          const next = pending.shift();
          if (next === undefined) return;
          await renderOne(next);
        }
      }

      await Promise.all(
        Array.from({ length: THUMBNAIL_CONCURRENCY }, () => worker()),
      );
      if (!cancelled) {
        onPerformanceSample?.({
          durationMs: window.performance.now() - thumbnailBatchStartedAt,
          pageCount,
          renderedCount,
          failedCount,
          mountedRowCount: thumbnailWindow.indices.length,
          virtualized: thumbnailWindow.virtualized,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    docReady,
    pageCount,
    getDocument,
    thumbnailWindow.endIndexExclusive,
    thumbnailWindow.startIndex,
    thumbnailWindow.indices.length,
    thumbnailWindow.virtualized,
    onPerformanceSample,
  ]);

  useEffect(
    () => () => {
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
      urlsRef.current.clear();
    },
    [],
  );

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) onReorder(dragIndex, toIndex);
      setDragIndex(null);
      setOverIndex(null);
    },
    [dragIndex, onReorder],
  );

  return (
    <aside
      aria-label="Pages"
      className="flex w-[124px] shrink-0 flex-col rounded-[var(--radius-xl)] border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-0)]/60"
    >
      <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        Pages
      </p>
      <ul
        ref={listRef}
        data-thumbnail-virtualized={thumbnailWindow.virtualized ? "true" : "false"}
        data-thumbnail-window-size={thumbnailWindow.indices.length}
        onScroll={(event) => {
          const list = event.currentTarget;
          setScrollMetrics({
            top: list.scrollTop,
            height: Math.max(1, list.clientHeight),
          });
        }}
        className={`flex-1 overflow-y-auto overscroll-contain p-1.5 ${thumbnailWindow.virtualized ? "" : "space-y-1"}`}
      >
        {thumbnailWindow.topSpacerPx > 0 ? (
          <li
            aria-hidden="true"
            style={{ height: thumbnailWindow.topSpacerPx }}
          />
        ) : null}
        {thumbnailWindow.indices.map((pageIndex) => (
          <Thumb
            key={pageIndex}
            pageIndex={pageIndex}
            url={visibleThumbnails[pageIndex]}
            active={pageIndex === activePageIndex}
            selected={selected.has(pageIndex)}
            dragging={dragIndex === pageIndex}
            dropTarget={overIndex === pageIndex && dragIndex !== null && dragIndex !== pageIndex}
            disabled={busy}
            virtualized={thumbnailWindow.virtualized}
            onOpen={onSelectPage}
            onToggle={onToggleSelected}
            onDragStart={setDragIndex}
            onDragOver={setOverIndex}
            onDrop={handleDrop}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          />
        ))}
        {thumbnailWindow.bottomSpacerPx > 0 ? (
          <li
            aria-hidden="true"
            style={{ height: thumbnailWindow.bottomSpacerPx }}
          />
        ) : null}
      </ul>
    </aside>
  );
}
