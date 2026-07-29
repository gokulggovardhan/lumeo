"use client";

// components/pdf/crop/CropRectView.tsx
//
// The draggable, resizable crop rectangle overlaid on the page preview.
// Move (drag the body) reuses WatermarkPreview.tsx's pointer-capture drag
// pattern; resize (drag a corner handle) generalizes
// components/pdf/edit/EditElementView.tsx's single bottom-right resize
// handle to all four corners, since a crop rectangle (unlike Edit PDF's
// shapes, which only ever expose one resize handle) needs every corner
// independently draggable -- the fixed corner is whichever corner is NOT
// being dragged, generalizing the exact "opposite endpoint stays fixed"
// rule EditElementView already uses for line shapes.
//
// Same perf approach as both prior-art components: drag/resize write
// straight to the DOM node's style on every pointermove, and only call
// onRectChange once at gesture end (pointerup), so the interaction stays
// smooth regardless of page complexity.
//
// Per docs/specs/crop-pdf-spec.md section 7, keyboard operability is the
// PRIMARY accessible path (not a fallback to pointer-only dragging):
// the body and each handle are independently focusable and respond to
// arrow keys (Shift+Arrow for a larger step), with a live region
// announcing the resulting rect on every keyboard change.

import { useRef, useState } from "react";
import { clampCropRect, type CropRect } from "@/lib/pdf/crop/config";

const MOVE_STEP_PCT = 1;
const MOVE_STEP_LARGE_PCT = 5;

type Handle = "nw" | "ne" | "sw" | "se";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function describeRect(rect: CropRect): string {
  return `Crop area: ${Math.round(rect.xPct)}% from left, ${Math.round(rect.yPct)}% from top, ${Math.round(rect.widthPct)}% wide, ${Math.round(rect.heightPct)}% tall`;
}

// Resizes `origin` by (deltaXPct, deltaYPct) dragging the given corner --
// the two edges NOT named by the handle stay fixed (e.g. dragging "se"
// keeps the top and left edges fixed and grows right/down). When
// `aspectRatio` (widthPct/heightPct) is given, the width from the drag
// drives the result and height is derived to match the ratio -- the corner
// opposite the dragged handle still stays fixed, same as the unlocked case.
function resizeFromHandle(origin: CropRect, deltaXPct: number, deltaYPct: number, handle: Handle, aspectRatio?: number): CropRect {
  const right = origin.xPct + origin.widthPct;
  const bottom = origin.yPct + origin.heightPct;
  let { xPct, yPct, widthPct, heightPct } = origin;

  if (handle === "ne" || handle === "se") {
    widthPct = clamp(origin.widthPct + deltaXPct, 1, 100 - origin.xPct);
  } else {
    const newX = clamp(origin.xPct + deltaXPct, 0, right - 1);
    widthPct = right - newX;
    xPct = newX;
  }

  if (aspectRatio) {
    heightPct = widthPct / aspectRatio;
    if (handle === "nw" || handle === "ne") {
      yPct = bottom - heightPct;
    } else {
      yPct = origin.yPct;
    }
  } else if (handle === "sw" || handle === "se") {
    heightPct = clamp(origin.heightPct + deltaYPct, 1, 100 - origin.yPct);
  } else {
    const newY = clamp(origin.yPct + deltaYPct, 0, bottom - 1);
    heightPct = bottom - newY;
    yPct = newY;
  }

  return clampCropRect({ xPct, yPct, widthPct, heightPct });
}

export function CropRectView({
  stageRef,
  rect,
  onRectChange,
  lockAspectRatio = false,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  rect: CropRect;
  onRectChange: (rect: CropRect) => void;
  // "Maintain Aspect Ratio" toggle -- when on, every resize (drag or
  // keyboard) derives height from width using the rect's ratio AT THE
  // START of that resize gesture, so a locked resize can't drift ratio
  // gesture-to-gesture the way re-deriving from `rect` on every move would.
  lockAspectRatio?: boolean;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: CropRect } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origin: CropRect; handle: Handle } | null>(null);
  const [announcement, setAnnouncement] = useState(() => describeRect(rect));

  function getStageRect() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  function applyLiveStyle(live: CropRect) {
    const node = nodeRef.current;
    if (!node) return;
    node.style.left = `${live.xPct}%`;
    node.style.top = `${live.yPct}%`;
    node.style.width = `${live.widthPct}%`;
    node.style.height = `${live.heightPct}%`;
  }

  function commit(next: CropRect) {
    onRectChange(next);
    setAnnouncement(describeRect(next));
  }

  function handleBodyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.handle) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: rect };
  }

  function handleBodyPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stageRect = getStageRect();
    if (!drag || !stageRect) return;
    const deltaXPct = ((event.clientX - drag.startX) / stageRect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / stageRect.height) * 100;
    const live = clampCropRect({
      xPct: drag.origin.xPct + deltaXPct,
      yPct: drag.origin.yPct + deltaYPct,
      widthPct: drag.origin.widthPct,
      heightPct: drag.origin.heightPct,
    });
    applyLiveStyle(live);
  }

  function handleBodyPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stageRect = getStageRect();
    if (drag && stageRect) {
      const deltaXPct = ((event.clientX - drag.startX) / stageRect.width) * 100;
      const deltaYPct = ((event.clientY - drag.startY) / stageRect.height) * 100;
      commit(
        clampCropRect({
          xPct: drag.origin.xPct + deltaXPct,
          yPct: drag.origin.yPct + deltaYPct,
          widthPct: drag.origin.widthPct,
          heightPct: drag.origin.heightPct,
        }),
      );
    }
    dragRef.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handleResizeStart(event: React.PointerEvent<HTMLDivElement>, handle: Handle) {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    resizeRef.current = { startX: event.clientX, startY: event.clientY, origin: rect, handle };
  }

  function handleResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    const stageRect = getStageRect();
    if (!resize || !stageRect) return;
    const deltaXPct = ((event.clientX - resize.startX) / stageRect.width) * 100;
    const deltaYPct = ((event.clientY - resize.startY) / stageRect.height) * 100;
    const aspectRatio = lockAspectRatio ? resize.origin.widthPct / resize.origin.heightPct : undefined;
    applyLiveStyle(resizeFromHandle(resize.origin, deltaXPct, deltaYPct, resize.handle, aspectRatio));
  }

  function handleResizeEnd(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    const stageRect = getStageRect();
    if (resize && stageRect) {
      const deltaXPct = ((event.clientX - resize.startX) / stageRect.width) * 100;
      const deltaYPct = ((event.clientY - resize.startY) / stageRect.height) * 100;
      const aspectRatio = lockAspectRatio ? resize.origin.widthPct / resize.origin.heightPct : undefined;
      commit(resizeFromHandle(resize.origin, deltaXPct, deltaYPct, resize.handle, aspectRatio));
    }
    resizeRef.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handleBodyKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? MOVE_STEP_LARGE_PCT : MOVE_STEP_PCT;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    commit(clampCropRect({ ...rect, xPct: rect.xPct + dx, yPct: rect.yPct + dy }));
  }

  function handleHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>, handle: Handle) {
    const step = event.shiftKey ? MOVE_STEP_LARGE_PCT : MOVE_STEP_PCT;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    event.stopPropagation();
    const aspectRatio = lockAspectRatio ? rect.widthPct / rect.heightPct : undefined;
    commit(resizeFromHandle(rect, dx, dy, handle, aspectRatio));
  }

  const handles: Handle[] = ["nw", "ne", "sw", "se"];
  const handleLabel: Record<Handle, string> = {
    nw: "Resize crop area from top-left corner",
    ne: "Resize crop area from top-right corner",
    sw: "Resize crop area from bottom-left corner",
    se: "Resize crop area from bottom-right corner",
  };
  const handlePosition: Record<Handle, string> = {
    nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
    ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
    sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize",
    se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  };

  return (
    <>
      <div
        ref={nodeRef}
        role="group"
        tabIndex={0}
        aria-label={describeRect(rect)}
        onFocus={() => setAnnouncement(describeRect(rect))}
        onKeyDown={handleBodyKeyDown}
        onPointerDown={handleBodyPointerDown}
        onPointerMove={(event) => {
          handleBodyPointerMove(event);
          handleResizeMove(event);
        }}
        onPointerUp={(event) => {
          handleBodyPointerUp(event);
          handleResizeEnd(event);
        }}
        onPointerCancel={(event) => {
          handleBodyPointerUp(event);
          handleResizeEnd(event);
        }}
        className="absolute touch-none select-none border-2 border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 cursor-grab active:cursor-grabbing"
        style={{ left: `${rect.xPct}%`, top: `${rect.yPct}%`, width: `${rect.widthPct}%`, height: `${rect.heightPct}%` }}
      >
        {handles.map((handle) => (
          <div
            key={handle}
            data-handle={handle}
            role="button"
            tabIndex={0}
            aria-label={handleLabel[handle]}
            onPointerDown={(event) => handleResizeStart(event, handle)}
            onKeyDown={(event) => handleHandleKeyDown(event, handle)}
            className={`absolute h-4 w-4 touch-none rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)] ${handlePosition[handle]}`}
          />
        ))}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
