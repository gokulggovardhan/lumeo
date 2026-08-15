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

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageWithTimeout } from "@/lib/pdf/pdfjs";

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
};

type ThumbProps = {
  pageIndex: number;
  url: string | undefined;
  active: boolean;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  disabled: boolean;
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
  const urlsRef = useRef<string[]>([]);

  // Keyed on docReady as well as pageCount: a reorder or a text edit
  // replaces the document without necessarily changing how many pages it
  // has, and every thumbnail is stale the moment it does.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    // Revoke the PREVIOUS set only after the new ones are in state, so the
    // rail never blanks between documents.
    const previous = urlsRef.current;
    urlsRef.current = created;

    void (async () => {
      const doc = getDocument();
      if (!doc || pageCount === 0) return;
      const pending = Array.from({ length: pageCount }, (_, index) => index);

      async function renderOne(pageIndex: number) {
        try {
          const page = await doc!.getPage(pageIndex + 1);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) return;
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, canvas.width, canvas.height);

          await renderPageWithTimeout(page.render({ canvas, canvasContext: context, viewport }), pageIndex + 1);
          if (cancelled) return;

          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
          canvas.width = 0;
          canvas.height = 0;
          if (!blob || cancelled) return;

          const url = URL.createObjectURL(blob);
          created.push(url);
          setThumbnails((current) =>
            current.generation === docReady
              ? { generation: docReady, urls: { ...current.urls, [pageIndex]: url } }
              : { generation: docReady, urls: { [pageIndex]: url } },
          );
        } catch {
          // Best-effort: a page without a thumbnail is still selectable and
          // still reorderable, so a single failed render must not take the
          // rail down with it.
        }
      }

      async function worker() {
        while (pending.length > 0 && !cancelled) {
          const next = pending.shift();
          if (next === undefined) return;
          await renderOne(next);
        }
      }
      await Promise.all(Array.from({ length: THUMBNAIL_CONCURRENCY }, worker));
      for (const url of previous) URL.revokeObjectURL(url);
    })();

    return () => {
      cancelled = true;
      for (const url of previous) URL.revokeObjectURL(url);
    };
  }, [docReady, pageCount, getDocument]);

  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
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
      <ul className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-1.5">
        {Array.from({ length: pageCount }, (_, pageIndex) => (
          <Thumb
            key={pageIndex}
            pageIndex={pageIndex}
            url={visibleThumbnails[pageIndex]}
            active={pageIndex === activePageIndex}
            selected={selected.has(pageIndex)}
            dragging={dragIndex === pageIndex}
            dropTarget={overIndex === pageIndex && dragIndex !== null && dragIndex !== pageIndex}
            disabled={busy}
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
      </ul>
    </aside>
  );
}
