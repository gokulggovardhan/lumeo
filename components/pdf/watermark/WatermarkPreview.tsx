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
//
// v1.1 Phase 3 adds: keyboard movement (arrow/shift+arrow, mirroring Crop
// PDF's CropRectView pattern), snap guides + snap-to-center/edges during
// drag, and boundary/overflow-aware clamping (via
// lib/pdf/watermark/config.ts's clampManualPosition, the same function the
// settings-panel numeric inputs use, so drag and numeric input can never
// disagree about what's in-bounds).

import { useRef, useState } from "react";
import type { WatermarkConfig } from "@/lib/pdf/watermark/config";
import { clampManualPosition, computeTilePositions, cornerAnchorPct } from "@/lib/pdf/watermark/config";

const MOVE_STEP_PCT = 1;
const MOVE_STEP_LARGE_PCT = 5;
const SNAP_TOLERANCE_PCT = 1.5;

function describePosition(xPct: number, yPct: number): string {
  return `Watermark position: ${Math.round(xPct)}% from left, ${Math.round(yPct)}% from top`;
}

export function WatermarkPreview({
  pageImageUrl,
  config,
  contentWidthPct,
  contentHeightPct,
  pageWidthPt,
  pageHeightPt,
  onPositionChange,
  snapToCenter = true,
  snapToEdges = true,
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
  snapToCenter?: boolean;
  snapToEdges?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originXPct: number; originYPct: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ vCenter: boolean; hCenter: boolean; left: boolean; right: boolean; top: boolean; bottom: boolean }>({
    vCenter: false, hCenter: false, left: false, right: false, top: false, bottom: false,
  });
  const [announcement, setAnnouncement] = useState("");

  const allowOverflow = config.placement.mode === "manual" ? (config.placement.allowOverflow ?? false) : false;

  // Corner placement has no stored coordinates -- derive where it lands on
  // THIS page, fresh, the same way export.ts derives it per page. Manual
  // placement already has its own stored percentage.
  const singleAnchorPct = config.placement.mode === "manual"
    ? { xPct: config.placement.xPct, yPct: config.placement.yPct }
    : cornerAnchorPct(config.placement.corner, config.marginPct, contentWidthPct, contentHeightPct, config.rotationDeg, pageWidthPt, pageHeightPt);

  // Snaps a live (unclamped) position to the page center / edges within
  // SNAP_TOLERANCE_PCT, and reports which guides are active so the caller
  // can render them. Snapping never overrides an explicit numeric edit --
  // it only applies to the live drag value.
  function applySnap(xPct: number, yPct: number) {
    let snappedX = xPct;
    let snappedY = yPct;
    const centerX = (100 - contentWidthPct) / 2;
    const centerY = (100 - contentHeightPct) / 2;
    const rightX = 100 - contentWidthPct;
    const bottomY = 100 - contentHeightPct;

    const guides = { vCenter: false, hCenter: false, left: false, right: false, top: false, bottom: false };

    if (snapToCenter && Math.abs(xPct - centerX) <= SNAP_TOLERANCE_PCT) {
      snappedX = centerX;
      guides.vCenter = true;
    }
    if (snapToCenter && Math.abs(yPct - centerY) <= SNAP_TOLERANCE_PCT) {
      snappedY = centerY;
      guides.hCenter = true;
    }
    if (snapToEdges && !guides.vCenter) {
      if (Math.abs(xPct - 0) <= SNAP_TOLERANCE_PCT) {
        snappedX = 0;
        guides.left = true;
      } else if (Math.abs(xPct - rightX) <= SNAP_TOLERANCE_PCT) {
        snappedX = rightX;
        guides.right = true;
      }
    }
    if (snapToEdges && !guides.hCenter) {
      if (Math.abs(yPct - 0) <= SNAP_TOLERANCE_PCT) {
        snappedY = 0;
        guides.top = true;
      } else if (Math.abs(yPct - bottomY) <= SNAP_TOLERANCE_PCT) {
        snappedY = bottomY;
        guides.bottom = true;
      }
    }

    setSnapGuides(guides);
    return { xPct: snappedX, yPct: snappedY };
  }

  function clampLive(xPct: number, yPct: number) {
    return clampManualPosition(xPct, yPct, contentWidthPct, contentHeightPct, allowOverflow);
  }

  function applyLiveStyle(live: { xPct: number; yPct: number }) {
    const node = nodeRef.current;
    if (!node) return;
    node.style.left = `${live.xPct}%`;
    node.style.top = `${live.yPct}%`;
  }

  function commit(next: { xPct: number; yPct: number }) {
    onPositionChange(next);
    setAnnouncement(describePosition(next.xPct, next.yPct));
    setSnapGuides({ vCenter: false, hCenter: false, left: false, right: false, top: false, bottom: false });
  }

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
    const clamped = clampLive(drag.originXPct + deltaXPct, drag.originYPct + deltaYPct);
    const snapped = applySnap(clamped.xPct, clamped.yPct);
    applyLiveStyle(snapped);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (drag && rect) {
      const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
      const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
      const clamped = clampLive(drag.originXPct + deltaXPct, drag.originYPct + deltaYPct);
      commit(applySnap(clamped.xPct, clamped.yPct));
    }
    dragRef.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (config.placementMode !== "single") return;
    const step = event.shiftKey ? MOVE_STEP_LARGE_PCT : MOVE_STEP_PCT;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    commit(clampLive(singleAnchorPct.xPct + dx, singleAnchorPct.yPct + dy));
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

  const anyGuideActive = snapGuides.vCenter || snapGuides.hCenter || snapGuides.left || snapGuides.right || snapGuides.top || snapGuides.bottom;

  return (
    <div
      ref={stageRef}
      className="relative mx-auto max-h-[70vh] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white"
      style={{ aspectRatio: `${pageWidthPt} / ${pageHeightPt}` }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pageImageUrl} alt="Page preview" className="pointer-events-none block h-full w-full select-none" />

      {config.placementMode === "single" ? (
        <>
          <div
            ref={nodeRef}
            data-watermark-anchor="true"
            role="group"
            tabIndex={0}
            aria-label={describePosition(singleAnchorPct.xPct, singleAnchorPct.yPct)}
            onFocus={() => setAnnouncement(describePosition(singleAnchorPct.xPct, singleAnchorPct.yPct))}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            className="absolute cursor-grab touch-none select-none whitespace-nowrap active:cursor-grabbing"
            style={{ left: `${singleAnchorPct.xPct}%`, top: `${singleAnchorPct.yPct}%`, ...previewStyle }}
          >
            {config.content.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.content.imageDataUrl} alt="Watermark image" className="h-16 w-16 select-none object-contain" draggable={false} />
            ) : (
              previewLabel
            )}
          </div>

          {anyGuideActive ? (
            <>
              {snapGuides.vCenter ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[var(--lumeo-gold)]/70" /> : null}
              {snapGuides.hCenter ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--lumeo-gold)]/70" /> : null}
              {snapGuides.left ? <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-[var(--lumeo-gold)]/50" /> : null}
              {snapGuides.right ? <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[var(--lumeo-gold)]/50" /> : null}
              {snapGuides.top ? <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--lumeo-gold)]/50" /> : null}
              {snapGuides.bottom ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--lumeo-gold)]/50" /> : null}
            </>
          ) : null}
        </>
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

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
