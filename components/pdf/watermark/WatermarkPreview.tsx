"use client";

// components/pdf/watermark/WatermarkPreview.tsx
//
// Renders the current page's pdfjs-rendered background plus a live overlay
// of the watermark at its current position -- a single draggable anchor in
// "single" placement mode, or a read-only grid of repeats in "tiled" mode.
// Adapted from components/pdf/edit/EditElementView.tsx's drag pointer math
// (same live-DOM-write-during-gesture, commit-once-at-gesture-end pattern),
// simplified to move-only (no resize, no delete) since a watermark anchor
// has no independent size of its own -- size follows font size/scale or
// image scale, set in the settings panel, not by dragging.

import { useRef } from "react";
import type { WatermarkConfig } from "@/lib/pdf/watermark/config";
import { computeTilePositions, cornerAnchorPct } from "@/lib/pdf/watermark/config";

export function WatermarkPreview({
  pageImageUrl,
  config,
  contentWidthPct,
  contentHeightPct,
  pageWidthPt,
  pageHeightPt,
  onPositionChange,
}: {
  pageImageUrl: string;
  config: WatermarkConfig;
  // Approximate on-screen size of the watermark content, in percent of the
  // page -- computed by the caller from font metrics or image aspect ratio,
  // same "page-relative box" approach export.ts uses for the real export.
  contentWidthPct: number;
  contentHeightPct: number;
  // The currently-displayed page's own dimensions (any consistent unit --
  // cornerAnchorPct's math only depends on their ratio, e.g. rendered
  // canvas pixels work exactly as well as PDF points). Needed to derive a
  // corner placement's on-screen position for THIS page; a manual
  // placement doesn't need them at all.
  pageWidthPt: number;
  pageHeightPt: number;
  onPositionChange: (position: { xPct: number; yPct: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originXPct: number; originYPct: number } | null>(null);

  // Corner placement has no stored coordinates -- derive where it lands on
  // THIS page, fresh, the same way export.ts derives it per page. Manual
  // placement already has its own stored percentage.
  const singleAnchorPct = config.placement.mode === "manual"
    ? { xPct: config.placement.xPct, yPct: config.placement.yPct }
    : cornerAnchorPct(config.placement.corner, config.marginPct, contentWidthPct, contentHeightPct, config.rotationDeg, pageWidthPt, pageHeightPt);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (config.placementMode !== "single") return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originXPct: singleAnchorPct.xPct, originYPct: singleAnchorPct.yPct };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
    const xPct = Math.min(100 - contentWidthPct, Math.max(0, drag.originXPct + deltaXPct));
    const yPct = Math.min(100 - contentHeightPct, Math.max(0, drag.originYPct + deltaYPct));
    const node = event.currentTarget.querySelector<HTMLElement>('[data-watermark-anchor="true"]');
    if (node) {
      node.style.left = `${xPct}%`;
      node.style.top = `${yPct}%`;
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (drag && rect) {
      const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
      const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
      const xPct = Math.min(100 - contentWidthPct, Math.max(0, drag.originXPct + deltaXPct));
      const yPct = Math.min(100 - contentHeightPct, Math.max(0, drag.originYPct + deltaYPct));
      onPositionChange({ xPct, yPct });
    }
    dragRef.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  const previewLabel = config.content.kind === "text" ? config.content.text || "Watermark" : "Image watermark";
  const previewStyle: React.CSSProperties = {
    opacity: config.opacity,
    transform: `rotate(${-config.rotationDeg}deg)`,
    color: config.content.kind === "text" ? config.content.color : undefined,
    fontWeight: config.content.kind === "text" && config.content.bold ? 700 : 400,
    fontStyle: config.content.kind === "text" && config.content.italic ? "italic" : "normal",
    fontSize: config.content.kind === "text" ? `${Math.max(10, config.content.fontSizePt * config.scale * 0.6)}px` : undefined,
  };

  const tilePositions = config.placementMode === "tiled"
    ? computeTilePositions(contentWidthPct, contentHeightPct, config.tileSpacingPct)
    : [];

  return (
    <div
      ref={stageRef}
      className="relative mx-auto max-h-[32rem] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pageImageUrl} alt="Page preview" className="pointer-events-none block h-full w-full select-none" />

      {config.placementMode === "single" ? (
        <div
          data-watermark-anchor="true"
          onPointerDown={handlePointerDown}
          className="absolute cursor-grab select-none whitespace-nowrap active:cursor-grabbing"
          style={{ left: `${singleAnchorPct.xPct}%`, top: `${singleAnchorPct.yPct}%`, ...previewStyle }}
        >
          {config.content.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.content.imageDataUrl} alt="Watermark image" className="h-16 w-16 select-none object-contain" draggable={false} />
          ) : (
            previewLabel
          )}
        </div>
      ) : (
        tilePositions.map((position, index) => (
          <div
            key={`${position.xPct}-${position.yPct}-${index}`}
            className="pointer-events-none absolute select-none whitespace-nowrap"
            style={{ left: `${position.xPct}%`, top: `${position.yPct}%`, ...previewStyle }}
          >
            {config.content.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.content.imageDataUrl} alt="" className="h-16 w-16 select-none object-contain" draggable={false} />
            ) : (
              previewLabel
            )}
          </div>
        ))
      )}
    </div>
  );
}
