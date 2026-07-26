"use client";

// components/pdf/edit/EditElementView.tsx
//
// One placed element (text/shape/whiteout/ink) on the edit stage. Adapted
// from components/pdf/sign/PlacedElementView.tsx's drag/resize pointer math,
// extended to 2D resize (both width and height, since a rectangle needs
// both dimensions -- PlacedElementView's text-like branch only ever resized
// width) and line-endpoint dragging for line shapes. Ink elements are
// move + delete only, matching the design spec.
//
// Same perf approach as PlacedElementView: drag/resize write straight to
// the DOM node's style on every pointermove, and only call onChange once
// at gesture end, so dragging stays smooth regardless of how many other
// elements are on the page.

import { useRef } from "react";
import { canResizeElement, isLineShape, type EditElement } from "@/lib/pdf/edit/elements";

const MIN_SIZE_PCT = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type LiveGeometry = { xPct: number; yPct: number; widthPct: number; heightPct: number };

export function EditElementView({
  element,
  selected,
  stageRef,
  onSelect,
  onChange,
  onDelete,
  onTextChange,
  pixelsPerPoint,
}: {
  element: EditElement;
  selected: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: Partial<EditElement>) => void;
  onDelete: () => void;
  onTextChange: (text: string) => void;
  // Converts a PDF point (the unit `element.fontSizePt` is stored in, and
  // the unit lib/pdf/edit/export.ts draws text at) into the CSS pixels the
  // on-screen textarea should render at, so the editor stays WYSIWYG with
  // the exported PDF. Computed once in EditPdfTool.tsx from the rendered
  // page's pixel dimensions vs. its real point dimensions.
  pixelsPerPoint: number;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<LiveGeometry | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originXPct: number; originYPct: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    originWidthPct: number;
    originHeightPct: number;
    originXPct: number;
    originYPct: number;
    // Which endpoint is being dragged, for line shapes -- "end" resizes via
    // the normal corner handle (adjusts width/height from the start point),
    // "start" instead moves the origin point too so the opposite endpoint
    // stays fixed.
    endpoint: "start" | "end";
  } | null>(null);

  function getStageRect() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  function ensureLive(): LiveGeometry {
    if (!liveRef.current) {
      liveRef.current = { xPct: element.xPct, yPct: element.yPct, widthPct: element.widthPct, heightPct: element.heightPct };
    }
    return liveRef.current;
  }

  function applyLiveStyle(live: LiveGeometry) {
    const node = nodeRef.current;
    if (!node) return;
    node.style.left = `${live.xPct}%`;
    node.style.top = `${live.yPct}%`;
    node.style.width = `${live.widthPct}%`;
    node.style.height = `${live.heightPct}%`;
  }

  function commitLive() {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    onChange(live);
  }

  function handleBodyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.handle) return;
    onSelect();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originXPct: element.xPct, originYPct: element.yPct };
  }

  function handleBodyPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = getStageRect();
    if (!drag || !rect) return;
    const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
    const live = ensureLive();
    live.xPct = clamp(drag.originXPct + deltaXPct, 0, 100 - live.widthPct);
    live.yPct = clamp(drag.originYPct + deltaYPct, 0, 100 - live.heightPct);
    applyLiveStyle(live);
  }

  function handleBodyPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      commitLive();
    }
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handleResizeStart(event: React.PointerEvent<HTMLDivElement>, endpoint: "start" | "end") {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidthPct: element.widthPct,
      originHeightPct: element.heightPct,
      originXPct: element.xPct,
      originYPct: element.yPct,
      endpoint,
    };
  }

  function handleResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    const rect = getStageRect();
    if (!resize || !rect) return;
    const deltaXPct = ((event.clientX - resize.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - resize.startY) / rect.height) * 100;
    const live = ensureLive();

    if (resize.endpoint === "start") {
      // Dragging the line's start point: the opposite corner (origin +
      // original width/height) stays fixed, so both origin and size shift.
      const fixedX = resize.originXPct + resize.originWidthPct;
      const fixedY = resize.originYPct + resize.originHeightPct;
      const nextX = clamp(resize.originXPct + deltaXPct, 0, 100);
      const nextY = clamp(resize.originYPct + deltaYPct, 0, 100);
      const widthPct = Math.max(MIN_SIZE_PCT, Math.abs(fixedX - nextX));
      const heightPct = Math.max(MIN_SIZE_PCT, Math.abs(fixedY - nextY));
      live.widthPct = widthPct;
      live.heightPct = heightPct;
      // Re-derive xPct/yPct from the FLOORED width/height so the fixed corner
      // (fixedX, fixedY) stays truly pinned once the MIN_SIZE_PCT floor kicks
      // in -- which happens almost immediately for a freshly-created line,
      // since default heightPct is 0.5, already below the 2% floor.
      //
      // When the drag point hasn't crossed the fixed corner (nextX <= fixedX),
      // the fixed corner is the box's right edge, so xPct = fixedX - widthPct
      // keeps xPct + widthPct === fixedX exactly, even after flooring.
      // When the drag point has crossed past the fixed corner (nextX > fixedX),
      // the fixed corner is the box's LEFT edge instead, so xPct = fixedX
      // keeps it pinned there while the box grows in the other direction.
      // (A naive unconditional `fixedX - widthPct` breaks this crossover case.)
      live.xPct = nextX <= fixedX ? fixedX - widthPct : fixedX;
      live.yPct = nextY <= fixedY ? fixedY - heightPct : fixedY;
    } else {
      live.widthPct = clamp(resize.originWidthPct + deltaXPct, MIN_SIZE_PCT, 100 - resize.originXPct);
      live.heightPct = clamp(resize.originHeightPct + deltaYPct, MIN_SIZE_PCT, 100 - resize.originYPct);
    }
    applyLiveStyle(live);
  }

  function handleResizeEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (resizeRef.current) {
      resizeRef.current = null;
      commitLive();
    }
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  const resizable = canResizeElement(element);
  const isLine = isLineShape(element);

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={`${element.type} element, Delete to remove`}
      onFocus={onSelect}
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
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }
      }}
      className={`absolute touch-none select-none ${selected ? "z-20" : "z-10"} cursor-grab active:cursor-grabbing`}
      style={{ left: `${element.xPct}%`, top: `${element.yPct}%`, width: `${element.widthPct}%`, height: `${element.heightPct}%` }}
    >
      {element.type === "text" ? (
        <textarea
          value={element.text}
          onChange={(event) => onTextChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Type here"
          className={`h-full w-full resize-none rounded-sm bg-transparent px-1 outline-none ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{
            fontSize: `${element.fontSizePt * pixelsPerPoint}px`,
            lineHeight: 1.15,
            color: element.color,
            fontWeight: element.bold ? 700 : 400,
            fontStyle: element.italic ? "italic" : "normal",
          }}
        />
      ) : element.type === "ink" ? (
        <div className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={element.pngDataUrl} alt="Ink stroke" className="h-full w-full select-none" draggable={false} />
        </div>
      ) : element.type === "whiteout" ? (
        <div
          className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{ backgroundColor: element.color === "white" ? "#ffffff" : "#000000" }}
        />
      ) : isLine ? (
        <svg className="h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
          <line x1="0" y1="0" x2="100%" y2="100%" stroke={element.color} strokeWidth={2} strokeOpacity={element.opacity} />
        </svg>
      ) : (
        <div
          className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{
            backgroundColor: element.color,
            opacity: element.opacity,
            borderRadius: element.shapeKind === "ellipse" ? "50%" : undefined,
          }}
        />
      )}

      {selected ? (
        <>
          <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 px-1.5 py-1 shadow-lg">
            <button
              type="button"
              data-handle="delete"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              aria-label="Delete"
              className="grid h-6 w-6 place-items-center rounded-full text-xs text-[var(--text-danger)]/80 transition hover:bg-[var(--text-danger)]/10 hover:text-[var(--text-danger)]"
            >
              ✕
            </button>
          </div>

          {resizable && isLine ? (
            <>
              <div
                data-handle="resize-start"
                onPointerDown={(event) => handleResizeStart(event, "start")}
                className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 cursor-move rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
              />
              <div
                data-handle="resize-end"
                onPointerDown={(event) => handleResizeStart(event, "end")}
                className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-move rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
              />
            </>
          ) : resizable ? (
            <div
              data-handle="resize-end"
              onPointerDown={(event) => handleResizeStart(event, "end")}
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
