"use client";

// components/pdf/pageNumbers/PageNumberPreview.tsx
//
// Adapted from components/pdf/watermark/WatermarkPreview.tsx: same
// pdfjs-rendered-background + draggable-anchor-overlay approach, same
// pointer/keyboard drag math and clamping (lib/pdf/core/placement.ts's
// clampManualPosition, shared with Watermark, not duplicated). Simplified
// for what Page Numbers actually has: no tiled-repeat mode, no independent
// content rotation (a page number only rotates with the page itself, which
// this preview -- a plain on-screen overlay -- doesn't need to visualize),
// no snap guides (Watermark's snap-to-center/edges is a "not part of the
// approved feature list" item here too, per the same reasoning Watermark's
// own file documents for its own out-of-scope items).

import { useRef, useState } from "react";
import { clampManualPosition, cornerAnchorPct } from "@/lib/pdf/core/placement.ts";
import type { PageNumbersConfig } from "@/lib/pdf/pageNumbers/config";

const MOVE_STEP_PCT = 1;
const MOVE_STEP_LARGE_PCT = 5;

function describePosition(xPct: number, yPct: number): string {
  return `Page number position: ${Math.round(xPct)}% from left, ${Math.round(yPct)}% from top`;
}

export function PageNumberPreview({
  pageImageUrl,
  config,
  labelText,
  contentWidthPct,
  contentHeightPct,
  pageWidthPt,
  pageHeightPt,
  onPositionChange,
}: {
  pageImageUrl: string;
  config: PageNumbersConfig;
  labelText: string;
  contentWidthPct: number;
  contentHeightPct: number;
  pageWidthPt: number;
  pageHeightPt: number;
  onPositionChange: (position: { xPct: number; yPct: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originXPct: number; originYPct: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const allowOverflow = config.placement.mode === "manual" ? (config.placement.allowOverflow ?? false) : false;

  // Corner placement has no stored coordinates -- derive where it lands on
  // THIS page, fresh, the same way export.ts derives it per page (no user
  // rotation knob for page numbers, so rotationDeg is always 0 here).
  const anchorPct = config.placement.mode === "manual"
    ? { xPct: config.placement.xPct, yPct: config.placement.yPct }
    : cornerAnchorPct(config.placement.corner, config.marginPct, contentWidthPct, contentHeightPct, 0, pageWidthPt, pageHeightPt);

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
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (config.placement.mode !== "manual") return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originXPct: anchorPct.xPct, originYPct: anchorPct.yPct };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
    applyLiveStyle(clampLive(drag.originXPct + deltaXPct, drag.originYPct + deltaYPct));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (drag && rect) {
      const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
      const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
      commit(clampLive(drag.originXPct + deltaXPct, drag.originYPct + deltaYPct));
    }
    dragRef.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (config.placement.mode !== "manual") return;
    const step = event.shiftKey ? MOVE_STEP_LARGE_PCT : MOVE_STEP_PCT;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    commit(clampLive(anchorPct.xPct + dx, anchorPct.yPct + dy));
  }

  const previewStyle: React.CSSProperties = {
    opacity: config.opacity,
    color: config.color,
    fontWeight: config.bold ? 700 : 400,
    fontStyle: config.italic ? "italic" : "normal",
    fontSize: `${Math.max(10, config.fontSizePt * 0.6)}px`,
  };

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

      <div
        ref={nodeRef}
        role="group"
        tabIndex={0}
        aria-label={describePosition(anchorPct.xPct, anchorPct.yPct)}
        onFocus={() => setAnnouncement(describePosition(anchorPct.xPct, anchorPct.yPct))}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        className={`absolute select-none whitespace-nowrap ${config.placement.mode === "manual" ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"}`}
        style={{ left: `${anchorPct.xPct}%`, top: `${anchorPct.yPct}%`, ...previewStyle }}
      >
        {labelText}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
