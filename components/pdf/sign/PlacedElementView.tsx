"use client";

// components/pdf/sign/PlacedElementView.tsx
//
// One placed element on the placement stage -- a signature stamp or a
// date/text/initials box. Owns its own drag/resize/rotate pointer math;
// the parent just hands it percent-based geometry and gets patches back.
//
// Perf note: drag/resize/rotate write straight to the DOM node's style
// on every pointermove and only call onChange once, at gesture end.
// Calling onChange per pointermove (as this used to do)
// pushes a React state update for every mouse-move event -- 60-100+
// times a second while dragging -- which re-renders this component
// and, since the parent's `elements` array gets a new reference each
// time, every *other* placed element too. That's the actual "lag" a
// premium signing tool can't have; committing once at gesture end
// keeps dragging perfectly smooth regardless of how many elements are
// on the page.

import { useRef } from "react";
import type { PlacedElement } from "@/lib/sign/types";

const MIN_WIDTH_PCT = 4;
const MIN_TEXT_HEIGHT_PCT = 2;
const NUDGE_STEP_PCT = 0.5;
const NUDGE_STEP_LARGE_PCT = 2;

const ARROW_DELTAS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type LiveGeometry = { xPct: number; yPct: number; widthPct: number; heightPct: number; rotationDeg: number };

export function PlacedElementView({
  element,
  selected,
  stageRef,
  onSelect,
  onChange,
  onDelete,
  onDuplicate,
  onEditText,
}: {
  element: PlacedElement;
  selected: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: Partial<PlacedElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditText?: (text: string) => void;
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
    aspectRatio: number;
  } | null>(null);
  const rotateRef = useRef<{ centerX: number; centerY: number; startAngle: number; originRotation: number } | null>(null);

  function getStageRect() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  function ensureLive(): LiveGeometry {
    if (!liveRef.current) {
      liveRef.current = {
        xPct: element.xPct,
        yPct: element.yPct,
        widthPct: element.widthPct,
        heightPct: element.heightPct,
        rotationDeg: element.rotationDeg,
      };
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
    node.style.transform = `rotate(${live.rotationDeg}deg)`;
  }

  function commitLive() {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    // onChange fires exactly once per completed gesture, with the final
    // geometry -- the parent can push it straight to undo history like any
    // other discrete action, no separate "commit" phase needed.
    onChange(live);
  }

  function handleBodyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.handle) return;
    onSelect();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originXPct: element.xPct,
      originYPct: element.yPct,
    };
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

  function handleResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidthPct: element.widthPct,
      originHeightPct: element.heightPct,
      originXPct: element.xPct,
      originYPct: element.yPct,
      aspectRatio: element.type === "signature" ? element.aspectRatio : 0,
    };
  }

  function handleResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    const rect = getStageRect();
    if (!resize || !rect) return;
    const deltaXPct = ((event.clientX - resize.startX) / rect.width) * 100;
    const live = ensureLive();

    if (element.type === "signature") {
      const nextWidthPct = clamp(resize.originWidthPct + deltaXPct, MIN_WIDTH_PCT, 100 - resize.originXPct);
      const widthPx = (nextWidthPct / 100) * rect.width;
      const heightPx = widthPx / resize.aspectRatio;
      live.widthPct = nextWidthPct;
      live.heightPct = (heightPx / rect.height) * 100;
    } else {
      live.widthPct = clamp(resize.originWidthPct + deltaXPct, MIN_WIDTH_PCT, 100 - resize.originXPct);
      live.heightPct = Math.max(MIN_TEXT_HEIGHT_PCT, resize.originHeightPct);
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

  function handleRotateStart(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    const rect = getStageRect();
    if (!rect) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const centerX = rect.left + ((element.xPct + element.widthPct / 2) / 100) * rect.width;
    const centerY = rect.top + ((element.yPct + element.heightPct / 2) / 100) * rect.height;
    rotateRef.current = {
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      originRotation: element.rotationDeg,
    };
  }

  function handleRotateMove(event: React.PointerEvent<HTMLDivElement>) {
    const rotate = rotateRef.current;
    if (!rotate) return;
    const currentAngle = Math.atan2(event.clientY - rotate.centerY, event.clientX - rotate.centerX);
    const deltaDeg = ((currentAngle - rotate.startAngle) * 180) / Math.PI;
    const live = ensureLive();
    live.rotationDeg = Math.round(rotate.originRotation + deltaDeg);
    applyLiveStyle(live);
  }

  function handleRotateEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (rotateRef.current) {
      rotateRef.current = null;
      commitLive();
    }
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  const canRotate = element.type === "signature";

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={`${element.type} element, use arrow keys to move, Delete to remove`}
      onFocus={onSelect}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={(event) => {
        handleBodyPointerMove(event);
        handleResizeMove(event);
        handleRotateMove(event);
      }}
      onPointerUp={(event) => {
        handleBodyPointerUp(event);
        handleResizeEnd(event);
        handleRotateEnd(event);
      }}
      // Mobile browsers can fire pointercancel mid-gesture (e.g. the OS
      // hands the touch off to a scroll gesture) without ever firing
      // pointerup. Without this, the drag/resize/rotate ref stays set and
      // silently hijacks the element's *next* unrelated pointer gesture.
      onPointerCancel={(event) => {
        handleBodyPointerUp(event);
        handleResizeEnd(event);
        handleRotateEnd(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          // Stop this from also reaching SignPdfTool's window-level
          // Delete/Backspace listener (used for the case where an element is
          // selected but not DOM-focused) -- without it, one keypress would
          // call onDelete twice. Harmless in practice (deleting an
          // already-deleted id is a no-op filter), but doing it once is correct.
          event.stopPropagation();
          onDelete();
          return;
        }
        // Arrow-key nudge -- the only way a keyboard/switch-device user can
        // fine-tune placement without a mouse or touch drag. Small step per
        // press, larger with Shift, same as Figma/design-tool convention.
        const delta = ARROW_DELTAS[event.key];
        if (!delta) return;
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_STEP_LARGE_PCT : NUDGE_STEP_PCT;
        onChange({
          xPct: clamp(element.xPct + delta.dx * step, 0, 100 - element.widthPct),
          yPct: clamp(element.yPct + delta.dy * step, 0, 100 - element.heightPct),
        });
      }}
      className={`absolute touch-none select-none ${selected ? "z-20" : "z-10"} ${element.type === "signature" ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        left: `${element.xPct}%`,
        top: `${element.yPct}%`,
        width: `${element.widthPct}%`,
        height: `${element.heightPct}%`,
        transform: `rotate(${element.rotationDeg}deg)`,
      }}
    >
      {element.type === "signature" ? (
        <div className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={element.dataUrl} alt="Signature" className="h-full w-full select-none" draggable={false} />
        </div>
      ) : (
        <div
          className={`flex h-full w-full items-center rounded-sm px-1 ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{ fontSize: `${element.fontSizePt}px`, lineHeight: 1.1, color: "#12141a", fontWeight: element.type === "initials" ? 700 : 500 }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            const next = window.prompt(`Edit ${element.type}`, element.text);
            if (next !== null) onEditText?.(next);
          }}
        >
          {element.text || <span className="text-black/30">{element.type}</span>}
        </div>
      )}

      {selected ? (
        <>
          <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 px-1.5 py-1 shadow-lg">
            <button
              type="button"
              data-handle="duplicate"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate();
              }}
              aria-label="Duplicate"
              className="grid h-6 w-6 place-items-center rounded-full text-xs text-[var(--text-primary)]/70 transition hover:bg-[var(--text-primary)]/10 hover:text-[var(--text-primary)]"
            >
              ⧉
            </button>
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

          <div
            data-handle="resize"
            onPointerDown={handleResizeStart}
            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
          />

          {canRotate ? (
            <div
              data-handle="rotate"
              onPointerDown={handleRotateStart}
              className="absolute -top-6 left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)] active:cursor-grabbing"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
